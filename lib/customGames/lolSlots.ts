import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { effectiveMemberCapacity, splitParticipants } from './waitlist'
import type { GameRow } from './game'

/** 롤은 라운드 개념이 없어 팀 배정을 항상 round_number=1 로 고정한다. */
export const LOL_ROUND = 1

/**
 * 확정 멤버 id 집합. 상세 GET·lol-teams·claim 이 같은 규칙을 쓰도록 단일 지점으로 둔다.
 * 게스트도 정원을 소비하므로(effectiveMemberCapacity) 게스트 수를 함께 센다.
 */
export async function getConfirmedMemberIds(
  game: Pick<GameRow, 'id' | 'capacity'>,
): Promise<{ ok: true; ids: Set<string> } | { ok: false; message: string }> {
  const [parts, guests] = await Promise.all([
    supabaseAdmin
      .from('custom_game_participants')
      .select('id, member_id, joined_at')
      .eq('custom_game_id', game.id),
    supabaseAdmin
      .from('custom_game_guests')
      .select('id', { count: 'exact', head: true })
      .eq('custom_game_id', game.id),
  ])
  if (parts.error) return { ok: false, message: parts.error.message }

  const { confirmed } = splitParticipants(
    parts.data ?? [],
    effectiveMemberCapacity(game.capacity, guests.count ?? 0),
  )
  return { ok: true, ids: new Set(confirmed.map((p) => p.member_id as string)) }
}

type SlotRowLike = { member_id: string | null }

/**
 * ★ 표시 필터. replace_lol_teams RPC 의 현재 행 비교 필터와 **반드시 같은 규칙**이어야 한다:
 *   round_number=1(쿼리에서) + (member_id 가 null 이거나 확정 멤버).
 *   어긋나면 화면에 안 보이는 행 때문에 관리자 저장이 영구 409 가 된다.
 */
export function filterConfirmedSlots<T extends SlotRowLike>(rows: readonly T[], confirmed: ReadonlySet<string>): T[] {
  return rows.filter((r) => r.member_id === null || confirmed.has(r.member_id))
}

export const SLOT_RPC_RESULTS = [
  'claimed',
  'moved',
  'noop',
  'taken',
  'closed',
  'not_rift',
  'not_participant',
  'not_confirmed',
  'invalid',
  'not_found',
  'released',
  'none',
  'ok',
  'conflict',
] as const
export type SlotRpcResult = (typeof SLOT_RPC_RESULTS)[number]

export function isSlotRpcResult(value: unknown): value is SlotRpcResult {
  return typeof value === 'string' && (SLOT_RPC_RESULTS as readonly string[]).includes(value)
}
