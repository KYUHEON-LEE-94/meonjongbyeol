import { CARD, STAT_LABEL } from '@/lib/ui/styles'

type Tone = 'ok' | 'warn' | 'danger' | 'brand'

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-ink',
  warn: 'text-warn-ink',
  danger: 'text-danger-ink',
  brand: 'text-brand-ink',
}
const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  brand: 'bg-brand',
}

/** 대시보드형 통계 카드. 값은 이미 클라이언트에 있는 데이터로만 계산해 넘긴다. */
export default function AdminStat({
  label,
  value,
  hint,
  tone,
  className = '',
  compact = false,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: Tone
  className?: string
  /** 날짜처럼 긴 값은 작은 글씨로. */
  compact?: boolean
}) {
  const valueColor = tone ? TONE_TEXT[tone] : 'text-fg'
  return (
    <div className={`${CARD} min-w-0 px-5 py-4 ${className}`}>
      <p className={`${STAT_LABEL} flex items-center gap-1.5 truncate`}>
        {tone && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />}
        {label}
      </p>
      <p
        className={`mt-1.5 truncate font-display font-bold tracking-tight tabular-nums ${valueColor} ${
          compact ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-subtle">{hint}</p>}
    </div>
  )
}
