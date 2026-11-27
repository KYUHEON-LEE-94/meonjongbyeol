import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewerMember, isApprovedMember, type Viewer } from '@/lib/customGames/authorize'
import {
  fetchGame,
  isUniqueViolation,
  lolSlotMigrationRequiredResponse,
  rejectNonLolGame,
  type GameRow,
} from '@/lib/customGames/game'
import { getConfirmedMemberIds, isSlotRpcResult, type SlotRpcResult } from '@/lib/customGames/lolSlots'
import { isLolPosition } from '@/lib/customGames/constants'
import { isMissingFunctionError } from '@/lib/db/pgErrors'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * 롤 협곡 — 확정 참가자 본인의 팀·포지션 슬롯 선점(POST)/해제(DELETE).
 *
 * ⚠ 대상 멤버는 오직 세션(getViewerMember)에서 해석한다. body 의 member 식별자는 읽지 않는다.
 *   RPC 는 service_role 전용(20260913 STEP 5)이며 같은 게임의 슬롯 쓰기를 advisory lock 으로 직렬화한다.
 */

type Guard =
  | { ok: true; viewer: Viewer & { member: NonNullable<Viewer['member']> }; game: GameRow }
  | { ok: false; response: NextResponse }

async function guard(gameId: string): Promise<Guard> {
  const viewer = await getViewerMember()
  if (!viewer) {
    return { ok: false, response: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) }
  }
  if (!isApprovedMember(viewer) || !viewer.member) {
    return {
      ok: false,
      response: NextResponse.json({ error: '승인된 멤버만 이용할 수 있습니다' }, { status: 403 }),
    }
  }

  const fetched = await fetchGame(gameId)
  if (!fetched.ok) return { ok: false, response: fetched.response }
  const game = fetched.game

  const notLol = rejectNonLolGame(game)
  if (notLol) return { ok: false, response: notLol }
  if (game.lol_mode !== 'rift') {
    return {
      ok: false,
      response: NextResponse.json({ error: '협곡 내전에서만 포지션을 선점할 수 있습니다' }, { status: 400 }),
    }
  }
  if (game.status !== 'recruiting') {
    return { ok: false, response: NextResponse.json({ error: '선점이 마감되었습니다' }, { status: 400 }) }
  }

  return { ok: true, viewer: { ...viewer, member: viewer.member }, game }
}

function mapResult(result: SlotRpcResult): NextResponse {
  switch (result) {
    case 'claimed':
    case 'moved':
    case 'noop':
    case 'released':
    case 'none':
      return NextResponse.json({ ok: true, result })
    case 'taken':
      return NextResponse.json({ error: '방금 다른 사람이 가져갔어요', taken: true }, { status: 409 })
    case 'closed':
      return NextResponse.json({ error: '선점이 마감되었습니다' }, { status: 400 })
    case 'not_participant':
    case 'not_confirmed':
      return NextResponse.json({ error: '확정 참가자만 선점할 수 있어요' }, { status: 403 })
    case 'not_rift':
      return NextResponse.json({ error: '협곡 내전에서만 포지션을 선점할 수 있습니다' }, { status: 400 })
    case 'not_found':
      return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
    case 'invalid':
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
    default:
      return NextResponse.json({ error: '알 수 없는 응답입니다' }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params

  const g = await guard(gameId)
  if (!g.ok) return g.response
  const { viewer, game } = g

  const body = (await req.json().catch(() => null)) as { team_index?: unknown; position?: unknown } | null
  if (!body) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })

  const teamIndex = body.team_index
  if (teamIndex !== 1 && teamIndex !== 2) {
    return NextResponse.json({ error: '팀 번호는 1 또는 2여야 합니다' }, { status: 400 })
  }
  if (!isLolPosition(body.position)) {
    return NextResponse.json({ error: '포지션이 올바르지 않습니다' }, { status: 400 })
  }

  const confirmed = await getConfirmedMemberIds(game)
  if (!confirmed.ok) return NextResponse.json({ error: confirmed.message }, { status: 500 })
  if (!confirmed.ids.has(viewer.member.id)) {
    return NextResponse.json({ error: '확정 참가자만 선점할 수 있어요' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin.rpc('claim_lol_slot', {
    p_game_id: gameId,
    p_member_id: viewer.member.id,
    p_team_index: teamIndex,
    p_position: body.position,
    p_confirmed: [...confirmed.ids],
  })

  if (error) {
    if (isMissingFunctionError(error)) return lolSlotMigrationRequiredResponse()
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: '방금 다른 사람이 가져갔어요', taken: true }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result: unknown = data
  if (!isSlotRpcResult(result)) {
    return NextResponse.json({ error: '알 수 없는 응답입니다' }, { status: 500 })
  }
  return mapResult(result)
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params

  const g = await guard(gameId)
  if (!g.ok) return g.response

  const { data, error } = await supabaseAdmin.rpc('release_lol_slot', {
    p_game_id: gameId,
    p_member_id: g.viewer.member.id,
  })

  if (error) {
    if (isMissingFunctionError(error)) return lolSlotMigrationRequiredResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result: unknown = data
  if (!isSlotRpcResult(result)) {
    return NextResponse.json({ error: '알 수 없는 응답입니다' }, { status: 500 })
  }
  return mapResult(result)
}
