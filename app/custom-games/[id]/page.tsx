'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Spinner } from '@/app/components/Spinner'
import MemberAvatar from '@/app/components/MemberAvatar'
import Link from 'next/link'
import SteamThumb from '@/app/steam/SteamThumb'
import PushNotifyToggle from '@/app/components/PushNotifyToggle'
import SteamGamePicker, { type SteamGameSelection } from '@/app/custom-games/_components/SteamGamePicker'
import LolTeamAssignPanel, {
  EMPTY_LOL_DRAFT,
  TEAM_STYLES,
  nameInitial,
  type LolGuestCard,
  type LolSlot,
  type LolTeamDraft,
} from '@/app/custom-games/_components/LolTeamAssignPanel'
import { LOL_POSITIONS } from '@/lib/customGames/constants'
import { effectiveMemberCapacity } from '@/lib/customGames/waitlist'
import {
  formatKstSchedule,
  formatLolRankShort,
  formatTimeUntil,
  gameKindLabel,
  lolModeLabel,
  lolTierClass,
  openNativePicker,
  positionLabel,
  effectiveStatusBadgeClass,
  effectiveStatusLabel,
  isRecruitClosed,
  toKstDateInput,
  toKstTimeInput,
} from '@/lib/customGames/display'
import {
  ALERT,
  BTN_BASE,
  BTN_NEUTRAL,
  BTN_ON_HERO,
  BTN_ON_HERO_GHOST,
  BTN_PRIMARY,
  CARD,
  CONTAINER,
  H2,
  HERO_CHIP,
  INPUT,
  PANEL,
  SHELL,
} from '@/lib/ui/styles'
import HeroBanner from '@/app/components/ui/HeroBanner'

// ── 타입 ────────────────────────────────────────────────────────────────────

type GameDetail = {
  id: string
  title: string
  status: string
  game_type: string
  game_kind: string
  game_kind_label: string | null
  steam_app_id: number | null
  lol_mode: string | null
  capacity: number
  scheduled_at: string | null
  host_member_id: string | null
  host_member_name: string | null
  created_at: string
  ended_at: string | null
}

type MemberParticipant = {
  id: string
  member_id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  avatar_url?: string | null
  joined_at: string
  position: number
  confirmed: boolean
  is_host: boolean
}

type GuestParticipant = {
  id: string
  display_name: string
}

type LolTeamRow = {
  team_index: number
  member_id: string | null
  guest_id: string | null
  guest_name: string | null
  position: string | null
}

type MemberOption = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  avatar_url?: string | null
}

// 대기 순번 표시는 waitlist_position 만 쓴다(position 은 확정 포함 전체 순번).
type MyParticipation = {
  id: string
  position: number
  confirmed: boolean
  waitlist_position?: number | null
  is_host?: boolean
} | null

// ── 헬퍼 컴포넌트 ─────────────────────────────────────────────────────────────

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${className}`}>
      {children}
    </span>
  )
}

type InfoIconName = 'calendar' | 'user' | 'game' | 'users' | 'status'

const INFO_ICON_PATHS: Record<InfoIconName, string[]> = {
  calendar: ['M8 2v4M16 2v4', 'M3 9h18', 'M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z'],
  user: ['M20 21a8 8 0 10-16 0', 'M12 13a5 5 0 100-10 5 5 0 000 10z'],
  game: ['M6 11h4M8 9v4', 'M15 12h.01M18 10h.01', 'M17.3 5H6.7a4 4 0 00-3.96 3.43l-.7 4.9A3 3 0 007 16l2-2h6l2 2a3 3 0 004.96-2.67l-.7-4.9A4 4 0 0017.3 5z'],
  users: ['M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75'],
  status: ['M22 12h-4l-3 9L9 3l-3 9H2'],
}

function InfoIcon({ name }: { name: InfoIconName }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {INFO_ICON_PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function CustomGameDetailPage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.id as string

  const [game, setGame] = useState<GameDetail | null>(null)
  const [confirmedList, setConfirmedList] = useState<MemberParticipant[]>([])
  const [waitlist, setWaitlist] = useState<MemberParticipant[]>([])
  const [guests, setGuests] = useState<GuestParticipant[]>([])
  const [lolTeams, setLolTeams] = useState<LolTeamRow[]>([])
  const [canManage, setCanManage] = useState(false)
  const [myParticipation, setMyParticipation] = useState<MyParticipation>(null)
  const [loading, setLoading] = useState(true)
  // 이미 상세가 떠 있는 상태의 재조회. 콘텐츠를 언마운트하지 않아 스크롤·입력 상태가 유지된다.
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [ending, setEnding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [joining, setJoining] = useState(false)
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 수정 폼 상태
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editCapacity, setEditCapacity] = useState(8)
  const [editSteamGame, setEditSteamGame] = useState<SteamGameSelection>({ label: '', appId: null })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [migrationRequired, setMigrationRequired] = useState(false)

  // 롤 팀 배정 상태
  const [lolDraft, setLolDraft] = useState<LolTeamDraft>(EMPTY_LOL_DRAFT)
  // 미배치 외부인 카드(드래그로 슬롯에 넣기 전까지 풀에 머문다).
  const [lolPoolGuests, setLolPoolGuests] = useState<LolGuestCard[]>([])
  const [savingLolTeams, setSavingLolTeams] = useState(false)
  const [lolTeamError, setLolTeamError] = useState<string | null>(null)

  // 관리자 멤버 추가 상태 (다중 선택 → 한 번에 추가)
  const [showMemberAdd, setShowMemberAdd] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [addingMembers, setAddingMembers] = useState(false)

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
    }, 5000)
  }, [])

  const hasGameRef = useRef(false)
  const reqSeqRef = useRef(0)

  const loadDetail = useCallback(async () => {
    const seq = ++reqSeqRef.current
    const isRefresh = hasGameRef.current
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      // 세션 의존(can_manage 등) 데이터라 브라우저 캐시가 stale 권한을 재사용하지 않도록 no-store.
      const res = await fetch(`/api/custom-games/${gameId}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      // 연속 조작으로 겹친 요청은 마지막 것만 반영한다(늦게 도착한 옛 응답이 덮어쓰지 않도록).
      if (seq !== reqSeqRef.current) return
      if (!res.ok) {
        const message = body.error ?? '로드 실패'
        // 재조회 중 일시 오류(5xx 등)는 보고 있던 화면을 지우지 않는다. 삭제·권한 상실만 화면을 내린다.
        if (isRefresh && res.status !== 404 && res.status !== 403) {
          showMsg('error', message)
          return
        }
        hasGameRef.current = false
        setLoadError(message)
        setGame(null)
        return
      }
      hasGameRef.current = true
      setLoadError(null)
      setGame(body.game)
      setConfirmedList(body.confirmed ?? [])
      setWaitlist(body.waitlist ?? [])
      setGuests(body.guests ?? [])
      setLolTeams(body.lol_teams ?? [])
      setCanManage(Boolean(body.can_manage))
      setMyParticipation(body.my_participation ?? null)
      setMigrationRequired(Boolean(body.migration_required))
    } catch {
      if (seq !== reqSeqRef.current) return
      if (isRefresh) showMsg('error', '새로고침 중 오류가 발생했습니다')
      else setLoadError('알 수 없는 오류가 발생했습니다')
    } finally {
      if (seq === reqSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [gameId, showMsg])

  // loadDetail 은 gameId 가 바뀔 때만 새로 만들어진다 — 다른 내전으로 이동하면 첫 로드로 취급한다.
  useEffect(() => {
    hasGameRef.current = false
    void loadDetail()
  }, [loadDetail])

  const isTft = game?.game_kind === 'tft'
  const isTeam = isTft && game?.game_type === 'team'
  const isLol = game?.game_kind === 'lol'
  const isRift = isLol && game?.lol_mode === 'rift'
  const isClosed = game?.status === 'ended' || game?.status === 'cancelled'
  // 예정 시각이 지난 recruiting 은 "마감"으로 보고 참가/취소 버튼을 감춘다(로스터 고정).
  const isRecruiting =
    game?.status === 'recruiting' && !isRecruitClosed(game.status, game.scheduled_at)

  // ── 롤 팀 드래프트 초기화 ──────────────────────────────────────────
  useEffect(() => {
    if (!isLol) return
    // 저장된 배정을 다시 불러오면 미배치 외부인 풀은 비운다(저장된 외부인은 전부 슬롯에 있다).
    setLolPoolGuests([])
    if (lolTeams.length === 0) {
      setLolDraft(EMPTY_LOL_DRAFT)
      setLolTeamError(null)
      return
    }
    const next: LolTeamDraft = [
      [null, null, null, null, null],
      [null, null, null, null, null],
    ]
    lolTeams.forEach((t, i) => {
      // 슬롯은 확정 멤버(member_id) 또는 외부인 라벨(guest_name) 중 하나로 채워진다.
      const m = t.member_id
        ? confirmedList.find((p) => p.member_id === t.member_id)
          ?? waitlist.find((p) => p.member_id === t.member_id)
        : undefined
      const slotValue: LolSlot = t.member_id
        ? {
            kind: 'member',
            key: t.member_id,
            name: m?.member_name ?? '알 수 없음',
            tier: m?.lol_tier ?? null,
            rank: m?.lol_rank ?? null,
            lp: m?.lol_league_points ?? null,
          }
        : t.guest_name
          ? { kind: 'guest', key: `g-saved-${i}`, name: t.guest_name }
          : null
      if (!slotValue) return
      const teamIdx = t.team_index - 1
      if (teamIdx !== 0 && teamIdx !== 1) return
      // 협곡은 포지션으로 슬롯을 고정하고, 증바람은 빈 슬롯 순서대로 채운다.
      const slotPos = isRift && t.position ? LOL_POSITIONS.indexOf(t.position as (typeof LOL_POSITIONS)[number]) : -1
      if (slotPos >= 0) {
        next[teamIdx][slotPos] = slotValue
      } else {
        const empty = next[teamIdx].findIndex((v) => v === null)
        if (empty >= 0) next[teamIdx][empty] = slotValue
      }
    })
    setLolDraft(next)
    setLolTeamError(null)
  }, [lolTeams, isLol, isRift, confirmedList, waitlist])

  // ── 데이터 계산 ───────────────────────────────────────────────────

  // 롤 팀 배정 멤버 풀 = 확정 명단. 티어·추방용 참가자 id·주최 여부 포함(외부인은 별도 카드).
  const lolParticipants = useMemo(
    () =>
      confirmedList.map((p) => ({
        key: p.member_id,
        id: p.id,
        name: p.member_name,
        tier: p.lol_tier,
        rank: p.lol_rank,
        lp: p.lol_league_points,
        isHost: p.is_host,
        avatarUrl: p.avatar_url ?? null,
      })),
    [confirmedList],
  )

  // ── 이벤트 핸들러 ─────────────────────────────────────────────────

  const handleJoin = async () => {
    setJoining(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/join`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { showMsg('error', body.error ?? '신청 실패'); return }
      showMsg('success', body.confirmed ? '참가가 확정되었습니다' : `대기 ${body.waitlist_position ?? '-'}번으로 신청되었습니다`)
      await loadDetail()
    } catch { showMsg('error', '신청 중 오류가 발생했습니다') }
    finally { setJoining(false) }
  }

  const handleLeave = async () => {
    if (!confirm('참가를 취소하시겠습니까?')) return
    setJoining(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/join`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { showMsg('error', body.error ?? '취소 실패'); return }
      showMsg('success', '참가가 취소되었습니다')
      await loadDetail()
    } catch { showMsg('error', '취소 중 오류가 발생했습니다') }
    finally { setJoining(false) }
  }

  const handleKick = async (p: MemberParticipant) => {
    if (!confirm(`${p.member_name}님을 명단에서 제외하시겠습니까?`)) return
    setKickingId(p.id)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/participants/${p.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '제외 실패'); return }
      showMsg('success', '명단에서 제외되었습니다')
      await loadDetail()
    } catch { showMsg('error', '제외 중 오류가 발생했습니다') }
    finally { setKickingId(null) }
  }

  const handleOpenEdit = () => {
    if (!game) return
    setEditTitle(game.title)
    setEditDate(toKstDateInput(game.scheduled_at))
    setEditTime(toKstTimeInput(game.scheduled_at))
    setEditCapacity(game.capacity)
    setEditSteamGame({ label: game.game_kind_label ?? '', appId: game.steam_app_id })
    setEditError(null)
    setShowEdit(true)
  }

  const closeEdit = () => {
    setShowEdit(false)
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!game) return
    // 에러는 모달 내부에 표시한다 — 페이지 알림은 모달 배경 뒤에 가려 보이지 않는다.
    setEditError(null)
    setSavingEdit(true)
    try {
      // 일자·시간은 문자열 그대로 전송한다 (서버가 KST 오프셋을 붙여 변환).
      const res = await fetch(`/api/custom-games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          scheduled_date: editDate,
          scheduled_time: editTime,
          capacity: editCapacity,
          ...(game.game_kind === 'steam'
            ? {
                game_kind_label: editSteamGame.label.trim() || null,
                steam_app_id: editSteamGame.appId,
              }
            : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) { setEditError(body.error ?? '수정 실패'); return }
      closeEdit()
      showMsg('success', '수정되었습니다')
      await loadDetail()
    } catch { setEditError('수정 중 오류가 발생했습니다') }
    finally { setSavingEdit(false) }
  }

  const handleDelete = async () => {
    if (!confirm('이 내전을 삭제하시겠습니까? 모든 참가 신청이 함께 삭제됩니다.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { showMsg('error', body.error ?? '삭제 실패'); setDeleting(false); return }
      // 성공 시 deleting 을 풀지 않는다 — 이동 전까지 버튼 재클릭을 막는다.
      router.push('/custom-games')
    } catch {
      showMsg('error', '삭제 중 오류가 발생했습니다')
      setDeleting(false)
    }
  }

  const handleEnd = async () => {
    if (!confirm('내전을 종료하시겠습니까?')) return
    setEnding(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/end`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '종료 실패'); return }
      showMsg('success', '내전이 종료되었습니다')
      await loadDetail()
    } catch { showMsg('error', '종료 중 오류가 발생했습니다') }
    finally { setEnding(false) }
  }

  // ── 롤 팀 배정 핸들러 ─────────────────────────────────────────────
  const handleSaveLolTeams = async () => {
    setSavingLolTeams(true)
    setLolTeamError(null)
    const assignments = lolDraft.flatMap((team, teamIdx) =>
      team
        .map((slot, slotIdx) => ({ slot, slotIdx }))
        .filter((s): s is { slot: NonNullable<LolSlot>; slotIdx: number } => s.slot !== null)
        .map((s) => ({
          team_index: teamIdx + 1,
          ...(s.slot.kind === 'member'
            ? { member_id: s.slot.key }
            : { guest_name: s.slot.name }),
          ...(isRift ? { position: LOL_POSITIONS[s.slotIdx] } : {}),
        })),
    )
    try {
      const res = await fetch(`/api/custom-games/${gameId}/lol-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })
      const body = await res.json()
      if (!res.ok) { setLolTeamError(body.error ?? '저장 실패'); return }
      showMsg('success', '팀 배정이 저장되었습니다')
      await loadDetail()
    } catch { setLolTeamError('저장 중 오류가 발생했습니다') }
    finally { setSavingLolTeams(false) }
  }

  const handleRandomLolTeams = async () => {
    setSavingLolTeams(true)
    setLolTeamError(null)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/lol-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ random: true }),
      })
      const body = await res.json()
      if (!res.ok) { setLolTeamError(body.error ?? '랜덤 배정 실패'); return }
      await loadDetail()
    } catch { setLolTeamError('랜덤 배정 중 오류가 발생했습니다') }
    finally { setSavingLolTeams(false) }
  }

  // ── 관리자 멤버 직접 추가 핸들러 ──────────────────────────────────
  const loadMemberOptions = useCallback(async (q: string) => {
    setLoadingOptions(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/member-options?q=${encodeURIComponent(q)}`)
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '멤버 목록 로드 실패'); return }
      setMemberOptions(body.members ?? [])
    } catch { showMsg('error', '멤버 목록 로드 중 오류가 발생했습니다') }
    finally { setLoadingOptions(false) }
  }, [gameId, showMsg])

  const toggleMemberSelect = (memberId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  // 선택한 멤버를 한 번의 요청으로 모두 추가한다(클릭마다 재조회하던 문제 해소).
  const handleAddSelectedMembers = async () => {
    if (selectedMemberIds.size === 0) return
    setAddingMembers(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_ids: [...selectedMemberIds] }),
      })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '추가 실패'); return }
      const added: number = body.added ?? 0
      const skipped: number = body.skipped ?? 0
      showMsg(
        'success',
        added > 0
          ? `${added}명이 추가되었습니다${skipped > 0 ? ` (${skipped}명은 이미 참가 중)` : ''}`
          : '추가할 새 멤버가 없습니다',
      )
      setSelectedMemberIds(new Set())
      await Promise.all([loadDetail(), loadMemberOptions(memberQuery)])
    } catch { showMsg('error', '추가 중 오류가 발생했습니다') }
    finally { setAddingMembers(false) }
  }

  // 관리자 멤버 추가 패널이 열려 있는 동안만 후보를 조회한다(검색어 디바운스).
  useEffect(() => {
    if (!showMemberAdd) return
    const t = setTimeout(() => { loadMemberOptions(memberQuery) }, 250)
    return () => clearTimeout(t)
  }, [showMemberAdd, memberQuery, loadMemberOptions])

  // ── 파생 값 ───────────────────────────────────────────────────────

  const seatsTaken = confirmedList.length + guests.length

  // 정원 하향 시 확정자 중 몇 명이 대기자로 밀리는지 (B-R12)
  const demotedCount = game
    ? Math.max(0, confirmedList.length - effectiveMemberCapacity(editCapacity, guests.length))
    : 0

  // 롤 내전 관리자 화면은 팀 배정 패널의 미배치 풀이 명단 역할을 하므로 참가자 카드를 생략한다.
  const showLolPanel = isLol && canManage && !isClosed

  const renderParticipantRow = (p: MemberParticipant, tone: 'confirmed' | 'waitlist') => (
    <li
      key={p.id}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        tone === 'confirmed' ? 'bg-surface-2/60' : 'bg-warn/5'
      }`}
    >
      {tone === 'confirmed' ? (
        <MemberAvatar
          src={p.avatar_url}
          name={p.member_name}
          size={40}
          className="h-10 w-10 shrink-0 rounded-2xl bg-brand/15 text-sm font-black text-brand-ink"
        />
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn/15 font-display text-sm font-bold tabular-nums text-warn-ink"
          aria-label={`대기 ${p.position - confirmedList.length}번`}
        >
          {p.position - confirmedList.length}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold leading-tight text-fg">{p.member_name}</p>
          {p.is_host && (
            <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-black text-brand-ink">
              주최
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-subtle">
          {p.riot_game_name ? `${p.riot_game_name}#${p.riot_tagline}` : p.is_host ? '주최자' : '참가자'}
        </p>
      </div>
      {isLol && (
        <span className={`shrink-0 text-[11px] font-black ${lolTierClass(p.lol_tier)}`}>
          {formatLolRankShort(p.lol_tier, p.lol_rank, p.lol_league_points)}
        </span>
      )}
      {canManage && !isClosed && !p.is_host && (
        <button
          type="button"
          onClick={() => handleKick(p)}
          disabled={kickingId === p.id}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-danger/15 hover:text-danger-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40"
          title="명단에서 제외"
          aria-label={`${p.member_name} 명단에서 제외`}
        >
          {kickingId === p.id ? <Spinner size={3} /> : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </button>
      )}
    </li>
  )

  // ── 렌더 ─────────────────────────────────────────────────────────

  const remainingSeats = game ? Math.max(0, game.capacity - seatsTaken) : 0
  const timeUntil = game && !isClosed ? formatTimeUntil(game.scheduled_at) : null
  const fillPercent = game && game.capacity > 0 ? Math.min(100, (seatsTaken / game.capacity) * 100) : 0

  const heroStats = game
    ? [
        { label: '확정', value: `${seatsTaken}/${game.capacity}` },
        ...(waitlist.length > 0 ? [{ label: '대기', value: `${waitlist.length}` }] : []),
        ...(timeUntil ? [{ label: '시작까지', value: timeUntil }] : []),
      ]
    : []

  const heroAction = game && (refreshing || myParticipation || (!isClosed && isRecruiting)) ? (
    <>
      {refreshing && (
        <span role="status" aria-label="새로고침 중" className={HERO_CHIP}>
          <Spinner size={3} /> 갱신 중
        </span>
      )}
      {!isClosed && isRecruiting && !myParticipation && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={joining}
          className={BTN_ON_HERO}
        >
          {joining ? <Spinner size={4} /> : null}
          {seatsTaken >= game.capacity ? '대기 신청' : '참가 신청'}
        </button>
      )}
      {myParticipation && (
        <span className="inline-flex min-h-11 items-center rounded-full bg-white/20 px-4 text-sm font-bold text-white ring-1 ring-white/30">
          {myParticipation.is_host
            ? '주최자'
            : myParticipation.confirmed
              ? '참가 확정'
              : `대기 ${myParticipation.waitlist_position ?? myParticipation.position - confirmedList.length}번`}
        </span>
      )}
      {/* 주최자는 서버가 취소를 400으로 막는다 — 버튼 자체를 숨긴다(관리자는 is_host=false라 노출). */}
      {!isClosed && isRecruiting && myParticipation && !myParticipation.is_host && (
        <button
          type="button"
          onClick={handleLeave}
          disabled={joining}
          className={BTN_ON_HERO_GHOST}
        >
          {joining ? <Spinner size={4} /> : null}
          참가 취소
        </button>
      )}
    </>
  ) : null

  const infoRows = game
    ? [
        { icon: 'calendar' as const, label: '일정', value: formatKstSchedule(game.scheduled_at) },
        { icon: 'user' as const, label: '주최', value: game.host_member_name ?? '알 수 없음' },
        {
          icon: 'game' as const,
          label: '게임',
          value: isLol && game.lol_mode
            ? `${gameKindLabel(game.game_kind, game.game_kind_label)} · ${lolModeLabel(game.lol_mode)}`
            : gameKindLabel(game.game_kind, game.game_kind_label),
        },
        {
          icon: 'users' as const,
          label: '인원',
          value: `${seatsTaken}/${game.capacity}명${guests.length > 0 ? ` (게스트 ${guests.length}명 포함)` : ''}${
            waitlist.length > 0 ? ` · 대기 ${waitlist.length}명` : ''
          }`,
        },
      ]
    : []

  return (
    <>
    {/* 자체 sticky 헤더를 두지 않는다 — 앱 내비(AppShell)와 겹친다. 탭바 여백은 SHELL 이 맡는다. */}
    <main className={SHELL}>
      <div className={CONTAINER}>
        <nav aria-label="이동 경로" className="mb-4">
          <Link
            href="/custom-games"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl px-1 text-sm font-bold text-muted transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            내전 목록
          </Link>
        </nav>

        {loading && (
          <div className={PANEL} aria-busy="true">
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-subtle">
              <Spinner size={6} />
              <p className="text-sm font-semibold">로딩 중...</p>
            </div>
          </div>
        )}

        {!loading && !game && (
          <div className={PANEL}>
            <div className="text-center py-20">
              <p className="text-muted font-bold">{loadError ?? '내전을 찾을 수 없습니다'}</p>
              <Link href="/custom-games" className="text-brand-ink text-sm mt-2 inline-block hover:underline">← 목록으로</Link>
            </div>
          </div>
        )}

        {!loading && game && (
          <>
            <HeroBanner
              size="md"
              className="mb-6"
              kicker={gameKindLabel(game.game_kind, game.game_kind_label)}
              badges={
                <>
                  {isLol && game.lol_mode && (
                    <span className={HERO_CHIP}>{lolModeLabel(game.lol_mode)}</span>
                  )}
                  <span className={HERO_CHIP}>{effectiveStatusLabel(game.status, game.scheduled_at)}</span>
                </>
              }
              title={game.title}
              description={`${formatKstSchedule(game.scheduled_at)} · 주최 ${game.host_member_name ?? '알 수 없음'}`}
              stats={heroStats}
              action={heroAction}
              illustration={
                game.game_kind === 'steam' && game.steam_app_id != null ? (
                  <span className="block rotate-6 rounded-2xl bg-white p-1.5 shadow-[0_14px_30px_-12px_var(--color-shadow)] ring-1 ring-black/5">
                    <span className="relative block h-[46px] w-[120px] overflow-hidden rounded-xl sm:h-[60px] sm:w-[160px]">
                      <SteamThumb appid={game.steam_app_id} name={gameKindLabel(game.game_kind, game.game_kind_label)} />
                    </span>
                  </span>
                ) : game.game_kind === 'tft' || game.game_kind === 'lol' ? (
                  <span className="block rotate-6 rounded-2xl bg-white p-1.5 shadow-[0_14px_30px_-12px_var(--color-shadow)] ring-1 ring-black/5">
                    <span className="relative block h-16 w-16 overflow-hidden rounded-xl sm:h-24 sm:w-24">
                      <Image src={`/custom-games/${game.game_kind}.png`} alt="" fill sizes="96px" className="object-cover" />
                    </span>
                  </span>
                ) : (
                  'character'
                )
              }
            />

            {error && (
              <div role="alert" className={`mb-6 ${ALERT.error}`}>
                {error}
              </div>
            )}
            {successMsg && (
              <div role="status" className={`mb-6 ${ALERT.ok}`}>
                {successMsg}
              </div>
            )}

            {/* 모바일: 정보·알림 → 본문 → 관리 / lg: 본문(좌) + 정보·알림·관리(우) */}
            <div
              className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:items-start"
              aria-busy={refreshing}
            >
              {/* ── 사이드: 정보 + 알림 ── */}
              <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1">
                <section className={`${CARD} p-5`} aria-label="내전 정보">
                  <h2 className={H2}>내전 정보</h2>
                  <dl className="mt-4 flex flex-col gap-3">
                    {infoRows.map((row) => (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand-ink" aria-hidden="true">
                          <InfoIcon name={row.icon} />
                        </span>
                        <div className="min-w-0">
                          <dt className="text-xs font-semibold text-subtle">{row.label}</dt>
                          <dd className="text-sm font-bold text-fg break-keep">{row.value}</dd>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand-ink" aria-hidden="true">
                        <InfoIcon name="status" />
                      </span>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold text-subtle">상태</dt>
                        <dd className="mt-0.5">
                          <Badge className={effectiveStatusBadgeClass(game.status, game.scheduled_at)}>
                            {effectiveStatusLabel(game.status, game.scheduled_at)}
                          </Badge>
                        </dd>
                      </div>
                    </div>
                  </dl>
                </section>

                {!isClosed && <PushNotifyToggle variant="compact" />}
              </div>

              {/* ── 메인 ── */}
              <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                {/* 좌석 현황 */}
                <section className={`${CARD} p-5 sm:p-6`} aria-label="좌석 현황">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className={H2}>좌석 현황</h2>
                      <p className="mt-1 text-sm text-muted">
                        <span className="font-display font-bold tabular-nums text-fg">{seatsTaken}/{game.capacity}</span>
                        {' · '}
                        {remainingSeats > 0
                          ? `${remainingSeats}자리 남음`
                          : `정원 마감${waitlist.length > 0 ? ` · 대기 ${waitlist.length}명` : ''}`}
                      </p>
                    </div>
                    {canManage && !isClosed && (
                      <button
                        type="button"
                        onClick={() => setShowMemberAdd((v) => !v)}
                        aria-expanded={showMemberAdd}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-brand/12 px-3 text-xs font-bold text-brand-ink transition-colors hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        멤버 추가
                      </button>
                    )}
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${fillPercent}%` }} />
                  </div>

                  {game.capacity <= 20 && (
                    <ul className="mt-5 grid grid-cols-5 gap-x-2 gap-y-4 sm:grid-cols-10" aria-label="좌석">
                      {confirmedList.map((p) => (
                        <li key={p.id} className="flex min-w-0 flex-col items-center gap-1.5" title={p.member_name}>
                          <span className="relative flex h-11 w-11 rounded-full ring-2 ring-brand/30">
                            <MemberAvatar
                              src={p.avatar_url}
                              name={p.member_name}
                              size={44}
                              className="h-full w-full rounded-full bg-brand/15 text-sm font-black text-brand-ink"
                            />
                            {p.is_host && (
                              <span
                                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white"
                                aria-label="주최자"
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d="M12 2.5l2.6 6.2 6.7.6-5.1 4.4 1.6 6.5L12 16.7l-5.8 3.5 1.6-6.5L2.7 9.3l6.7-.6z" />
                                </svg>
                              </span>
                            )}
                          </span>
                          <span className="w-full truncate text-center text-[11px] font-semibold text-muted">{p.member_name}</span>
                        </li>
                      ))}
                      {guests.map((g) => (
                        <li key={g.id} className="flex min-w-0 flex-col items-center gap-1.5" title={`${g.display_name} (게스트)`}>
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-warn/15 text-sm font-black text-warn-ink ring-2 ring-warn/30">
                            {nameInitial(g.display_name)}
                          </span>
                          <span className="w-full truncate text-center text-[11px] font-semibold text-muted">{g.display_name}</span>
                        </li>
                      ))}
                      {Array.from({ length: remainingSeats }).map((_, i) => (
                        <li key={`empty-${i}`} className="flex flex-col items-center gap-1.5">
                          <span className="h-11 w-11 rounded-full border-2 border-dashed border-line-strong" aria-hidden="true" />
                          <span className="text-[11px] font-semibold text-subtle">빈 자리</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {canManage && !isClosed && showMemberAdd && (
                    <div className="mt-5 rounded-2xl p-4 ring-1 ring-line">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-bold text-fg">승인 멤버 추가</p>
                        <button
                          type="button"
                          onClick={() => { setShowMemberAdd(false); setMemberQuery(''); setSelectedMemberIds(new Set()) }}
                          className="rounded-xl px-2 py-1 text-xs font-bold text-subtle transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                        >
                          닫기
                        </button>
                      </div>
                      <input
                        type="text"
                        value={memberQuery}
                        onChange={(e) => setMemberQuery(e.target.value)}
                        placeholder="멤버 이름 검색"
                        aria-label="멤버 이름 검색"
                        className={`${INPUT} mb-3`}
                      />
                      {loadingOptions ? (
                        <div className="flex items-center gap-2 text-subtle text-sm py-3">
                          <Spinner size={4} /> 불러오는 중...
                        </div>
                      ) : memberOptions.length === 0 ? (
                        <p className="text-sm text-subtle py-2">추가할 수 있는 승인 멤버가 없습니다</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allSelected = memberOptions.every((m) => selectedMemberIds.has(m.id))
                                setSelectedMemberIds((prev) => {
                                  const next = new Set(prev)
                                  memberOptions.forEach((m) => (allSelected ? next.delete(m.id) : next.add(m.id)))
                                  return next
                                })
                              }}
                              className="text-xs font-bold text-brand-ink hover:underline"
                            >
                              {memberOptions.every((m) => selectedMemberIds.has(m.id)) ? '전체 해제' : '전체 선택'}
                            </button>
                            <span className="text-xs text-subtle">{selectedMemberIds.size}명 선택됨</span>
                          </div>
                          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                            {memberOptions.map((m) => {
                              const checked = selectedMemberIds.has(m.id)
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => toggleMemberSelect(m.id)}
                                  aria-pressed={checked}
                                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-left ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                                    checked ? 'bg-brand/10 ring-brand/40' : 'bg-surface-2 ring-transparent hover:bg-line-strong'
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border ${
                                      checked ? 'bg-brand border-brand text-white' : 'border-line-strong'
                                    }`}
                                  >
                                    {checked && (
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </span>
                                  <MemberAvatar
                                    src={m.avatar_url}
                                    name={m.member_name}
                                    size={32}
                                    className="h-8 w-8 shrink-0 rounded-xl bg-brand/15 text-xs font-black text-brand-ink"
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-bold text-fg leading-tight truncate">{m.member_name}</span>
                                    <span className="block text-xs text-subtle truncate">
                                      {m.riot_game_name ? `${m.riot_game_name}#${m.riot_tagline}` : '라이엇 ID 미등록'}
                                    </span>
                                  </span>
                                  {isLol && (
                                    <span className={`ml-auto shrink-0 text-[11px] font-black ${lolTierClass(m.lol_tier)}`}>
                                      {formatLolRankShort(m.lol_tier, m.lol_rank, m.lol_league_points)}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={handleAddSelectedMembers}
                              disabled={addingMembers || selectedMemberIds.size === 0}
                              className={BTN_PRIMARY}
                            >
                              {addingMembers ? <Spinner size={3} /> : null}
                              선택 {selectedMemberIds.size}명 추가
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>

                {/* 참가자 — 롤 관리자 화면은 아래 팀 배정 패널의 미배치 풀이 명단을 대신한다. */}
                {!showLolPanel && (
                  <section className={`${CARD} p-5 sm:p-6`} aria-label="참가자">
                    <h2 className={H2}>
                      참가자 <span className="font-display tabular-nums text-muted">{seatsTaken}</span>
                    </h2>
                    {confirmedList.length === 0 && guests.length === 0 ? (
                      <p className="mt-3 text-sm text-subtle">아직 참가자가 없습니다</p>
                    ) : (
                      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {confirmedList.map((p) => renderParticipantRow(p, 'confirmed'))}
                        {guests.map((g) => (
                          <li key={g.id} className="flex items-center gap-3 rounded-2xl bg-warn/5 px-3 py-2.5">
                            <span
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-warn/15 text-sm font-black text-warn-ink"
                            >
                              {nameInitial(g.display_name)}
                            </span>
                            <p className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{g.display_name}</p>
                            <span className="shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-black text-warn-ink">
                              게스트
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!isTft && !isLol && (
                      <p className="mt-4 text-xs text-subtle">
                        {gameKindLabel(game.game_kind, game.game_kind_label)} 내전은 모집·참가 관리만 지원합니다.
                      </p>
                    )}
                  </section>
                )}

                {/* 대기 명단 */}
                {waitlist.length > 0 && (
                  <section className={`${CARD} p-5 sm:p-6`} aria-label="대기 명단">
                    <h2 className={H2}>
                      대기 명단 <span className="font-display tabular-nums text-muted">{waitlist.length}</span>
                    </h2>
                    <p className="mt-1 text-xs text-subtle">확정 인원이 취소하면 순번대로 자동 확정됩니다</p>
                    <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {waitlist.map((p) => renderParticipantRow(p, 'waitlist'))}
                    </ul>
                  </section>
                )}

                {/* 레거시 롤체(tft) 내전: 생성·기록 기능은 종료됐고 모집 정보만 표시한다. */}
                {isTft && (
                  <p className={ALERT.warn}>
                    롤체 내전(종료된 기능) — 기록 기능은 더 이상 제공되지 않습니다.
                  </p>
                )}

                {/* ── 롤 내전: 팀/포지션 배정 ───── */}
                {isLol && (
                  <>
                    {canManage && !isClosed ? (
                      <LolTeamAssignPanel
                        participants={lolParticipants}
                        guests={lolPoolGuests}
                        mode={isRift ? 'rift' : 'aram'}
                        draft={lolDraft}
                        onChange={setLolDraft}
                        onGuestsChange={setLolPoolGuests}
                        onKickMember={(key) => {
                          const p = confirmedList.find((x) => x.member_id === key)
                          if (p) handleKick(p)
                        }}
                        onRandom={handleRandomLolTeams}
                        onSave={handleSaveLolTeams}
                        saving={savingLolTeams}
                        canManage={canManage}
                        isClosed={isClosed}
                        validationError={lolTeamError}
                      />
                    ) : (
                      // 관리 권한이 없거나 종료된 내전은 읽기 전용 팀 구성만 보여준다.
                      lolTeams.length > 0 && (
                        <section className={`${CARD} p-5 sm:p-6`} aria-label="팀 구성">
                          <h2 className={H2}>팀 구성</h2>
                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {([1, 2] as const).map((teamIndex) => {
                              const rows = lolTeams
                                .filter((t) => t.team_index === teamIndex && (t.member_id || t.guest_name))
                                .sort((a, b) => {
                                  if (!isRift) return 0
                                  return LOL_POSITIONS.indexOf(a.position as (typeof LOL_POSITIONS)[number]) -
                                    LOL_POSITIONS.indexOf(b.position as (typeof LOL_POSITIONS)[number])
                                })
                              const ts = TEAM_STYLES[teamIndex - 1]
                              return (
                                <div key={teamIndex} className={`rounded-2xl border p-3 sm:p-4 ${ts.bg}`}>
                                  <div className="mb-3 flex items-center gap-2">
                                    <span className={`h-2.5 w-2.5 rounded-full ${ts.dot}`} aria-hidden="true" />
                                    <span className={`text-sm font-black ${ts.text}`}>{ts.label}</span>
                                    <span className="ml-auto font-display text-xs font-bold tabular-nums text-muted">{rows.length}명</span>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {rows.length === 0 && <p className="text-xs text-subtle">미배정</p>}
                                    {rows.map((t, i) => {
                                      const teamMember = t.member_id
                                        ? confirmedList.find((p) => p.member_id === t.member_id)
                                          ?? waitlist.find((p) => p.member_id === t.member_id)
                                        : undefined
                                      const name = t.member_id
                                        ? teamMember?.member_name ?? '알 수 없음'
                                        : t.guest_name ?? '알 수 없음'
                                      return (
                                        <div key={`${t.member_id ?? t.guest_name}-${t.position ?? ''}`} className="flex items-center gap-2">
                                          <span className={`w-12 shrink-0 rounded-lg py-1 text-center text-[11px] font-bold ${ts.pill}`}>
                                            {isRift ? positionLabel(t.position) : `${i + 1}`}
                                          </span>
                                          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-raised px-2 py-1.5 ring-1 ring-line">
                                            {t.member_id ? (
                                              <MemberAvatar
                                                src={teamMember?.avatar_url}
                                                name={name}
                                                size={28}
                                                className="h-7 w-7 shrink-0 rounded-lg bg-brand/15 text-xs font-black text-brand-ink"
                                              />
                                            ) : (
                                              <span
                                                aria-hidden="true"
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warn/15 text-xs font-black text-warn-ink"
                                              >
                                                {nameInitial(name)}
                                              </span>
                                            )}
                                            <span className="truncate text-sm font-bold text-fg">{name}</span>
                                            {!t.member_id && t.guest_name && (
                                              <span className="ml-auto shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-black text-warn-ink">
                                                외부인
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      )
                    )}
                  </>
                )}
              </div>

              {/* ── 사이드: 관리 (모바일에서는 본문 아래) ── */}
              {canManage && (
                <section className={`${CARD} p-5 lg:col-start-2 lg:row-start-2`} aria-label="관리">
                  <h2 className={H2}>관리</h2>
                  <div className="mt-4 flex flex-col gap-2">
                    {!isClosed && (
                      <button
                        type="button"
                        onClick={handleOpenEdit}
                        className={`${BTN_NEUTRAL} w-full`}
                      >
                        수정
                      </button>
                    )}
                    {!isClosed && (
                      <button
                        type="button"
                        onClick={handleEnd}
                        disabled={ending || deleting}
                        className={`${BTN_BASE} w-full bg-warn/12 text-warn-ink hover:bg-warn/20`}
                      >
                        {ending ? <><Spinner size={4} /> 종료 중...</> : '내전 종료'}
                      </button>
                    )}
                  </div>
                  {/* 삭제는 종료된 내전에도 노출한다 — 위험 행동이라 시각적 강조를 낮춘다(확인 대화상자 유지). */}
                  <div className={`${isClosed ? 'mt-3' : 'mt-4 border-t border-line pt-3'} flex justify-center`}>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting || ending}
                      className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
                    >
                      {deleting ? <><Spinner size={4} /> 삭제 중...</> : '내전 삭제'}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </main>

      {/* 수정 모달 — 서버가 권한을 강제하므로 이 노출 제어는 UX 목적이다 */}
      {showEdit && game && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !savingEdit && closeEdit()}
          />
          <div
            className="relative w-full max-w-lg rounded-3xl bg-panel p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto shadow-[0_24px_64px_-20px_var(--color-shadow)] ring-1 ring-line"
          >
            <h2 className="text-lg font-black text-fg">내전 수정</h2>

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">제목</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={60}
                disabled={savingEdit}
                className={INPUT}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">일자</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  onMouseDown={openNativePicker}
                  disabled={savingEdit}
                  className={`${INPUT} cursor-pointer`}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">시간 (KST)</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  onMouseDown={openNativePicker}
                  disabled={savingEdit}
                  className={`${INPUT} cursor-pointer`}
                />
              </div>
            </div>

            {game.game_kind === 'steam' && !migrationRequired && (
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">게임</label>
                <SteamGamePicker
                  value={editSteamGame}
                  onChange={setEditSteamGame}
                  disabled={savingEdit}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">정원</label>
              <input
                type="number"
                min={2}
                max={100}
                value={editCapacity}
                onChange={(e) => setEditCapacity(Number(e.target.value))}
                disabled={savingEdit || isTeam}
                className={`${INPUT} disabled:cursor-not-allowed`}
              />
              {isTeam && <p className="mt-1.5 text-xs text-faint">레거시 롤체 팀전은 8명 고정입니다</p>}
              {demotedCount > 0 && (
                <p className="mt-1.5 text-xs text-warn-ink">
                  정원을 줄이면 확정자 {demotedCount}명이 대기자로 이동합니다
                </p>
              )}
            </div>

            {editError && (
              <div role="alert" className={ALERT.error}>
                {editError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                className={`${BTN_NEUTRAL} flex-1`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editTitle.trim() || !editDate || !editTime}
                className={`${BTN_PRIMARY} flex-1`}
              >
                {savingEdit ? <><Spinner size={4} /> 저장 중...</> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
