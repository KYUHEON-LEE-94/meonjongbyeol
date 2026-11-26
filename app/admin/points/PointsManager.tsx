'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EmptyState from '@/app/components/ui/EmptyState'
import MemberAvatar from '@/app/components/MemberAvatar'
import { Spinner } from '@/app/components/Spinner'
import {
  ALERT,
  BADGE,
  BTN_DANGER,
  BTN_NEUTRAL,
  BTN_PRIMARY,
  BTN_SM_NEUTRAL,
  CARD,
  H2,
  HINT,
  INPUT,
  LABEL,
  PILL,
  PILL_ACTIVE,
  TABLE,
  TD,
  TH,
  TR,
} from '@/lib/ui/styles'
import AdminPageHeader from '../_components/AdminPageHeader'
import AdminStat from '../_components/AdminStat'

type Member = { id: string; name: string; balance: number; avatar_url?: string | null }
type Ledger = {
  id: number
  member_id?: string
  member_name: string
  member_avatar_url?: string | null
  amount: number
  reason: string
  description: string | null
  balance_after: number
  created_at: string
  actor_name: string
}
type Summary = { total_balance: number; member_count: number; earned_24h: number; spent_24h: number; window_hours?: number }
type Payload = {
  members: Member[]
  ledger: Ledger[]
  page: number
  total: number
  total_pages: number
  summary?: Summary | null
}
type SignFilter = '' | 'earn' | 'spend'
type MemberFilter = { id: string; name: string } | null
type Result = { tone: 'ok' | 'error'; text: string } | null

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300
const MEMBER_SEARCH_DEBOUNCE_MS = 250
const QUICK_AMOUNTS = [10, 50, 100, 500]

// 레거시 사유(hall_of_fame 등)도 과거 내역 표시용으로 남겨 둔다.
const REASON_LABEL: Record<string, string> = {
  daily_login: '출석',
  custom_game_participation: '내전 참여',
  cosmetic_purchase: '꾸미기 구매',
  shop_purchase: '상점 구매',
  admin_adjustment: '관리자',
  hall_of_fame: '명예의 전당',
}
const REASON_STYLE: Record<string, string> = {
  daily_login: BADGE.info,
  custom_game_participation: BADGE.brand,
  cosmetic_purchase: BADGE.danger,
  shop_purchase: BADGE.danger,
  admin_adjustment: BADGE.neutral,
  hall_of_fame: BADGE.warn,
}
const REASON_OPTIONS: [string, string][] = [['', '전체 유형'], ...Object.entries(REASON_LABEL)]
const SIGN_FILTERS: [SignFilter, string][] = [['', '전체'], ['earn', '지급'], ['spend', '차감']]

const DATE_FMT = new Intl.DateTimeFormat('ko-KR', {
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
})

function fmtDate(iso: string): string {
  try {
    return DATE_FMT.format(new Date(iso))
  } catch {
    return ''
  }
}

function fmtPoints(n: number, signed = false): string {
  const body = `${n.toLocaleString('ko-KR')}P`
  return signed && n > 0 ? `+${body}` : body
}

/** 현재 페이지 주변 번호(최대 5개)만 보여준다. */
function pageWindow(page: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function isPayload(value: unknown): value is Payload {
  return !!value && typeof value === 'object' && 'members' in value && 'ledger' in value
}

function errorText(value: unknown, fallback: string): string {
  return value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : fallback
}

function SearchIcon() {
  return (
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
  )
}

function Chip({ label, onClear, clearLabel }: { label: React.ReactNode; onClear: () => void; clearLabel: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand/12 py-1 pl-3 pr-1 text-xs font-bold text-brand-ink">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </span>
  )
}

const AVATAR_SM = 'h-8 w-8 shrink-0 rounded-full bg-brand/15 text-xs font-black text-brand-ink'

export default function PointsManager() {
  // ── 지급·차감 폼 ──
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [memberQInput, setMemberQInput] = useState('')
  const [selected, setSelected] = useState<Member | null>(null)
  const [sign, setSign] = useState<1 | -1>(1)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [requestId, setRequestId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result>(null)

  // ── 내역 ──
  const [ledger, setLedger] = useState<Ledger[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [ledgerQInput, setLedgerQInput] = useState('')
  const [ledgerQ, setLedgerQ] = useState('')
  const [reasonFilter, setReasonFilter] = useState('')
  const [signFilter, setSignFilter] = useState<SignFilter>('')
  const [memberFilter, setMemberFilter] = useState<MemberFilter>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // 늦게 도착한 이전 요청 응답이 최신 결과를 덮어쓰지 않게 요청 번호로 거른다.
  const ledgerSeq = useRef(0)
  const memberSeq = useRef(0)

  const loadLedger = useCallback(
    (opts: { page: number; q: string; reason: string; sign: SignFilter; memberId: string | null }) => {
      const seq = ++ledgerSeq.current
      const params = new URLSearchParams({ page: String(opts.page), pageSize: String(PAGE_SIZE) })
      if (opts.q) params.set('ledgerQ', opts.q)
      if (opts.reason) params.set('reason', opts.reason)
      if (opts.sign) params.set('sign', opts.sign)
      if (opts.memberId) params.set('memberId', opts.memberId)
      fetch(`/api/admin/points?${params.toString()}`, { cache: 'no-store' })
        .then(async (res) => {
          const data: unknown = await res.json().catch(() => null)
          if (!res.ok || !isPayload(data)) throw new Error(errorText(data, '포인트 내역을 불러오지 못했습니다.'))
          return data
        })
        .then((d) => {
          if (seq !== ledgerSeq.current) return
          setLedger(d.ledger)
          setSummary(d.summary ?? null)
          setTotal(d.total ?? d.ledger.length)
          setTotalPages(d.total_pages ?? 1)
          setErr(null)
          setLoaded(true)
          // 서버가 범위를 벗어난 페이지를 마지막 페이지로 보정했으면 따라간다.
          if (d.page && d.page !== opts.page) setPage(d.page)
        })
        .catch((e) => {
          if (seq === ledgerSeq.current) setErr(e instanceof Error ? e.message : '오류가 발생했습니다.')
        })
        .finally(() => {
          if (seq === ledgerSeq.current) setLoading(false)
        })
    },
    [],
  )

  const loadMembers = useCallback((q: string) => {
    const seq = ++memberSeq.current
    const params = new URLSearchParams({ page: '1', pageSize: '10' })
    if (q) params.set('q', q)
    fetch(`/api/admin/points?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok || !isPayload(data)) throw new Error(errorText(data, '멤버 목록을 불러오지 못했습니다.'))
        return data
      })
      .then((d) => {
        if (seq !== memberSeq.current) return
        setMembers(d.members)
        // 선택된 멤버의 잔액도 최신값으로 맞춘다(검색 결과에 없으면 기존 값 유지).
        setSelected((prev) => (prev ? d.members.find((m) => m.id === prev.id) ?? prev : prev))
      })
      .catch((e) => {
        if (seq === memberSeq.current) setResult({ tone: 'error', text: e instanceof Error ? e.message : '멤버 목록을 불러오지 못했습니다.' })
      })
      .finally(() => {
        if (seq === memberSeq.current) setMembersLoading(false)
      })
  }, [])

  // 멤버 검색은 입력이 멈춘 뒤 서버에 묻는다.
  useEffect(() => {
    const t = setTimeout(() => loadMembers(memberQInput.trim()), MEMBER_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [memberQInput, loadMembers])

  // 내역 검색어는 입력이 멈춘 뒤 반영하고, 바뀌면 1페이지로 돌아간다.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = ledgerQInput.trim()
      if (next !== ledgerQ) {
        setLoading(true)
        setLedgerQ(next)
        setPage(1)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [ledgerQInput, ledgerQ])

  useEffect(() => {
    loadLedger({ page, q: ledgerQ, reason: reasonFilter, sign: signFilter, memberId: memberFilter?.id ?? null })
  }, [page, ledgerQ, reasonFilter, signFilter, memberFilter, loadLedger])

  // 로딩 표시는 이벤트 핸들러에서 켠다(effect 안에서 동기 setState 금지 — react-hooks/set-state-in-effect).
  const goToPage = (n: number) => {
    if (n === page) return
    setLoading(true)
    setPage(n)
  }
  const changeReason = (value: string) => {
    if (value === reasonFilter) return
    setLoading(true)
    setReasonFilter(value)
    setPage(1)
  }
  const changeSignFilter = (value: SignFilter) => {
    if (value === signFilter) return
    setLoading(true)
    setSignFilter(value)
    setPage(1)
  }
  const changeMemberFilter = (value: MemberFilter) => {
    if ((value?.id ?? null) === (memberFilter?.id ?? null)) return
    setLoading(true)
    setMemberFilter(value)
    setPage(1)
  }
  const reload = () => {
    setLoading(true)
    loadLedger({ page, q: ledgerQ, reason: reasonFilter, sign: signFilter, memberId: memberFilter?.id ?? null })
    loadMembers(memberQInput.trim())
  }

  // 입력이 바뀌면 새 요청으로 본다(requestId 초기화). 실패 후 같은 입력으로 재시도하면 같은 id 를 쓴다.
  const changeSign = (next: 1 | -1) => {
    setSign(next)
    setRequestId('')
  }
  const selectMember = (m: Member | null) => {
    setSelected(m)
    setRequestId('')
  }
  const changeAmount = (value: string) => {
    setAmount(value)
    setRequestId('')
  }
  const changeDescription = (value: string) => {
    setDescription(value)
    setRequestId('')
  }

  async function grant() {
    if (!selected) return
    setSubmitting(true)
    setResult(null)
    const id = requestId || crypto.randomUUID()
    setRequestId(id)
    try {
      const res = await fetch('/api/admin/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: selected.id, amount: sign * Number(amount), requestId: id, description }),
      })
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        setResult({ tone: 'error', text: errorText(data, sign > 0 ? '지급하지 못했습니다.' : '차감하지 못했습니다.') })
        return
      }
      setResult({
        tone: 'ok',
        text: `${selected.name}님에게 ${Number(amount).toLocaleString('ko-KR')}P를 ${sign > 0 ? '지급' : '차감'}했습니다.`,
      })
      setAmount('')
      setDescription('')
      setRequestId('')
      // 내역은 1페이지로 돌아가 방금 처리한 행을 보여주고, 통계·잔액도 다시 읽는다.
      setLoading(true)
      if (page !== 1) setPage(1)
      else loadLedger({ page: 1, q: ledgerQ, reason: reasonFilter, sign: signFilter, memberId: memberFilter?.id ?? null })
      loadMembers(memberQInput.trim())
    } catch (e) {
      setResult({
        tone: 'error',
        text: e instanceof Error ? `네트워크 오류가 발생했습니다. 같은 요청으로 다시 시도해 주세요. (${e.message})` : '네트워크 오류가 발생했습니다. 같은 요청으로 다시 시도해 주세요.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const amountNum = Number(amount)
  const amountValid = Number.isInteger(amountNum) && amountNum >= 1 && amountNum <= 10000
  const canSubmit = !submitting && !!selected && amountValid && description.trim().length > 0
  const nextBalance = selected && amountValid ? selected.balance + sign * amountNum : null
  const segBtn = (active: boolean, tone: 'brand' | 'danger') =>
    `flex-1 min-h-10 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
      active ? (tone === 'brand' ? 'bg-brand text-white' : 'bg-danger text-white') : 'text-muted hover:text-fg'
    }`
  const windowHint = `최근 ${summary?.window_hours ?? 24}시간`

  return (
    <section>
      <AdminPageHeader
        kicker="Points"
        title="포인트 관리"
        description="승인 멤버에게 운영 포인트를 지급·차감하고 전체 포인트 내역을 봅니다."
        action={
          <button type="button" onClick={reload} disabled={loading} className={BTN_NEUTRAL}>
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        }
      />

      {/* 요약 */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat label="총 보유 포인트" value={summary ? fmtPoints(summary.total_balance) : '—'} hint="승인 멤버 잔액 합계" tone="brand" />
        <AdminStat label="승인 멤버" value={summary ? summary.member_count.toLocaleString('ko-KR') : '—'} hint="지급 대상" />
        <AdminStat label="24시간 지급" value={summary ? fmtPoints(summary.earned_24h, true) : '—'} hint={windowHint} tone="ok" />
        <AdminStat
          label="24시간 차감"
          value={summary ? fmtPoints(summary.spent_24h) : '—'}
          hint={windowHint}
          tone={summary && summary.spent_24h < 0 ? 'danger' : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        {/* ── 지급·차감 ── */}
        <div className={`${CARD} flex flex-col gap-5 p-5 sm:p-6 lg:sticky lg:top-6`}>
          <div>
            <h2 className={H2}>포인트 지급·차감</h2>
            <p className={`${HINT} mt-1`}>처리 내역은 오른쪽 목록에 바로 기록됩니다.</p>
          </div>

          <div className="flex rounded-2xl bg-surface-2 p-1" role="group" aria-label="지급 / 차감 선택">
            <button type="button" aria-pressed={sign > 0} onClick={() => changeSign(1)} className={segBtn(sign > 0, 'brand')}>
              지급 (+)
            </button>
            <button type="button" aria-pressed={sign < 0} onClick={() => changeSign(-1)} className={segBtn(sign < 0, 'danger')}>
              차감 (−)
            </button>
          </div>

          {/* 대상 멤버 */}
          <div className="space-y-2">
            <span className={LABEL}>대상 멤버</span>
            {selected && (
              <div className="flex items-center gap-2">
                <Chip
                  label={`${selected.name} · ${fmtPoints(selected.balance)}`}
                  onClear={() => selectMember(null)}
                  clearLabel={`${selected.name} 선택 해제`}
                />
              </div>
            )}
            <div className="relative">
              <SearchIcon />
              <input
                type="search"
                className={`${INPUT} pl-10`}
                placeholder="이름으로 검색"
                aria-label="지급 대상 멤버 검색"
                maxLength={50}
                value={memberQInput}
                onChange={(e) => setMemberQInput(e.target.value)}
              />
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-2xl bg-surface-2/50 p-1.5" aria-label="멤버 목록">
              {members.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-subtle">{membersLoading ? '불러오는 중…' : '검색 결과가 없습니다.'}</li>
              ) : (
                members.map((m) => {
                  const active = selected?.id === m.id
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectMember(active ? null : m)}
                        className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                          active ? 'bg-brand/12 ring-2 ring-brand' : 'hover:bg-surface-2'
                        }`}
                      >
                        <MemberAvatar src={m.avatar_url} name={m.name} size={32} className={AVATAR_SM} />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{m.name}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{fmtPoints(m.balance)}</span>
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${active ? 'bg-brand text-white' : 'bg-surface text-transparent'}`}
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>

          {/* 포인트 */}
          <div className="space-y-2">
            <label htmlFor="points-amount" className={LABEL}>
              포인트
            </label>
            <input
              id="points-amount"
              className={`${INPUT} tabular-nums`}
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              placeholder="1 ~ 10,000"
              value={amount}
              onChange={(e) => changeAmount(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="빠른 포인트 입력">
              {QUICK_AMOUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => changeAmount(String(n))}
                  aria-pressed={amount === String(n)}
                  className={`${amount === String(n) ? PILL_ACTIVE : PILL} min-h-8 px-3 tabular-nums`}
                >
                  {n.toLocaleString('ko-KR')}
                </button>
              ))}
            </div>
          </div>

          {/* 사유 */}
          <div className="space-y-2">
            <label htmlFor="points-description" className={LABEL}>
              사유
            </label>
            <input
              id="points-description"
              className={INPUT}
              maxLength={200}
              placeholder={sign > 0 ? '지급 사유' : '차감 사유'}
              value={description}
              onChange={(e) => changeDescription(e.target.value)}
            />
          </div>

          {/* 잔액 미리보기 */}
          {selected && (
            <div className="rounded-2xl bg-surface-2 px-4 py-3">
              <p className={LABEL}>잔액 변화</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display text-lg font-bold tabular-nums text-fg">
                <span>{fmtPoints(selected.balance)}</span>
                <span className="text-sm text-subtle" aria-hidden="true">→</span>
                <span className={nextBalance == null ? 'text-subtle' : nextBalance < 0 ? 'text-danger-ink' : sign > 0 ? 'text-ok-ink' : 'text-fg'}>
                  {nextBalance == null ? '—' : fmtPoints(nextBalance)}
                </span>
              </p>
            </div>
          )}
          {nextBalance != null && nextBalance < 0 && (
            <p role="alert" className={ALERT.warn}>
              잔액보다 많이 차감합니다. 잔액이 부족하면 서버가 처리를 거절합니다.
            </p>
          )}

          <button type="button" className={`${sign > 0 ? BTN_PRIMARY : BTN_DANGER} w-full`} disabled={!canSubmit} onClick={() => void grant()}>
            {submitting ? (sign > 0 ? '지급 중…' : '차감 중…') : sign > 0 ? '포인트 지급' : '포인트 차감'}
          </button>

          {result && (
            <p role="status" className={result.tone === 'ok' ? ALERT.ok : ALERT.error}>
              {result.text}
            </p>
          )}
        </div>

        {/* ── 내역 ── */}
        <div className={`${CARD} min-w-0 overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className={H2}>포인트 내역</h2>
                <p className={`${HINT} mt-1`}>출석·내전·구매·관리자 지급 등 전체 로그</p>
              </div>
              <span className="flex items-center gap-2 text-xs text-subtle" role="status">
                {loading && <Spinner size={3} />}총 <b className="tabular-nums text-fg">{total.toLocaleString('ko-KR')}</b>건
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <SearchIcon />
                <input
                  type="search"
                  value={ledgerQInput}
                  onChange={(e) => setLedgerQInput(e.target.value)}
                  placeholder="멤버 이름 또는 사유 검색"
                  aria-label="포인트 내역 검색"
                  maxLength={40}
                  className={`${INPUT} pl-10`}
                />
              </div>
              <select aria-label="유형 필터" className={`${INPUT} sm:w-40!`} value={reasonFilter} onChange={(e) => changeReason(e.target.value)}>
                {REASON_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2" role="group" aria-label="증감 필터">
                {SIGN_FILTERS.map(([v, label]) => (
                  <button
                    key={v || 'all'}
                    type="button"
                    aria-pressed={signFilter === v}
                    onClick={() => changeSignFilter(v)}
                    className={`${signFilter === v ? PILL_ACTIVE : PILL} min-h-9 px-4 text-sm`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {memberFilter && (
                <Chip label={`멤버: ${memberFilter.name}`} onClear={() => changeMemberFilter(null)} clearLabel="멤버 필터 해제" />
              )}
            </div>
          </div>

          {err && (
            <div role="alert" className={`${ALERT.error} m-4 sm:m-5`}>
              {err}
            </div>
          )}

          {ledger.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState>{!loaded && loading ? '불러오는 중…' : ledgerQ ? `'${ledgerQ}'에 맞는 내역이 없습니다.` : '내역이 없습니다.'}</EmptyState>
            </div>
          ) : (
            <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              {/* md 이상: 표 */}
              <div className="hidden overflow-x-auto md:block">
                <table className={`${TABLE} min-w-[760px]`}>
                  <thead>
                    <tr className="bg-surface-2/60">
                      <th className={TH}>멤버</th>
                      <th className={TH}>유형</th>
                      <th className={`${TH} text-right`}>증감</th>
                      <th className={TH}>사유</th>
                      <th className={`${TH} text-right`}>잔액</th>
                      <th className={TH}>처리</th>
                      <th className={TH}>일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.id} className={TR}>
                        <td className={TD}>
                          <LedgerMember row={row} onFilter={changeMemberFilter} />
                        </td>
                        <td className={TD}>
                          <span className={REASON_STYLE[row.reason] ?? BADGE.neutral}>{REASON_LABEL[row.reason] ?? row.reason}</span>
                        </td>
                        <td className={`${TD} whitespace-nowrap text-right font-bold tabular-nums ${row.amount > 0 ? 'text-ok-ink' : 'text-danger-ink'}`}>
                          {fmtPoints(row.amount, true)}
                        </td>
                        <td className={`${TD} max-w-56 truncate text-muted`} title={row.description ?? undefined}>
                          {row.description ?? ''}
                        </td>
                        <td className={`${TD} whitespace-nowrap text-right tabular-nums text-fg`}>{fmtPoints(row.balance_after)}</td>
                        <td className={`${TD} whitespace-nowrap text-muted`}>{row.actor_name}</td>
                        <td className={`${TD} whitespace-nowrap text-xs tabular-nums text-subtle`}>{fmtDate(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* md 미만: 카드 리스트 */}
              <ul className="divide-y divide-line md:hidden">
                {ledger.map((row) => (
                  <li key={row.id} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <LedgerMember row={row} onFilter={changeMemberFilter} />
                      <span className={`shrink-0 font-bold tabular-nums ${row.amount > 0 ? 'text-ok-ink' : 'text-danger-ink'}`}>
                        {fmtPoints(row.amount, true)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className={REASON_STYLE[row.reason] ?? BADGE.neutral}>{REASON_LABEL[row.reason] ?? row.reason}</span>
                      {row.description && <span className="min-w-0 truncate text-muted">{row.description}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-[11px] tabular-nums text-subtle">
                      <span>잔액 {fmtPoints(row.balance_after)}</span>
                      <span>{row.actor_name}</span>
                      <span className="ml-auto">{fmtDate(row.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 페이지 이동 */}
          {totalPages > 1 && (
            <nav aria-label="포인트 내역 페이지" className="flex flex-wrap items-center justify-center gap-1.5 border-t border-line p-4">
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
              <button
                type="button"
                onClick={() => goToPage(Math.min(totalPages, page + 1))}
                disabled={loading || page >= totalPages}
                className={`${BTN_SM_NEUTRAL} disabled:opacity-40`}
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => goToPage(totalPages)}
                disabled={loading || page >= totalPages}
                className={`${BTN_SM_NEUTRAL} disabled:opacity-40`}
                aria-label="마지막 페이지"
              >
                »
              </button>
              <span className="ml-2 text-xs tabular-nums text-subtle">
                {page} / {totalPages}
              </span>
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}

/** 내역 행의 멤버 표시. 클릭하면 그 멤버 내역만 보도록 필터한다. */
function LedgerMember({ row, onFilter }: { row: Ledger; onFilter: (value: MemberFilter) => void }) {
  const memberId = row.member_id
  const inner = (
    <>
      <MemberAvatar src={row.member_avatar_url} name={row.member_name} size={32} className={AVATAR_SM} />
      <span className="min-w-0 truncate font-bold text-fg group-hover:text-brand-ink">{row.member_name}</span>
    </>
  )
  if (!memberId) return <span className="flex min-w-0 items-center gap-2.5">{inner}</span>
  return (
    <button
      type="button"
      onClick={() => onFilter({ id: memberId, name: row.member_name })}
      title={`${row.member_name} 내역만 보기`}
      className="group flex min-w-0 items-center gap-2.5 rounded-xl text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      {inner}
    </button>
  )
}
