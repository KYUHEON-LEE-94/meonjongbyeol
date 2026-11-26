'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { ICON_BTN_ROUND, LIST_ITEM, LIST_THUMB } from '@/lib/ui/styles'
import { formatKstShort, gameKindLabel, quickGameState } from '@/lib/customGames/display'
import { useCustomGamesRealtime } from '@/app/custom-games/_components/useCustomGamesRealtime'
import { useNow } from '@/app/custom-games/_components/useNow'
import LiveToast from '@/app/custom-games/_components/LiveToast'
import SeatBar from '@/app/custom-games/_components/SeatBar'
import { QuickLiveBadge, quickCountdownText } from '@/app/custom-games/_components/QuickLiveBadge'

export type HomeRecruitingRow = {
  id: string
  title: string
  game_kind: string | null
  game_kind_label: string | null
  scheduled_at: string | null
  created_at: string | null
  capacity: number | null
  /** 공개 인원 집계(확정+게스트). 집계 실패 시 undefined → 바 숨김. */
  taken?: number
}

type ApiGame = {
  id: string
  title: string
  status: string
  game_kind?: string | null
  game_kind_label?: string | null
  scheduled_at?: string | null
  created_at?: string | null
  capacity?: number | null
  confirmed_count?: number
  waitlist_count?: number
  guest_count?: number
  latest_joiner?: { name: string; joined_at: string; is_me: boolean } | null
}

const LIMIT = 5

/**
 * 홈 '모집 중 내전' 카드(Client Island).
 * 초기값은 ISR props(세션 무관 공개 데이터). 마운트 시 추가 조회하지 않고, Realtime 이벤트·재연결 때만
 * /api/custom-games 를 다시 부른다. 시간 의존 UI(LIVE·카운트다운)는 useNow 가 생긴 뒤에만 렌더해
 * ISR HTML 과 하이드레이션이 어긋나지 않게 한다(R8).
 */
export default function HomeRecruitingGames({
  initialRows,
  initialCount,
}: {
  initialRows: HomeRecruitingRow[]
  initialCount: number
}) {
  const [rows, setRows] = useState(initialRows)
  const [count, setCount] = useState(initialCount)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const now = useNow(30_000)
  const prevRef = useRef<Map<string, { total: number; latestAt: string | null }> | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/custom-games', { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as { games?: ApiGame[]; migration_required?: boolean }
      const recruiting = (body.games ?? [])
        .filter((g) => g.status === 'recruiting')
        .sort((a, b) => {
          const ta = a.scheduled_at ? Date.parse(a.scheduled_at) : Number.POSITIVE_INFINITY
          const tb = b.scheduled_at ? Date.parse(b.scheduled_at) : Number.POSITIVE_INFINITY
          return ta - tb
        })

      const prev = prevRef.current
      if (prev) {
        const joined = recruiting.find((g) => {
          const before = prev.get(g.id)
          if (!before || !g.latest_joiner || g.latest_joiner.is_me) return false
          const total = (g.confirmed_count ?? 0) + (g.waitlist_count ?? 0)
          return total > before.total && g.latest_joiner.joined_at !== before.latestAt
        })
        if (joined?.latest_joiner) {
          setToast({ id: Date.now(), message: `${joined.latest_joiner.name}님이 ‘${joined.title}’에 방금 참가했어요` })
        }
      }
      prevRef.current = new Map(
        recruiting.map((g) => [
          g.id,
          { total: (g.confirmed_count ?? 0) + (g.waitlist_count ?? 0), latestAt: g.latest_joiner?.joined_at ?? null },
        ]),
      )

      setCount(recruiting.length)
      setRows(
        recruiting.slice(0, LIMIT).map((g) => ({
          id: g.id,
          title: g.title,
          game_kind: g.game_kind ?? null,
          game_kind_label: g.game_kind_label ?? null,
          scheduled_at: g.scheduled_at ?? null,
          created_at: g.created_at ?? null,
          capacity: g.capacity ?? null,
          taken: g.confirmed_count != null ? g.confirmed_count + (g.guest_count ?? 0) : undefined,
        })),
      )
    } catch (e) {
      console.warn('[home] 모집 중 내전 재조회 실패', e instanceof Error ? e.message : '오류 발생')
    }
  }, [])

  useCustomGamesRealtime({ scope: 'list' }, reload)

  return (
    <>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-subtle">
          {count > 0 ? `모집 중 ${count}건` : '지금 모집 중인 내전이 없어요.'}
        </p>
      ) : (
        <ul className="-mx-3 mt-3 space-y-1">
          {rows.map((game) => {
            const capacity = game.capacity ?? 0
            const taken = game.taken
            const quickState =
              now !== null && taken !== undefined && capacity > 0
                ? quickGameState({ status: 'recruiting', ...game }, taken, capacity, now)
                : null
            const countdown =
              quickState === 'live' && now !== null && taken !== undefined
                ? quickCountdownText(game.scheduled_at, taken, capacity, now)
                : null
            return (
              <li key={game.id}>
                <Link href={`/custom-games/${game.id}`} className={`${LIST_ITEM} group min-h-[56px]`}>
                  <span className={`${LIST_THUMB} text-xs font-black text-brand-ink`} aria-hidden>
                    {gameKindLabel(game.game_kind, game.game_kind_label).slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-fg">{game.title}</span>
                      <QuickLiveBadge state={quickState} className="shrink-0" />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-subtle">
                      {countdown ? (
                        <span className="font-bold text-danger-ink">{countdown}</span>
                      ) : (
                        <>
                          {gameKindLabel(game.game_kind, game.game_kind_label)}
                          {' · '}
                          {game.scheduled_at ? formatKstShort(game.scheduled_at) : '일정 미정'}
                          {taken !== undefined && capacity > 0
                            ? ` · ${taken}/${capacity}명`
                            : game.capacity
                              ? ` · 정원 ${game.capacity}명`
                              : ''}
                        </>
                      )}
                    </span>
                    {taken !== undefined && capacity > 0 && (
                      <SeatBar taken={taken} capacity={capacity} className="mt-1.5" />
                    )}
                  </span>
                  <span className={`${ICON_BTN_ROUND} group-hover:bg-brand group-hover:text-white`} aria-hidden>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <LiveToast toast={toast} onDismiss={dismissToast} />
    </>
  )
}
