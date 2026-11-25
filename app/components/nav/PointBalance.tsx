'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { PointBalanceState } from '@/app/components/nav/usePointBalance'

function formatLedgerDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(iso))
  } catch {
    return ''
  }
}

/** 포인트 잔액 칩(표시 전용). 데이터는 AppShell 의 usePointBalance 1회 호출 결과를 props 로 받는다.
 *  클릭하면 최근 내역 드롭다운을 연다. placement='up' 은 사이드바 하단 등 위로 펼칠 때. */
export default function PointBalance({
  points,
  placement = 'down',
  align = 'right',
}: {
  points: PointBalanceState
  placement?: 'down' | 'up'
  align?: 'left' | 'right'
}) {
  const { balance, ledger } = points
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (balance === null) return null

  const pos = `${placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} ${align === 'left' ? 'left-0' : 'right-0'}`

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`보유 포인트 ${balance}P, 내역 보기`}
        className="flex min-h-9 items-center gap-1.5 rounded-full bg-warn/12 px-3 py-1.5 text-xs font-black text-warn-ink transition-colors hover:bg-warn/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <span aria-hidden>🪙</span>
        <span className="font-display tabular-nums">{balance.toLocaleString()}P</span>
      </button>
      {open && (
        <div role="menu" className={`absolute ${pos} z-50 w-72 overflow-hidden rounded-3xl bg-panel shadow-[0_24px_64px_-20px_var(--color-shadow)] ring-1 ring-line`}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-black text-muted">포인트 내역</span>
            <span className="font-display text-sm font-bold text-warn-ink">{balance.toLocaleString()}P</span>
          </div>
          {ledger.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-subtle">아직 내역이 없어요.</div>
          ) : (
            <ul className="divide-y divide-line">
              {ledger.slice(0, 5).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-fg">{row.description ?? '포인트 변동'}</div>
                    <div className="text-[10px] text-subtle">{formatLedgerDate(row.created_at)}</div>
                  </div>
                  <b className={`shrink-0 text-xs font-black ${row.amount > 0 ? 'text-ok-ink' : 'text-danger-ink'}`}>
                    {row.amount > 0 ? '+' : ''}{row.amount.toLocaleString()}P
                  </b>
                </li>
              ))}
            </ul>
          )}
          <Link href="/points" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-bold text-brand-ink transition-colors hover:bg-surface-2">
            포인트 내역 상세 보기 →
          </Link>
        </div>
      )}
    </div>
  )
}
