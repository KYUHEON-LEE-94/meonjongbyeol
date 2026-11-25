// lib/riot/api.ts
// Riot API 공유 클라이언트 — LoL 키(RIOT_LOL_API_KEY) 단일.

const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const LOL_LEAGUE_BASE_URL = process.env.RIOT_LOL_LEAGUE_BASE_URL

/**
 * ★ PUUID 는 API 키에 종속된 암호문이다. 이 클라이언트는 LoL 키만 쓰므로 여기서 받은 puuid 는
 *   `riot_accounts.lol_puuid` 에만 저장한다(레거시 TFT 키 기준 `riot_puuid` 와 값이 다르다).
 *
 * top-level 상수로 캡처하지 않는 이유: 서버리스 인스턴스가 살아 있는 동안
 * env 가 갱신되어도 옛 값을 계속 쓰게 된다.
 */
function lolApiKey(): string | undefined {
  return process.env.RIOT_LOL_API_KEY
}

const warnedKeys = new Set<string>()

/** 동일 사유의 경고를 프로세스당 1회만 남긴다(멤버 수만큼 로그가 오염되는 것 방지). */
function warnOnce(key: string, message: string) {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.warn(message)
}

export class RiotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSec?: number,
  ) {
    super(message)
    this.name = 'RiotApiError'
  }
}

async function riotFetch(url: string): Promise<Response> {
  const apiKey = lolApiKey()
  if (!apiKey) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  // 키 값은 헤더로만 전송한다. URL·에러 메시지·로그에 절대 싣지 않는다.
  const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } })
  if (res.ok) return res
  const retryAfterHeader = res.headers.get('Retry-After')
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined
  const raw = (await res.text().catch(() => '')).trim()
  // Cloudflare/게이트웨이는 5xx(예: 520~524) 시 긴 HTML 에러 페이지를 반환한다.
  // 그대로 message 에 실으면 UI·로그·title 속성이 HTML 통째로 오염된다 → HTML 이면 버리고
  // 그 외 응답 본문만 200자로 잘라 붙인다.
  const body = raw.startsWith('<') ? '' : raw.slice(0, 200)
  throw new RiotApiError(
    `Riot API error (${res.status})${body ? `: ${body}` : ''}`,
    res.status,
    retryAfterSec,
  )
}

/** account-v1 로 PUUID 를 발급받는다(LoL 키 기준 → lol_puuid). */
export async function fetchPuuid(gameName: string, tagLine: string): Promise<string> {
  if (!ACCOUNT_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${ACCOUNT_BASE_URL}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  const res = await riotFetch(url)
  const data = (await res.json()) as { puuid: string }
  return data.puuid
}

/** LoL 리그 엔트리. */
export type LolLeagueEntry = {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

export const LOL_SOLO_QUEUE = 'RANKED_SOLO_5x5'

/** LoL 키가 없으면 호출 단계를 조용히 건너뛴다(throw 하면 멤버 수만큼 로그가 오염된다). */
export function hasLolKey(): boolean {
  if (lolApiKey()) return true
  warnOnce('lol-key-missing', '[riot] RIOT_LOL_API_KEY 미설정 — Riot 조회를 건너뜁니다.')
  return false
}

/**
 * LoL 키로 PUUID 를 발급받는다(키 없음/403 degrade 래퍼). 레거시 riot_puuid 와는 값이 다르다.
 *
 * 반환값: `null` = 발급 불가(키 없음 / 403) — 호출자는 LoL 단계를 건너뛴다.
 */
export async function fetchLolPuuid(gameName: string, tagLine: string): Promise<string | null> {
  if (!hasLolKey()) return null
  try {
    return await fetchPuuid(gameName, tagLine)
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 403) {
      warnOnce(
        'lol-account-403',
        '[riot] LoL account API 403 — RIOT_LOL_API_KEY 가 만료되었거나 권한이 없습니다. LoL 랭크 수집을 건너뜁니다.',
      )
      return null
    }
    throw e
  }
}

/**
 * LoL 솔로랭크 엔트리 조회. **반드시 LoL 키로 발급받은 puuid 를 넘겨야 한다.**
 * 레거시 riot_puuid(TFT 키)를 넘기면 400(Exception decrypting)이 반환된다.
 *
 * 반환값: `null` = 조회 불가(키 없음 / 권한 미승인) — 기존 저장값을 유지해야 한다.
 *         `[]`   = 조회 성공했으나 언랭.
 * 400 은 그대로 throw 한다 — puuid 재발급 여부는 호출자가 판단한다.
 */
export async function fetchLolLeaguesByPuuid(puuid: string): Promise<LolLeagueEntry[] | null> {
  if (!LOL_LEAGUE_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  if (!hasLolKey()) return null
  const url = `${LOL_LEAGUE_BASE_URL}/${encodeURIComponent(puuid)}`
  try {
    const res = await riotFetch(url)
    return ((await res.json()) as LolLeagueEntry[]) ?? []
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 403) {
      warnOnce(
        'lol-league-403',
        '[riot] LoL API 403 — RIOT_LOL_API_KEY 에 LoL 제품 권한이 없거나 만료되었습니다. LoL 랭크 수집을 건너뜁니다.',
      )
      return null
    }
    throw e
  }
}

/** 400 재발급 2회 실패처럼 "이번 주기는 포기" 상황을 1회만 경고할 때 호출자가 쓴다. */
export function warnRiotOnce(key: string, message: string) {
  warnOnce(key, message)
}
