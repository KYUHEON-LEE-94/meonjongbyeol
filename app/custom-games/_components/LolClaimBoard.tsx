'use client'

import MemberAvatar from '@/app/components/MemberAvatar'
import { Spinner } from '@/app/components/Spinner'
import { LOL_POSITIONS, type LolPosition } from '@/lib/customGames/constants'
import { positionLabel } from '@/lib/customGames/display'
import { CARD, H2, HINT } from '@/lib/ui/styles'
import { TEAM_STYLES, nameInitial } from './LolTeamAssignPanel'

export type ClaimBoardRow = {
  team_index: number
  member_id: string | null
  guest_name: string | null
  position: string | null
}

export type ClaimBoardMember = { name: string; avatarUrl: string | null }

export type MySlot = { team_index: number; position: string | null } | null

type Props = {
  teams: readonly ClaimBoardRow[]
  members: ReadonlyMap<string, ClaimBoardMember>
  mySlot: MySlot
  /** 확정 참가자 + 모집 중일 때만 true. 서버가 최종 판정한다. */
  canClaim: boolean
  /** 진행 중인 요청의 슬롯 키(`${team}-${position}` 또는 'release'). 중복 클릭 방지. */
  busyKey: string | null
  onClaim: (teamIndex: 1 | 2, position: LolPosition) => void
  onRelease: () => void
}

const SLOT_BTN =
  'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 disabled:pointer-events-none'
const RELEASE_BTN =
  'inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 px-3 text-xs font-bold text-fg transition-colors hover:bg-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 disabled:pointer-events-none'

/**
 * 롤 협곡 — 비관리자용 팀·포지션 선점 보드(2팀 × 5포지션).
 * 빈 슬롯은 탭해서 선점(내 슬롯이 다른 곳이면 이동), 내 슬롯은 강조 + 해제. 남의 슬롯은 읽기 전용.
 */
export default function LolClaimBoard({ teams, members, mySlot, canClaim, busyKey, onClaim, onRelease }: Props) {
  const busy = busyKey !== null

  return (
    <section className={`${CARD} p-5 sm:p-6`} aria-label="포지션 선점">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={H2}>팀 구성</h2>
        {canClaim && (
          <p className={HINT}>
            {mySlot ? '다른 빈 자리를 누르면 이동해요' : '원하는 팀·포지션의 빈 자리를 눌러 선점하세요'}
          </p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([1, 2] as const).map((teamIndex) => {
          const ts = TEAM_STYLES[teamIndex - 1]
          const filled = teams.filter((t) => t.team_index === teamIndex && (t.member_id || t.guest_name)).length
          return (
            <div key={teamIndex} className={`rounded-2xl border p-3 sm:p-4 ${ts.bg}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${ts.dot}`} aria-hidden="true" />
                <span className={`text-sm font-black ${ts.text}`}>{ts.label}</span>
                <span className="ml-auto font-display text-xs font-bold tabular-nums text-muted">{filled}명</span>
              </div>
              <div className="flex flex-col gap-2">
                {LOL_POSITIONS.map((pos) => {
                  const row = teams.find((t) => t.team_index === teamIndex && t.position === pos)
                  const isMine = mySlot?.team_index === teamIndex && mySlot.position === pos
                  const key = `${teamIndex}-${pos}`
                  const posName = positionLabel(pos)
                  const teamName = `${teamIndex}팀`

                  let body: React.ReactNode
                  if (isMine && row) {
                    const m = row.member_id ? members.get(row.member_id) : undefined
                    const name = m?.name ?? '나'
                    body = (
                      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-brand/10 px-2 py-1.5 ring-2 ring-brand/60">
                        <MemberAvatar
                          src={m?.avatarUrl}
                          name={name}
                          size={28}
                          className="h-7 w-7 shrink-0 rounded-lg bg-brand/15 text-xs font-black text-brand-ink"
                        />
                        <span className="truncate text-sm font-bold text-fg">{name}</span>
                        <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-black text-white">나</span>
                        {canClaim && (
                          <button
                            type="button"
                            onClick={onRelease}
                            disabled={busy}
                            className={`${RELEASE_BTN} ml-auto`}
                            aria-label={`${teamName} ${posName} 선점 해제`}
                          >
                            {busyKey === 'release' ? <Spinner /> : '해제'}
                          </button>
                        )}
                      </div>
                    )
                  } else if (row && (row.member_id || row.guest_name)) {
                    const m = row.member_id ? members.get(row.member_id) : undefined
                    const name = row.member_id ? m?.name ?? '알 수 없음' : row.guest_name ?? '알 수 없음'
                    body = (
                      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-raised px-2 py-1.5 ring-1 ring-line">
                        {row.member_id ? (
                          <MemberAvatar
                            src={m?.avatarUrl}
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
                        {!row.member_id && (
                          <span className="ml-auto shrink-0 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-black text-warn-ink">
                            외부인
                          </span>
                        )}
                      </div>
                    )
                  } else if (canClaim) {
                    const label = mySlot ? '여기로 이동' : '선점'
                    body = (
                      <button
                        type="button"
                        onClick={() => onClaim(teamIndex, pos)}
                        disabled={busy}
                        className={`${SLOT_BTN} border border-dashed border-line-strong bg-surface/60 hover:bg-brand/10`}
                        aria-label={`${teamName} ${posName} ${mySlot ? '자리로 이동' : '선점'}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-black text-subtle" aria-hidden="true">
                          +
                        </span>
                        <span className="truncate text-sm font-bold text-brand-ink">
                          {busyKey === key ? <Spinner /> : label}
                        </span>
                      </button>
                    )
                  } else {
                    body = (
                      <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl border border-dashed border-line px-3 py-1.5">
                        <span className="text-xs text-subtle">비어 있음</span>
                      </div>
                    )
                  }

                  return (
                    <div key={pos} className="flex items-center gap-2">
                      <span className={`w-12 shrink-0 rounded-lg py-1 text-center text-[11px] font-bold ${ts.pill}`}>
                        {posName}
                      </span>
                      {body}
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
}
