'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BTN_NEUTRAL, BTN_PRIMARY } from '@/lib/ui/styles'
import type { Viewer } from '@/app/components/nav/useViewer'
import { ADMIN_HREF } from '@/app/components/nav/navItems'

// 표시 전용. 세션·관리자 판정·로그아웃 로직은 AppShell 의 useViewer() 1회 호출 결과를 받는다.

function Avatar({ viewer, size }: { viewer: Viewer; size: 36 | 40 }) {
  const box = size === 40 ? 'h-10 w-10' : 'h-9 w-9'
  if (viewer.avatarUrl) {
    return (
      <Image src={viewer.avatarUrl} alt="" width={size} height={size} className={`${box} shrink-0 rounded-full object-cover`} />
    )
  }
  const initial = (viewer.displayName ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-black text-brand-ink`}>
      {initial}
    </span>
  )
}

export default function AuthButtons({
  viewer,
  variant = 'avatar',
}: {
  viewer: Viewer
  variant?: 'avatar' | 'sidebar-card'
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 바깥 클릭·ESC로 메뉴를 닫는다.
  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
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

  const handleLogout = async () => {
    setMenuOpen(false)
    await viewer.logout()
  }

  const go = (path: string) => {
    setMenuOpen(false)
    router.push(path)
  }

  if (viewer.loading) {
    return variant === 'sidebar-card' ? (
      <div className="skeleton h-16 rounded-2xl" aria-label="로딩 중" />
    ) : (
      <div className="skeleton h-9 w-9 rounded-full" aria-label="로딩 중" />
    )
  }

  if (!viewer.isLoggedIn) {
    return variant === 'sidebar-card' ? (
      <div className="rounded-2xl bg-surface-2 p-4">
        <p className="text-xs font-semibold text-muted">로그인하고 내전·포인트를 이용하세요.</p>
        <Link href="/login" className={`${BTN_PRIMARY} mt-3 w-full`}>
          로그인
        </Link>
      </div>
    ) : (
      <button onClick={() => router.push('/login')} className={BTN_NEUTRAL}>
        로그인
      </button>
    )
  }

  const menu = menuOpen && (
    <div
      role="menu"
      className={`absolute z-50 w-52 overflow-hidden rounded-3xl bg-panel shadow-[0_24px_64px_-20px_var(--color-shadow)] ring-1 ring-line ${
        variant === 'sidebar-card' ? 'bottom-full left-0 mb-2' : 'right-0 mt-2'
      }`}
    >
      {viewer.displayName && (
        <div className="border-b border-line px-4 py-3">
          <p className="text-xs font-semibold text-muted">로그인 계정</p>
          <p className="mt-0.5 truncate text-sm font-bold text-fg">{viewer.displayName}</p>
        </div>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={() => go('/profile')}
        className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
      >
        프로필
      </button>

      {viewer.isAdmin && (
        <button
          type="button"
          role="menuitem"
          onClick={() => go(ADMIN_HREF)}
          className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-brand-ink transition-colors hover:bg-surface-2"
        >
          관리
        </button>
      )}

      <button
        type="button"
        role="menuitem"
        onClick={handleLogout}
        className="block w-full border-t border-line px-4 py-2.5 text-left text-sm font-semibold text-danger-ink transition-colors hover:bg-surface-2"
      >
        로그아웃
      </button>
    </div>
  )

  if (variant === 'sidebar-card') {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="내 메뉴 열기"
          className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Avatar viewer={viewer} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-fg">{viewer.displayName ?? '멤버'}</span>
            <span className="block text-xs text-subtle">{viewer.isAdmin ? '관리자' : '멤버'}</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-subtle" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m8 10 4-4 4 4M8 14l4 4 4-4" />
          </svg>
        </button>
        {menu}
      </div>
    )
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="내 메뉴 열기"
        className="flex items-center rounded-full ring-1 ring-line transition hover:ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand/60"
      >
        <Avatar viewer={viewer} size={36} />
      </button>
      {menu}
    </div>
  )
}
