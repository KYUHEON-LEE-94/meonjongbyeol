import { STATUS_BADGE, formatQuickCountdown, type QuickGameState } from '@/lib/customGames/display'

/**
 * 번개 LIVE / 만료 배지(표시 전용 — DB status 는 바꾸지 않는다).
 * 'use client' 없이 순수 컴포넌트로 둔다. now 는 호출자의 useNow 값(마운트 전 null 이면 렌더하지 않는다).
 */
export function QuickLiveBadge({ state, className = '' }: { state: QuickGameState; className?: string }) {
  if (state === 'live') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/10 px-2 py-0.5 text-xs font-black text-danger-ink ${className}`}
      >
        <span className="live-pulse h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
        LIVE
      </span>
    )
  }
  if (state === 'expired') {
    return (
      <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-bold ${STATUS_BADGE.ended} ${className}`}>
        만료
      </span>
    )
  }
  return null
}

/** "N자리 남음 · M분 후 시작" / 정원이 차면 "정원 마감 · M분 후 시작". 시작이 지났으면 null. */
export function quickCountdownText(
  scheduledAt: string | null | undefined,
  taken: number,
  capacity: number,
  now: number,
): string | null {
  const countdown = formatQuickCountdown(scheduledAt, now)
  if (!countdown) return null
  const remaining = Math.max(0, capacity - taken)
  return `${remaining > 0 ? `${remaining}자리 남음` : '정원 마감'} · ${countdown}`
}
