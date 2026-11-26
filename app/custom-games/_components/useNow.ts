'use client'

import { useEffect, useState } from 'react'

/**
 * 마운트 후에만 값이 생기는 현재 시각(ms). SSR·첫 렌더는 null — 시간 의존 UI 는 null 이면 렌더하지 않아
 * 하이드레이션 불일치를 피한다(R8). intervalMs 가 null 이면 tick 을 멈추고 마지막 값을 유지한다.
 */
export function useNow(intervalMs: number | null): number | null {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    if (intervalMs === null) return () => clearTimeout(first)
    const id = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [intervalMs])

  return now
}
