import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; participantId: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, participantId } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response
  const { game } = auth

  if (game.status === 'ended' || game.status === 'cancelled') {
    return NextResponse.json({ error: '종료된 내전은 수정할 수 없습니다' }, { status: 400 })
  }

  // 다른 내전의 참가자 id를 넘겨 강퇴하는 것을 막기 위해 custom_game_id로 함께 좁힌다.
  const { data: participant, error: lookupError } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id, member_id')
    .eq('id', participantId)
    .eq('custom_game_id', id)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!participant) {
    return NextResponse.json({ error: '참가자를 찾을 수 없습니다' }, { status: 404 })
  }

  if (game.host_member_id !== null && participant.member_id === game.host_member_id) {
    return NextResponse.json(
      { error: '주최자는 강퇴할 수 없습니다. 내전을 삭제하세요.' },
      { status: 400 },
    )
  }

  const { error } = await supabaseAdmin
    .from('custom_game_participants')
    .delete()
    .eq('id', participantId)
    .eq('custom_game_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 강퇴된 사람의 롤 슬롯도 비운다. 실패해도 표시 필터(확정 집합 밖 숨김)가 실제 방어선이라 경고만 남긴다.
  const { error: slotError } = await supabaseAdmin
    .from('custom_game_teams')
    .delete()
    .eq('custom_game_id', id)
    .eq('member_id', participant.member_id)
  if (slotError) {
    console.warn('[custom-games] 강퇴 후 슬롯 정리 실패', { gameId: id, message: slotError.message })
  }

  return NextResponse.json({ ok: true })
}
