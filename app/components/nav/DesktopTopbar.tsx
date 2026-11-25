'use client'

import { usePathname } from 'next/navigation'
import ThemeToggle from '@/app/components/ThemeToggle'
import PointBalance from '@/app/components/nav/PointBalance'
import { sectionLabel } from '@/app/components/nav/navItems'
import type { Viewer } from '@/app/components/nav/useViewer'
import type { PointBalanceState } from '@/app/components/nav/usePointBalance'

/** lg+ 본문 상단바. 인사말·섹션 라벨 + 포인트·테마.
 *  섹션 라벨은 h1 이 아니다(페이지 h1 은 HeroBanner 가 갖는다).
 *  검색·알림 아이콘은 실제 기능이 없으므로 두지 않는다. */
export default function DesktopTopbar({ viewer, points }: { viewer: Viewer; points: PointBalanceState }) {
  const pathname = usePathname()
  const greeting = viewer.loading ? ' ' : `Hi ${viewer.displayName ?? '게스트'},`

  return (
    <div className="hidden h-20 items-center justify-between gap-4 px-8 lg:flex">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted">{greeting}</p>
        <p className="text-2xl font-black tracking-tight text-fg">{sectionLabel(pathname)}</p>
      </div>
      <div className="flex items-center gap-2">
        <PointBalance points={points} />
        <ThemeToggle />
      </div>
    </div>
  )
}
