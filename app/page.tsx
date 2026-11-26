import Link from 'next/link'
import { supabaseService } from '@/lib/supabase/service'
import { BTN_ON_HERO, CARD, CONTAINER, SHELL } from '@/lib/ui/styles'
import HeroBanner from '@/app/components/ui/HeroBanner'
import ProfileChecklist from '@/app/components/ProfileChecklist'
import AdminPendingNotice from '@/app/components/AdminPendingNotice'
import HomeCalendar from '@/app/components/calendar/HomeCalendar'
import HomeNews from '@/app/components/home/HomeNews'
import DashboardDiscordTop5 from '@/app/components/home/DashboardDiscordTop5'
import SteamPresence from '@/app/steam/SteamPresence'
import HomeRecruitingGames, { type HomeRecruitingRow } from '@/app/components/home/HomeRecruitingGames'
import { effectiveMemberCapacity } from '@/lib/customGames/waitlist'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import { getLolPatchNotes } from '@/lib/lol/patchNotes'
import { getSteamFeaturedDealSnapshot } from '@/lib/steam/featuredDealSnapshot'
import { fetchWeeklyDiscordTop5 } from '@/lib/discord/weeklyTop5'

// ⚠ ISR(경로 단위 공유 캐시). 이 파일에서 세션을 읽지 않는다(cookies()/auth.getUser() 금지).
//   개인화(프로필 체크리스트·관리자 알림·캘린더·스팀 접속 중)는 전부 Client Island 가 동적 API 로 조회한다.
export const revalidate = 60

type RecruitingGame = Omit<HomeRecruitingRow, 'taken'>

async function safe<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise
  } catch (e) {
    console.warn(`[home] ${label} 조회 실패`, e instanceof Error ? e.message : '오류 발생')
    return fallback
  }
}

/** 마이그레이션(20260725) 미적용 환경에서도 대시보드가 죽지 않도록 신규 컬럼 부재를 흡수한다. */
async function fetchRecruiting(): Promise<{ rows: HomeRecruitingRow[]; count: number }> {
  const full = await supabaseService
    .from('custom_games')
    .select('id,title,game_kind,game_kind_label,scheduled_at,created_at,capacity', { count: 'exact' })
    .eq('status', 'recruiting')
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (!full.error) {
    const rows = (full.data ?? []) as unknown as RecruitingGame[]
    const taken = await safe('모집 중 내전 인원', fetchTakenSeats(rows), null)
    return {
      rows: rows.map((r) => ({ ...r, taken: taken?.get(r.id) })),
      count: full.count ?? 0,
    }
  }
  if (!isMissingColumnError(full.error)) {
    console.error('Supabase error:', full.error)
    return { rows: [], count: 0 }
  }

  const legacy = await supabaseService
    .from('custom_games')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'recruiting')

  return { rows: [], count: legacy.error ? 0 : legacy.count ?? 0 }
}

/**
 * 공개 인원 집계(세션 무관 — ISR 안전). taken = min(참가자, 게스트 뺀 정원) + 게스트.
 * 대기열 파생 규칙(waitlist.ts)을 재사용한다. 실패하면 null → 카드가 인원 바를 숨긴다.
 */
async function fetchTakenSeats(rows: RecruitingGame[]): Promise<Map<string, number> | null> {
  if (rows.length === 0) return new Map()
  const ids = rows.map((r) => r.id)
  const [participants, guests] = await Promise.all([
    supabaseService.from('custom_game_participants').select('custom_game_id').in('custom_game_id', ids),
    supabaseService.from('custom_game_guests').select('custom_game_id').in('custom_game_id', ids),
  ])
  if (participants.error || guests.error) return null
  const countBy = (list: { custom_game_id: string }[]) => {
    const m = new Map<string, number>()
    list.forEach((r) => m.set(r.custom_game_id, (m.get(r.custom_game_id) ?? 0) + 1))
    return m
  }
  const p = countBy(participants.data ?? [])
  const g = countBy(guests.data ?? [])
  return new Map(
    rows.map((r) => {
      const guestCount = g.get(r.id) ?? 0
      const memberCount = p.get(r.id) ?? 0
      const cap = r.capacity ?? 0
      return [r.id, Math.min(memberCount, effectiveMemberCapacity(cap, guestCount)) + guestCount]
    }),
  )
}

export default async function DashboardPage() {
  const [recruiting, lolPatchNotes, deals, discordTop5] = await Promise.all([
    safe('모집 중 내전', fetchRecruiting(), { rows: [], count: 0 }),
    safe('롤 패치 노트', getLolPatchNotes(), []),
    safe('스팀 할인', getSteamFeaturedDealSnapshot(), null),
    safe('디스코드 TOP5', fetchWeeklyDiscordTop5(), []),
  ])

  return (
    <main className={SHELL}>
      <div className={CONTAINER}>
        {/* stats 는 서버가 이미 가진 공개 집계만 — 개인화 값 금지(ISR) */}
        <HeroBanner
          kicker="Dashboard"
          title="오늘도 종겜할 사람?"
          description="종겜방 오늘의 소식 — 내전·스팀·디스코드를 한눈에"
          priority
          stats={[
            { label: '모집 중 내전', value: `${recruiting.count}건` },
            { label: '이번 주 디스코드 TOP', value: `${discordTop5.length}명` },
          ]}
          action={
            <Link href="/custom-games" className={BTN_ON_HERO}>
              내전 보러 가기
            </Link>
          }
        />

        <AdminPendingNotice />

        {/* 완료되면 null을 반환하므로 별도 grid wrapper 없이 둔다. */}
        <ProfileChecklist />

        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className={`${CARD} p-5 sm:p-6 lg:col-span-2`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight text-fg">모집 중 내전</h2>
              <Link href="/custom-games" className="text-xs font-bold text-brand-ink hover:text-brand-ink">
                전체 보기 →
              </Link>
            </div>

            {/* 실시간 갱신은 Client Island 가 맡는다. 초기값은 이 ISR 렌더의 공개 데이터. */}
            <HomeRecruitingGames initialRows={recruiting.rows} initialCount={recruiting.count} />
          </section>

          <div className="flex flex-col gap-2">
            <DashboardDiscordTop5 entries={discordTop5} />
            <Link href="/discord" className="self-end text-xs font-bold text-brand-ink hover:underline">
              디스코드 활동 전체 보기 →
            </Link>
          </div>
        </div>

        {/* 미로그인·미승인이면 SteamPresence 가 스스로 렌더하지 않는다. */}
        <div className="mb-2 flex justify-end">
          <Link href="/steam" className="text-xs font-bold text-brand-ink hover:underline">
            스팀 페이지로 →
          </Link>
        </div>
        <SteamPresence />

        {/* 세션·일정 데이터는 ISR HTML과 분리된 dynamic/no-store Client Island에서만 조회한다. */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
          <HomeCalendar />
          <HomeNews
            lolPatchNotes={lolPatchNotes.map((note) => ({ id: note.id, title: note.title, summary: note.summary, publishedAt: note.publishedAt, sourceUrl: note.sourceUrl }))}
            deals={deals}
          />
        </div>
      </div>
    </main>
  )
}
