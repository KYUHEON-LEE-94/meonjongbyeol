import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { MAX_RIOT_ACCOUNTS } from '@/lib/members/memberInput'
import {
  RIOT_ACCOUNTS_MIGRATION_MESSAGE,
  listRiotAccounts,
  pickPrimaryAccount,
} from '@/lib/members/primaryAccount'
import { addRiotAccount, riotOpResponse, toPublicAccount } from '@/lib/members/riotAccountOps'

export const dynamic = 'force-dynamic'

export async function GET() {
  const me = await getMyMember()
  if (!me.ok) {
    return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  }
  if (!me.member) {
    return NextResponse.json({ ok: true, accounts: [], max: MAX_RIOT_ACCOUNTS })
  }

  const listed = await listRiotAccounts(me.member.id)
  if (!listed.ok) {
    // 마이그레이션 미적용은 장애가 아니라 "아직 켜지지 않은 기능"이다. 500 대신 안내로 degrade.
    if (listed.missingTable) {
      return NextResponse.json({
        ok: true,
        accounts: [],
        max: MAX_RIOT_ACCOUNTS,
        migration_required: true,
        message: RIOT_ACCOUNTS_MIGRATION_MESSAGE,
      })
    }
    return NextResponse.json({ ok: false, message: listed.message }, { status: 500 })
  }

  const primary = pickPrimaryAccount(listed.accounts)

  return NextResponse.json({
    ok: true,
    max: MAX_RIOT_ACCOUNTS,
    primary_account_id: primary?.id ?? null,
    accounts: listed.accounts.map(toPublicAccount),
  })
}

export async function POST(req: Request) {
  const me = await getMyMember()
  if (!me.ok) {
    return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  }
  if (!me.member) {
    return NextResponse.json(
      { ok: false, message: '먼저 멤버 등록 신청을 완료해주세요.' },
      { status: 404 },
    )
  }

  const body = await req.json().catch(() => null)
  const result = await addRiotAccount(
    { memberId: me.member.id, memberStatus: me.member.status, actor: 'self' },
    body,
  )
  return riotOpResponse(result)
}
