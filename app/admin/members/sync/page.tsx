'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/app/components/Spinner'
import type { MemberStatus } from '@/types/supabase'
import { compareRank } from '@/lib/constants/tierOrder'
import EmptyState from '@/app/components/ui/EmptyState'
import { ALERT, BADGE, BTN_PRIMARY, BTN_SM_GHOST, CARD, INPUT, PILL, PILL_ACTIVE, TABLE, TD, TH, TR } from '@/lib/ui/styles'
import AdminPageHeader from '../../_components/AdminPageHeader'
import AdminStat from '../../_components/AdminStat'

type MemberRow = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  status: MemberStatus
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  sync_status: string | null
  last_sync_error: string | null
  last_sync_finished_at: string | null
  last_synced_at: string | null
  login_linked: boolean
  discord_registered: boolean
}

const MAX_SYNC_ALL_ROUNDS = 50

type Banner = { tone: 'error' | 'success' | 'warn'; msg: string }
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
type LoginFilter = 'all' | 'linked' | 'unlinked'
type SortKey = 'tier' | 'recent' | 'name'

// ─── 티어 스타일 (도메인 색 — 로컬 상수 유지) ────────────────────────────────

// palette: tier — 티어 고유색(화이트리스트). 실버·아이언만 중립 토큰.
const TIER_BADGE: Record<string, { text: string; bg: string; dot: string }> = {
  CHALLENGER:  { text: 'text-yellow-300',  bg: 'bg-yellow-500/10 border border-yellow-500/20',  dot: 'bg-yellow-400'  },
  GRANDMASTER: { text: 'text-danger-ink',     bg: 'bg-red-500/10 border border-red-500/20',        dot: 'bg-red-400'     },
  MASTER:      { text: 'text-purple-300',  bg: 'bg-purple-500/10 border border-purple-500/20',  dot: 'bg-purple-400'  },
  DIAMOND:     { text: 'text-blue-300',    bg: 'bg-blue-500/10 border border-blue-500/20',      dot: 'bg-blue-400'    },
  EMERALD:     { text: 'text-ok-ink', bg: 'bg-emerald-500/10 border border-emerald-500/20', dot: 'bg-emerald-400' },
  PLATINUM:    { text: 'text-cyan-300',    bg: 'bg-cyan-500/10 border border-cyan-500/20',      dot: 'bg-cyan-400'    },
  GOLD:        { text: 'text-warn-ink',   bg: 'bg-amber-500/10 border border-amber-500/20',    dot: 'bg-amber-400'   },
  SILVER:      { text: 'text-muted',   bg: 'bg-muted/10 border border-muted/20',    dot: 'bg-muted'   },
  BRONZE:      { text: 'text-orange-300',  bg: 'bg-orange-500/10 border border-orange-500/20',  dot: 'bg-orange-400'  },
  IRON:        { text: 'text-muted',    bg: 'bg-subtle/10 border border-subtle/20',      dot: 'bg-subtle'    },
}

const STATUS_BADGE: Record<MemberStatus, { label: string; cls: string }> = {
  pending:  { label: '대기', cls: BADGE.warn },
  approved: { label: '승인', cls: BADGE.ok },
  rejected: { label: '거절', cls: BADGE.danger },
}

function TierBadge({
                     tier, rank, lp,
                   }: { tier: string | null; rank: string | null; lp: number | null }) {
  if (!tier) return <span className="text-xs italic text-subtle">Unranked</span>
  const s = TIER_BADGE[tier.toUpperCase()] ?? {
    text: 'text-subtle', bg: 'bg-surface-2', dot: 'bg-subtle',
  }
  return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap tabular-nums ${s.bg} ${s.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
        {tier} {rank ?? ''} · {lp ?? 0} LP
      </span>
  )
}

function StatusBadge({ status }: { status: MemberStatus }) {
  const s = STATUS_BADGE[status]
  return <span className={s.cls}>{s.label}</span>
}

function LoginBadge({ linked, discord }: { linked: boolean; discord: boolean }) {
  if (linked) {
    return <span className={BADGE.info}>로그인 연결됨</span>
  }
  if (discord) {
    return <span className={BADGE.brand}>Discord 사전등록</span>
  }
  return <span className={BADGE.neutral}>미로그인</span>
}

function SyncFailBadge() {
  return <span className={BADGE.danger}>동기화 실패</span>
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function AdminMemberSyncPage() {
  const router = useRouter()
  const [ready,          setReady]          = useState(false)
  const [members,        setMembers]        = useState<MemberRow[]>([])
  const [loading,        setLoading]        = useState(true)
  const [syncingId,      setSyncingId]      = useState<string | null>(null)
  const [syncAllLoading, setSyncAllLoading] = useState(false)
  const [banner,         setBanner]         = useState<Banner | null>(null)

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loginFilter,  setLoginFilter]  = useState<LoginFilter>('all')
  const [failedOnly,   setFailedOnly]   = useState(false)
  const [sortKey,      setSortKey]      = useState<SortKey>('tier')

  const showMsg = (tone: Banner['tone'], msg: string) => {
    setBanner({ tone, msg })
    setTimeout(() => setBanner(null), 4000)
  }

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/members')
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '멤버 목록을 불러오지 못했습니다.')
      setMembers(body.members as MemberRow[])
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '멤버 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/admin/me', { method: 'GET' })
      if (res.status === 401) { router.replace('/admin/login'); return }
      if (res.status === 403) { router.replace('/'); return }
      setReady(true)
    })()
  }, [router])

  useEffect(() => { if (ready) loadMembers() }, [ready, loadMembers])

  const handleSync = async (id: string) => {
    setSyncingId(id)
    try {
      const res  = await fetch(`/api/members/${id}/sync`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok || body?.ok === false) throw new Error(body?.error)
      if (body?.skipped && body?.reason === 'in_progress') {
        showMsg('warn', '동기화 진행 중입니다. 잠시 후 새로고침하세요.')
      } else if (body?.skipped) {
        const remain = body.nextAllowedInSec ? `${body.nextAllowedInSec}초 후 가능` : '잠시 후 다시 시도하세요'
        showMsg('warn', `이미 최신 상태입니다. (${remain})`)
      } else {
        showMsg('success', '동기화 완료!')
        await loadMembers()
      }
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '동기화 실패')
    } finally {
      setSyncingId(null)
    }
  }

  const handleSyncAll = async () => {
    setSyncAllLoading(true)
    try {
      let cursorId: string | null = null
      let totalProcessed = 0

      // 서버는 커서 대신 상태로 진행하므로, 상태 갱신이 실패하는 이상 상황에서 무한 루프를 막는 상한.
      for (let i = 0; i < MAX_SYNC_ALL_ROUNDS; i++) {
        const res: Response = await fetch('/api/admin/sync-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursorId }),
        })
        const body = await res.json().catch(() => ({})) as { processed?: number; batch?: { done: boolean; nextCursorId?: string }; error?: string }

        if (!res.ok) {
          showMsg('error', res.status === 429
              ? '라이엇 API 제한 · 전체 동기화가 중단되었습니다.'
              : `전체 동기화 실패 (${res.status}) ${body.error ?? ''}`)
          return
        }

        totalProcessed += body.processed ?? 0

        if (body.batch?.done !== false) break
        cursorId = body.batch.nextCursorId ?? null
        if (!cursorId) break
      }

      // sync-all 은 "갱신 필요분(stale/stuck)"만 처리하므로 0명도 정상이다.
      showMsg('success', totalProcessed > 0
          ? `갱신 필요 멤버 ${totalProcessed}명을 동기화했습니다.`
          : '갱신이 필요한 멤버가 없습니다. (모두 최신)')
      await loadMembers()
    } catch {
      showMsg('error', '전체 동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncAllLoading(false)
    }
  }

  // ─── 상단 요약 집계 ─────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    return members.reduce(
        (acc, m) => {
          acc.total += 1
          acc[m.status] += 1
          if (!m.login_linked) acc.unlinked += 1
          if (m.sync_status === 'failed') acc.failed += 1
          if (m.sync_status === 'success') acc.success += 1
          if (m.sync_status === 'running') acc.running += 1
          if (m.last_sync_finished_at && (!acc.lastSync || m.last_sync_finished_at > acc.lastSync)) {
            acc.lastSync = m.last_sync_finished_at
          }
          return acc
        },
        { total: 0, pending: 0, approved: 0, rejected: 0, unlinked: 0, failed: 0, success: 0, running: 0, lastSync: null as string | null },
    )
  }, [members])

  // ─── 검색 / 필터 / 정렬 ──────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const term = search.trim()
    let list = members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (loginFilter === 'linked' && !m.login_linked) return false
      if (loginFilter === 'unlinked' && m.login_linked) return false
      if (failedOnly && m.sync_status !== 'failed') return false
      if (term && !(m.member_name.includes(term) || m.riot_game_name.includes(term))) return false
      return true
    })

    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.member_name.localeCompare(b.member_name, 'ko')
      if (sortKey === 'recent') {
        return (b.last_synced_at ?? '').localeCompare(a.last_synced_at ?? '')
      }
      // tier: 롤 솔로랭크 내림차순, 동점이면 이름
      const diff = compareRank(
        { tier: a.lol_tier, rank: a.lol_rank, lp: a.lol_league_points },
        { tier: b.lol_tier, rank: b.lol_rank, lp: b.lol_league_points },
      )
      if (diff !== 0) return diff
      return a.member_name.localeCompare(b.member_name, 'ko')
    })

    return list
  }, [members, search, statusFilter, loginFilter, failedOnly, sortKey])

  if (!ready)
    return (
        <div className="flex items-center justify-center py-20 gap-2.5 text-subtle">
          <Spinner size={4} />
          <span className="text-sm font-medium tracking-tight">권한 확인 중...</span>
        </div>
    )

  const selectCls = `${INPUT} w-auto! py-2!`

  return (
      <div>
        <AdminPageHeader
            kicker="Sync"
            title="멤버 동기화"
            description="멤버들의 롤 솔로랭크 정보를 조회·동기화합니다."
            action={
              <button
                  type="button"
                  onClick={handleSyncAll}
                  disabled={syncAllLoading || loading}
                  aria-busy={syncAllLoading}
                  className={BTN_PRIMARY}
              >
                {syncAllLoading ? (
                    <><Spinner /> 전체 동기화 중...</>
                ) : (
                    <>
                      <SyncIcon className="h-4 w-4" />
                      전체 동기화
                    </>
                )}
              </button>
            }
        />

        {/* ── 상단 요약 ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <AdminStat label="총원" value={summary.total} hint={`승인 ${summary.approved} · 대기 ${summary.pending} · 거절 ${summary.rejected}`} />
          <AdminStat label="동기화 성공" value={summary.success} tone="ok" />
          <AdminStat label="동기화 실패" value={summary.failed} tone={summary.failed > 0 ? 'danger' : undefined} />
          <AdminStat label="진행 중" value={summary.running} tone={summary.running > 0 ? 'brand' : undefined} />
          <AdminStat label="로그인 미연결" value={summary.unlinked} tone={summary.unlinked > 0 ? 'warn' : undefined} />
          <AdminStat label="마지막 동기화" value={formatSyncTime(summary.lastSync)} compact />
        </div>

        {/* ── 알림 배너 ── */}
        {banner && (
            <div
                role={banner.tone === 'error' ? 'alert' : 'status'}
                aria-live={banner.tone === 'error' ? 'assertive' : 'polite'}
                className={`mb-6 ${banner.tone === 'error' ? ALERT.error : banner.tone === 'warn' ? ALERT.warn : ALERT.ok}`}
            >
              {banner.msg}
            </div>
        )}

        {/* ── 검색 / 필터 / 정렬 ── */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <input
                type="text"
                placeholder="이름 · Riot ID 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${INPUT} pl-10!`}
                aria-label="멤버 검색"
            />
            <svg className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectCls} aria-label="상태 필터">
              <option value="all">상태 전체</option>
              <option value="pending">대기</option>
              <option value="approved">승인</option>
              <option value="rejected">거절</option>
            </select>
            <select value={loginFilter} onChange={(e) => setLoginFilter(e.target.value as LoginFilter)} className={selectCls} aria-label="로그인 연결 필터">
              <option value="all">연결 전체</option>
              <option value="linked">연결됨</option>
              <option value="unlinked">미연결</option>
            </select>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={selectCls} aria-label="정렬 기준">
              <option value="tier">티어순</option>
              <option value="recent">최근 동기화순</option>
              <option value="name">이름순</option>
            </select>
            <label className={`${failedOnly ? PILL_ACTIVE : PILL} min-h-10 cursor-pointer select-none gap-2 px-4 text-sm`}>
              <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} className="accent-danger" />
              실패만
            </label>
          </div>
        </div>

        {/* ── 로딩 ── */}
        {loading && (
            <div className={`${CARD} flex flex-col items-center justify-center gap-4 py-24 text-subtle`}>
              <Spinner size={6} />
              <p className="text-sm font-semibold tracking-wide">멤버 목록 로딩 중...</p>
            </div>
        )}

        {/* ── 빈 상태 ── */}
        {!loading && visible.length === 0 && (
            <EmptyState hint="검색어·필터를 조정하거나 [멤버 관리]에서 추가하세요">표시할 멤버가 없습니다</EmptyState>
        )}

        {/* ── 데스크톱: 테이블 (md 이상) ── */}
        {!loading && visible.length > 0 && (
            <>
              <div className={`hidden md:block ${CARD} overflow-hidden`}>
                <div className="overflow-x-auto">
                  <table className={TABLE}>
                    <thead>
                    <tr className="bg-surface-2/60">
                      {['단톡방 ID', 'Riot ID', '롤 솔로랭크', '최근 동기화'].map((label) => (
                          <th key={label} className={TH}>{label}</th>
                      ))}
                      <th className={`${TH} text-right`}>동기화</th>
                    </tr>
                    </thead>
                    <tbody>
                    {visible.map((m) => {
                      const isSyncing = syncingId === m.id
                      const failed = m.sync_status === 'failed'
                      return (
                          <tr key={m.id} className={TR}>
                            <td className={TD}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="max-w-[140px] truncate text-sm font-bold text-fg">{m.member_name}</span>
                                <StatusBadge status={m.status} />
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <LoginBadge linked={m.login_linked} discord={m.discord_registered} />
                                {failed && <SyncFailBadge />}
                              </div>
                              {failed && m.last_sync_error && (
                                  <div className="mt-1 max-w-[220px] truncate text-[11px] text-danger-ink" title={m.last_sync_error}>
                                    {m.last_sync_error}
                                  </div>
                              )}
                            </td>
                            <td className={TD}>
                              <span className="block max-w-[200px] truncate text-sm text-muted">
                                {m.riot_game_name}<span className="text-subtle">#{m.riot_tagline}</span>
                              </span>
                            </td>
                            <td className={TD}>
                              <TierBadge tier={m.lol_tier} rank={m.lol_rank} lp={m.lol_league_points} />
                            </td>
                            <td className={TD}>
                              <span className="whitespace-nowrap text-xs font-medium tabular-nums text-subtle">
                                {m.last_synced_at ? formatSyncTime(m.last_synced_at) : '-'}
                              </span>
                            </td>
                            <td className={`${TD} text-right`}>
                              <button
                                  type="button"
                                  onClick={() => handleSync(m.id)}
                                  disabled={!!syncingId}
                                  aria-busy={isSyncing}
                                  className={BTN_SM_GHOST}
                              >
                                {isSyncing ? (
                                    <><Spinner size={3} /> 동기화 중</>
                                ) : (
                                    <>
                                      <SyncIcon className="h-3 w-3" />
                                      동기화
                                    </>
                                )}
                              </button>
                            </td>
                          </tr>
                      )
                    })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-line px-5 py-3">
                  <span className="text-xs font-medium tabular-nums text-subtle">총 {visible.length}명</span>
                </div>
              </div>

              {/* ── 모바일: 카드 리스트 (md 미만) ── */}
              <div className="grid gap-3 md:hidden">
                {visible.map((m) => {
                  const isSyncing = syncingId === m.id
                  const failed = m.sync_status === 'failed'
                  return (
                      <div key={m.id} className={`${CARD} space-y-3 p-4`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-bold text-fg">{m.member_name}</span>
                              <StatusBadge status={m.status} />
                            </div>
                            <div className="mt-1 truncate text-xs text-muted">
                              {m.riot_game_name}<span className="text-subtle">#{m.riot_tagline}</span>
                            </div>
                          </div>
                          <button
                              type="button"
                              onClick={() => handleSync(m.id)}
                              disabled={!!syncingId}
                              aria-busy={isSyncing}
                              className={`${BTN_SM_GHOST} shrink-0`}
                          >
                            {isSyncing ? (
                                <><Spinner size={3} /> 동기화 중</>
                            ) : (
                                <>
                                  <SyncIcon className="h-3 w-3" />
                                  동기화
                                </>
                            )}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <LoginBadge linked={m.login_linked} discord={m.discord_registered} />
                          {failed && <SyncFailBadge />}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <TierBadge tier={m.lol_tier} rank={m.lol_rank} lp={m.lol_league_points} />
                        </div>

                        {failed && m.last_sync_error && (
                            <div className="break-words text-[11px] text-danger-ink">{m.last_sync_error}</div>
                        )}

                        <div className="text-[11px] tabular-nums text-subtle">
                          최근 동기화: {m.last_synced_at ? formatSyncTime(m.last_synced_at) : '-'}
                        </div>
                      </div>
                  )
                })}
                <div className="px-1 text-xs font-medium tabular-nums text-subtle">총 {visible.length}명</div>
              </div>
            </>
        )}
      </div>
  )
}

function SyncIcon({ className }: { className: string }) {
  return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
        <path d="M4 4v5h5M20 20v-5h-5M4.582 9a8 8 0 0115.356 4M19.418 15a8 8 0 01-15.356-4" />
      </svg>
  )
}
