import Link from 'next/link'
import { supabaseService } from '@/lib/supabase/service'
import { BTN_ON_HERO, CARD, CONTAINER, ICON_BTN_ROUND, LIST_ITEM, LIST_THUMB, SHELL } from '@/lib/ui/styles'
import HeroBanner from '@/app/components/ui/HeroBanner'
import ProfileChecklist from '@/app/components/ProfileChecklist'
import AdminPendingNotice from '@/app/components/AdminPendingNotice'
import HomeCalendar from '@/app/components/calendar/HomeCalendar'
import HomeNews from '@/app/components/home/HomeNews'
import DashboardDiscordTop5 from '@/app/components/home/DashboardDiscordTop5'
import SteamPresence from '@/app/steam/SteamPresence'
import { formatKstShort, gameKindLabel } from '@/lib/customGames/display'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import { getLolPatchNotes } from '@/lib/lol/patchNotes'
import { getSteamFeaturedDealSnapshot } from '@/lib/steam/featuredDealSnapshot'
import { fetchWeeklyDiscordTop5 } from '@/lib/discord/weeklyTop5'

// ⚠ ISR(경로 단위 공유 캐시). 이 파일에서 세션을 읽지 않는다(cookies()/auth.getUser() 금지).
//   개인화(프로필 체크리스트·관리자 알림·캘린더·스팀 접속 중)는 전부 Client Island 가 동적 API 로 조회한다.
export const revalidate = 60

type RecruitingGame = {
  id: string
  title: string
  game_kind: string | null
  game_kind_label: string | null
  scheduled_at: string | null
  capacity: number | null
}

async function safe<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise
  } catch (e) {
    console.warn(`[home] ${label} 조회 실패`, e instanceof Error ? e.message : '오류 발생')
    return fallback
  }
}

/** 마이그레이션(20260725) 미적용 환경에서도 대시보드가 죽지 않도록 신규 컬럼 부재를 흡수한다. */
async function fetchRecruiting(): Promise<{ rows: RecruitingGame[]; count: number }> {
  const full = await supabaseService
    .from('custom_games')
    .select('id,title,game_kind,game_kind_label,scheduled_at,capacity', { count: 'exact' })
    .eq('status', 'recruiting')
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (!full.error) {
    return { rows: (full.data ?? []) as unknown as RecruitingGame[], count: full.count ?? 0 }
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

            {recruiting.rows.length === 0 ? (
              <p className="mt-4 text-sm text-subtle">
                {recruiting.count > 0 ? `모집 중 ${recruiting.count}건` : '지금 모집 중인 내전이 없어요.'}
              </p>
            ) : (
              <ul className="-mx-3 mt-3 space-y-1">
                {recruiting.rows.map((game) => (
                  <li key={game.id}>
                    <Link href={`/custom-games/${game.id}`} className={`${LIST_ITEM} group min-h-[56px]`}>
                      <span className={`${LIST_THUMB} text-xs font-black text-brand-ink`} aria-hidden>
                        {gameKindLabel(game.game_kind, game.game_kind_label).slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-fg">{game.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-subtle">
                          {gameKindLabel(game.game_kind, game.game_kind_label)}
                          {' · '}
                          {game.scheduled_at ? formatKstShort(game.scheduled_at) : '일정 미정'}
                          {game.capacity ? ` · 정원 ${game.capacity}명` : ''}
                        </span>
                      </span>
                      <span className={`${ICON_BTN_ROUND} group-hover:bg-brand group-hover:text-white`} aria-hidden>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
