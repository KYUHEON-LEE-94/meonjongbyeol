'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import SteamThumb from '@/app/steam/SteamThumb'
import { Spinner } from '@/app/components/Spinner'
import SteamGamePicker, { type SteamGameSelection } from '@/app/custom-games/_components/SteamGamePicker'
import {
  DEFAULT_QUICK_START_MIN,
  LOL_CAPACITY,
  LOL_MODES,
  QUICK_START_OPTIONS_MIN,
  type CreatableGameKind,
  type LolMode,
  type QuickStartMin,
} from '@/lib/customGames/constants'
import {
  GAME_KIND_OPTIONS,
  LOL_MODE_LABELS,
  formatKstSchedule,
  gameKindBadgeClass,
  gameKindLabel,
  lolModeBadge,
  openNativePicker,
  effectiveStatusBadgeClass,
  effectiveStatusLabel,
  isQuickGame,
  isRecruitClosed,
  quickGameState,
  todayKstDate,
} from '@/lib/customGames/display'
import { useCustomGamesRealtime } from '@/app/custom-games/_components/useCustomGamesRealtime'
import { useNow } from '@/app/custom-games/_components/useNow'
import LiveToast from '@/app/custom-games/_components/LiveToast'
import SeatBar from '@/app/custom-games/_components/SeatBar'
import { QuickLiveBadge, quickCountdownText } from '@/app/custom-games/_components/QuickLiveBadge'
import { ALERT, BTN_NEUTRAL, BTN_ON_HERO, BTN_PRIMARY, CARD_HOVER, CONTAINER, INPUT, SHELL } from '@/lib/ui/styles'
import HeroBanner from '@/app/components/ui/HeroBanner'
import EmptyState from '@/app/components/ui/EmptyState'

// 마이그레이션 미적용 환경에서는 GET이 구 컬럼만 담아 degrade하므로 파생 필드를 optional로 둔다.
type GameRow = {
  id: string
  title: string
  status: string
  created_at: string
  ended_at: string | null
  game_kind?: string
  game_kind_label?: string | null
  steam_app_id?: number | null
  lol_mode?: string | null
  capacity?: number
  scheduled_at?: string | null
  host_member_id?: string | null
  host_member_name?: string | null
  guest_count?: number
  confirmed_count?: number
  waitlist_count?: number
  can_manage?: boolean
  // 대기 순번 표시는 waitlist_position 만 쓴다(position 은 확정 포함 전체 순번).
  my_participation?: {
    position: number
    confirmed: boolean
    waitlist_position?: number | null
    is_host?: boolean
  } | null
  latest_joiner?: { name: string; joined_at: string; is_me: boolean } | null
}

const DEFAULT_CAPACITY = 8
/** 10분 이내 시작하는 번개가 있으면 초 단위 카운트다운이 필요하다. */
const FAST_TICK_WINDOW_MS = 10 * 60 * 1000

type GameSnapshot = { total: number; latestAt: string | null }

function snapshotOf(games: GameRow[]): Map<string, GameSnapshot> {
  return new Map(
    games.map((g) => [
      g.id,
      { total: (g.confirmed_count ?? 0) + (g.waitlist_count ?? 0), latestAt: g.latest_joiner?.joined_at ?? null },
    ]),
  )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${className}`}>
      {children}
    </span>
  )
}

/** 모집 폼을 바로 여는 쿼리(?new=1). 사이드바·홈의 "내전 모집하기"가 이 링크를 쓴다. */
const OPEN_CREATE_QUERY = 'new'

/**
 * `?new=1` 로 들어오면 모집 모달을 연 뒤 쿼리를 지운다(새로고침·뒤로가기로 다시 열리지 않게).
 * 이미 /custom-games 에 있을 때 같은 링크를 눌러도 searchParams 변화로 다시 동작한다.
 * useSearchParams 는 정적 프리렌더에서 Suspense 경계가 필요해 별도 컴포넌트로 분리한다.
 */
function OpenCreateFromQuery({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const onOpenRef = useRef(onOpen)
  useEffect(() => { onOpenRef.current = onOpen })
  const shouldOpen = searchParams.get(OPEN_CREATE_QUERY) === '1'
  useEffect(() => {
    if (!shouldOpen) return
    onOpenRef.current()
    router.replace('/custom-games', { scroll: false })
  }, [shouldOpen, router])
  return null
}

export default function CustomGamesPage() {
  const router = useRouter()
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [timeInput, setTimeInput] = useState('21:00')
  const [capacityInput, setCapacityInput] = useState(8)
  const [gameKind, setGameKind] = useState<CreatableGameKind>('lol')
  const [kindLabel, setKindLabel] = useState('')
  const [steamGame, setSteamGame] = useState<SteamGameSelection>({ label: '', appId: null })
  const [lolMode, setLolMode] = useState<LolMode>('rift')
  const [quickMode, setQuickMode] = useState(false)
  const [quickStartMin, setQuickStartMin] = useState<QuickStartMin>(DEFAULT_QUICK_START_MIN)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)

  // 이전 타이머를 지우지 않으면 앞선 메시지의 타이머가 새 메시지를 일찍 지운다.
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
  }, [])

  const showMsg = useCallback((type: 'error' | 'success', msg: string) => {
    if (type === 'error') { setError(msg); setSuccessMsg(null) }
    else { setSuccessMsg(msg); setError(null) }
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
    msgTimerRef.current = setTimeout(() => {
      msgTimerRef.current = null
      setError(null)
      setSuccessMsg(null)
    }, 4000)
  }, [])

  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])

  const loadedRef = useRef(false)
  const reqSeqRef = useRef(0)
  const prevSnapshotRef = useRef<Map<string, GameSnapshot> | null>(null)

  /**
   * silent: 라이브 재조회. 이미 목록이 떠 있으면 스피너를 띄우지 않고(R3), 실패해도 화면·알림을 건드리지 않는다.
   * live: 직전 스냅샷과 비교해 남이 방금 참가한 내전에 토스트를 띄운다(신규 내전·본인 참가 제외).
   */
  const loadGames = useCallback(async (opts?: { silent?: boolean; live?: boolean }) => {
    const silent = opts?.silent ?? false
    const seq = ++reqSeqRef.current
    if (!loadedRef.current) setLoading(true)
    try {
      const res = await fetch('/api/custom-games', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (seq !== reqSeqRef.current) return
      if (!res.ok) {
        if (!silent) showMsg('error', body.error ?? '목록 로드 실패')
        return
      }
      const next = (body.games ?? []) as GameRow[]
      const prev = prevSnapshotRef.current
      if (opts?.live && prev) {
        const joined = next.find((g) => {
          const before = prev.get(g.id)
          if (!before || !g.latest_joiner || g.latest_joiner.is_me) return false
          const total = (g.confirmed_count ?? 0) + (g.waitlist_count ?? 0)
          return total > before.total && g.latest_joiner.joined_at !== before.latestAt
        })
        if (joined?.latest_joiner) {
          setToast({ id: Date.now(), message: `${joined.latest_joiner.name}님이 ‘${joined.title}’에 방금 참가했어요` })
        }
      }
      prevSnapshotRef.current = snapshotOf(next)
      loadedRef.current = true
      setGames(next)
      setMigrationRequired(Boolean(body.migration_required))
    } catch {
      if (seq !== reqSeqRef.current) return
      if (!silent) showMsg('error', '알 수 없는 오류가 발생했습니다')
    } finally {
      if (seq === reqSeqRef.current) setLoading(false)
    }
  }, [showMsg])

  useEffect(() => { loadGames() }, [loadGames])

  const liveReload = useCallback(() => loadGames({ silent: true, live: true }), [loadGames])
  useCustomGamesRealtime({ scope: 'list' }, liveReload)

  // 10분 안에 시작하는 번개가 있으면 1초, 아니면 30초 tick (마감·LIVE 판정 재평가).
  const [fastTick, setFastTick] = useState(false)
  const now = useNow(fastTick ? 1000 : 30_000)
  useEffect(() => {
    if (now === null) return
    const need = games.some((g) => {
      if (g.status !== 'recruiting' || !g.scheduled_at || !isQuickGame(g)) return false
      const diff = Date.parse(g.scheduled_at) - now
      return diff > 0 && diff <= FAST_TICK_WINDOW_MS
    })
    if (need !== fastTick) setFastTick(need)
  }, [games, now, fastTick])

  const isLol = gameKind === 'lol'
  const effectiveCapacity = isLol ? LOL_CAPACITY : capacityInput

  const handleOpenModal = () => {
    setTitleInput('')
    setDateInput(todayKstDate())
    setTimeInput('21:00')
    setCapacityInput(8)
    setGameKind('lol')
    setKindLabel('')
    setSteamGame({ label: '', appId: null })
    setLolMode('rift')
    setQuickMode(false)
    setQuickStartMin(DEFAULT_QUICK_START_MIN)
    setCreateError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setCreateError(null)
  }

  const handleCreate = async () => {
    // 에러는 모달 내부에 표시한다 — 페이지 알림은 모달 배경 뒤에 가려 보이지 않는다.
    setCreateError(null)
    if (!titleInput.trim()) { setCreateError('제목을 입력하세요'); return }
    if (!quickMode && (!dateInput || !timeInput)) { setCreateError('일자와 시간을 모두 입력하세요'); return }
    if (gameKind === 'etc' && !kindLabel.trim()) { setCreateError('기타 게임은 종류 이름을 입력하세요'); return }

    setCreating(true)
    try {
      // ⚠ 일자·시간은 문자열 그대로 보낸다. 클라이언트에서 Date로 변환하면
      //   브라우저 로컬 타임존으로 해석되어 실제 일정과 어긋난다.
      //   번개는 시각 자체를 보내지 않는다 — 서버가 now + N분으로 정한다.
      const res = await fetch('/api/custom-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.trim(),
          ...(quickMode
            ? { quick: true, quick_start_min: quickStartMin }
            : { scheduled_date: dateInput, scheduled_time: timeInput }),
          capacity: effectiveCapacity,
          game_kind: gameKind,
          game_kind_label:
            gameKind === 'etc'
              ? kindLabel.trim()
              : gameKind === 'steam'
                ? steamGame.label.trim() || null
                : null,
          ...(gameKind === 'steam' ? { steam_app_id: steamGame.appId } : {}),
          ...(gameKind === 'lol' ? { lol_mode: lolMode } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) { setCreateError(body.error ?? '생성 실패'); return }
      closeModal()
      router.push(`/custom-games/${body.id}`)
    } catch { setCreateError('생성 중 오류가 발생했습니다') }
    finally { setCreating(false) }
  }

  const handleJoin = async (game: GameRow) => {
    setBusyId(game.id)
    try {
      const res = await fetch(`/api/custom-games/${game.id}/join`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { showMsg('error', body.error ?? '신청 실패'); return }
      showMsg('success', body.confirmed ? '참가가 확정되었습니다' : `대기 ${body.waitlist_position ?? '-'}번으로 신청되었습니다`)
      await loadGames()
    } catch { showMsg('error', '신청 중 오류가 발생했습니다') }
    finally { setBusyId(null) }
  }

  const handleLeave = async (game: GameRow) => {
    if (!confirm('참가를 취소하시겠습니까?')) return
    setBusyId(game.id)
    try {
      const res = await fetch(`/api/custom-games/${game.id}/join`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { showMsg('error', body.error ?? '취소 실패'); return }
      showMsg('success', '참가가 취소되었습니다')
      await loadGames()
    } catch { showMsg('error', '취소 중 오류가 발생했습니다') }
    finally { setBusyId(null) }
  }

  const handleDelete = async (game: GameRow) => {
    if (!confirm('이 내전을 삭제하시겠습니까? 모든 참가 신청과 라운드 기록이 함께 삭제됩니다.')) return
    setBusyId(game.id)
    try {
      const res = await fetch(`/api/custom-games/${game.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '삭제 실패'); return }
      showMsg('success', '삭제되었습니다')
      await loadGames()
    } catch { showMsg('error', '삭제 중 오류가 발생했습니다') }
    finally { setBusyId(null) }
  }

  const recruitingCount = games.filter((g) => g.status === 'recruiting').length

  return (
    <>
      <Suspense fallback={null}>
        <OpenCreateFromQuery onOpen={handleOpenModal} />
      </Suspense>
      <main className={SHELL}>
      <div className={CONTAINER}>
        <HeroBanner
          kicker="Custom Games"
          title="내전"
          description={`내전을 모집하고 참가 신청을 받습니다${
            !loading && recruitingCount > 0 ? ` · 모집 중 ${recruitingCount}건` : ''
          }`}
          action={
            <button type="button" onClick={handleOpenModal} className={BTN_ON_HERO}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                <path d="M12 4v16m8-8H4" />
              </svg>
              내전 모집
            </button>
          }
        />

          {migrationRequired && (
            <div className={`mb-6 ${ALERT.warn}`}>
              내전 모집 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요.
            </div>
          )}

          {error && (
            <div className={`mb-6 ${ALERT.error}`}>
              {error}
            </div>
          )}
          {successMsg && (
            <div className={`mb-6 ${ALERT.ok}`}>
              {successMsg}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-subtle">
              <Spinner size={6} />
              <p className="text-sm font-semibold">로딩 중...</p>
            </div>
          )}

          {!loading && games.length === 0 && (
            <EmptyState hint="위쪽 [내전 모집] 버튼으로 시작하세요">모집 중인 내전이 없습니다</EmptyState>
          )}

          {!loading && games.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {games.map((g) => {
                const capacity = g.capacity ?? DEFAULT_CAPACITY
                const taken = (g.confirmed_count ?? 0) + (g.guest_count ?? 0)
                const waitlistCount = g.waitlist_count ?? 0
                const mine = g.my_participation ?? null
                // 예정 시각이 지난 recruiting 은 "마감"으로 보고 참가를 막는다.
                // now 가 없는(첫 렌더) 동안은 기존과 같이 Date.now() 기준으로 판정한다.
                const nowMs = now ?? undefined
                const joinable = g.status === 'recruiting' && !isRecruitClosed(g.status, g.scheduled_at, nowMs)
                const busy = busyId === g.id
                const quickState = now !== null ? quickGameState(g, taken, capacity, now) : null
                const countdown =
                  quickState === 'live' && now !== null ? quickCountdownText(g.scheduled_at, taken, capacity, now) : null

                return (
                  // 카드 전체 클릭은 제목 링크의 ::after 를 카드 크기로 늘려 처리한다(stretched link).
                  // <a> 안에 <button> 을 넣지 않기 위해서이며, 버튼 행만 z-10 으로 링크 위에 올린다.
                  <div
                    key={g.id}
                    className={`${CARD_HOVER} relative p-5 flex flex-col gap-3`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-black text-fg leading-snug break-all">
                        <Link
                          href={`/custom-games/${g.id}`}
                          className="after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand"
                        >
                          {g.title}
                        </Link>
                      </h2>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <QuickLiveBadge state={quickState} />
                        {quickState !== 'expired' && (
                          <Badge className={effectiveStatusBadgeClass(g.status, g.scheduled_at, nowMs)}>
                            {effectiveStatusLabel(g.status, g.scheduled_at, nowMs)}
                          </Badge>
                        )}
                      </span>
                    </div>

                    {g.game_kind === 'steam' && g.steam_app_id != null && (
                      <div className="pointer-events-none relative h-[42px] w-[110px] overflow-hidden rounded-lg border border-line bg-surface-2">
                        <SteamThumb appid={g.steam_app_id} name={gameKindLabel(g.game_kind, g.game_kind_label)} />
                      </div>
                    )}
                    {(g.game_kind === 'tft' || g.game_kind === 'lol') && (
                      <div className="pointer-events-none relative h-[42px] w-[42px] shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
                        <Image src={`/custom-games/${g.game_kind}.png`} alt="" fill sizes="42px" className="object-cover" />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={gameKindBadgeClass(g.game_kind)}>
                        {gameKindLabel(g.game_kind, g.game_kind_label)}
                      </Badge>
                      {g.game_kind === 'lol' && lolModeBadge(g.lol_mode) && (
                        <Badge className="bg-info/10 border-info/20 text-info-ink">
                          {lolModeBadge(g.lol_mode)}
                        </Badge>
                      )}
                      <Badge className="bg-surface-2 border-line text-muted">
                        {taken}/{capacity}
                      </Badge>
                      {waitlistCount > 0 && (
                        <Badge className="bg-warn/10 border-warn/20 text-warn-ink">
                          대기 {waitlistCount}명
                        </Badge>
                      )}
                      {mine && (
                        <Badge className={mine.confirmed
                          ? 'bg-ok/10 border-ok/20 text-ok-ink'
                          : 'bg-warn/10 border-warn/20 text-warn-ink'}>
                          {mine.confirmed ? '참가 확정' : `대기 ${mine.waitlist_position ?? '-'}번`}
                        </Badge>
                      )}
                    </div>

                    {g.capacity != null && g.confirmed_count != null && <SeatBar taken={taken} capacity={capacity} />}

                    <div className="text-xs text-subtle flex flex-col gap-0.5">
                      {countdown && <span className="font-bold text-danger-ink">{countdown}</span>}
                      <span>{formatKstSchedule(g.scheduled_at)}</span>
                      <span>주최: {g.host_member_name ?? '알 수 없음'}</span>
                    </div>

                    <div className="pointer-events-none relative z-10 flex items-center gap-2 mt-1 [&>*]:pointer-events-auto">
                      {joinable && !mine && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleJoin(g) }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-ok/10 border border-ok/25 text-ok-ink
                            hover:bg-ok/20 hover:text-ok-ink
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          {taken >= capacity ? '대기 신청' : '참가 신청'}
                        </button>
                      )}

                      {/* 주최자는 서버가 취소를 400으로 막는다 — 버튼 자체를 숨긴다(관리자는 is_host=false라 노출). */}
                      {joinable && mine && !mine.is_host && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleLeave(g) }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-surface-2 border border-line text-muted
                            hover:text-fg hover:bg-line-strong
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          참가 취소
                        </button>
                      )}

                      {g.can_manage && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(g) }}
                          disabled={busy}
                          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-danger/10 border border-danger/20 text-danger-ink
                            hover:bg-danger/20 hover:text-danger-ink
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && games.length > 0 && (
            <p className="mt-4 text-xs text-faint font-medium">총 {games.length}개</p>
          )}
        </div>
      </main>

      <LiveToast toast={toast} onDismiss={dismissToast} />

      {/* 모집 폼 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !creating && closeModal()}
          />
          <div
            className="relative w-full max-w-lg rounded-3xl bg-panel p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto shadow-[0_24px_64px_-20px_var(--color-shadow)] ring-1 ring-line"
          >
            <div>
              <h2 className="text-lg font-black text-fg mb-1">내전 모집</h2>
              <p className="text-sm text-subtle">일정과 정원을 정하면 참가 신청을 받습니다</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">제목</label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="예) 금요일 저녁 내전"
                maxLength={60}
                disabled={creating}
                className={INPUT}
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setQuickMode((v) => !v)}
                aria-pressed={quickMode}
                disabled={creating}
                className={`flex w-full min-h-11 items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-bold ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 ${
                  quickMode ? 'bg-danger/10 text-danger-ink ring-danger/30' : 'bg-surface-2 text-muted ring-transparent hover:text-fg'
                }`}
              >
                <span>⚡ 지금 바로 (번개)</span>
                <span className="text-xs font-semibold">{quickMode ? '켜짐' : '꺼짐'}</span>
              </button>
              {quickMode && (
                <div className="mt-2">
                  <p className="mb-2 text-xs font-bold text-muted">몇 분 뒤에 시작할까요?</p>
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label="시작까지 시간">
                    {QUICK_START_OPTIONS_MIN.map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setQuickStartMin(min)}
                        aria-pressed={quickStartMin === min}
                        disabled={creating}
                        className={`min-h-11 rounded-2xl text-sm font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 ${
                          quickStartMin === min ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-fg'
                        }`}
                      >
                        {min}분
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-faint">시작 시각은 등록 시점 기준으로 서버가 정합니다</p>
                </div>
              )}
            </div>

            {!quickMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">일자</label>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  onMouseDown={openNativePicker}
                  disabled={creating}
                  className={`${INPUT} cursor-pointer`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">시간 (KST)</label>
                <input
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  onMouseDown={openNativePicker}
                  disabled={creating}
                  className={`${INPUT} cursor-pointer`}
                />
              </div>
            </div>
            )}

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">게임 종류</label>
              <div className="grid grid-cols-3 gap-2">
                {GAME_KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGameKind(opt.value)}
                    disabled={creating}
                    className={`min-h-11 py-2.5 rounded-2xl text-sm font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                      gameKind === opt.value
                        ? 'bg-brand text-white shadow-[0_10px_24px_-12px_var(--color-brand)]'
                        : 'bg-surface-2 text-muted hover:text-fg'
                    } disabled:opacity-50`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {gameKind === 'etc' && (
                <input
                  type="text"
                  value={kindLabel}
                  onChange={(e) => setKindLabel(e.target.value)}
                  placeholder="게임 이름 (예: 배틀그라운드)"
                  maxLength={30}
                  disabled={creating}
                  className={`${INPUT} mt-2`}
                />
              )}
              {gameKind === 'steam' && !migrationRequired && (
                <SteamGamePicker value={steamGame} onChange={setSteamGame} disabled={creating} />
              )}
              {isLol && (
                <div className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    {LOL_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setLolMode(mode)}
                        disabled={creating}
                        className={`min-h-11 py-2.5 rounded-2xl text-sm font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                          lolMode === mode
                            ? 'bg-brand text-white shadow-[0_10px_24px_-12px_var(--color-brand)]'
                            : 'bg-surface-2 text-muted hover:text-fg'
                        } disabled:opacity-50`}
                      >
                        {LOL_MODE_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-faint">
                    {lolMode === 'rift'
                      ? '협곡은 5:5 팀 분할 + 포지션 배치를 상세에서 지원합니다 (정원 10명 고정)'
                      : '증바람은 5:5 팀 분할을 상세에서 지원합니다 (정원 10명 고정)'}
                  </p>
                </div>
              )}
              {(gameKind === 'steam' || gameKind === 'etc') && (
                <p className="mt-1.5 text-xs text-faint">
                  스팀·기타 내전은 모집·참가 관리만 지원합니다
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">정원</label>
              <input
                type="number"
                min={2}
                max={100}
                value={effectiveCapacity}
                onChange={(e) => setCapacityInput(Number(e.target.value))}
                disabled={creating || isLol}
                className={`${INPUT} disabled:cursor-not-allowed`}
              />
              <p className="mt-1.5 text-xs text-faint">
                {isLol
                  ? '롤 내전은 5:5 구조라 10명 고정입니다'
                  : '2~100명. 정원을 넘는 신청은 자동으로 대기자가 됩니다'}
              </p>
            </div>

            {createError && (
              <div role="alert" className={ALERT.error}>
                {createError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={closeModal}
                disabled={creating}
                className={`${BTN_NEUTRAL} flex-1`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !titleInput.trim() || (!quickMode && (!dateInput || !timeInput))}
                className={`${BTN_PRIMARY} flex-1`}
              >
                {creating ? <><Spinner size={4} /> 등록 중...</> : '모집 시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
