'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { H3, HINT, LIST_THUMB, SIDE_CARD } from '@/lib/ui/styles'

export type RecentPlayer = {
  memberId: string
  memberName: string
  avatarUrl: string | null
  totalText: string
  gamesText: string
}

const TOP_COUNT = 5

/**
 * "최근 2주 플레이" 사이드 카드. 데이터는 전원 동일(ISR 공유 렌더)이지만,
 * 내 기록은 '내 스팀' 카드에 이미 통합돼 있으므로 목록에서는 나를 숨긴다.
 * ★ 개인화(나 숨기기)는 클라이언트에서만 수행 — 서버 렌더 HTML 은 모두에게 동일해 ISR 캐시가 안전하다.
 */
export default function RecentPlayedList({ players }: { players: RecentPlayer[] }) {
  const [myId, setMyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/me/steam')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (alive && body?.memberId) setMyId(body.memberId as string) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const others = players.filter((player) => player.memberId !== myId)
  const visible = expanded ? others : others.slice(0, TOP_COUNT)

  return (
    <section className={SIDE_CARD}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={H3}>최근 2주 플레이</h2>
        <span className={HINT}>다른 멤버 기준</span>
      </div>

      {others.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">최근 2주 플레이 기록이 없습니다.</p>
      ) : (
        <ol className="-mx-2 space-y-0.5">
          {visible.map((player, index) => (
            <li key={player.memberId} className="flex items-center gap-3 rounded-2xl px-2 py-2">
              <span className="w-4 shrink-0 text-center font-display text-xs font-bold text-subtle tabular-nums">
                {index + 1}
              </span>
              <div className={`${LIST_THUMB} relative h-9 w-9 rounded-xl`}>
                {player.avatarUrl ? (
                  <Image src={player.avatarUrl} alt="" fill sizes="36px" className="object-cover" unoptimized />
                ) : (
                  <span className="text-xs font-bold text-subtle">{player.memberName.slice(0, 1)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-fg">{player.memberName}</p>
                <p className="truncate text-[11px] text-subtle" title={player.gamesText}>{player.gamesText}</p>
              </div>
              <span className="shrink-0 text-xs font-bold text-ok-ink tabular-nums">{player.totalText}</span>
            </li>
          ))}
        </ol>
      )}

      {others.length > TOP_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 w-full rounded-xl py-2 text-xs font-bold text-brand-ink transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {expanded ? '접기' : `전체 보기 (${others.length})`}
        </button>
      )}
    </section>
  )
}
