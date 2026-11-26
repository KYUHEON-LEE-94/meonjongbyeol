'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EmptyState from '@/app/components/ui/EmptyState'
import { Spinner } from '@/app/components/Spinner'
import { ALERT, BADGE, BTN_NEUTRAL, BTN_SM_NEUTRAL, CARD, INPUT, PILL, PILL_ACTIVE } from '@/lib/ui/styles'
import AdminPageHeader from '../_components/AdminPageHeader'
import AdminStat from '../_components/AdminStat'

type LogRow = { id: string; type: string; status: string; member_name: string; message: string | null; duration_ms: number | null; created_at: string }
type StaleRow = { id: string; member_name: string; last_synced_at: string | null }
type Summary = {
  last_synced_at: string | null
  stale_hours: number
  stale_count: number
  approved_count: number
  count_window_hours?: number
  counts: { success: number; skipped: number; error: number }
}
type Payload = { summary: Summary; stale: StaleRow[]; logs: LogRow[]; page: number; page_size: number; total: number; total_pages: number }
type Filter = '' | 'error' | 'skipped' | 'success'
type TypeFilter = '' | 'cron' | 'manual'

const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 300

function fmt(iso: string | null): string {
  if (!iso) return '기록 없음'
  try {
    return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(iso))
  } catch {
    return ''
  }
}
function ago(iso: string | null): string {
  if (!iso) return ''
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

/** 현재 페이지 주변 번호(최대 5개)만 보여준다. */
function pageWindow(page: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  success: { label: '성공', cls: BADGE.ok },
  skipped: { label: '스킵', cls: BADGE.neutral },
  error: { label: '실패', cls: BADGE.danger },
}

const STATUS_FILTERS: [Filter, string][] = [['', '전체'], ['error', '실패'], ['skipped', '스킵'], ['success', '성공']]
const TYPE_FILTERS: [TypeFilter, string][] = [['', '모든 실행'], ['cron', '크론'], ['manual', '수동']]

export default function LogsClient() {
  const [filter, setFilter] = useState<Filter>('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  // 늦게 도착한 이전 요청 응답이 최신 결과를 덮어쓰지 않게 요청 번호로 거른다.
  const reqSeq = useRef(0)

  const load = useCallback((opts: { status: Filter; type: TypeFilter; q: string; page: number }) => {
    const seq = ++reqSeq.current
    const params = new URLSearchParams({ page: String(opts.page), pageSize: String(PAGE_SIZE) })
    if (opts.status) params.set('status', opts.status)
    if (opts.type) params.set('type', opts.type)
    if (opts.q) params.set('q', opts.q)
    fetch(`/api/admin/sync-logs?${params.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('불러오기 실패'))))
      .then((d: Payload) => {
        if (seq !== reqSeq.current) return
        setData(d)
        setErr(null)
        // 서버가 범위를 벗어난 페이지를 마지막 페이지로 보정했으면 따라간다.
        if (d.page !== opts.page) setPage(d.page)
      })
      .catch((e) => {
        if (seq === reqSeq.current) setErr(e instanceof Error ? e.message : '오류')
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false)
      })
  }, [])

  // 검색어는 입력이 멈춘 뒤 반영하고, 검색어가 바뀌면 1페이지로 돌아간다.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = queryInput.trim()
      if (next !== query) {
        setLoading(true)
        setQuery(next)
        setPage(1)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [queryInput, query])

  useEffect(() => {
    load({ status: filter, type: typeFilter, q: query, page })
  }, [filter, typeFilter, query, page, load])

  // 로딩 표시는 이벤트 핸들러에서 켠다(effect 안에서 동기 setState 금지 — react-hooks/set-state-in-effect).
  const reload = () => {
    setLoading(true)
    load({ status: filter, type: typeFilter, q: query, page })
  }
  const goToPage = (n: number) => {
    if (n === page) return
    setLoading(true)
    setPage(n)
  }

  const s = data?.summary
  const stale = data?.stale ?? []
  const rows = data?.logs ?? []
  const totalPages = data?.total_pages ?? 1
  const windowHint = `최근 ${s?.count_window_hours ?? 24}시간`

  return (
    <div>
      <AdminPageHeader
        kicker="System"
        title="동기화 로그"
        description="멤버 랭크 동기화의 성공·스킵·실패 기록과 지연 현황을 봅니다."
        action={
          <button type="button" onClick={reload} disabled={loading} className={BTN_NEUTRAL}>
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        }
      />

      {err && <div role="alert" className={`${ALERT.error} mb-6`}>{err}</div>}

      {/* 요약 */}
      {s && (
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <AdminStat label="최근 동기화" value={ago(s.last_synced_at) || '기록 없음'} hint={fmt(s.last_synced_at)} compact className="col-span-2 lg:col-span-1" />
          <AdminStat
            label={`${s.stale_hours}시간 이상 미동기화`}
            value={`${s.stale_count} / ${s.approved_count}`}
            hint={s.stale_count > 0 ? '아래 목록 확인' : '모두 최신'}
            tone={s.stale_count > 0 ? 'danger' : 'ok'}
            className="col-span-2 lg:col-span-1"
          />
          <AdminStat label="성공" value={s.counts.success} tone="ok" hint={windowHint} />
          <AdminStat label="스킵" value={s.counts.skipped} hint={windowHint} />
          <AdminStat label="실패" value={s.counts.error} tone={s.counts.error > 0 ? 'danger' : undefined} hint={windowHint} className="col-span-2 lg:col-span-1" />
        </section>
      )}

      {/* 지연 멤버 */}
      {stale.length > 0 && (
        <section className={`${CARD} mb-6 p-5`}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-danger-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
            지연 멤버 <span className="tabular-nums text-subtle">{stale.length}</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {stale.map((m) => (
              <span key={m.id} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
                {m.member_name} · <b className="text-danger-ink">{m.last_synced_at ? ago(m.last_synced_at) : '동기화 기록 없음'}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 검색 · 필터 */}
      <section className={`${CARD} mb-4 flex flex-col gap-3 p-4 sm:p-5`}>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="멤버 이름 또는 메시지 검색"
            aria-label="동기화 로그 검색"
            maxLength={40}
            className={`${INPUT} pl-10`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="로그 상태 필터">
            {STATUS_FILTERS.map(([f, label]) => (
              <button
                key={f || 'all'}
                type="button"
                aria-pressed={filter === f}
                onClick={() => {
                  if (f !== filter) {
                    setLoading(true)
                    setFilter(f)
                    setPage(1)
                  }
                }}
                className={`${filter === f ? PILL_ACTIVE : PILL} min-h-9 px-4 text-sm`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
          <div className="flex flex-wrap gap-2" role="group" aria-label="실행 방식 필터">
            {TYPE_FILTERS.map(([t, label]) => (
              <button
                key={t || 'all'}
                type="button"
                aria-pressed={typeFilter === t}
                onClick={() => {
                  if (t !== typeFilter) {
                    setLoading(true)
                    setTypeFilter(t)
                    setPage(1)
                  }
                }}
                className={`${typeFilter === t ? PILL_ACTIVE : PILL} min-h-9 px-4 text-sm`}
              >
                {label}
              </button>
            ))}
          </div>
          {data && (
            <span className="ml-auto flex items-center gap-2 text-xs text-subtle" role="status">
              {loading && <Spinner size={3} />}
              총 <b className="tabular-nums text-fg">{data.total.toLocaleString('ko-KR')}</b>건
            </span>
          )}
        </div>
      </section>

      {/* 로그 목록 */}
      {rows.length === 0 ? (
        <EmptyState>{loading ? '불러오는 중…' : query ? `'${query}'에 맞는 로그가 없습니다.` : '로그가 없습니다.'}</EmptyState>
      ) : (
        <section className={`${CARD} overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: BADGE.neutral }
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-surface-2 sm:flex-nowrap sm:px-5">
                  <span className={`${st.cls} shrink-0`}>{st.label}</span>
                  <span className="w-28 shrink-0 truncate font-bold text-fg">{r.member_name}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-subtle">{r.type === 'cron' ? '크론' : '수동'}</span>
                  <span className="order-last min-w-0 basis-full truncate text-xs text-muted sm:order-none sm:basis-auto sm:flex-1" title={r.message ?? undefined}>
                    {r.message ?? ''}
                  </span>
                  {r.duration_ms != null && <span className="ml-auto shrink-0 text-[11px] tabular-nums text-subtle sm:ml-0">{(r.duration_ms / 1000).toFixed(1)}s</span>}
                  <span className="shrink-0 text-[11px] tabular-nums text-subtle" title={fmt(r.created_at)}>{ago(r.created_at)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* 페이지 이동 */}
      {data && totalPages > 1 && (
        <nav aria-label="로그 페이지" className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          <button type="button" onClick={() => goToPage(1)} disabled={loading || page <= 1} className={`${BTN_SM_NEUTRAL} disabled:opacity-40`} aria-label="첫 페이지">
            «
          </button>
          <button type="button" onClick={() => goToPage(Math.max(1, page - 1))} disabled={loading || page <= 1} className={`${BTN_SM_NEUTRAL} disabled:opacity-40`}>
            이전
          </button>
          {pageWindow(page, totalPages).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => goToPage(n)}
              disabled={loading}
              aria-current={n === page ? 'page' : undefined}
              className={`${n === page ? PILL_ACTIVE : PILL} min-h-9 min-w-9 justify-center tabular-nums`}
            >
              {n}
            </button>
          ))}
          <button type="button" onClick={() => goToPage(Math.min(totalPages, page + 1))} disabled={loading || page >= totalPages} className={`${BTN_SM_NEUTRAL} disabled:opacity-40`}>
            다음
          </button>
          <button type="button" onClick={() => goToPage(totalPages)} disabled={loading || page >= totalPages} className={`${BTN_SM_NEUTRAL} disabled:opacity-40`} aria-label="마지막 페이지">
            »
          </button>
          <span className="ml-2 text-xs tabular-nums text-subtle">
            {page} / {totalPages}
          </span>
        </nav>
      )}
    </div>
  )
}
