'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/app/components/nav/Sidebar'
import MobileTopBar from '@/app/components/nav/MobileTopBar'
import MobileTabBar from '@/app/components/nav/MobileTabBar'
import DesktopTopbar from '@/app/components/nav/DesktopTopbar'
import { isNavHidden } from '@/app/components/nav/navItems'
import { useViewer } from '@/app/components/nav/useViewer'
import { usePointBalance } from '@/app/components/nav/usePointBalance'

/** 숨김 경로(/admin·/login·/auth·/og)는 내비·lg:pl-64 없이 children 만 렌더한다. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (isNavHidden(pathname)) return <>{children}</>
  return <NavFrame>{children}</NavFrame>
}

// 훅을 숨김 경로 판정 뒤에서 호출하기 위해 분리한다(조건부 훅 호출 금지).
// ★ useViewer·usePointBalance 는 여기서 단 1회만 호출한다. 사이드바와 모바일 상단바가 CSS 로만
//   숨겨져 동시에 마운트되므로, 각자 호출하면 /api/admin/me·출석 POST·onAuthStateChange 가 2배가 된다.
function NavFrame({ children }: { children: React.ReactNode }) {
  const viewer = useViewer()
  const points = usePointBalance(viewer.isLoggedIn)

  return (
    <>
      <Sidebar viewer={viewer} />
      <MobileTopBar viewer={viewer} points={points} />
      <div className="lg:pl-64">
        <DesktopTopbar viewer={viewer} points={points} />
        {children}
      </div>
      <MobileTabBar />
    </>
  )
}
