import 'server-only'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { MAX_RIOT_ACCOUNTS, isSameRiotId, parseRiotAccountInput } from '@/lib/members/memberInput'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import {
  CLEARED_RANK_COLUMNS,
  CLEARED_RANK_COLUMNS_LEGACY,
  REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH,
  REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE,
  RIOT_ACCOUNTS_MIGRATION_MESSAGE,
  type RiotAccountRow,
  isMissingTableError,
  isUniqueViolation,
  listRiotAccounts,
  markMemberPending,
  mirrorPrimaryToMember,
  nextAccountNo,
  pickPrimaryAccount,
} from '@/lib/members/primaryAccount'
import { RIOT_ID_NOT_FOUND_MESSAGE, verifyRiotId } from '@/lib/riot/verifyRiotId'

/**
 * 라이엇 계정 쓰기 로직의 공용 지점. 사용자(`/api/me/riot-accounts/*`)·관리자
 * (`/api/admin/members/[id]/riot-accounts/*`) 라우트가 공유한다.
 *
 * ⚠ memberId 는 호출자가 이미 권한을 확인한 값이어야 한다(사용자=세션, 관리자=requireAdmin + path).
 *   대상 계정은 항상 그 멤버의 목록 안에서만 찾는다(소유권 가드). 쿼리에도 member_id 조건을 유지한다.
 */
export type RiotOpCtx = {
  memberId: string
  memberStatus: string | null
  /**
   * 'admin' 이면 재승인(pending 복귀)을 하지 않는다 — 관리자가 직접 바꾼 값은 이미 심사를 거친 것이다.
   * 대신 관리자 라우트가 대표 변경 시 즉시 동기화한다.
   */
  actor: 'self' | 'admin'
}

export type RiotOpResult =
  | {
      ok: true
      message: string
      /** 공개 노출값(대표 계정)이 바뀌었는가 — 관리자 라우트의 즉시 동기화 판단용. */
      primaryChanged: boolean
      /** undefined 면 응답에 키를 싣지 않는다(기존 사용자 응답 형태 보존). */
      backToPending?: boolean
      accountId?: string
    }
  | { ok: false; status: number; message: string; migrationRequired?: true }

const MIGRATION_RESULT: RiotOpResult = {
  ok: false,
  status: 503,
  message: RIOT_ACCOUNTS_MIGRATION_MESSAGE,
  migrationRequired: true,
}

function duplicateMessage(actor: RiotOpCtx['actor'], variant: 'add' | 'update'): string {
  if (actor === 'admin') return '이미 다른 멤버에게 등록된 라이엇 ID입니다.'
  return variant === 'add'
    ? '이미 등록된 라이엇 ID입니다. 다른 계정에 연결되어 있다면 관리자에게 문의해주세요.'
    : '이미 등록된 라이엇 ID입니다. 관리자에게 문의해주세요.'
}

function shouldReapprove(ctx: RiotOpCtx, policy: boolean): boolean {
  return ctx.actor === 'self' && policy && ctx.memberStatus === 'approved'
}

function revalidatePublic() {
  revalidatePath('/lol')
  revalidatePath('/')
  revalidatePath('/profile')
}

/** 대표가 바뀐 뒤 members 캐시를 다시 쓴다. 실패는 500 — 캐시 불일치는 랭킹 오표시로 이어진다. */
async function mirrorOrFail(memberId: string): Promise<RiotOpResult | null> {
  const mirrored = await mirrorPrimaryToMember(memberId)
  if (!mirrored.ok) return { ok: false, status: 500, message: mirrored.message }
  return null
}

async function loadAccounts(memberId: string): Promise<{ ok: true; accounts: RiotAccountRow[] } | RiotOpResult> {
  const listed = await listRiotAccounts(memberId)
  if (!listed.ok) {
    if (listed.missingTable) return MIGRATION_RESULT
    return { ok: false, status: 500, message: listed.message }
  }
  return { ok: true, accounts: listed.accounts }
}

function isAccountList(v: { ok: true; accounts: RiotAccountRow[] } | RiotOpResult): v is { ok: true; accounts: RiotAccountRow[] } {
  return v.ok && 'accounts' in v
}

export async function addRiotAccount(ctx: RiotOpCtx, body: unknown): Promise<RiotOpResult> {
  const parsed = parseRiotAccountInput(body)
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  const loaded = await loadAccounts(ctx.memberId)
  if (!isAccountList(loaded)) return loaded
  const accounts = loaded.accounts

  if (accounts.some((a) => isSameRiotId(parsed.value, a))) {
    return { ok: false, status: 409, message: '이미 등록한 라이엇 ID입니다.' }
  }

  const slot = nextAccountNo(accounts)
  if (slot === null) {
    return { ok: false, status: 409, message: `라이엇 계정은 최대 ${MAX_RIOT_ACCOUNTS}개까지 등록할 수 있습니다.` }
  }

  const verification = await verifyRiotId(parsed.value.riot_game_name, parsed.value.riot_tagline)
  if (verification.status === 'not_found') {
    return { ok: false, status: 400, message: RIOT_ID_NOT_FOUND_MESSAGE }
  }

  const isFirst = accounts.length === 0

  const baseRow = {
    member_id: ctx.memberId,
    account_no: slot,
    // 계정이 하나도 없던 경우에만 자동으로 대표가 된다. 부계정 추가는 대표를 바꾸지 않는다.
    is_primary: isFirst,
    riot_game_name: parsed.value.riot_game_name,
    riot_tagline: parsed.value.riot_tagline,
  }
  // LoL 키 기준 puuid 는 lol_puuid 에만 저장한다(riot_puuid 는 레거시 동결). 확인 불가면 null — 동기화가 lazy 발급한다.
  const lolPuuid = verification.status === 'ok' ? verification.puuid : null
  const insertAccount = (row: Record<string, string | number | boolean | null>) =>
    supabaseAdmin.from('riot_accounts').insert(row).select('id').single()

  let { data: created, error } = await insertAccount({ ...baseRow, lol_puuid: lolPuuid })
  // 20260729_lol_puuid.sql 미적용이면 컬럼 부재(42703/PGRST204). lol_puuid 없이 1회 재시도한다.
  if (error && isMissingColumnError(error)) {
    ;({ data: created, error } = await insertAccount(baseRow))
  }

  if (error || !created) {
    // 슬롯 경합·중복 Riot ID 모두 DB 유니크가 유일한 원자적 방어선이다.
    if (isUniqueViolation(error)) {
      return { ok: false, status: 409, message: duplicateMessage(ctx.actor, 'add') }
    }
    return { ok: false, status: 400, message: error?.message ?? '계정 추가에 실패했습니다.' }
  }

  // 부계정 추가는 status를 건드리지 않는다(공개 노출값이 바뀌지 않으므로 심사 대상이 아니다).
  if (isFirst) {
    const failed = await mirrorOrFail(ctx.memberId)
    if (failed) return failed
    revalidatePath('/lol')
    revalidatePath('/')
  }
  revalidatePath('/profile')

  return {
    ok: true,
    accountId: created.id,
    primaryChanged: isFirst,
    message: '라이엇 계정을 추가했습니다. 다음 동기화에서 랭크가 반영돼요.',
  }
}

export async function updateRiotAccount(ctx: RiotOpCtx, accountId: string, body: unknown): Promise<RiotOpResult> {
  const parsed = parseRiotAccountInput(body)
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  const loaded = await loadAccounts(ctx.memberId)
  if (!isAccountList(loaded)) return loaded
  const accounts = loaded.accounts

  // ⚠ 소유권 가드: 이 멤버의 계정 목록 안에서만 대상을 찾는다.
  const target = accounts.find((a) => a.id === accountId)
  if (!target) return { ok: false, status: 404, message: '계정을 찾을 수 없습니다.' }

  if (isSameRiotId(parsed.value, target)) {
    return { ok: true, primaryChanged: false, message: '변경된 내용이 없습니다.' }
  }
  if (accounts.some((a) => a.id !== accountId && isSameRiotId(parsed.value, a))) {
    return { ok: false, status: 409, message: '이미 등록한 라이엇 ID입니다.' }
  }

  // 존재하지 않는 ID면 DB를 건드리기 전에 거절한다. Riot 장애로 확인 불가면 막지 않는다.
  const verification = await verifyRiotId(parsed.value.riot_game_name, parsed.value.riot_tagline)
  if (verification.status === 'not_found') {
    return { ok: false, status: 400, message: RIOT_ID_NOT_FOUND_MESSAGE }
  }
  const resolvedPuuid = verification.status === 'ok' ? verification.puuid : null

  const isPrimary = pickPrimaryAccount(accounts)?.id === accountId

  // 다른 사람의 계정으로 바뀌었으므로 옛 puuid·랭크는 전부 무효다.
  // ★ 순서 중요: cleared(lol_puuid:null 포함)를 펼친 **뒤에** 검증된 새 lol_puuid 를 덮어쓴다.
  //   riot_puuid 는 레거시 동결 값이라 null 로만 지운다.
  const clearRiotId = (cleared: Record<string, string | null>) =>
    supabaseAdmin
      .from('riot_accounts')
      .update({
        riot_game_name: parsed.value.riot_game_name,
        riot_tagline: parsed.value.riot_tagline,
        riot_puuid: null,
        ...cleared,
      })
      .eq('id', accountId)
      .eq('member_id', ctx.memberId)

  let { error } = await clearRiotId({ ...CLEARED_RANK_COLUMNS, lol_puuid: resolvedPuuid })
  // 20260729_lol_puuid.sql 미적용이면 42703. 무효화를 통째로 포기하면 옛 티어가 남으므로 나머지만 지운다.
  if (error && isMissingColumnError(error)) {
    ;({ error } = await clearRiotId(CLEARED_RANK_COLUMNS_LEGACY))
  }

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, status: 409, message: duplicateMessage(ctx.actor, 'update') }
    }
    return { ok: false, status: 400, message: error.message }
  }

  let backToPending = false
  if (isPrimary) {
    // 대표 계정의 Riot ID 문자열 변경 = 랭킹에 오르는 값의 변경 → 사용자 경로는 재심사.
    backToPending = shouldReapprove(ctx, REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE)
    if (backToPending) {
      const pendingError = await markMemberPending(ctx.memberId)
      if (pendingError) return { ok: false, status: 500, message: pendingError }
    }
    const failed = await mirrorOrFail(ctx.memberId)
    if (failed) return failed
    revalidatePublic()
  } else {
    // 부계정 수정은 공개 노출값을 바꾸지 않으므로 status를 건드리지 않는다.
    revalidatePath('/profile')
  }

  return {
    ok: true,
    backToPending,
    primaryChanged: isPrimary,
    message: backToPending
      ? '대표 계정을 변경해 승인 대기 상태로 돌아갔습니다. 관리자 승인 후 랭킹에 표시돼요.'
      : '계정 정보를 수정했습니다.',
  }
}

export async function deleteRiotAccount(ctx: RiotOpCtx, accountId: string): Promise<RiotOpResult> {
  const loaded = await loadAccounts(ctx.memberId)
  if (!isAccountList(loaded)) return loaded
  const accounts = loaded.accounts

  const target = accounts.find((a) => a.id === accountId)
  if (!target) return { ok: false, status: 404, message: '계정을 찾을 수 없습니다.' }

  // 멤버는 항상 라이엇 계정을 1개 이상 보유한다. 0개가 되면 members 캐시가
  // 갱신될 근거를 잃고 랭킹에 옛 값이 영구히 남는다.
  if (accounts.length <= 1) {
    return {
      ok: false,
      status: 409,
      message: '마지막 라이엇 계정은 삭제할 수 없습니다. 먼저 다른 계정을 추가해주세요.',
    }
  }

  const wasPrimary = pickPrimaryAccount(accounts)?.id === accountId

  const { error } = await supabaseAdmin
    .from('riot_accounts')
    .delete()
    .eq('id', accountId)
    .eq('member_id', ctx.memberId)

  if (error) return { ok: false, status: 500, message: error.message }

  let backToPending = false
  if (wasPrimary) {
    // 자동 승격 UPDATE는 없다. 남은 계정 중 account_no 최솟값이 파생 대표가 된다.
    backToPending = shouldReapprove(ctx, REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH)
    if (backToPending) {
      const pendingError = await markMemberPending(ctx.memberId)
      if (pendingError) return { ok: false, status: 500, message: pendingError }
    }
    const failed = await mirrorOrFail(ctx.memberId)
    if (failed) return failed
    revalidatePublic()
  } else {
    revalidatePath('/profile')
  }

  return {
    ok: true,
    backToPending,
    primaryChanged: wasPrimary,
    message: wasPrimary
      ? '대표 계정을 삭제했습니다. 남은 계정 중 첫 번째가 대표가 됩니다.'
      : '계정을 삭제했습니다.',
  }
}

export async function setPrimaryRiotAccount(ctx: RiotOpCtx, accountId: string): Promise<RiotOpResult> {
  const loaded = await loadAccounts(ctx.memberId)
  if (!isAccountList(loaded)) return loaded
  const accounts = loaded.accounts

  // ⚠ 소유권 가드 1: 이 멤버의 계정 목록 안에 있는 id만 대상이 된다.
  const target = accounts.find((a) => a.id === accountId)
  if (!target) return { ok: false, status: 404, message: '계정을 찾을 수 없습니다.' }

  if (pickPrimaryAccount(accounts)?.id === accountId && target.is_primary) {
    return { ok: true, primaryChanged: false, message: '이미 대표 계정입니다.' }
  }

  // ⚠ 소유권 가드 2(DB): RPC 내부에서도 member_id로 한 번 더 검증한다.
  //   부분 유니크 인덱스는 비지연이라 해제→지정 2문장을 한 트랜잭션(RPC)으로 처리한다.
  const { error } = await supabaseAdmin.rpc('set_primary_riot_account', {
    p_member_id: ctx.memberId,
    p_account_id: accountId,
  })

  if (error) {
    if (isMissingTableError(error) || error.code === 'PGRST202') return MIGRATION_RESULT
    return { ok: false, status: 500, message: error.message }
  }

  // 정책 반전 지점: true면 대표 전환도 재심사 대상이 된다. 캐시 갱신과 반드시 짝으로 수행한다.
  const backToPending = shouldReapprove(ctx, REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH)
  if (backToPending) {
    const pendingError = await markMemberPending(ctx.memberId)
    if (pendingError) return { ok: false, status: 500, message: pendingError }
  }

  const failed = await mirrorOrFail(ctx.memberId)
  if (failed) return failed

  revalidatePublic()

  // 첫 번째 계정이 is_primary=false 인 채 파생 대표였다면 실제 대표는 바뀌지 않았다.
  const primaryChanged = pickPrimaryAccount(accounts)?.id !== accountId

  return {
    ok: true,
    backToPending,
    primaryChanged,
    message: backToPending
      ? '대표 계정을 변경했습니다. 관리자 승인 후 랭킹에 다시 표시돼요.'
      : '대표 계정을 변경했습니다. 랭킹에 이 계정이 표시됩니다.',
  }
}

/**
 * 공용 결과 → HTTP 응답. 기존 사용자 응답 키(`ok`/`accountId`/`backToPending`/`message`/
 * `migration_required`)를 그대로 유지한다. extra 는 관리자 라우트의 `syncWarning` 등.
 */
export function riotOpResponse(result: RiotOpResult, extra?: Record<string, string | null>): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.message,
        ...(result.migrationRequired ? { migration_required: true } : {}),
      },
      { status: result.status },
    )
  }
  return NextResponse.json({
    ok: true,
    ...(result.accountId !== undefined ? { accountId: result.accountId } : {}),
    ...(result.backToPending !== undefined ? { backToPending: result.backToPending } : {}),
    message: result.message,
    ...(extra ?? {}),
  })
}

type PublicAccountSource = Pick<
  RiotAccountRow,
  | 'id'
  | 'account_no'
  | 'is_primary'
  | 'riot_game_name'
  | 'riot_tagline'
  | 'riot_puuid'
  | 'lol_puuid'
  | 'lol_tier'
  | 'lol_rank'
  | 'lol_league_points'
  | 'last_synced_at'
>

/** 클라이언트로 내보내는 필드만 추린다. puuid 자체는 응답하지 않는다. */
export function toPublicAccount(a: PublicAccountSource) {
  return {
    id: a.id,
    account_no: a.account_no,
    is_primary: a.is_primary,
    riot_game_name: a.riot_game_name,
    riot_tagline: a.riot_tagline,
    // riot_puuid 는 레거시 계정의 폴백 판정용.
    synced: !!(a.lol_puuid ?? a.riot_puuid),
    lol_tier: a.lol_tier,
    lol_rank: a.lol_rank,
    lol_league_points: a.lol_league_points,
    last_synced_at: a.last_synced_at,
  }
}

/** 관리자 상세용. 공개 필드 + 승패·랭크 동기화 시각. puuid 는 여전히 노출하지 않는다. */
export function toAdminAccount(a: RiotAccountRow) {
  return {
    ...toPublicAccount(a),
    lol_wins: a.lol_wins,
    lol_losses: a.lol_losses,
    lol_synced_at: a.lol_synced_at,
  }
}
