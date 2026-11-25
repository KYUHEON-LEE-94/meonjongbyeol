'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export type LedgerRow = { id: number; amount: number; description: string | null; reason: string; created_at: string }

export type PointBalanceState = {
  /** 승인 멤버만 숫자. null 이면 칩을 숨긴다 */
  balance: number | null
  ledger: LedgerRow[]
}

/**
 * 포인트 잔액·최근 내역 + 사이트 출석. AppShell 에서 **단 1회만** 호출한다
 * (사이드바·모바일 상단바가 동시에 마운트되므로 각자 호출하면 출석 POST 가 2번 나간다).
 * 로그인 상태에서만 조회하고, 경로 변경마다 재조회해 갱신한다.
 */
export function usePointBalance(isLoggedIn: boolean): PointBalanceState {
  const pathname = usePathname()
  const [balance, setBalance] = useState<number | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const attendedRef = useRef(false)

  const loadBalance = useCallback(() => {
    fetch('/api/me/points?limit=5', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        const data = d as { balance?: unknown; ledger?: unknown } | null
        setBalance(typeof data?.balance === 'number' ? data.balance : null)
        setLedger(Array.isArray(data?.ledger) ? (data.ledger as LedgerRow[]) : [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    loadBalance()
  }, [pathname, isLoggedIn, loadBalance])

  // 사이트 출석: 로드당 1회 시도(하루 1회 5P, 서버가 날짜로 dedup). 성공 후 잔액 갱신.
  useEffect(() => {
    if (!isLoggedIn || attendedRef.current) return
    attendedRef.current = true
    fetch('/api/me/attendance', { method: 'POST' })
      .then(() => loadBalance())
      .catch(() => {})
  }, [isLoggedIn, loadBalance])

  // 로그아웃 직후 이전 잔액이 남아 보이지 않도록 로그인 상태에서만 노출한다.
  return { balance: isLoggedIn ? balance : null, ledger: isLoggedIn ? ledger : [] }
}
