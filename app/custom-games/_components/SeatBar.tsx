/** 인원 진행 바(목록·홈 공용). 순수 컴포넌트. */
export default function SeatBar({ taken, capacity, className = '' }: { taken: number; capacity: number; className?: string }) {
  const percent = capacity > 0 ? Math.min(100, (taken / capacity) * 100) : 0
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`}
      role="progressbar"
      aria-label="인원"
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={Math.min(taken, capacity)}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${taken >= capacity ? 'bg-ok' : 'bg-brand'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
