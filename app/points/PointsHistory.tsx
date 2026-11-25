'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ALERT, BTN_GHOST, BTN_NEUTRAL, CARD, LIST_ITEM, STAT_LABEL } from '@/lib/ui/styles'
import { Spinner } from '@/app/components/Spinner'

type Row = { id: number; amount: number; description: string | null; reason: string; created_at: string; balance_after: number }
type Summary = { monthEarned: number; monthSpent: number }
type PageData = { balance: number; ledger: Row[]; hasMore: boolean; nextCursor: string | null; summary: Summary | null }

const PAGE_SIZE = 20

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const KST_TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })

function kstDayKey(d: Date): string {
  return KST_DAY.format(d)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : KST_TIME.format(d)
}

function dayLabel(key: string, today: string, yesterday: string): string {
  if (key === today) return '오늘'
  if (key === yesterday) return '어제'
  return key.replaceAll('-', '.')
}

function parsePage(d: unknown): PageData | null {
  const data = d as { balance?: unknown; ledger?: unknown; hasMore?: unknown; nextCursor?: unknown; summary?: unknown } | null
  if (!data || typeof data.balance !== 'number') return null
  const s = data.summary as { monthEarned?: unknown; monthSpent?: unknown } | null | undefined
  return {
    balance: data.balance,
    ledger: Array.isArray(data.ledger) ? (data.ledger as Row[]) : [],
    hasMore: data.hasMore === true,
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
    summary: s && typeof s.monthEarned === 'number' && typeof s.monthSpent === 'number' ? { monthEarned: s.monthEarned, monthSpent: s.monthSpent } : null,
  }
}

export default function PointsHistory() {
  const [state, setState] = useState<'loading' | 'ok' | 'unauth'>('loading')
  const [balance, setBalance] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetch(`/api/me/points?limit=${PAGE_SIZE}&summary=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (!mounted) return
        const page = parsePage(d)
        if (!page) {
          setState('unauth')
          return
        }
        setBalance(page.balance)
        setSummary(page.summary)
        setRows(page.ledger)
        setNextCursor(page.hasMore ? page.nextCursor : null)
        setState('ok')
      })
      .catch(() => {
        if (mounted) setState('unauth')
      })
    return () => {
      mounted = false
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const res = await fetch(`/api/me/points?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`, { cache: 'no-store' })
      const page = res.ok ? parsePage(await res.json()) : null
      if (!page) throw new Error('내역을 더 불러오지 못했어요.')
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id))
        return [...prev, ...page.ledger.filter((r) => !seen.has(r.id))]
      })
      setNextCursor(page.hasMore ? page.nextCursor : null)
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : '내역을 더 불러오지 못했어요.')
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore])

  const groups = useMemo(() => {
    const out: { key: string; rows: Row[] }[] = []
    for (const r of rows) {
      const d = new Date(r.created_at)
      const key = Number.isNaN(d.getTime()) ? '' : kstDayKey(d)
      const tail = out[out.length - 1]
      if (tail && tail.key === key) tail.rows.push(r)
      else out.push({ key, rows: [r] })
    }
    return out
  }, [rows])

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> 불러오는 중…
      </div>
    )
  }
  if (state === 'unauth') return <div className={ALERT.warn}>로그인한 승인 멤버만 볼 수 있어요. <Link href="/login" className="font-bold underline">로그인</Link></div>

  const now = new Date()
  const today = kstDayKey(now)
  const yesterday = kstDayKey(new Date(now.getTime() - 86_400_000))

  return (
    <div className="grid gap-5">
      <section className={`${CARD} grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center`}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className={STAT_LABEL}>보유 포인트</div>
            <div className="mt-0.5 font-display text-2xl font-bold tabular-nums text-brand-ink">{balance.toLocaleString()}P</div>
          </div>
          {summary && (
            <>
              <div>
                <div className={STAT_LABEL}>이번 달 획득</div>
                <div className="mt-0.5 font-display text-lg font-bold tabular-nums text-ok-ink">+{summary.monthEarned.toLocaleString()}P</div>
              </div>
              <div>
                <div className={STAT_LABEL}>이번 달 사용</div>
                <div className="mt-0.5 font-display text-lg font-bold tabular-nums text-danger-ink">-{summary.monthSpent.toLocaleString()}P</div>
              </div>
            </>
          )}
        </div>
        <Link href="/shop" className={BTN_NEUTRAL}>상점 가기</Link>
      </section>

      <section className={`${CARD} p-3 sm:p-4`}>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-subtle">아직 포인트 내역이 없어요.</div>
        ) : (
          <div className="grid gap-4">
            {groups.map((g) => (
              <div key={g.key || 'unknown'}>
                <h3 className="px-3 pb-1 text-xs font-bold text-subtle">{g.key ? dayLabel(g.key, today, yesterday) : '날짜 미상'}</h3>
                <ul>
                  {g.rows.map((r) => (
                    <li key={r.id} className={`${LIST_ITEM} justify-between`}>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-fg">{r.description ?? '포인트 변동'}</div>
                        <div className="text-xs text-subtle">{formatTime(r.created_at)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-sm font-black tabular-nums ${r.amount > 0 ? 'text-ok-ink' : 'text-danger-ink'}`}>{r.amount > 0 ? '+' : ''}{r.amount.toLocaleString()}P</div>
                        <div className="text-xs tabular-nums text-subtle">잔액 {r.balance_after.toLocaleString()}P</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {moreError && <div className={`${ALERT.error} mt-3`}>{moreError}</div>}
        {nextCursor && (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={loadMore} disabled={loadingMore} className={BTN_GHOST} aria-busy={loadingMore}>
              {loadingMore ? <><Spinner /> 불러오는 중…</> : '더 보기'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
