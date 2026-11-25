import { KICKER } from '@/lib/ui/styles'

/** 관리자 페이지 상단 제목 영역(h1). 순수 컴포넌트. */
export default function AdminPageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker && <p className={`${KICKER} text-brand-ink`}>{kicker}</p>}
        <h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  )
}
