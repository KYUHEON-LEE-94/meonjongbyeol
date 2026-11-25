'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { formatDiscordVoiceDuration } from '@/lib/discord/activityHelpers'
import EmptyState from '@/app/components/ui/EmptyState'
import { ALERT, BADGE, CARD, PILL, PILL_ACTIVE, TABLE, TD, TH, TR } from '@/lib/ui/styles'
import AdminPageHeader from '../_components/AdminPageHeader'
import AdminStat from '../_components/AdminStat'

type Row = {
  memberId: string | null
  displayName: string
  avatarUrl: string | null
  linked: boolean
  voiceSeconds: number
  voiceJoins: number
  attendanceDays: number
  messages: number
}
type ApiResult = {
  status: 'ready' | 'unconfigured' | 'unavailable'
  period: { from: string; to: string }
  rows: Row[]
}

type Mode = 'day' | 'week' | 'month' | 'range'
type SortKey = 'voice' | 'days' | 'messages' | 'joins'
type SortDir = 'asc' | 'desc'

const MODE_LABELS: Record<Mode, string> = { day: '일별', week: '주별', month: '월별', range: '기간 지정' }

// 표 컬럼 = 정렬 키. 헤더를 클릭하면 그 컬럼 기준으로 정렬한다.
const METRIC_COLUMNS: { key: SortKey; label: string; render: (row: Row) => string }[] = [
  { key: 'voice', label: '음성 시간', render: (row) => formatDiscordVoiceDuration(row.voiceSeconds) },
  { key: 'days', label: '활동일', render: (row) => `${row.attendanceDays}일` },
  { key: 'messages', label: '메시지', render: (row) => row.messages.toLocaleString('ko-KR') },
  { key: 'joins', label: '음성 참여', render: (row) => `${row.voiceJoins}회` },
]

function metricValue(row: Row, key: SortKey): number {
  return key === 'voice' ? row.voiceSeconds : key === 'days' ? row.attendanceDays : key === 'messages' ? row.messages : row.voiceJoins
}

/** 날짜 문자열 산술은 UTC 자정 기준으로 처리해 브라우저 타임존 영향을 없앤다(KST는 DST 없음). */
function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)
}
function monthLastDay(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export default function DiscordActivityAdminClient({ today }: { today: string }) {
  const [mode, setMode] = useState<Mode>('week')
  const [dayDate, setDayDate] = useState(today)
  const [weekEnd, setWeekEnd] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [rangeFrom, setRangeFrom] = useState(addDays(today, -6))
  const [rangeTo, setRangeTo] = useState(today)
  const [sortKey, setSortKey] = useState<SortKey>('voice')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const period = useMemo(() => {
    if (mode === 'day') return { from: dayDate, to: dayDate }
    if (mode === 'week') return { from: addDays(weekEnd, -6), to: weekEnd }
    if (mode === 'month') {
      const to = monthLastDay(month)
      return { from: `${month}-01`, to: to > today ? today : to }
    }
    return { from: rangeFrom, to: rangeTo }
  }, [mode, dayDate, weekEnd, month, rangeFrom, rangeTo, today])

  const load = useCallback(async () => {
    if (period.from > period.to) {
      setError('시작일이 종료일보다 늦습니다.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/discord-activity?from=${period.from}&to=${period.to}`, { cache: 'no-store' })
      const body = (await res.json().catch(() => null)) as ApiResult | { error?: string } | null
      if (!res.ok || !body || !('status' in body)) {
        setError((body && 'error' in body && body.error) || '불러오지 못했습니다.')
        setData(null)
        return
      }
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const measured = data.rows.filter((r) => r.voiceSeconds > 0 || r.attendanceDays > 0 || r.messages > 0)
    return [...measured].sort((a, b) => {
      const diff = metricValue(b, sortKey) - metricValue(a, sortKey)
      const directed = sortDir === 'desc' ? diff : -diff
      return directed || a.displayName.localeCompare(b.displayName, 'ko')
    })
  }, [data, sortKey, sortDir])

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ voice: acc.voice + r.voiceSeconds, messages: acc.messages + r.messages, active: acc.active + 1 }),
    { voice: 0, messages: 0, active: 0 },
  ), [rows])

  return (
    <div>
      <AdminPageHeader
        kicker="Discord"
        title="디스코드 활동"
        description="음성 채널 체류 시간·활동일·메시지를 기간별로 집계합니다. (KST 기준)"
      />

      {/* 기간 모드 + 입력 */}
      <div className={`${CARD} mb-6 space-y-4 p-5`}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="집계 기간 단위">
          {(Object.keys(MODE_LABELS) as Mode[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={`${mode === key ? PILL_ACTIVE : PILL} min-h-9 px-4 text-sm`}
            >
              {MODE_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mode === 'day' && (
            <DateField label="날짜" value={dayDate} max={today} onChange={setDayDate} />
          )}
          {mode === 'week' && (
            <>
              <DateField label="기준일" value={weekEnd} max={today} onChange={setWeekEnd} />
              <span className="text-xs tabular-nums text-muted">→ 최근 7일 ({period.from} ~ {period.to})</span>
            </>
          )}
          {mode === 'month' && (
            <label className="flex items-center gap-2 text-xs font-bold text-muted">
              월
              <input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className={DATE_INPUT} />
            </label>
          )}
          {mode === 'range' && (
            <>
              <DateField label="시작" value={rangeFrom} max={today} onChange={setRangeFrom} />
              <DateField label="종료" value={rangeTo} max={today} onChange={setRangeTo} />
            </>
          )}
        </div>
      </div>

      {/* 요약 */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <AdminStat label="총 음성 시간" value={formatDiscordVoiceDuration(totals.voice)} compact />
        <AdminStat label="활동 멤버" value={`${totals.active}명`} compact />
        <AdminStat label="총 메시지" value={`${totals.messages.toLocaleString('ko-KR')}개`} compact />
      </div>

      {/* 결과 */}
      {loading ? (
        <EmptyState>불러오는 중…</EmptyState>
      ) : error ? (
        <div role="alert" className={ALERT.error}>{error}</div>
      ) : data && data.status !== 'ready' ? (
        <EmptyState hint="환경변수(DISCORD_ACTIVITY_*) 설정을 확인해 주세요.">Discord 활동 API를 사용할 수 없습니다.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>이 기간에 활동 기록이 없습니다.</EmptyState>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className={`${TABLE} min-w-[560px]`}>
              <thead>
                <tr className="bg-surface-2/60">
                  <th className={`${TH} w-12 text-center`}>#</th>
                  <th className={TH}>멤버</th>
                  {METRIC_COLUMNS.map((col) => {
                    const activeCol = sortKey === col.key
                    return (
                      <th key={col.key} className={`${TH} text-right`} aria-sort={activeCol ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}>
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className={`ml-auto inline-flex items-center gap-1 rounded-md uppercase tracking-[0.12em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${activeCol ? 'text-brand-ink' : 'text-subtle hover:text-fg'}`}
                        >
                          {col.label}
                          <span className="text-[9px] leading-none">{activeCol ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}</span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.memberId ?? row.displayName + index} className={TR}>
                    <td className={`${TD} text-center text-xs font-bold tabular-nums text-subtle`}>{index + 1}</td>
                    <td className={TD}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-2">
                          {row.avatarUrl ? <Image src={row.avatarUrl} alt="" fill sizes="32px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-muted">{row.displayName.slice(0, 1)}</span>}
                        </div>
                        <span className="min-w-0 truncate text-sm font-bold text-fg">{row.displayName}</span>
                        {!row.linked && <span className={`${BADGE.neutral} shrink-0`}>미연결</span>}
                      </div>
                    </td>
                    {METRIC_COLUMNS.map((col) => (
                      <td key={col.key} className={`${TD} text-right tabular-nums ${sortKey === col.key ? 'text-sm font-black text-brand-ink' : 'text-xs font-bold text-muted'}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data?.status === 'ready' && !loading && !error && (
        <p className="mt-3 text-right text-[11px] tabular-nums text-subtle">집계 기간 {data.period.from} ~ {data.period.to}</p>
      )}
    </div>
  )
}

const DATE_INPUT = 'min-h-10 rounded-2xl bg-surface-2 px-3 text-sm font-bold text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40'

function DateField({ label, value, max, onChange }: { label: string; value: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-muted">
      {label}
      <input type="date" value={value} max={max} onChange={(e) => onChange(e.target.value)} className={DATE_INPUT} />
    </label>
  )
}
