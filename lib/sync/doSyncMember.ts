import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { SyncError } from '@/lib/sync/syncMember'
import {
  fetchLolPuuid,
  fetchLolLeaguesByPuuid,
  warnRiotOnce,
  LOL_SOLO_QUEUE,
  RiotApiError,
  type LolLeagueEntry,
} from '@/lib/riot/api'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import { notifyTierPromotion } from '@/lib/discord/notify'
import {
  ensurePrimaryAccount,
  listRiotAccounts,
  mirrorPrimaryToMember,
  pickPrimaryAccount,
  type RiotAccountRow,
} from '@/lib/members/primaryAccount'

const RIOT_ACCOUNT_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '800')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * LoL 리그 조회. ★ PUUID 는 키에 종속된 암호문이라 레거시 riot_puuid(TFT 키 기준)를 넘기면 400 이 반환된다.
 * 따라서 LoL 키 기준 lol_puuid 만 쓴다(등록 검증 때 저장, 없으면 여기서 lazy 발급).
 *
 * 캐시가 있으면 account-v1 호출이 0회이므로 정상 상태에서 호출 증가량은 없다.
 * 반환값: `null` = 이번 주기 조회 불가(키 없음 / 403 / 재발급 실패) — 기존 저장값을 보존한다.
 */
async function fetchLolSnapshot(
  account: Pick<RiotAccountRow, 'riot_game_name' | 'riot_tagline' | 'lol_puuid'>,
): Promise<{ entries: LolLeagueEntry[]; puuid: string } | null> {
  let puuid = account.lol_puuid
  if (!puuid) {
    puuid = await fetchLolPuuid(account.riot_game_name, account.riot_tagline)
    if (!puuid) return null
    if (RIOT_ACCOUNT_DELAY_MS > 0) await sleep(RIOT_ACCOUNT_DELAY_MS)
  }

  let entries: LolLeagueEntry[] | null
  try {
    entries = await fetchLolLeaguesByPuuid(puuid)
  } catch (e) {
    // 상태코드만 본다. 'Exception decrypting' 문자열 매칭은 Riot 이 문구를 바꾸면 깨진다.
    if (!(e instanceof RiotApiError && e.status === 400)) throw e

    // 키 교체 등으로 저장된 lol_puuid 가 무효해진 경우. 재발급은 **1회만** 시도한다.
    const reissued = await fetchLolPuuid(account.riot_game_name, account.riot_tagline)
    if (!reissued) return null
    puuid = reissued
    try {
      entries = await fetchLolLeaguesByPuuid(puuid)
    } catch (retryError) {
      if (retryError instanceof RiotApiError && retryError.status === 400) {
        warnRiotOnce(
          'lol-puuid-400',
          '[riot] 재발급한 lol_puuid 로도 400 — RIOT_LOL_API_KEY 설정을 확인하세요. LoL 랭크 수집을 건너뜁니다.',
        )
        return null
      }
      throw retryError
    }
  }

  if (!entries) return null
  return { entries, puuid }
}

type MemberLite = {
  id: string
  member_name: string
  riot_game_name: string | null
  riot_tagline: string | null
  lol_tier: string | null
}

/**
 * 대표 계정의 LoL 솔로랭크만 동기화한다(부계정·매치·랭크 히스토리 수집 없음).
 *
 * ★ `mirrorPrimaryToMember()` 이후에는 throw 하지 않는다 — syncOneMember 재시도가 전체를 다시 돌리면
 *   2회차의 `member.lol_tier`(=이전 값)가 이미 새 값이 되어 승급 알림이 무력화된다.
 */
export async function doSyncMember(memberId: string) {
  const { data: memberData, error: memberError } = await supabaseAdmin
    .from('members')
    .select('id, member_name, riot_game_name, riot_tagline, lol_tier')
    .eq('id', memberId)
    .single()

  if (memberError || !memberData) {
    throw new SyncError('Member not found', 404)
  }
  const member = memberData as unknown as MemberLite

  let listed = await listRiotAccounts(memberId)
  // 테이블 부재(20260726 미적용)는 재시도해도 같은 결과다. lol_puuid 를 캐시할 곳이 없어 동기화 불가.
  if (!listed.ok) throw new SyncError(listed.message, 500)

  if (listed.accounts.length === 0 && member.riot_game_name && member.riot_tagline) {
    const ensured = await ensurePrimaryAccount(memberId, {
      riot_game_name: member.riot_game_name,
      riot_tagline: member.riot_tagline,
    })
    if (!ensured.ok) throw new SyncError(ensured.message, ensured.conflict ? 409 : 500)
    listed = await listRiotAccounts(memberId)
    if (!listed.ok) throw new SyncError(listed.message, 500)
  }

  const account = pickPrimaryAccount(listed.accounts)
  if (!account) throw new SyncError('등록된 라이엇 계정이 없습니다', 400)

  // 429/5xx 는 throw → syncOneMember 재시도 래퍼가 처리한다.
  const lol = await fetchLolSnapshot(account)
  if (!lol) {
    throw new SyncError('LoL API를 사용할 수 없습니다(RIOT_LOL_API_KEY 확인)', 500)
  }

  const lolSolo = lol.entries.find((e) => e.queueType === LOL_SOLO_QUEUE) ?? null
  const now = new Date().toISOString()
  const lolColumns = {
    lol_tier: lolSolo?.tier ?? null,
    lol_rank: lolSolo?.rank ?? null,
    lol_league_points: lolSolo?.leaguePoints ?? null,
    lol_wins: lolSolo?.wins ?? null,
    lol_losses: lolSolo?.losses ?? null,
    lol_synced_at: now,
    last_synced_at: now,
  }
  // 값이 바뀐 경우에만 lol_puuid 를 payload 에 포함한다.
  const withPuuid =
    account.lol_puuid === lol.puuid ? lolColumns : { ...lolColumns, lol_puuid: lol.puuid }

  const updateAccount = (payload: Record<string, string | number | null>) =>
    supabaseAdmin
      .from('riot_accounts')
      .update(payload)
      .eq('id', account.id)
      .eq('member_id', memberId)

  let { error: accountError } = await updateAccount(withPuuid)
  // 20260729_lol_puuid.sql 미적용이면 42703. 랭크 값만이라도 저장한다(크론이 죽으면 안 된다).
  if (accountError && isMissingColumnError(accountError)) {
    warnRiotOnce(
      'lol-puuid-column-missing',
      '[sync] riot_accounts.lol_puuid 컬럼이 없습니다 (scripts/sql/20260729_lol_puuid.sql 미적용). 매 동기화마다 PUUID 를 재발급합니다.',
    )
    ;({ error: accountError } = await updateAccount(lolColumns))
  }
  if (accountError) throw new SyncError(accountError.message, 500)

  // ★ members 캐시 갱신은 primaryAccount.ts 한 곳에서만 수행한다.
  const mirrored = await mirrorPrimaryToMember(memberId)
  if (!mirrored.ok) throw new SyncError(mirrored.message, 500)

  // 칭호 갱신. 실패해도 랭크 동기화는 유지한다.
  try {
    const { refreshMemberTitles } = await import('@/lib/achievements/refreshTitles')
    await refreshMemberTitles(memberId)
  } catch (e) {
    console.warn('[sync] 칭호 갱신 실패:', e instanceof Error ? e.message : '오류 발생')
  }

  // ── 티어 승급 축하 알림(롤 솔로랭크) ─────────────────────────────────────
  //   member(함수 시작 시점 = 이전 값)와 이번 결과를 비교해 등급 자체가 오른 경우만 알린다.
  try {
    await notifyTierPromotion(member.member_name, member.lol_tier, lolColumns.lol_tier)
  } catch (e) {
    console.warn('[sync] 승급 알림 실패:', e instanceof Error ? e.message : '오류')
  }
}
