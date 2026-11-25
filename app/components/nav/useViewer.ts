'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabaseClient } from '@/lib/supabase'
import { getDiscordAvatarUrl, getDiscordDisplayName } from '@/lib/auth/discord'
import { cleanupPushSubscription } from '@/lib/push/clientUnsubscribe'

export type Viewer = {
  loading: boolean
  isLoggedIn: boolean
  displayName: string | null
  avatarUrl: string | null
  isAdmin: boolean
  logout: () => Promise<void>
}

/**
 * 세션·관리자 판정·로그아웃. AppShell 에서 **단 1회만** 호출하고 props 로 내린다.
 * 사이드바·모바일 상단바는 CSS 로만 숨겨져 둘 다 마운트되므로, 각자 호출하면
 * /api/admin/me 와 onAuthStateChange 구독이 2배가 된다.
 */
export function useViewer(): Viewer {
  const router = useRouter()

  // 초기값 true — 서버/클라 첫 렌더가 같아야 hydration 불일치가 없다.
  const [loading, setLoading] = useState(true)
  // Discord 계정은 email이 없을 수 있으므로 로그인 여부는 user 존재로 판별한다.
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    // admins 테이블은 RLS 로 브라우저(anon)에서 직접 읽을 수 없으므로
    // 관리자 판정은 서버 라우트(requireAdmin: user_id 매칭 → discord_id 폴백 → user_id 백필)에 위임한다.
    // 네트워크/조회 실패는 관리자 아님으로 조용히 degrade 한다.
    async function checkAdmin() {
      try {
        const res = await fetch('/api/admin/me', { cache: 'no-store' })
        if (!res.ok) return false
        const body = await res.json()
        return body?.ok === true
      } catch {
        return false
      }
    }

    async function applyUser(user: User | null) {
      setIsLoggedIn(!!user)
      setDisplayName(getDiscordDisplayName(user))
      setAvatarUrl(getDiscordAvatarUrl(user))

      if (!user) {
        setIsAdmin(false)
        return
      }

      const admin = await checkAdmin()
      if (!mounted) return
      setIsAdmin(admin)
    }

    async function load() {
      setLoading(true)
      const { data } = await supabaseClient.auth.getSession()
      if (!mounted) return
      await applyUser(data.session?.user ?? null)
      if (!mounted) return
      setLoading(false)
    }

    load()

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // ⚠ 순서 고정: 구독 해제 → signOut. 서버 DELETE 가 세션의 member_id 조건이라
  //   signOut 뒤에는 이 기기 구독을 지울 수 없다. cleanup 이 실패해도 로그아웃은 진행된다.
  const logout = useCallback(async () => {
    setLoading(true)
    try {
      await cleanupPushSubscription()
      await supabaseClient.auth.signOut()
    } finally {
      setLoading(false)
      router.refresh()
    }
  }, [router])

  return { loading, isLoggedIn, displayName, avatarUrl, isAdmin, logout }
}
