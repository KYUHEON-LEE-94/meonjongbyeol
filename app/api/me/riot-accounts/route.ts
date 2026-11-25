import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMyMember } from '@/lib/members/myMember'
import { MAX_RIOT_ACCOUNTS, isSameRiotId, parseRiotAccountInput } from '@/lib/members/memberInput'
import {
  RIOT_ACCOUNTS_MIGRATION_MESSAGE,
  isUniqueViolation,
  listRiotAccounts,
  mirrorPrimaryToMember,
  nextAccountNo,
  pickPrimaryAccount,
  riotAccountsMigrationResponse,
} from '@/lib/members/primaryAccount'
import { RIOT_ID_NOT_FOUND_MESSAGE, verifyRiotId } from '@/lib/riot/verifyRiotId'
import { isMissingColumnError } from '@/lib/db/pgErrors'

export const dynamic = 'force-dynamic'

const DUPLICATE_MESSAGE =
  '이미 등록된 라이엇 ID입니다. 다른 계정에 연결되어 있다면 관리자에게 문의해주세요.'

/** 클라이언트로 내보내는 필드만 추린다(내부 id 외 소유권 정보는 노출하지 않는다). */
function toPublicAccount(a: {
  id: string
  account_no: number
  is_primary: boolean
  riot_game_name: string
  riot_tagline: string
  riot_puuid: string | null
  lol_puuid: string | null
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  last_synced_at: string | null
}) {
  return {
    id: a.id,
    account_no: a.account_no,
    is_primary: a.is_primary,
    riot_game_name: a.riot_game_name,
    riot_tagline: a.riot_tagline,
    // puuid 자체는 응답하지 않는다. riot_puuid 는 레거시 계정의 폴백 판정용.
    synced: !!(a.lol_puuid ?? a.riot_puuid),
    lol_tier: a.lol_tier,
    lol_rank: a.lol_rank,
    lol_league_points: a.lol_league_points,
    last_synced_at: a.last_synced_at,
  }
}

export async function GET() {
  const me = await getMyMember()
  if (!me.ok) {
    return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  }
  if (!me.member) {
    return NextResponse.json({ ok: true, accounts: [], max: MAX_RIOT_ACCOUNTS })
  }

  const listed = await listRiotAccounts(me.member.id)
  if (!listed.ok) {
    // 마이그레이션 미적용은 장애가 아니라 "아직 켜지지 않은 기능"이다. 500 대신 안내로 degrade.
    if (listed.missingTable) {
      return NextResponse.json({
        ok: true,
        accounts: [],
        max: MAX_RIOT_ACCOUNTS,
        migration_required: true,
        message: RIOT_ACCOUNTS_MIGRATION_MESSAGE,
      })
    }
    return NextResponse.json({ ok: false, message: listed.message }, { status: 500 })
  }

  const primary = pickPrimaryAccount(listed.accounts)

  return NextResponse.json({
    ok: true,
    max: MAX_RIOT_ACCOUNTS,
    primary_account_id: primary?.id ?? null,
    accounts: listed.accounts.map(toPublicAccount),
  })
}

export async function POST(req: Request) {
  const me = await getMyMember()
  if (!me.ok) {
    return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  }
  if (!me.member) {
    return NextResponse.json(
      { ok: false, message: '먼저 멤버 등록 신청을 완료해주세요.' },
      { status: 404 },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = parseRiotAccountInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 })
  }

  const listed = await listRiotAccounts(me.member.id)
  if (!listed.ok) {
    if (listed.missingTable) return riotAccountsMigrationResponse()
    return NextResponse.json({ ok: false, message: listed.message }, { status: 500 })
  }

  if (listed.accounts.some((a) => isSameRiotId(parsed.value, a))) {
    return NextResponse.json({ ok: false, message: '이미 등록한 라이엇 ID입니다.' }, { status: 409 })
  }

  const slot = nextAccountNo(listed.accounts)
  if (slot === null) {
    return NextResponse.json(
      { ok: false, message: `라이엇 계정은 최대 ${MAX_RIOT_ACCOUNTS}개까지 등록할 수 있습니다.` },
      { status: 409 },
    )
  }

  const verification = await verifyRiotId(parsed.value.riot_game_name, parsed.value.riot_tagline)
  if (verification.status === 'not_found') {
    return NextResponse.json({ ok: false, message: RIOT_ID_NOT_FOUND_MESSAGE }, { status: 400 })
  }

  const isFirst = listed.accounts.length === 0

  const baseRow = {
    member_id: me.member.id,
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
      return NextResponse.json({ ok: false, message: DUPLICATE_MESSAGE }, { status: 409 })
    }
    return NextResponse.json(
      { ok: false, message: error?.message ?? '계정 추가에 실패했습니다.' },
      { status: 400 },
    )
  }

  // 부계정 추가는 status를 건드리지 않는다(공개 노출값이 바뀌지 않으므로 심사 대상이 아니다).
  if (isFirst) {
    await mirrorPrimaryToMember(me.member.id)
    revalidatePath('/lol')
    revalidatePath('/')
  }
  revalidatePath('/profile')

  return NextResponse.json({
    ok: true,
    accountId: created.id,
    message: '라이엇 계정을 추가했습니다. 다음 동기화에서 랭크가 반영돼요.',
  })
}
