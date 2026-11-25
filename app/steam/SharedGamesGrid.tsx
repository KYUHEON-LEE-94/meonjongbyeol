'use client'

import { useState } from 'react'
import Image from 'next/image'
import SteamThumb from '@/app/steam/SteamThumb'
import EmptyState from '@/app/components/ui/EmptyState'
import { BTN_NEUTRAL, CARD_HOVER } from '@/lib/ui/styles'

export type SharedGameOwner = { id: string; name: string; avatarUrl: string | null }

export type SharedGameCard = {
  appid: number
  name: string
  isMultiplayer: boolean | null
  headerImageUrl: string | null
  owners: SharedGameOwner[]
}

const INITIAL_COUNT = 12
const AVATAR_STACK_MAX = 4

/**
 * "함께 할 수 있는 게임" 카드 그리드. 데이터는 ISR 서버 렌더가 props 로 넘긴 공개 집계뿐이고,
 * 여기서는 "더 보기" 펼침 상태만 갖는다(세션·fetch 없음).
 */
export default function SharedGamesGrid({ games }: { games: SharedGameCard[] }) {
  const [expanded, setExpanded] = useState(false)

  if (games.length === 0) {
    return <EmptyState>아직 함께 보유한 멀티플레이 게임이 없습니다.</EmptyState>
  }

  const visible = expanded ? games : games.slice(0, INITIAL_COUNT)
  const hiddenCount = games.length - visible.length

  return (
    <div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((game) => (
          <li key={game.appid} className={`${CARD_HOVER} overflow-hidden`}>
            <div className="relative aspect-[2.15] bg-surface-2">
              <SteamThumb appid={game.appid} name={game.name} headerImageUrl={game.headerImageUrl} />
              {game.isMultiplayer === null && (
                <span className="absolute left-2 top-2 rounded-full bg-canvas/85 px-2 py-0.5 text-[10px] font-bold text-muted">
                  분류 미확인
                </span>
              )}
            </div>
            <div className="p-4">
              <p className="truncate text-sm font-bold text-fg" title={game.name}>
                {game.name}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <AvatarStack owners={game.owners} />
                <span className="shrink-0 text-xs font-bold text-brand-ink">{game.owners.length}명 보유</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {games.length > INITIAL_COUNT && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={() => setExpanded((v) => !v)} className={BTN_NEUTRAL}>
            {expanded ? '접기' : `더 보기 (${hiddenCount})`}
          </button>
        </div>
      )}
    </div>
  )
}

function AvatarStack({ owners }: { owners: SharedGameOwner[] }) {
  const shown = owners.slice(0, AVATAR_STACK_MAX)
  const rest = owners.length - shown.length

  return (
    <div className="flex min-w-0 items-center" title={owners.map((o) => o.name).join(', ')}>
      <span className="sr-only">보유 멤버: {owners.map((o) => o.name).join(', ')}</span>
      {shown.map((owner, index) => (
        <span
          key={owner.id}
          aria-hidden
          className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-2 ring-surface ${index > 0 ? '-ml-2' : ''}`}
        >
          {owner.avatarUrl ? (
            <Image src={owner.avatarUrl} alt="" fill sizes="28px" className="object-cover" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-subtle">
              {owner.name.slice(0, 1)}
            </span>
          )}
        </span>
      ))}
      {rest > 0 && (
        <span
          aria-hidden
          className="-ml-2 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-muted ring-2 ring-surface"
        >
          +{rest}
        </span>
      )}
    </div>
  )
}
