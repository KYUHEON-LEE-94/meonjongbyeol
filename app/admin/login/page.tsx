'use client'

import { useState } from 'react'
import Link from 'next/link'
import BrandSticker from '@/app/components/ui/BrandSticker'
import { supabaseClient } from '@/lib/supabase'
import { ALERT, CARD, HERO } from '@/lib/ui/styles'

function DiscordIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.21.375-.45.88-.617 1.284a18.32 18.32 0 0 0-5.53 0A12.66 12.66 0 0 0 9.11 3a19.74 19.74 0 0 0-4.435 1.372C1.878 8.55 1.12 12.62 1.5 16.634a19.93 19.93 0 0 0 6.06 3.058c.49-.67.926-1.382 1.3-2.13a12.9 12.9 0 0 1-2.048-.985c.172-.126.34-.257.502-.392 3.95 1.826 8.227 1.826 12.13 0 .164.135.332.266.503.392-.654.386-1.34.716-2.05.986.375.747.81 1.459 1.3 2.129a19.9 19.9 0 0 0 6.063-3.058c.443-4.65-.762-8.683-3.193-12.265ZM8.35 14.19c-1.183 0-2.157-1.085-2.157-2.418 0-1.332.953-2.418 2.157-2.418 1.213 0 2.18 1.096 2.157 2.418 0 1.333-.953 2.418-2.157 2.418Zm7.3 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.332.953-2.418 2.157-2.418 1.213 0 2.18 1.096 2.157 2.418 0 1.333-.944 2.418-2.157 2.418Z" />
        </svg>
    )
}

export default function AdminLoginPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleDiscordLogin = async () => {
        setLoading(true)
        setError(null)

        try {
            const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
                provider: 'discord',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/admin/members/sync')}`,
                },
            })

            if (oauthError) {
                setError(oauthError.message)
                setLoading(false)
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '로그인 중 오류 발생')
            setLoading(false)
        }
    }

    return (
        <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
            <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
                <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-sm">
                <section className={`${HERO} px-6 py-6`}>
                    <span className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
                    <div className="relative flex items-center gap-4">
                        <BrandSticker size="sm" className="h-16! w-16!" />
                        <div>
                            <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Admin</p>
                            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-white">관리자 로그인</h1>
                            <p className="mt-0.5 text-sm text-white/85">먼종별 운영진 전용</p>
                        </div>
                    </div>
                </section>

                <div className={`${CARD} mt-4 p-6`}>
                    <p className="text-sm text-muted">관리자로 등록된 Discord 계정으로 로그인하세요.</p>

                    {error && <div className={`${ALERT.error} mt-4`}>{error}</div>}

                    <button
                        type="button"
                        onClick={handleDiscordLogin}
                        disabled={loading}
                        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2.5 rounded-2xl bg-discord px-4 py-3 text-sm font-bold text-white shadow-lg shadow-discord/25 transition hover:bg-discord-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60"
                    >
                        <DiscordIcon />
                        {loading ? '디스코드로 이동 중…' : '디스코드로 로그인'}
                    </button>
                </div>

                <p className="mt-6 text-center text-xs">
                    <Link href="/" className="font-semibold text-subtle transition-colors hover:text-fg">
                        ← 사이트로 돌아가기
                    </Link>
                </p>
            </div>
        </main>
    )
}
