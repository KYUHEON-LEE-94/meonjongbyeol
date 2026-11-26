'use client'

import { useEffect, useState } from 'react'
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

export function useGamePresence(gameId: string | null | undefined): number | null {
  const [count, setCount] = useState<number | null>(null)

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
        ch.on('presence', { event: 'sync' }, () => {
          if (disposed) return
          setCount(Object.keys(ch.presenceState()).length)
        })
        timeoutTimer = setTimeout(() => {
          if (!disposed) setCount(null)
        }, SUBSCRIBE_TIMEOUT_MS)
        ch.subscribe((state) => {
          if (disposed) return
          if (state === 'SUBSCRIBED') {
            if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
            void ch.track({ t: Date.now() }).catch(() => undefined)
          } else {
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
      if (ch) {
        const p = supabaseClient.removeChannel(ch).catch(() => undefined)
        leaving.set(topic, p)
        void p.finally(() => {
          if (leaving.get(topic) === p) leaving.delete(topic)
        })
      }
    }
  }, [gameId])

  return count
}
