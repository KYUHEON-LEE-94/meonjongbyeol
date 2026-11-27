import { deleteRiotAccount, riotOpResponse, updateRiotAccount } from '@/lib/members/riotAccountOps'
import { auditAdminAction, loadAdminTarget, syncAfterAdminChange } from '@/lib/members/adminMemberOps'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; accountId: string }> }

/** 관리자: 라이엇 계정 Riot ID 수정. status 불변, 대표면 즉시 동기화. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id: memberId, accountId } = await ctx.params
  const target = await loadAdminTarget(memberId)
  if (!target.ok) return target.response

  const body = await req.json().catch(() => null)
  // 다른 멤버의 accountId 는 이 멤버 목록에 없으므로 공용 함수가 404 로 거절한다.
  const result = await updateRiotAccount(
    { memberId, memberStatus: target.member.status, actor: 'admin' },
    accountId,
    body,
  )
  if (!result.ok) return riotOpResponse(result)

  auditAdminAction({ adminUserId: target.adminUserId, memberId, action: 'riot_account_update', accountId })
  const syncWarning = result.primaryChanged ? await syncAfterAdminChange(target.member) : null
  return riotOpResponse(result, { syncWarning })
}

/** 관리자: 라이엇 계정 삭제(마지막 1개는 409). 대표였다면 파생 대표로 즉시 동기화. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: memberId, accountId } = await ctx.params
  const target = await loadAdminTarget(memberId)
  if (!target.ok) return target.response

  const result = await deleteRiotAccount(
    { memberId, memberStatus: target.member.status, actor: 'admin' },
    accountId,
  )
  if (!result.ok) return riotOpResponse(result)

  auditAdminAction({ adminUserId: target.adminUserId, memberId, action: 'riot_account_delete', accountId })
  const syncWarning = result.primaryChanged ? await syncAfterAdminChange(target.member) : null
  return riotOpResponse(result, { syncWarning })
}
