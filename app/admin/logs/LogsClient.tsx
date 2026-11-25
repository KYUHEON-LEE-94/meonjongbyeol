'use client'

import { useCallback, useEffect, useState } from 'react'
import EmptyState from '@/app/components/ui/EmptyState'
import { ALERT, BADGE, BTN_NEUTRAL, CARD, PILL, PILL_ACTIVE } from '@/lib/ui/styles'
import AdminPageHeader from '../_components/AdminPageHeader'
import AdminStat from '../_components/AdminStat'

type LogRow = { id: string; type: string; status: string; member_name: string; message: string | null; duration_ms: number | null; created_at: string }
type StaleRow = { id: string; member_name: string; last_synced_at: string | null }
type Summary = { last_synced_at: string | null; stale_hours: number; stale_count: number; approved_count: number; counts: { success: number; skipped: number; error: number } }
type Payload = { summary: Summary; stale: StaleRow[]; logs: LogRow[] }
type Filter = '' | 'error' | 'skipped' | 'success'

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

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  success: { label: '성공', cls: BADGE.ok },
  skipped: { label: '스킵', cls: BADGE.neutral },
  error: { label: '실패', cls: BADGE.danger },
}

export default function LogsClient() {
  const [filter, setFilter] = useState<Filter>('')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback((f: Filter) => {
    fetch(`/api/admin/sync-logs?limit=150${f ? `&status=${f}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('불러오기 실패'))))
      .then((d: Payload) => { setData(d); setErr(null) })
      .catch((e) => setErr(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const s = data?.summary
  const stale = (data?.stale ?? [])
  const rows = data?.logs ?? []

  return (
    <div>
      <AdminPageHeader
        kicker="System"
        title="동기화 로그"
        description="멤버 랭크 동기화의 성공·스킵·실패 기록과 지연 현황을 봅니다."
        action={
          <button type="button" onClick={() => { setLoading(true); load(filter) }} disabled={loading} className={BTN_NEUTRAL}>
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
          <AdminStat label="성공" value={s.counts.success} tone="ok" hint="최근 로그" />
          <AdminStat label="스킵" value={s.counts.skipped} hint="최근 로그" />
          <AdminStat label="실패" value={s.counts.error} tone={s.counts.error > 0 ? 'danger' : undefined} hint="최근 로그" className="col-span-2 lg:col-span-1" />
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

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="로그 상태 필터">
        {([['', '전체'], ['error', '실패'], ['skipped', '스킵'], ['success', '성공']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => { if (f !== filter) { setLoading(true); setFilter(f) } }} className={`${filter === f ? PILL_ACTIVE : PILL} min-h-9 px-4 text-sm`}>
            {label}
          </button>
        ))}
      </div>

      {/* 로그 목록 */}
      {rows.length === 0 ? (
        <EmptyState>{loading ? '불러오는 중…' : '로그가 없습니다.'}</EmptyState>
      ) : (
        <section className={`${CARD} overflow-hidden`}>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: BADGE.neutral }
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-surface-2 sm:flex-nowrap sm:px-5">
                  <span className={`${st.cls} shrink-0`}>{st.label}</span>
                  <span className="w-28 shrink-0 truncate font-bold text-fg">{r.member_name}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-subtle">{r.type === 'cron' ? '크론' : '수동'}</span>
                  <span className="order-last min-w-0 basis-full truncate text-xs text-muted sm:order-none sm:basis-auto sm:flex-1">{r.message ?? ''}</span>
                  {r.duration_ms != null && <span className="ml-auto shrink-0 text-[11px] tabular-nums text-subtle sm:ml-0">{(r.duration_ms / 1000).toFixed(1)}s</span>}
                  <span className="shrink-0 text-[11px] tabular-nums text-subtle" title={fmt(r.created_at)}>{ago(r.created_at)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
