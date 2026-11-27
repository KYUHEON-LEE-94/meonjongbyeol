import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { riotOpResponse, setPrimaryRiotAccount } from '@/lib/members/riotAccountOps'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id: accountId } = await ctx.params

  const me = await getMyMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  if (!me.member) {
    return NextResponse.json({ ok: false, message: '멤버 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const result = await setPrimaryRiotAccount(
    { memberId: me.member.id, memberStatus: me.member.status, actor: 'self' },
    accountId,
  )
  return riotOpResponse(result)
}
