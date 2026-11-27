'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseClient } from '@/lib/supabase'

/**
 * 내전 상세 "지금 N명이 보는 중". 공개 Presence 채널 `custom-game:{id}`.
 *
 * - presence key 는 마운트마다 새 탭 id — 같은 사람이 탭 2개면 2명으로 센다(개인 식별 없음).
 *   sessionStorage 로 고정하지 않는다(탭 복제 시 key 가 겹쳐 1명으로 합쳐진다).
 * - track payload 는 `{ t }` 하나. 이름·member_id 등 개인정보를 싣지 않는다.
 * - 실패·타임아웃이면 null → 호출자가 칩을 숨긴다.
 *
 * 팀 슬롯 변경 알림(broadcast 'teams-changed')도 이 채널을 재사용한다. custom_game_teams 는 B 그룹(정책 0개)이라
 * postgres_changes 로 받을 수 없기 때문이다. payload 는 `{ t }` 하나이며 수신 측은 재조회 트리거로만 쓴다 —
 * 공개 채널이라 위조 broadcast 가 와도 서버 API 재조회만 유발할 뿐 상태를 바꾸지 못한다.
 * self:false(기본)라 발신자는 자기 이벤트를 받지 않는다 → 발신자는 성공 후 직접 재조회한다.
 *
 * ⚠ topic 이 고정이라 realtime-js 가 같은 topic 의 기존(leaving 중) 채널을 돌려줄 수 있다(R1).
 *   직전 인스턴스의 removeChannel 완료를 모듈 Map 으로 기다린 뒤 새 채널을 만든다.
 */

const SUBSCRIBE_TIMEOUT_MS = 10_000
const leaving = new Map<string, Promise<unknown>>()

function newTabKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // 폴백
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function useGamePresence(
  gameId: string | null | undefined,
  opts?: { onTeamsChanged?: () => void },
): { count: number | null; notifyTeamsChanged: () => void } {
  const [count, setCount] = useState<number | null>(null)
  const onTeamsChangedRef = useRef(opts?.onTeamsChanged)
  useEffect(() => { onTeamsChangedRef.current = opts?.onTeamsChanged })
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribedRef = useRef(false)

  const notifyTeamsChanged = useCallback(() => {
    const ch = channelRef.current
    if (!ch || !subscribedRef.current) return
    void ch.send({ type: 'broadcast', event: 'teams-changed', payload: { t: Date.now() } }).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!gameId) return
    const topic = `custom-game:${gameId}`
    let disposed = false
    let channel: RealtimeChannel | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null

    const start = async () => {
      const prev = leaving.get(topic)
      if (prev) await prev.catch(() => undefined)
      if (disposed) return
      try {
        const ch = supabaseClient.channel(topic, { config: { presence: { key: newTabKey() } } })
        channel = ch
        channelRef.current = ch
        ch.on('presence', { event: 'sync' }, () => {
          if (disposed) return
          setCount(Object.keys(ch.presenceState()).length)
        })
        // broadcast 핸들러는 subscribe 전에 등록해야 한다.
        ch.on('broadcast', { event: 'teams-changed' }, () => {
          if (disposed) return
          onTeamsChangedRef.current?.()
        })
        timeoutTimer = setTimeout(() => {
          if (!disposed) setCount(null)
        }, SUBSCRIBE_TIMEOUT_MS)
        ch.subscribe((state) => {
          if (disposed) return
          if (state === 'SUBSCRIBED') {
            subscribedRef.current = true
            if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
            void ch.track({ t: Date.now() }).catch(() => undefined)
          } else {
            subscribedRef.current = false
            setCount(null)
          }
        })
      } catch (e) {
        console.warn('[presence] 구독 실패', e instanceof Error ? e.message : '오류 발생')
        if (!disposed) setCount(null)
      }
    }
    void start()

    return () => {
      disposed = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      setCount(null)
      const ch = channel
      if (channelRef.current === ch) {
        channelRef.current = null
        subscribedRef.current = false
      }
      if (ch) {
        const p = supabaseClient.removeChannel(ch).catch(() => undefined)
        leaving.set(topic, p)
        void p.finally(() => {
          if (leaving.get(topic) === p) leaving.delete(topic)
        })
      }
    }
  }, [gameId])

  return { count, notifyTeamsChanged }
}
