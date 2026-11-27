'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Spinner } from '@/app/components/Spinner'
import MemberAvatar from '@/app/components/MemberAvatar'
import { LOL_CAPACITY, LOL_POSITIONS } from '@/lib/customGames/constants'
import { formatLolRankShort, lolTierClass, positionLabel } from '@/lib/customGames/display'
import { ALERT, BTN_GHOST, BTN_PRIMARY, CARD, H2 } from '@/lib/ui/styles'

const TEAM_SIZE = LOL_CAPACITY / 2 // 5
const GUEST_NAME_MAX = 20

/** 멤버 풀 소스 = 확정 명단. 롤 티어 + 추방용 참가자 id + 주최 여부. */
export type LolParticipant = {
  key: string // member_id (드래그 식별자)
  id: string // custom_game_participants.id (추방 API)
  name: string
  tier: string | null
  rank: string | null
  lp: number | null
  isHost: boolean
  avatarUrl: string | null
}

// 슬롯 3-상태: 확정 멤버 | 외부인 라벨(자유 텍스트) | 미배정.
export type LolSlot =
  | { kind: 'member'; key: string; name: string; tier: string | null; rank: string | null; lp: number | null }
  | { kind: 'guest'; key: string; name: string }
  | null

// 2팀 × 5슬롯. rift 는 슬롯 index i 가 LOL_POSITIONS[i] 포지션과 대응한다.
export type LolTeamDraft = [LolSlot[], LolSlot[]]

/** 미배치 외부인 카드. 드래그로 슬롯에 넣기 전까지 여기 머문다. */
export type LolGuestCard = { key: string; name: string }

export const EMPTY_LOL_DRAFT: LolTeamDraft = [
  [null, null, null, null, null],
  [null, null, null, null, null],
]

// 1팀=블루(info), 2팀=레드(danger). 읽기 전용 팀 구성(상세 페이지)도 이 상수를 공유한다.
export const TEAM_STYLES = [
  {
    bg: 'bg-info/5 border-info/25',
    dot: 'bg-info',
    text: 'text-info-ink',
    pill: 'bg-info/12 text-info-ink',
    over: 'ring-2 ring-info/60 bg-info/10',
    label: '1팀 (블루)',
  },
  {
    bg: 'bg-danger/5 border-danger/25',
    dot: 'bg-danger',
    text: 'text-danger-ink',
    pill: 'bg-danger/12 text-danger-ink',
    over: 'ring-2 ring-danger/60 bg-danger/10',
    label: '2팀 (레드)',
  },
] as const

/** 이름 첫 글자(아바타 이니셜). */
export function nameInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

// 드래그 대상을 하나의 값으로 통일한다.
type Card =
  | { kind: 'member'; key: string; name: string; tier: string | null; rank: string | null; lp: number | null; isHost: boolean; avatarUrl: string | null }
  | { kind: 'guest'; key: string; name: string }

const cardDragId = (c: Card) => `${c.kind}:${c.key}`

function CardInner({ card }: { card: Card }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {card.kind === 'member' ? (
        <MemberAvatar
          src={card.avatarUrl}
          name={card.name}
          size={28}
          className="h-7 w-7 shrink-0 rounded-lg bg-brand/15 text-xs font-black text-brand-ink"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warn/15 text-xs font-black text-warn-ink"
        >
          {nameInitial(card.name)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-bold text-fg">{card.name}</span>
        {card.kind === 'member' && card.isHost && (
          <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-black text-brand-ink">주최</span>
        )}
      </span>
      {card.kind === 'member' ? (
        <span className={`shrink-0 text-[11px] font-black ${lolTierClass(card.tier)}`}>
          {formatLolRankShort(card.tier, card.rank, card.lp)}
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-black text-warn-ink">외부인</span>
      )}
    </div>
  )
}

/**
 * 드래그 가능한 카드. DragOverlay 대신 카드 자신에 transform 을 적용한다.
 * (DragOverlay 는 position:fixed 라 상위에 CSS transform 이 있으면 커서와 크게 어긋난다 —
 *  내전 상세는 애니메이션 transform 조상이 있어 이 방식이 안전하다.)
 */
function DraggableCard({
  card,
  disabled,
  onRemove,
  removeLabel,
}: {
  card: Card
  disabled: boolean
  onRemove?: () => void
  removeLabel?: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cardDragId(card),
    data: { card },
    disabled,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex min-h-11 items-center gap-1 rounded-xl bg-surface-raised py-1.5 pl-2 pr-1.5 ring-1 ring-line transition-shadow ${
        isDragging ? 'shadow-[0_16px_32px_-12px_var(--color-shadow)] ring-brand/50 opacity-95' : ''
      }`}
    >
      {/* 드래그 핸들 = 카드 본문. 버튼(추방/삭제)은 리스너 밖이라 클릭이 드래그로 먹히지 않는다. */}
      <div
        {...listeners}
        {...attributes}
        className={`flex min-w-0 flex-1 items-center select-none touch-none ${
          disabled ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <CardInner card={card} />
      </div>
      {onRemove && !disabled && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? (card.kind === 'guest' ? '외부인 삭제' : '명단에서 제외')}
          title={removeLabel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-subtle transition-colors hover:bg-danger/10 hover:text-danger-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function Slot({
  id,
  label,
  card,
  disabled,
  teamStyle,
  onUnassign,
}: {
  id: string
  label: string
  card: Card | null
  disabled: boolean
  teamStyle: (typeof TEAM_STYLES)[number]
  onUnassign: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled })
  return (
    <div className="flex items-center gap-2">
      <span className={`w-12 shrink-0 rounded-lg py-1 text-center text-[11px] font-bold ${teamStyle.pill}`}>{label}</span>
      <div
        ref={setNodeRef}
        className={`min-h-12 min-w-0 flex-1 rounded-xl transition-[background-color,box-shadow] ${
          isOver ? teamStyle.over : ''
        } ${card ? '' : 'flex items-center border border-dashed border-line-strong px-3'}`}
      >
        {card ? (
          // 슬롯의 × = 배치 해제(명단 · 미배치로 되돌림). 추방·삭제가 아니다 — 모바일에서 풀까지 끌 필요가 없게.
          <DraggableCard card={card} disabled={disabled} onRemove={onUnassign} removeLabel={`${label} 배치 빼기`} />
        ) : (
          <span className="text-xs text-subtle">여기로 드래그</span>
        )}
      </div>
    </div>
  )
}

function Pool({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', disabled })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border border-dashed p-3 transition-colors ${
        isOver ? 'border-brand/60 bg-brand/10' : 'border-line-strong bg-surface-2/40'
      }`}
    >
      {children}
    </div>
  )
}

export default function LolTeamAssignPanel({
  participants,
  guests,
  mode,
  draft,
  onChange,
  onGuestsChange,
  onKickMember,
  onRandom,
  onSave,
  saving,
  canManage,
  isClosed,
  validationError,
  hasSavedTeams = false,
}: {
  participants: LolParticipant[]
  guests: LolGuestCard[]
  mode: 'aram' | 'rift'
  draft: LolTeamDraft
  onChange: (next: LolTeamDraft) => void
  onGuestsChange: (next: LolGuestCard[]) => void
  onKickMember: (memberKey: string) => void
  onRandom: () => void
  onSave: () => void
  saving: boolean
  canManage: boolean
  isClosed: boolean
  validationError: string | null
  /** 저장된 배정이 있으면 전원 빼고 저장(비우기)도 허용한다 */
  hasSavedTeams?: boolean
}) {
  const isRift = mode === 'rift'
  const [guestInput, setGuestInput] = useState('')

  const sensors = useSensors(
    // distance 활성 제약: 터치에서 살짝 눌러 스크롤하는 동작과 드래그를 구분한다(모바일 지원).
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const placed = useMemo(() => {
    const members = new Set<string>()
    const guestKeys = new Set<string>()
    draft.flat().forEach((s) => {
      if (s?.kind === 'member') members.add(s.key)
      else if (s?.kind === 'guest') guestKeys.add(s.key)
    })
    return { members, guestKeys }
  }, [draft])

  // 풀 = 배치되지 않은 멤버 + 배치되지 않은 외부인.
  const poolMembers = useMemo(() => participants.filter((p) => !placed.members.has(p.key)), [participants, placed])
  const poolGuests = useMemo(() => guests.filter((g) => !placed.guestKeys.has(g.key)), [guests, placed])
  const poolCount = poolMembers.length + poolGuests.length

  const filledCount = useMemo(() => draft.flat().filter((s) => s !== null).length, [draft])
  const canRandom = participants.length === LOL_CAPACITY

  const findLocation = (card: Card): [number, number] | null => {
    for (let t = 0; t < 2; t++)
      for (let s = 0; s < TEAM_SIZE; s++) {
        const slot = draft[t][s]
        if (slot && slot.kind === card.kind && slot.key === card.key) return [t, s]
      }
    return null
  }

  const cardToSlot = (card: Card): LolSlot =>
    card.kind === 'member'
      ? { kind: 'member', key: card.key, name: card.name, tier: card.tier, rank: card.rank, lp: card.lp }
      : { kind: 'guest', key: card.key, name: card.name }

  const handleDragEnd = (e: DragEndEvent) => {
    const card = e.active.data.current?.card as Card | undefined
    if (!card || !e.over) return
    const overId = String(e.over.id)
    const from = findLocation(card)
    const next: LolTeamDraft = [[...draft[0]], [...draft[1]]]

    if (overId === 'pool') {
      if (from) next[from[0]][from[1]] = null
      onChange(next)
      return
    }
    const m = /^t(\d)s(\d)$/.exec(overId)
    if (!m) return
    const toT = Number(m[1])
    const toS = Number(m[2])
    if (from && from[0] === toT && from[1] === toS) return
    const occupant = next[toT][toS]
    next[toT][toS] = cardToSlot(card)
    if (from) next[from[0]][from[1]] = occupant // 슬롯↔슬롯 스왑
    onChange(next)
  }

  const unassign = (teamIdx: number, slotIdx: number) => {
    const next: LolTeamDraft = [[...draft[0]], [...draft[1]]]
    next[teamIdx][slotIdx] = null
    onChange(next)
  }

  const addGuest = () => {
    const name = guestInput.trim().slice(0, GUEST_NAME_MAX)
    if (!name) return
    if (guests.some((g) => g.name.trim().toLowerCase() === name.toLowerCase())) { setGuestInput(''); return }
    const key = `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    onGuestsChange([...guests, { key, name }])
    setGuestInput('')
  }

  const memberCard = (p: LolParticipant): Card => ({
    kind: 'member', key: p.key, name: p.name, tier: p.tier, rank: p.rank, lp: p.lp, isHost: p.isHost, avatarUrl: p.avatarUrl,
  })

  return (
    <section className={`${CARD} p-5 sm:p-6`} aria-label="팀 배정">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={H2}>팀 배정</h2>
            <span className="rounded-full bg-info/12 px-2.5 py-0.5 text-xs font-bold text-info-ink">
              {isRift ? '협곡 · 포지션' : '증바람'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            명단 카드를 끌어 {isRift ? '포지션별로' : '각 팀에'} 배치하세요 · 슬롯의 ×로 다시 미배치로 뺄 수 있어요 · 저장 버튼으로 확정됩니다
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRandom}
              disabled={saving || !canRandom}
              title={canRandom ? undefined : `확정 ${LOL_CAPACITY}명이어야 랜덤 배정할 수 있습니다`}
              className={BTN_GHOST}
            >
              랜덤 배정
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || (filledCount === 0 && !hasSavedTeams)}
              className={BTN_PRIMARY}
            >
              {saving ? <Spinner size={3} /> : null}
              저장
            </button>
          </div>
          {!canRandom && (
            <p className="text-[11px] text-subtle">랜덤 배정은 확정 {LOL_CAPACITY}명일 때 가능</p>
          )}
        </div>
      </div>

      {validationError && (
        <div role="alert" className={`mb-4 ${ALERT.error}`}>
          {validationError}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {/* 확정 명단 = 미배치 풀(드래그 소스). 배치된 인원은 슬롯에 있으므로 여기서 빠진다. */}
        <div className="mb-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted">
              명단 · 미배치 <span className="font-display tabular-nums text-fg">{poolCount}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }}
                placeholder="외부인 이름 추가"
                maxLength={GUEST_NAME_MAX}
                disabled={saving}
                aria-label="외부인 이름"
                className="h-9 w-36 rounded-xl border border-transparent bg-surface-2 px-3 text-xs font-medium text-fg placeholder:text-subtle transition-colors focus:border-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 disabled:opacity-50 sm:w-44"
              />
              <button
                type="button"
                onClick={addGuest}
                disabled={saving || !guestInput.trim()}
                className="h-9 rounded-xl bg-brand/12 px-3 text-xs font-bold text-brand-ink transition-colors hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
          <Pool disabled={saving}>
            {poolCount === 0 ? (
              <p className="py-1 text-xs text-subtle">모든 인원이 배치되었습니다. 슬롯의 × 를 누르거나 카드를 여기로 끌면 배치가 해제됩니다.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {poolMembers.map((p) => (
                  <DraggableCard
                    key={p.key}
                    card={memberCard(p)}
                    disabled={saving}
                    onRemove={canManage && !isClosed && !p.isHost ? () => onKickMember(p.key) : undefined}
                  />
                ))}
                {poolGuests.map((g) => (
                  <DraggableCard
                    key={g.key}
                    card={{ kind: 'guest', key: g.key, name: g.name }}
                    disabled={saving}
                    onRemove={() => onGuestsChange(guests.filter((x) => x.key !== g.key))}
                  />
                ))}
              </div>
            )}
          </Pool>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([0, 1] as const).map((teamIdx) => {
            const ts = TEAM_STYLES[teamIdx]
            const teamFilled = draft[teamIdx].filter((v) => v !== null).length
            return (
              <div key={teamIdx} className={`rounded-2xl border p-3 sm:p-4 ${ts.bg}`}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${ts.dot}`} aria-hidden="true" />
                  <span className={`text-sm font-black ${ts.text}`}>{ts.label}</span>
                  <span className="ml-auto font-display text-xs font-bold tabular-nums text-muted">
                    {teamFilled}/{TEAM_SIZE}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {Array.from({ length: TEAM_SIZE }).map((_, slotIdx) => {
                    const slot = draft[teamIdx][slotIdx]
                    const owner = slot?.kind === 'member' ? participants.find((p) => p.key === slot.key) : undefined
                    const card: Card | null = slot
                      ? slot.kind === 'member'
                        ? { kind: 'member', key: slot.key, name: slot.name, tier: slot.tier, rank: slot.rank, lp: slot.lp, isHost: owner?.isHost ?? false, avatarUrl: owner?.avatarUrl ?? null }
                        : { kind: 'guest', key: slot.key, name: slot.name }
                      : null
                    return (
                      <Slot
                        key={slotIdx}
                        id={`t${teamIdx}s${slotIdx}`}
                        label={isRift ? positionLabel(LOL_POSITIONS[slotIdx]) : `${slotIdx + 1}`}
                        card={card}
                        disabled={saving}
                        teamStyle={ts}
                        onUnassign={() => unassign(teamIdx, slotIdx)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </DndContext>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${(filledCount / LOL_CAPACITY) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold text-subtle">
          <span className="font-display tabular-nums text-fg">{filledCount}/{LOL_CAPACITY}</span>명 배정
        </span>
      </div>
    </section>
  )
}
