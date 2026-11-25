import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import { resolveAvatarUrl, withAvatarColumn } from '@/lib/members/avatar'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

type OptionRow = {
  id: string
  member_name: string
  riot_game_name: string | null
  riot_tagline: string | null
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
  discord_avatar_url?: string | null
}

/**
 * 관리자/주최자가 직접 추가할 승인 멤버 후보. authorizeGameManage() 로 게이트한다.
 * ★ 노출 필터 규칙(CLAUDE.md): members 조회는 반드시 status='approved' 로 좁힌다.
 *   이미 참가 중인 멤버는 서버에서 제외해 UI가 바로 쓸 수 있게 한다.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''

  const { data: existing } = await supabaseAdmin
    .from('custom_game_participants')
    .select('member_id')
    .eq('custom_game_id', id)
  const existingIds = new Set((existing ?? []).map((p) => p.member_id))

  const { data, error } = await withAvatarColumn((cols) => {
    let query = supabaseAdmin
      .from('members')
      .select(`id, member_name, riot_game_name, riot_tagline, lol_tier, lol_rank, lol_league_points${cols}`)
      .eq('status', 'approved')
      .order('member_name')
      .limit(50)
    if (q) query = query.ilike('member_name', `%${q}%`)
    return query
  })
  if (error) return NextResponse.json({ error: error.message ?? '조회 실패' }, { status: 500 })

  const members = ((data ?? []) as OptionRow[])
    .filter((m) => !existingIds.has(m.id))
    .map(({ discord_avatar_url, ...rest }) => ({
      ...rest,
      avatar_url: resolveAvatarUrl({ discord_avatar_url }),
    }))
  return NextResponse.json({ members })
}
