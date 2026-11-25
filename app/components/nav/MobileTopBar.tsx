'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthButtons from '@/app/components/AuthButtons'
import ThemeToggle from '@/app/components/ThemeToggle'
import BrandSticker from '@/app/components/ui/BrandSticker'
import NavIcon from '@/app/components/nav/NavIcon'
import PointBalance from '@/app/components/nav/PointBalance'
import { ADMIN_HREF, isActive, visibleNavItems } from '@/app/components/nav/navItems'
import type { Viewer } from '@/app/components/nav/useViewer'
import type { PointBalanceState } from '@/app/components/nav/usePointBalance'
import { BADGE_DOT } from '@/lib/ui/styles'

/** lg 미만 상단바. 하단 탭바는 주요 4개만 담으므로 햄버거로 전체 메뉴를 노출한다. */
export default function MobileTopBar({ viewer, points }: { viewer: Viewer; points: PointBalanceState }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const items = visibleNavItems(viewer.isLoggedIn)

  // 경로 변경 시 닫기는 effect가 아니라 메뉴 항목 onClick 에서 처리한다
  // (effect 안 동기 setState 는 연쇄 렌더를 유발).
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const itemClass = (active: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
      active ? 'bg-brand text-white' : 'text-muted hover:bg-surface-2 hover:text-fg'
    }`

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-5">
        <div className="relative flex items-center gap-1.5" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="전체 메뉴 열기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-muted transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-black tracking-tight text-fg">
            <BrandSticker size="xs" rotate={false} />
            먼종별
          </Link>

          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-3xl bg-panel p-2 shadow-[0_24px_64px_-20px_var(--color-shadow)] ring-1 ring-line"
            >
              {items.map((item) => {
                const active = isActive(pathname, item)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={itemClass(active)}
                  >
                    <NavIcon name={item.icon} className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                )
              })}
              {viewer.isAdmin && (
                <Link href={ADMIN_HREF} role="menuitem" onClick={() => setMenuOpen(false)} className={itemClass(false)}>
                  <NavIcon name="admin" className="h-[18px] w-[18px]" />
                  <span className="flex-1">관리자</span>
                  <span className={BADGE_DOT} aria-hidden />
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <PointBalance points={points} />
          <ThemeToggle />
          <AuthButtons viewer={viewer} variant="avatar" />
        </div>
      </div>
    </header>
  )
}
