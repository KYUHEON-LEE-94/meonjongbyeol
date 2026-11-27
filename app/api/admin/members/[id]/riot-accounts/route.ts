import { addRiotAccount, riotOpResponse } from '@/lib/members/riotAccountOps'
import { auditAdminAction, loadAdminTarget, syncAfterAdminChange } from '@/lib/members/adminMemberOps'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** 관리자: 멤버에게 라이엇 계정 추가. status 는 건드리지 않는다. */
export async function POST(req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params
  const target = await loadAdminTarget(memberId)
  if (!target.ok) return target.response

  const body = await req.json().catch(() => null)
  const result = await addRiotAccount(
    { memberId, memberStatus: target.member.status, actor: 'admin' },
    body,
  )
  if (!result.ok) return riotOpResponse(result)

  auditAdminAction({ adminUserId: target.adminUserId, memberId, action: 'riot_account_add', accountId: result.accountId })
  const syncWarning = result.primaryChanged ? await syncAfterAdminChange(target.member) : null
  return riotOpResponse(result, { syncWarning })
}
