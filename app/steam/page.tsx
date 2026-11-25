import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import SteamLinkForm from '@/app/steam/SteamLinkForm'
import RecentPlayedList from '@/app/steam/RecentPlayedList'
import SharedGamesGrid, { type SharedGameCard } from '@/app/steam/SharedGamesGrid'
import SharedWithMe from '@/app/steam/SharedWithMe'
import SteamPresence from '@/app/steam/SteamPresence'
import { resolveAvatarUrl, withAvatarColumn } from '@/lib/members/avatar'
import { CONTAINER, SHELL } from '@/lib/ui/styles'
import HeroBanner from '@/app/components/ui/HeroBanner'
import SectionHeader from '@/app/components/ui/SectionHeader'
import EmptyState from '@/app/components/ui/EmptyState'
import SteamDeals from '@/app/steam/SteamDeals'
import SteamContentTabs from '@/app/steam/SteamContentTabs'
import { getSteamFeaturedDealSnapshot } from '@/lib/steam/featuredDealSnapshot'

// ⚠ 이 페이지는 DB 캐시와 마지막 정상 할인 스냅샷만 읽는다.
//   Steam Store API 호출은 매일 GitHub Actions가 호출하는 cron route에서만 일어난다.
//
// ⚠⚠ 이 파일에서 세션을 읽지 않는다 (cookies() / createRouteClient() / auth.getUser() 금지).
//     revalidate 는 경로 단위 공유 캐시라, 서버에서 개인화하면 A가 만든 HTML이 B에게 서빙된다.
//     개인화("나와 같은 게임")는 SharedWithMe(Client) → force-dynamic API 경로로만 흐른다.
export const revalidate = 300

export const metadata: Metadata = {
  title: '스팀 · 먼종별',
}

const STEAM_VISIBILITY_PUBLIC = 3
/** Supabase(PostgREST) 기본 응답 상한. 이 크기로 끊어서 전부 가져온다. */
const PAGE_SIZE = 1000
const MAX_PAGES = 20

type SteamMemberRow = {
  id: string
  member_name: string
  profile_image_path: string | null
  discord_avatar_url: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_synced_at: string | null
}

type OwnedRow = {
  member_id: string
  appid: number
  playtime_forever: number
  playtime_2weeks: number
  steam_apps: { appid: number; name: string | null; is_multiplayer: boolean | null; header_image_url: string | null } | null
}

type LoadResult =
  | { ok: true; members: SteamMemberRow[]; owned: OwnedRow[] }
  | { ok: false; message: string }

function formatHours(minutes: number) {
  const hours = minutes / 60
  if (hours >= 100) return `${Math.round(hours).toLocaleString('ko-KR')}시간`
  if (hours >= 10) return `${hours.toFixed(0)}시간`
  if (hours >= 1) return `${hours.toFixed(1)}시간`
  return `${minutes}분`
}

function formatSyncedAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date)
}

/**
 * 마이그레이션 미실행(컬럼/테이블 부재) 시에도 500 대신 안내로 degrade 하기 위해
 * 에러를 throw 하지 않고 결과 객체로 돌려준다.
 */
async function loadSteamData(): Promise<LoadResult> {
  const membersResult = await withAvatarColumn((cols) =>
    supabase
      .from('members')
      .select(
        `id,member_name,profile_image_path,steam_avatar_url,steam_visibility,steam_synced_at${cols}`,
      )
      // 승인 대기/거절 멤버는 노출하지 않는다 (CLAUDE.md 노출 필터 규칙)
      .eq('status', 'approved')
      .not('steam_id64', 'is', null)
      .order('member_name', { ascending: true }),
  )

  if (membersResult.error) {
    const message = membersResult.error.message ?? '조회에 실패했습니다.'
    console.error('[steam] members 조회 실패', message)
    return { ok: false, message }
  }

  const members = (membersResult.data ?? []) as SteamMemberRow[]
  if (members.length === 0) return { ok: true, members: [], owned: [] }

  const memberIds = members.map((m) => m.id)
  const owned: OwnedRow[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('steam_owned_games')
      .select(
        'member_id,appid,playtime_forever,playtime_2weeks,steam_apps!inner(appid,name,is_multiplayer,header_image_url)',
      )
      .in('member_id', memberIds)
      .order('appid', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('[steam] steam_owned_games 조회 실패', error.message)
      return { ok: false, message: error.message }
    }

    const rows = (data ?? []) as unknown as OwnedRow[]
    owned.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  return { ok: true, members, owned }
}

function buildSharedGames(members: SteamMemberRow[], owned: OwnedRow[]): SharedGameCard[] {
  // 아바타는 이미 조회한 members 행에서만 계산한다(추가 쿼리 없음). 스팀 맥락이라 steam_avatar_url 우선.
  const ownerById = new Map(
    members.map((m) => [
      m.id,
      { id: m.id, name: m.member_name, avatarUrl: m.steam_avatar_url ?? resolveAvatarUrl(m) },
    ]),
  )
  const byApp = new Map<number, SharedGameCard>()

  for (const row of owned) {
    // 싱글플레이로 확정된 게임만 제외한다. 미확인(null)은 남겨 "분류 미확인" 으로 표기.
    if (row.steam_apps?.is_multiplayer === false) continue

    const owner = ownerById.get(row.member_id)
    if (!owner) continue

    const existing = byApp.get(row.appid)
    if (existing) {
      existing.owners.push(owner)
      continue
    }
    byApp.set(row.appid, {
      appid: row.appid,
      name: row.steam_apps?.name ?? `앱 ${row.appid}`,
      isMultiplayer: row.steam_apps?.is_multiplayer ?? null,
      headerImageUrl: row.steam_apps?.header_image_url ?? null,
      owners: [owner],
    })
  }

  return [...byApp.values()]
    .filter((g) => g.owners.length >= 2)
    .sort((a, b) => b.owners.length - a.owners.length || a.name.localeCompare(b.name, 'ko'))
    .slice(0, 24)
}

type MemberStat = {
  member: SteamMemberRow
  recentMinutes: number
  recentGames: { appid: number; name: string; minutes: number }[]
}

function buildMemberStats(members: SteamMemberRow[], owned: OwnedRow[]): MemberStat[] {
  const stats = new Map<string, MemberStat>(
    members.map((m) => [m.id, { member: m, recentMinutes: 0, recentGames: [] }]),
  )

  for (const row of owned) {
    const stat = stats.get(row.member_id)
    if (!stat) continue
    if (row.playtime_2weeks > 0) {
      stat.recentMinutes += row.playtime_2weeks
      stat.recentGames.push({
        appid: row.appid,
        name: row.steam_apps?.name ?? `앱 ${row.appid}`,
        minutes: row.playtime_2weeks,
      })
    }
  }

  for (const stat of stats.values()) {
    stat.recentGames.sort((a, b) => b.minutes - a.minutes)
    stat.recentGames = stat.recentGames.slice(0, 3)
  }

  return [...stats.values()]
}

export default async function SteamPage() {
  const [result, deals] = await Promise.all([loadSteamData(), getSteamFeaturedDealSnapshot()])

  const members = result.ok ? result.members : []
  const owned = result.ok ? result.owned : []
  const sharedGames = buildSharedGames(members, owned)
  const recentPlayers = buildMemberStats(members, owned)
    .filter((s) => s.recentMinutes > 0)
    .sort((a, b) => b.recentMinutes - a.recentMinutes)
  const privateMembers = members.filter(
    (m) => m.steam_visibility != null && m.steam_visibility !== STEAM_VISIBILITY_PUBLIC,
  )
  const lastSyncedAt = members
    .map((m) => m.steam_synced_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1)

  return (
    <main className={SHELL}>
      <div className={CONTAINER}>
        <HeroBanner
          kicker="Steam"
          title="스팀 라운지"
          description="멤버들과 함께 할 게임을 찾고, 지금 누가 접속 중인지 확인하세요."
          stats={
            result.ok
              ? [
                  { label: '연결 멤버', value: `${members.length}명` },
                  { label: '함께 할 게임', value: `${sharedGames.length}개` },
                ]
              : undefined
          }
          size="md"
          className="mb-6"
        />

        {/* lg+: 왼쪽 메인(탭) + 오른쪽 사이드(작은 카드). 모바일: 내 스팀 → 접속 중 → 탭 → 최근 2주. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:items-start">
          {/* 개인화 카드 2개 — 전부 Client → force-dynamic API. 이 페이지(ISR)의 캐시와 무관하다. */}
          <aside className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1" aria-label="내 스팀과 접속 현황">
            <SteamLinkForm variant="compact" />
            <SteamPresence variant="compact" />
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <SteamContentTabs
              together={
                <section>
                  <SectionHeader title="함께 할 수 있는 게임" hint="2명 이상이 가진 멀티플레이 게임이에요." />
                  {!result.ok ? (
                    <EmptyState>스팀 데이터를 아직 사용할 수 없습니다. 잠시 후 다시 확인해주세요.</EmptyState>
                  ) : members.length === 0 ? (
                    <EmptyState>아직 스팀 계정을 연결한 멤버가 없습니다.</EmptyState>
                  ) : (
                    <SharedGamesGrid games={sharedGames} />
                  )}
                </section>
              }
              // 개인화 섹션. 이 컴포넌트의 실패는 다른 탭·사이드 카드에 영향을 주지 않는다.
              shared={<SharedWithMe />}
              deals={<SteamDeals deals={deals} />}
            />
          </div>

          {result.ok && members.length > 0 && (
            <aside className="lg:col-start-2 lg:row-start-2" aria-label="최근 2주 플레이">
              {/* 데이터는 전원 동일(ISR)하고, '나 숨기기'는 클라이언트에서만 수행한다. */}
              <RecentPlayedList
                players={recentPlayers.map((stat) => ({
                  memberId: stat.member.id,
                  memberName: stat.member.member_name,
                  avatarUrl: stat.member.steam_avatar_url ?? resolveAvatarUrl(stat.member),
                  totalText: formatHours(stat.recentMinutes),
                  gamesText: stat.recentGames.map((g) => `${g.name} ${formatHours(g.minutes)}`).join(' · '),
                }))}
              />
            </aside>
          )}
        </div>

        {result.ok && members.length > 0 && (
          <p className="mt-8 text-[11px] leading-relaxed text-subtle">
            마지막 동기화 {formatSyncedAt(lastSyncedAt ?? null) ?? '기록 없음'}
            {privateMembers.length > 0 && (
              <>
                {' · '}
                <span className="text-warn-ink/80">
                  프로필 비공개(게임 미표시): {privateMembers.map((m) => m.member_name).join(', ')}
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </main>
  )
}
