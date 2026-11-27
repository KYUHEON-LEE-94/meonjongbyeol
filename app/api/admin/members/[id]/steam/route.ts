import { NextResponse } from 'next/server'
import { linkSteam, unlinkSteam } from '@/lib/members/steamLink'
import { auditAdminAction, loadAdminTarget } from '@/lib/members/adminMemberOps'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * 관리자: 멤버의 스팀 ID 등록/변경.
 * ⚠ bindUserId 를 넘기지 않는다 — 관리자 세션의 user_id 가 남의 멤버 행에 묶이면 안 된다.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params
  const target = await loadAdminTarget(memberId)
  if (!target.ok) return target.response

  const body = (await req.json().catch(() => null)) as { steam_input?: unknown } | null
  const result = await linkSteam(memberId, body?.steam_input)
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status })
  }

  auditAdminAction({ adminUserId: target.adminUserId, memberId, action: 'steam_link' })
  return NextResponse.json({
    ok: true,
    steam: result.steam,
    syncWarning: result.syncWarning,
    message: result.message,
  })
}

/** 관리자: 멤버의 스팀 연결 해제(보유 게임 캐시 포함). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params
  const target = await loadAdminTarget(memberId)
  if (!target.ok) return target.response

  const result = await unlinkSteam(memberId)
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status })
  }

  auditAdminAction({ adminUserId: target.adminUserId, memberId, action: 'steam_unlink' })
  return NextResponse.json({ ok: true, message: result.message })
}
