'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabaseClient } from '@/lib/supabase'

/**
 * 내전 Realtime = "재조회 트리거" 전용.
 *
 * payload 는 신뢰하지 않는다 — 대기열(순번 파생)·can_manage·my_participation 은 서버 API 만 계산한다.
 * 이벤트가 오면 디바운스(400ms) + 지터(0~600ms) 뒤 onTrigger 1회. 실행 중에 또 오면 dirty 로 표시해
 * 끝난 뒤 1회만 더 부른다. 탭이 숨겨져 있으면 보류했다가 visible 이 될 때 1회.
 * 재연결(두 번째 이후 SUBSCRIBED)이면 놓친 변경을 메우려 1회 catch-up 한다.
 *
 * publication 미적용·WS 차단이면 이벤트가 오지 않을 뿐이다(최초 fetch 경로는 호출자가 그대로 가진다).
 * "실시간 연결됨"을 단정하는 UI 에 status 를 쓰지 않는다.
 */

export type RealtimeTarget = { scope: 'list' } | { scope: 'game'; gameId: string }
export type RealtimeStatus = 'connecting' | 'live' | 'unavailable'

const DEBOUNCE_MS = 400
const JITTER_MS = 600
const SUBSCRIBE_TIMEOUT_MS = 10_000

type Row = Record<string, unknown>

function newInstanceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // 비보안 컨텍스트 등 — 아래 폴백
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function useCustomGamesRealtime(
  target: RealtimeTarget,
  onTrigger: () => void | Promise<void>,
  opts?: { enabled?: boolean },
): { status: RealtimeStatus } {
  const enabled = opts?.enabled ?? true
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const onTriggerRef = useRef(onTrigger)
  useEffect(() => { onTriggerRef.current = onTrigger })

  const scope = target.scope
  const gameId = target.scope === 'game' ? target.gameId : null

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let running = false
    let dirty = false
    let pendingHidden = false
    let subscribedOnce = false

    const run = async () => {
      if (disposed) return
      if (typeof document !== 'undefined' && document.hidden) {
        pendingHidden = true
        return
      }
      if (running) {
        dirty = true
        return
      }
      running = true
      try {
        await onTriggerRef.current()
      } catch (e) {
        console.warn('[realtime] 재조회 실패', e instanceof Error ? e.message : '오류 발생')
      } finally {
        running = false
        if (dirty && !disposed) {
          dirty = false
          schedule()
        }
      }
    }

    const schedule = () => {
      if (disposed) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void run()
      }, DEBOUNCE_MS + Math.floor(Math.random() * JITTER_MS))
    }

    const onVisible = () => {
      if (!document.hidden && pendingHidden) {
        pendingHidden = false
        schedule()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    // ⚠ topic 은 인스턴스마다 고유해야 한다. realtime-js 는 같은 topic 이면 기존 채널을 돌려주고
    //   removeChannel 이 비동기라, StrictMode 재마운트 시 leaving 중인 채널을 재사용해 이벤트가 끊긴다(R1).
    const topic = `cg-live:${scope}:${gameId ?? 'all'}:${newInstanceId()}`
    let channel: RealtimeChannel | null = null

    try {
      channel = supabaseClient.channel(topic)
      if (scope === 'list') {
        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_games' }, schedule)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_game_participants' }, schedule)
      } else if (gameId) {
        channel
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'custom_games', filter: `id=eq.${gameId}` },
            schedule,
          )
          // DELETE 는 서버측 필터가 동작하지 않는다 — old.id 로 직접 거른다.
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'custom_games' },
            (payload: RealtimePostgresChangesPayload<Row>) => {
              const old = payload.old as Partial<Row> | undefined
              if (old && old.id === gameId) schedule()
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'custom_game_participants',
              filter: `custom_game_id=eq.${gameId}`,
            },
            schedule,
          )
          // 참가 DELETE 의 old 는 PK 만 담겨(REPLICA IDENTITY 기본) 내전을 구분할 수 없다.
          // 무조건 트리거하고 디바운스·지터가 흡수한다.
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'custom_game_participants' }, schedule)
      }

      timeoutTimer = setTimeout(() => {
        if (!disposed && !subscribedOnce) setStatus('unavailable')
      }, SUBSCRIBE_TIMEOUT_MS)

      channel.subscribe((state) => {
        if (disposed) return
        if (state === 'SUBSCRIBED') {
          if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
          setStatus('live')
          if (subscribedOnce) schedule()
          subscribedOnce = true
        } else {
          setStatus('unavailable')
        }
      })
    } catch (e) {
      console.warn('[realtime] 구독 실패', e instanceof Error ? e.message : '오류 발생')
      setStatus('unavailable')
    }

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) {
        void supabaseClient.removeChannel(channel).catch(() => undefined)
      }
    }
  }, [enabled, scope, gameId])

  return { status }
}
