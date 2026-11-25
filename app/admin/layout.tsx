'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import ThemeToggle from '@/app/components/ThemeToggle'
import BrandSticker from '@/app/components/ui/BrandSticker'
import { NAV_ITEM, NAV_ITEM_ACTIVE, NAV_SECTION } from '@/lib/ui/styles'
import AdminNavIcon from './_components/AdminNavIcon'
import { ADMIN_NAV, findAdminNavItem, isAdminNavActive } from './_components/adminNav'

const LOGIN_PATH = '/admin/login'

function AdminNavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
    return (
        <>
            {ADMIN_NAV.map((section) => (
                <div key={section.label}>
                    <p className={NAV_SECTION}>{section.label}</p>
                    <ul className="space-y-1">
                        {section.items.map((item) => {
                            const active = isAdminNavActive(pathname, item.href)
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        onClick={onNavigate}
                                        aria-current={active ? 'page' : undefined}
                                        className={active ? NAV_ITEM_ACTIVE : NAV_ITEM}
                                    >
                                        <AdminNavIcon name={item.icon} />
                                        {item.label}
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            ))}
        </>
    )
}

function BackToSiteIcon() {
    return (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 19l-7-7 7-7M3 12h18" />
        </svg>
    )
}

function AdminLogo() {
    return (
        <span className="flex items-center gap-3">
            <BrandSticker size="xs" rotate={false} />
            <span className="leading-tight">
                <span className="block text-lg font-black tracking-tight text-fg">먼종별</span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-brand-ink">관리자</span>
            </span>
        </span>
    )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    const [menuOpen, setMenuOpen] = useState(false)
    const mobileRef = useRef<HTMLDivElement>(null)

    // 바깥 클릭 · Esc 로 모바일 메뉴 닫기.
    useEffect(() => {
        if (!menuOpen) return
        const onPointerDown = (event: MouseEvent) => {
            if (mobileRef.current && !mobileRef.current.contains(event.target as Node)) setMenuOpen(false)
        }
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [menuOpen])

    // 관리자 로그인은 내비 없이 단독 화면으로 보여준다(아직 관리자 판정 전).
    if (pathname === LOGIN_PATH) {
        return <div className="min-h-dvh bg-canvas">{children}</div>
    }

    const current = findAdminNavItem(pathname)

    return (
        <div className="min-h-dvh bg-canvas">
            {/* ── lg+ 고정 사이드바 ── */}
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar shadow-[1px_0_0_0_var(--color-line)] lg:flex">
                <div className="flex h-20 shrink-0 items-center px-6">
                    <Link href="/admin/members/control" className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label="관리자 홈">
                        <AdminLogo />
                    </Link>
                </div>

                <nav aria-label="관리자 메뉴" className="flex-1 overflow-y-auto px-3 pb-4">
                    <AdminNavList pathname={pathname} />
                </nav>

                <div className="shrink-0 space-y-2 border-t border-line p-3">
                    <Link href="/" className={NAV_ITEM}>
                        <BackToSiteIcon />
                        사이트로 돌아가기
                    </Link>
                    <div className="flex items-center justify-between px-4">
                        <span className="text-xs font-semibold text-subtle">테마</span>
                        <ThemeToggle />
                    </div>
                </div>
            </aside>

            {/* ── lg 미만 상단바 + 메뉴 시트 ── */}
            <div ref={mobileRef} className="sticky top-0 z-50 lg:hidden">
                <header className="flex h-14 items-center gap-2 border-b border-line bg-canvas/90 px-4 backdrop-blur-md">
                    <button
                        type="button"
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-expanded={menuOpen}
                        aria-controls="admin-mobile-menu"
                        aria-label={menuOpen ? '관리자 메뉴 닫기' : '관리자 메뉴 열기'}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" aria-hidden>
                            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                        </svg>
                    </button>
                    <div className="min-w-0 flex-1 leading-tight">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-ink">먼종별 관리자</p>
                        <p className="truncate text-sm font-bold text-fg">{current?.label ?? '관리자'}</p>
                    </div>
                    <ThemeToggle className="shrink-0" />
                </header>

                {menuOpen && (
                    <nav
                        id="admin-mobile-menu"
                        aria-label="관리자 메뉴"
                        className="absolute inset-x-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-line bg-sidebar px-3 pb-4 shadow-[0_24px_48px_-24px_var(--color-shadow)]"
                    >
                        <AdminNavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                        <div className="mt-4 border-t border-line pt-3">
                            <Link href="/" onClick={() => setMenuOpen(false)} className={NAV_ITEM}>
                                <BackToSiteIcon />
                                사이트로 돌아가기
                            </Link>
                        </div>
                    </nav>
                )}
            </div>

            {/* ── 본문 ── */}
            <div className="lg:pl-64">
                <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
                <footer className="pb-6 text-center">
                    <p className="text-xs font-medium text-faint">© 2026 먼종별 관리자 · LoL 랭크 데이터: Riot Games API</p>
                </footer>
            </div>
        </div>
    )
}
