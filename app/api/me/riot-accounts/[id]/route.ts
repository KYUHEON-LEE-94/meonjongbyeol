import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { deleteRiotAccount, riotOpResponse, updateRiotAccount } from '@/lib/members/riotAccountOps'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: accountId } = await ctx.params

  const me = await getMyMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  if (!me.member) {
    return NextResponse.json({ ok: false, message: '멤버 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const result = await updateRiotAccount(
    { memberId: me.member.id, memberStatus: me.member.status, actor: 'self' },
    accountId,
    body,
  )
  return riotOpResponse(result)
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: accountId } = await ctx.params

  const me = await getMyMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  if (!me.member) {
    return NextResponse.json({ ok: false, message: '멤버 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const result = await deleteRiotAccount(
    { memberId: me.member.id, memberStatus: me.member.status, actor: 'self' },
    accountId,
  )
  return riotOpResponse(result)
}
