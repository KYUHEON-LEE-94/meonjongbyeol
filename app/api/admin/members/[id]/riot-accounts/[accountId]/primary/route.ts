import { riotOpResponse, setPrimaryRiotAccount } from '@/lib/members/riotAccountOps'
import { auditAdminAction, loadAdminTarget, syncAfterAdminChange } from '@/lib/members/adminMemberOps'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; accountId: string }> }

/** 관리자: 대표 계정 지정. status 불변, 즉시 동기화. */
export async function POST(_req: Request, ctx: Ctx) {
  const { id: memberId, accountId } = await ctx.params
  const target = await loadAdminTarget(memberId)
  if (!target.ok) return target.response

  const result = await setPrimaryRiotAccount(
    { memberId, memberStatus: target.member.status, actor: 'admin' },
    accountId,
  )
  if (!result.ok) return riotOpResponse(result)

  auditAdminAction({ adminUserId: target.adminUserId, memberId, action: 'riot_account_set_primary', accountId })
  const syncWarning = result.primaryChanged ? await syncAfterAdminChange(target.member) : null
  return riotOpResponse(result, { syncWarning })
}
