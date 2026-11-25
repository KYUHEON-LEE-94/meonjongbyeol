'use client'

import { FormEvent, useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import type { MemberStatus } from '@/types/supabase'
import {
  MEMBER_NAME_MAX,
  RIOT_GAME_NAME_MAX,
  RIOT_TAGLINE_MAX,
  REJECTED_REASON_MAX,
} from '@/lib/members/memberInput'
import { resolveAvatarUrl } from '@/lib/members/avatar'
import EmptyState from '@/app/components/ui/EmptyState'
import {
  ALERT, BADGE, BTN_DANGER, BTN_NEUTRAL, BTN_PRIMARY, BTN_SM_DANGER, BTN_SM_GHOST, BTN_SM_PRIMARY, BTN_SM_WARN,
  CARD, H2, INPUT, LABEL, PILL, PILL_ACTIVE,
} from '@/lib/ui/styles'
import AdminPageHeader from '../../_components/AdminPageHeader'
import AdminStat from '../../_components/AdminStat'

function Field({
                 label, hint, children,
               }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
      <div className="space-y-1.5">
        <label className={LABEL}>{label}</label>
        {children}
        {hint && <p className="text-[11px] text-subtle">{hint}</p>}
      </div>
  )
}

const inputCls = INPUT

type MemberListItem = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  status: MemberStatus
  rejected_reason: string | null
  requested_at: string | null
  approved_at: string | null
  created_at: string
  last_synced_at: string | null
  login_linked: boolean
  discord_registered: boolean
  discord_avatar_url: string | null
  /** 마이그레이션 미적용 환경에서는 빈 배열. 대표 계정이 항상 첫 번째. */
  riot_accounts: {
    id: string
    account_no: number
    is_primary: boolean
    riot_game_name: string
    riot_tagline: string
  }[]
}

function MemberAvatar({ member }: { member: MemberListItem }) {
  const [imageFailed, setImageFailed] = useState(false)
  const avatarUrl = member.login_linked && !imageFailed ? resolveAvatarUrl(member) : null

  return (
      <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded-full bg-surface-2 flex items-center justify-center font-bold text-subtle uppercase">
        {avatarUrl ? (
            <Image
                src={avatarUrl}
                alt={`${member.member_name} Discord 프로필 이미지`}
                fill
                sizes="40px"
                className="object-cover"
                onError={() => setImageFailed(true)}
            />
        ) : (
            member.member_name[0]
        )}
      </div>
  )
}

type Tab = 'pending' | 'all'

const STATUS_BADGE: Record<MemberStatus, { label: string; cls: string }> = {
  pending: { label: '대기', cls: BADGE.warn },
  approved: { label: '승인', cls: BADGE.ok },
  rejected: { label: '거절', cls: BADGE.danger },
}

const DELETE_WARNING = [
  '랭크 히스토리 그래프',
  '내전 참가·팀·결과 기록',
  '해당 멤버의 매치 참가 데이터',
]

export default function AdminMemberControlPage() {
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [tab, setTab] = useState<Tab>('pending')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [memberName, setMemberName] = useState('')
  const [riotGameName, setRiotGameName] = useState('')
  const [riotTagline, setRiotTagline] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null)
  const [confirmName, setConfirmName] = useState('')

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/members')
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '목록을 불러오지 못했습니다.')
      setMembers(body.members as MemberListItem[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  const resetForm = () => {
    setEditingId(null)
    setMemberName('')
    setRiotGameName('')
    setRiotTagline('')
  }

  const handleEditStart = (m: MemberListItem) => {
    setEditingId(m.id)
    setMemberName(m.member_name)
    setRiotGameName(m.riot_game_name)
    setRiotTagline(m.riot_tagline)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const runAction = async (id: string, fn: () => Promise<Response>, successMsg: string) => {
    setBusyId(id)
    setMessage(null)
    setError(null)
    try {
      const res = await fn()
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '작업에 실패했습니다.')
      setMessage(body.message ?? successMsg)
      await loadMembers()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업에 실패했습니다.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const handleApprove = (m: MemberListItem) =>
      runAction(
          m.id,
          () => fetch(`/api/admin/members/${m.id}/approve`, { method: 'POST' }),
          '승인했습니다.',
      )

  const handleReject = (m: MemberListItem) => {
    const reason = window.prompt(`"${m.member_name}" 신청을 거절합니다. 사유를 입력해주세요.`, '')
    if (reason === null) return
    if (reason.length > REJECTED_REASON_MAX) {
      setError(`거절 사유는 ${REJECTED_REASON_MAX}자 이하여야 합니다.`)
      return
    }
    return runAction(
        m.id,
        () =>
            fetch(`/api/admin/members/${m.id}/reject`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason }),
            }),
        '거절했습니다.',
    )
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    const success = await runAction(
        target.id,
        () =>
            fetch(`/api/admin/members/${target.id}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ confirmName }),
            }),
        '삭제했습니다.',
    )
    if (success) {
      if (editingId === target.id) resetForm()
      setDeleteTarget(null)
      setConfirmName('')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const endpoint = editingId ? `/api/admin/members/update` : `/api/admin/members/create`
      const payload = editingId
          ? { id: editingId, member_name: memberName, riot_game_name: riotGameName, riot_tagline: riotTagline }
          : { member_name: memberName, riot_game_name: riotGameName, riot_tagline: riotTagline }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '작업에 실패했습니다.')

      // Riot ID가 바뀌었을 수 있으므로 동기화 시도 (실패해도 등록/수정은 유효)
      const targetId = editingId || body.memberId
      await fetch(`/api/members/${targetId}/sync`, { method: 'POST' }).catch(() => null)

      setMessage(editingId ? '정보가 수정되었습니다.' : '멤버가 등록되었습니다.')
      resetForm()
      await loadMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const pendingCount = useMemo(() => members.filter((m) => m.status === 'pending').length, [members])
  const statusCounts = useMemo(
      () => ({
        approved: members.filter((m) => m.status === 'approved').length,
        rejected: members.filter((m) => m.status === 'rejected').length,
      }),
      [members],
  )

  const visibleMembers = useMemo(() => {
    const base = tab === 'pending' ? members.filter((m) => m.status === 'pending') : members
    const term = searchTerm.trim()
    if (!term) return base
    return base.filter((m) => m.member_name.includes(term) || m.riot_game_name.includes(term))
  }, [members, tab, searchTerm])

  return (
      <div>
        <AdminPageHeader
            kicker="Members"
            title="멤버 관리"
            description="가입 신청을 승인·거절하고, 멤버를 직접 등록·수정·추방합니다."
        />

        {/* ── 요약 ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminStat label="전체 멤버" value={members.length} />
          <AdminStat label="승인 대기" value={pendingCount} tone={pendingCount > 0 ? 'warn' : undefined} />
          <AdminStat label="승인" value={statusCounts.approved} tone="ok" />
          <AdminStat label="거절" value={statusCounts.rejected} tone={statusCounts.rejected > 0 ? 'danger' : undefined} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

          {/* ── 좌측: 등록/수정 폼 ── */}
          <div className="lg:col-span-4">
            <div className="space-y-4 lg:sticky lg:top-8">
              <form onSubmit={handleSubmit} className={`${CARD} space-y-5 p-6`}>
                <div>
                  <h2 className={H2}>{editingId ? '멤버 정보 수정' : '새 멤버 등록'}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-subtle">
                    {editingId ? '기존 멤버의 라이엇 계정 정보를 변경합니다' : '관리자가 등록한 멤버는 즉시 승인 상태가 됩니다'}
                  </p>
                </div>
                <Field label="단톡방 아이디">
                  <input type="text" value={memberName} maxLength={MEMBER_NAME_MAX}
                         onChange={(e) => setMemberName(e.target.value)} className={inputCls} required />
                </Field>
                <Field label="라이엇 게임명">
                  <input type="text" value={riotGameName} maxLength={RIOT_GAME_NAME_MAX}
                         onChange={(e) => setRiotGameName(e.target.value)} className={inputCls} required />
                </Field>
                <Field label="태그라인" hint="영문/숫자 2~10자">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-subtle">#</span>
                    <input type="text" value={riotTagline} maxLength={RIOT_TAGLINE_MAX}
                           onChange={(e) => setRiotTagline(e.target.value)} className={inputCls} required />
                  </div>
                </Field>

                <div className="flex flex-col gap-2 pt-1">
                  <button type="submit" disabled={loading} className={`${BTN_PRIMARY} w-full`}>
                    {loading ? '처리 중...' : editingId ? '정보 수정하기' : '멤버 등록하기'}
                  </button>
                  {editingId && (
                      <button type="button" onClick={resetForm} className={`${BTN_NEUTRAL} w-full`}>
                        취소하고 새로 등록하기
                      </button>
                  )}
                </div>
              </form>

              {message && <div role="status" className={ALERT.ok}>{message}</div>}
              {error && <div role="alert" className={ALERT.error}>{error}</div>}
            </div>
          </div>

          {/* ── 우측: 탭 + 목록 ── */}
          <div className="space-y-4 lg:col-span-8">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex gap-2" role="tablist" aria-label="멤버 목록 구분">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'pending'}
                    onClick={() => setTab('pending')}
                    className={`${tab === 'pending' ? PILL_ACTIVE : PILL} min-h-9 px-4 text-sm`}
                >
                  대기 중 <span className="ml-1.5 tabular-nums opacity-80">{pendingCount}</span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'all'}
                    onClick={() => setTab('all')}
                    className={`${tab === 'all' ? PILL_ACTIVE : PILL} min-h-9 px-4 text-sm`}
                >
                  전체 멤버 <span className="ml-1.5 tabular-nums opacity-80">{members.length}</span>
                </button>
              </div>

              <div className="relative sm:w-64">
                <input
                    type="text"
                    placeholder="멤버 이름 검색..."
                    aria-label="멤버 검색"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`${inputCls} pl-10!`}
                />
                <svg className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            {visibleMembers.length === 0 ? (
                <EmptyState>{tab === 'pending' ? '대기 중인 신청이 없습니다.' : '검색 결과가 없습니다.'}</EmptyState>
            ) : (
                <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
                  {visibleMembers.map((m) => (
                      <li key={m.id}
                          className="flex flex-col justify-between gap-3 px-4 py-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:px-5">

                        <div className="flex min-w-0 items-center gap-4">
                          <MemberAvatar member={m} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="mr-0.5 truncate font-bold text-fg">{m.member_name}</span>
                              <span className={STATUS_BADGE[m.status].cls}>{STATUS_BADGE[m.status].label}</span>
                              <span className={m.login_linked ? BADGE.info : BADGE.neutral}>
                                {m.login_linked ? '로그인 연결됨' : '미로그인'}
                              </span>
                              {!m.login_linked && m.discord_registered && (
                                  <span className={BADGE.brand}>Discord 사전등록</span>
                              )}
                            </div>
                            {m.riot_accounts.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {m.riot_accounts.map((a, i) => (
                                      <span
                                          key={a.id}
                                          className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                                              i === 0 ? 'bg-brand/12 text-brand-ink' : 'bg-surface-2 text-muted'
                                          }`}
                                      >
                                        {i === 0 && <span className="mr-1 text-[10px] font-black">대표</span>}
                                        {a.riot_game_name}
                                        <span className="opacity-60">#{a.riot_tagline}</span>
                                      </span>
                                  ))}
                                </div>
                            ) : (
                                <div className="mt-0.5 truncate text-xs text-muted">
                                  {m.riot_game_name} <span className="text-subtle">#{m.riot_tagline}</span>
                                </div>
                            )}
                            {m.status === 'rejected' && m.rejected_reason && (
                                <div className="mt-1 truncate text-[11px] text-danger-ink">거절 사유: {m.rejected_reason}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                          {m.status !== 'approved' && (
                              <button
                                  type="button"
                                  onClick={() => handleApprove(m)}
                                  disabled={busyId === m.id}
                                  className={BTN_SM_PRIMARY}
                              >
                                승인
                              </button>
                          )}
                          {m.status === 'pending' && (
                              <button
                                  type="button"
                                  onClick={() => handleReject(m)}
                                  disabled={busyId === m.id}
                                  className={BTN_SM_WARN}
                              >
                                거절
                              </button>
                          )}
                          <button
                              type="button"
                              onClick={() => handleEditStart(m)}
                              className={BTN_SM_GHOST}
                          >
                            수정
                          </button>
                          <button
                              type="button"
                              onClick={() => { setDeleteTarget(m); setConfirmName('') }}
                              disabled={busyId === m.id}
                              className={BTN_SM_DANGER}
                          >
                            추방
                          </button>
                        </div>
                      </li>
                  ))}
                </ul>
            )}
          </div>
        </div>

        {/* ── 추방 확인 모달 ── */}
        {deleteTarget && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-member-title">
              <div className="w-full max-w-md rounded-3xl bg-panel p-6 shadow-[0_24px_64px_-28px_var(--color-shadow)]">
                <h3 id="delete-member-title" className="text-lg font-black text-fg">멤버 추방</h3>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-bold text-fg">{deleteTarget.member_name}</span> 멤버를 완전히 삭제합니다.
                  이 작업은 <span className="font-bold text-danger-ink">되돌릴 수 없습니다.</span>
                </p>

                <div className="mt-4 rounded-2xl bg-danger/8 p-4">
                  <div className="text-xs font-bold text-danger-ink">함께 삭제되는 데이터</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-danger-ink">
                    {DELETE_WARNING.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                  <div className="mt-3 text-[11px] text-muted">
                    명예의 전당 시즌 기록은 이름 스냅샷으로 보존됩니다.
                  </div>
                </div>

                <div className="mt-5 space-y-1.5">
                  <label className={LABEL}>
                    확인을 위해 멤버명을 입력하세요
                  </label>
                  <input
                      type="text"
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={deleteTarget.member_name}
                      className={inputCls}
                  />
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                      type="button"
                      onClick={() => { setDeleteTarget(null); setConfirmName('') }}
                      className={`${BTN_NEUTRAL} flex-1`}
                  >
                    취소
                  </button>
                  <button
                      type="button"
                      onClick={handleDeleteConfirm}
                      disabled={confirmName !== deleteTarget.member_name || busyId === deleteTarget.id}
                      className={`${BTN_DANGER} flex-1`}
                  >
                    {busyId === deleteTarget.id ? '삭제 중...' : '영구 삭제'}
                  </button>
                </div>
              </div>
            </div>
        )}

      </div>
  )
}
