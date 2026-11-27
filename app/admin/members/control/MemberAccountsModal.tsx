'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { RIOT_GAME_NAME_MAX, RIOT_TAGLINE_MAX } from '@/lib/members/memberInput'
import { formatKstShort, formatLolRankShort, lolTierClass } from '@/lib/customGames/display'
import {
  ALERT, BADGE, BTN_NEUTRAL, BTN_SM_DANGER, BTN_SM_GHOST, BTN_SM_NEUTRAL, BTN_SM_PRIMARY,
  H3, HINT, INPUT, LABEL,
} from '@/lib/ui/styles'

type AdminRiotAccount = {
  id: string
  account_no: number
  is_primary: boolean
  riot_game_name: string
  riot_tagline: string
  synced: boolean
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  lol_wins: number | null
  lol_losses: number | null
  lol_synced_at: string | null
  last_synced_at: string | null
}

type AdminSteam = {
  steam_id64: string
  steam_persona: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_linked_at: string | null
  steam_synced_at: string | null
  steam_sync_error: string | null
  is_private: boolean
  owned_game_count: number | null
}

type Detail = {
  riot: {
    accounts: AdminRiotAccount[]
    primary_account_id: string | null
    max: number
    migration_required?: boolean
    message?: string
  }
  steam: AdminSteam | null
  steam_migration_required?: boolean
}

type ApiBody = { ok?: boolean; message?: string; syncWarning?: string | null }

export default function MemberAccountsModal({
  memberId,
  memberName,
  onClose,
}: {
  memberId: string
  memberName: string
  /** changed=true 면 부모가 멤버 목록을 다시 불러온다. */
  onClose: (changed: boolean) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTag, setEditTag] = useState('')

  const [addName, setAddName] = useState('')
  const [addTag, setAddTag] = useState('')

  const [steamInput, setSteamInput] = useState('')

  const base = `/api/admin/members/${memberId}`

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${base}/accounts`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '계정 정보를 불러오지 못했습니다.')
      setDetail({ riot: body.riot, steam: body.steam ?? null, steam_migration_required: body.steam_migration_required })
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '계정 정보를 불러오지 못했습니다.')
    }
  }, [base])

  useEffect(() => { load() }, [load])

  const close = useCallback(() => {
    if (busy) return
    onClose(changed)
  }, [busy, changed, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  /** 쓰기 요청 공통 처리. 성공하면 상세를 다시 읽는다. 대표 변경은 서버가 즉시 동기화하므로 오래 걸릴 수 있다. */
  const run = async (key: string, url: string, init: RequestInit): Promise<boolean> => {
    setBusy(key)
    setMessage(null)
    setWarning(null)
    setError(null)
    try {
      const res = await fetch(url, init)
      const body = (await res.json().catch(() => ({}))) as ApiBody
      if (!res.ok || !body.ok) throw new Error(body.message ?? '작업에 실패했습니다.')
      setMessage(body.message ?? '완료했습니다.')
      if (body.syncWarning) setWarning(`동기화 경고: ${body.syncWarning}`)
      setChanged(true)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업에 실패했습니다.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const jsonInit = (method: string, payload: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const startEdit = (a: AdminRiotAccount) => {
    setEditingId(a.id)
    setEditName(a.riot_game_name)
    setEditTag(a.riot_tagline)
  }

  const saveEdit = async (e: FormEvent, accountId: string) => {
    e.preventDefault()
    const ok = await run(
      `edit:${accountId}`,
      `${base}/riot-accounts/${accountId}`,
      jsonInit('PATCH', { riot_game_name: editName, riot_tagline: editTag }),
    )
    if (ok) setEditingId(null)
  }

  const removeAccount = (a: AdminRiotAccount) => {
    if (!window.confirm(`${a.riot_game_name}#${a.riot_tagline} 계정을 삭제할까요?`)) return
    return run(`del:${a.id}`, `${base}/riot-accounts/${a.id}`, { method: 'DELETE' })
  }

  const makePrimary = (a: AdminRiotAccount) =>
    run(`primary:${a.id}`, `${base}/riot-accounts/${a.id}/primary`, { method: 'POST' })

  const addAccount = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run(
      'add',
      `${base}/riot-accounts`,
      jsonInit('POST', { riot_game_name: addName, riot_tagline: addTag }),
    )
    if (ok) {
      setAddName('')
      setAddTag('')
    }
  }

  const linkSteam = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run('steam', `${base}/steam`, jsonInit('POST', { steam_input: steamInput }))
    if (ok) setSteamInput('')
  }

  const unlinkSteam = () => {
    if (!window.confirm('스팀 연결을 해제할까요? 보유 게임 캐시도 함께 삭제됩니다.')) return
    return run('steam-unlink', `${base}/steam`, { method: 'DELETE' })
  }

  const accounts = detail?.riot.accounts ?? []
  const primaryId = detail?.riot.primary_account_id ?? null
  const riotMigration = !!detail?.riot.migration_required
  const canAdd = !!detail && !riotMigration && accounts.length < detail.riot.max

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-accounts-title"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-panel p-6 shadow-[0_24px_64px_-28px_var(--color-shadow)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="member-accounts-title" className="text-lg font-black text-fg">{memberName} · 계정 관리</h3>
            <p className={`mt-1 ${HINT}`}>
              관리자 수정은 승인 상태를 바꾸지 않습니다. 대표 계정이 바뀌면 즉시 랭크를 동기화합니다.
            </p>
          </div>
          <button type="button" onClick={close} disabled={!!busy} className={BTN_SM_NEUTRAL} aria-label="닫기">
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {message && <div role="status" className={ALERT.ok}>{message}</div>}
          {warning && <div role="status" className={ALERT.warn}>{warning}</div>}
          {error && <div role="alert" className={ALERT.error}>{error}</div>}
          {loadError && <div role="alert" className={ALERT.error}>{loadError}</div>}
        </div>

        {!detail && !loadError && <p className={`mt-6 ${HINT}`}>불러오는 중...</p>}

        {detail && (
          <>
            {/* ── 라이엇 계정 ── */}
            <section className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className={H3}>라이엇 계정</h4>
                {!riotMigration && (
                  <span className="text-xs tabular-nums text-subtle">{accounts.length} / {detail.riot.max}</span>
                )}
              </div>

              {riotMigration && <div className={ALERT.warn}>{detail.riot.message}</div>}

              <ul className="space-y-2">
                {accounts.map((a) => {
                  const isPrimary = a.id === primaryId
                  const isEditing = editingId === a.id
                  return (
                    <li key={a.id} className="rounded-2xl bg-surface-2 p-4">
                      {isEditing ? (
                        <form onSubmit={(e) => saveEdit(e, a.id)} className="space-y-3">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_8rem]">
                            <input
                              type="text" value={editName} maxLength={RIOT_GAME_NAME_MAX} required
                              onChange={(e) => setEditName(e.target.value)} className={INPUT}
                              aria-label="라이엇 게임명"
                            />
                            <span className="hidden self-center font-bold text-subtle sm:block">#</span>
                            <input
                              type="text" value={editTag} maxLength={RIOT_TAGLINE_MAX} required
                              onChange={(e) => setEditTag(e.target.value)} className={INPUT}
                              aria-label="태그라인"
                            />
                          </div>
                          {isPrimary && (
                            <p className={HINT}>대표 계정입니다. 저장하면 기존 랭크를 지우고 새 계정으로 즉시 동기화합니다.</p>
                          )}
                          <div className="flex gap-1.5">
                            <button type="submit" disabled={!!busy} className={BTN_SM_PRIMARY}>
                              {busy === `edit:${a.id}` ? '저장 중...' : '저장'}
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} disabled={!!busy} className={BTN_SM_NEUTRAL}>
                              취소
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isPrimary ? <span className={BADGE.brand}>대표</span> : <span className={BADGE.neutral}>슬롯 {a.account_no}</span>}
                              <span className="truncate font-bold text-fg">
                                {a.riot_game_name}<span className="text-subtle">#{a.riot_tagline}</span>
                              </span>
                              <span className={a.synced ? BADGE.ok : BADGE.warn}>{a.synced ? 'PUUID 확인' : 'PUUID 미발급'}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                              <span className={`font-bold ${lolTierClass(a.lol_tier)}`}>
                                {formatLolRankShort(a.lol_tier, a.lol_rank, a.lol_league_points)}
                              </span>
                              {(a.lol_wins != null || a.lol_losses != null) && (
                                <span className="tabular-nums">{a.lol_wins ?? 0}승 {a.lol_losses ?? 0}패</span>
                              )}
                              <span>동기화 {formatKstShort(a.last_synced_at)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            {!isPrimary && (
                              <button type="button" onClick={() => makePrimary(a)} disabled={!!busy} className={BTN_SM_GHOST}>
                                {busy === `primary:${a.id}` ? '변경 중...' : '대표 지정'}
                              </button>
                            )}
                            <button type="button" onClick={() => startEdit(a)} disabled={!!busy} className={BTN_SM_NEUTRAL}>
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => removeAccount(a)}
                              disabled={!!busy || accounts.length <= 1}
                              title={accounts.length <= 1 ? '마지막 계정은 삭제할 수 없습니다.' : undefined}
                              className={BTN_SM_DANGER}
                            >
                              {busy === `del:${a.id}` ? '삭제 중...' : '삭제'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {canAdd && (
                <form onSubmit={addAccount} className="space-y-2 rounded-2xl border border-dashed border-line-strong p-4">
                  <label className={LABEL}>계정 추가</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_8rem_auto]">
                    <input
                      type="text" value={addName} maxLength={RIOT_GAME_NAME_MAX} required placeholder="게임명"
                      onChange={(e) => setAddName(e.target.value)} className={INPUT} aria-label="추가할 라이엇 게임명"
                    />
                    <span className="hidden self-center font-bold text-subtle sm:block">#</span>
                    <input
                      type="text" value={addTag} maxLength={RIOT_TAGLINE_MAX} required placeholder="태그"
                      onChange={(e) => setAddTag(e.target.value)} className={INPUT} aria-label="추가할 태그라인"
                    />
                    <button type="submit" disabled={!!busy} className={BTN_SM_PRIMARY}>
                      {busy === 'add' ? '추가 중...' : '추가'}
                    </button>
                  </div>
                  <p className={HINT}>
                    {accounts.length === 0 ? '첫 계정은 자동으로 대표가 됩니다.' : '추가한 계정은 부계정입니다. 랭킹에는 대표 계정만 표시됩니다.'}
                  </p>
                </form>
              )}
            </section>

            {/* ── 스팀 ── */}
            <section className="mt-8 space-y-3">
              <h4 className={H3}>스팀</h4>

              {detail.steam_migration_required ? (
                <div className={ALERT.warn}>스팀 연동 컬럼이 아직 없습니다. (scripts/sql/20260724_steam.sql 미적용)</div>
              ) : (
                <>
                  {detail.steam ? (
                    <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-surface">
                          {detail.steam.steam_avatar_url && (
                            <Image src={detail.steam.steam_avatar_url} alt="" fill sizes="44px" className="object-cover" unoptimized />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-bold text-fg">{detail.steam.steam_persona ?? '(이름 없음)'}</span>
                            <span className={detail.steam.is_private ? BADGE.warn : BADGE.ok}>
                              {detail.steam.is_private ? '비공개' : '공개'}
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-muted">{detail.steam.steam_id64}</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-subtle">
                            <span>보유 게임 {detail.steam.owned_game_count ?? '-'}개</span>
                            <span>동기화 {formatKstShort(detail.steam.steam_synced_at)}</span>
                          </div>
                          {detail.steam.steam_sync_error && (
                            <div className="mt-0.5 text-xs text-danger-ink">{detail.steam.steam_sync_error}</div>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={unlinkSteam} disabled={!!busy} className={BTN_SM_DANGER}>
                        {busy === 'steam-unlink' ? '해제 중...' : '연결 해제'}
                      </button>
                    </div>
                  ) : (
                    <p className={HINT}>연결된 스팀 계정이 없습니다.</p>
                  )}

                  <form onSubmit={linkSteam} className="space-y-2">
                    <label className={LABEL} htmlFor="admin-steam-input">
                      {detail.steam ? '스팀 계정 변경' : '스팀 계정 등록'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="admin-steam-input"
                        type="text" value={steamInput} required maxLength={200}
                        placeholder="친구 코드 · SteamID64 · 프로필 주소 · 사용자 이름"
                        onChange={(e) => setSteamInput(e.target.value)} className={INPUT}
                      />
                      <button type="submit" disabled={!!busy} className={BTN_SM_PRIMARY}>
                        {busy === 'steam' ? '저장 중...' : '저장'}
                      </button>
                    </div>
                    <p className={HINT}>
                      친구 코드(숫자 10자리 이하), SteamID64(17자리), steamcommunity.com/id/… 또는 /profiles/… 주소를 인식합니다.
                      다른 계정으로 바꾸면 이전 보유 게임 캐시를 지우고 다시 동기화합니다.
                    </p>
                  </form>
                </>
              )}
            </section>
          </>
        )}

        <div className="mt-8">
          <button type="button" onClick={close} disabled={!!busy} className={`${BTN_NEUTRAL} w-full`}>
            {busy ? '처리 중...' : '닫기'}
          </button>
        </div>
      </div>
    </div>
  )
}
