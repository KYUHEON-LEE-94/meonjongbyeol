'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NavIcon from '@/app/components/nav/NavIcon'
import { TAB_ITEMS, isActive } from '@/app/components/nav/navItems'

/** lg 미만 하단 탭바. safe-area-inset-bottom 만큼 아래 여백을 둬 iOS 홈 인디케이터를 피한다.
 *  콘텐츠 가림은 SHELL / TABBAR_SAFE_PB 의 pb-28 이 막는다. */
export default function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="하단 주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_36px_-24px_var(--color-shadow)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {TAB_ITEMS.map((item) => {
          const active = isActive(pathname, item)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50 ${
                  active ? 'text-brand-ink' : 'text-subtle'
                }`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-brand/15' : ''}`}>
                  <NavIcon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold leading-none">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
