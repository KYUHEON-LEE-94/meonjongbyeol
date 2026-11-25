'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthButtons from '@/app/components/AuthButtons'
import ThemeToggle from '@/app/components/ThemeToggle'
import BrandSticker from '@/app/components/ui/BrandSticker'
import NavIcon from '@/app/components/nav/NavIcon'
import { ADMIN_HREF, NAV_SECTION_LABEL, isActive, visibleNavItems, type NavSection } from '@/app/components/nav/navItems'
import type { Viewer } from '@/app/components/nav/useViewer'
import { BADGE_DOT, BTN_ON_HERO, HERO, NAV_ITEM, NAV_ITEM_ACTIVE, NAV_SECTION } from '@/lib/ui/styles'

const SECTIONS: NavSection[] = ['main', 'me']

/** lg+ 왼쪽 고정 사이드바. lg 미만에서는 MobileTopBar·MobileTabBar 가 대신한다. */
export default function Sidebar({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname()
  const items = visibleNavItems(viewer.isLoggedIn)

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar shadow-[1px_0_0_0_var(--color-line)] lg:flex">
      <div className="flex h-20 shrink-0 items-center px-6">
        <Link href="/" className="flex items-center gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <BrandSticker size="xs" rotate={false} />
          <span className="leading-tight">
            <span className="block text-lg font-black tracking-tight text-fg">먼종별</span>
            <span className="block text-[10px] font-semibold text-subtle">먼가 종겜하는 별난 것들</span>
          </span>
        </Link>
      </div>

      <nav aria-label="주요 메뉴" className="flex-1 overflow-y-auto px-3 pb-4">
        {SECTIONS.map((section) => {
          const sectionItems = items.filter((i) => i.section === section)
          if (sectionItems.length === 0) return null
          return (
            <div key={section}>
              <p className={NAV_SECTION}>{NAV_SECTION_LABEL[section]}</p>
              <ul className="space-y-1">
                {sectionItems.map((item) => {
                  const active = isActive(pathname, item)
                  return (
                    <li key={item.href}>
                      <Link href={item.href} aria-current={active ? 'page' : undefined} className={active ? NAV_ITEM_ACTIVE : NAV_ITEM}>
                        <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {viewer.isAdmin && (
          <div>
            <p className={NAV_SECTION}>관리</p>
            <Link href={ADMIN_HREF} className={NAV_ITEM}>
              <NavIcon name="admin" className="h-5 w-5 shrink-0" />
              <span className="flex-1">관리자</span>
              <span className={BADGE_DOT} aria-hidden />
            </Link>
          </div>
        )}

        <div className={`${HERO} mx-1 mt-6 px-4 pb-4 pt-5`}>
          <span className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10 blur-xl" aria-hidden />
          <span className="absolute right-2 top-2">
            <BrandSticker size="sm" className="h-12! w-12! p-0.5!" />
          </span>
          <p className="relative pr-14 text-sm font-black leading-snug text-white">
            같이 할 사람
            <br />
            모아볼까요?
          </p>
          <Link href="/custom-games" className={`${BTN_ON_HERO} relative mt-3 w-full text-xs`}>
            내전 모집하기
          </Link>
        </div>
      </nav>

      <div className="shrink-0 space-y-2 border-t border-line p-3">
        <AuthButtons viewer={viewer} variant="sidebar-card" />
        <div className="flex items-center justify-between px-2">
          <span className="text-xs font-semibold text-subtle">테마</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
