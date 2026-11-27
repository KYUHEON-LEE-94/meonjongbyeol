import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import { STEAM_VISIBILITY_PUBLIC } from '@/lib/sync/syncSteamMember'
import { linkSteam, unlinkSteam } from '@/lib/members/steamLink'

export const dynamic = 'force-dynamic'

const SELECT_COLUMNS =
  'id, member_name, status, steam_id64, steam_persona, steam_avatar_url, steam_visibility, steam_linked_at, steam_synced_at, steam_sync_error'

type MyMember = {
  id: string
  member_name: string
  status: string | null
  steam_id64: string | null
  steam_persona: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_linked_at: string | null
  steam_synced_at: string | null
  steam_sync_error: string | null
}

type Lookup =
  | { ok: true; member: MyMember | null }
  | { ok: false; status: number; message: string }

async function getSessionUser() {
  const supabase = await createRouteClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/**
 * ⚠ 대상 행은 오직 세션 user_id 로 특정한다. body 의 member id 는 절대 신뢰하지 않는다.
 * user_id 미연결(관리자가 discord_id 만 사전 등록) 행만 discord_id 로 보조 조회한다.
 */
async function findMyMember(userId: string, discordId: string | null): Promise<Lookup> {
  const { data, error } = await supabaseService
    .schema('public')
    .from('members')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { ok: false, status: 500, message: error.message }
  if (data) return { ok: true, member: data as MyMember }

  if (!discordId) return { ok: true, member: null }

  const { data: byDiscord, error: discordError } = await supabaseService
    .schema('public')
    .from('members')
    .select(`${SELECT_COLUMNS}, user_id`)
    .eq('discord_id', discordId)
    .is('user_id', null)
    .maybeSingle()

  if (discordError) return { ok: false, status: 500, message: discordError.message }
  return { ok: true, member: (byDiscord as MyMember | null) ?? null }
}

function toPayload(member: MyMember | null) {
  if (!member || !member.steam_id64) return null
  return {
    steam_id64: member.steam_id64,
    steam_persona: member.steam_persona,
    steam_avatar_url: member.steam_avatar_url,
    steam_visibility: member.steam_visibility,
    steam_linked_at: member.steam_linked_at,
    steam_synced_at: member.steam_synced_at,
    steam_sync_error: member.steam_sync_error,
    is_private: member.steam_visibility != null && member.steam_visibility !== STEAM_VISIBILITY_PUBLIC,
  }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const lookup = await findMyMember(user.id, getDiscordId(user))
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, message: lookup.message }, { status: lookup.status })
  }

  // 내 최근 2주 플레이 게임(상단 '내 스팀 계정' 카드에 통합 표시). 스팀 미연동이면 빈 배열.
  let recentGames: { appid: number; name: string; minutes: number }[] = []
  let recentMinutes = 0
  if (lookup.member?.steam_id64) {
    const { data: rows } = await supabaseService
      .schema('public')
      .from('steam_owned_games')
      .select('appid, playtime_2weeks, steam_apps!inner(name)')
      .eq('member_id', lookup.member.id)
      .gt('playtime_2weeks', 0)
      .order('playtime_2weeks', { ascending: false })
    const owned = (rows ?? []) as unknown as { appid: number; playtime_2weeks: number; steam_apps: { name: string | null } | null }[]
    recentMinutes = owned.reduce((sum, r) => sum + r.playtime_2weeks, 0) // 전체 합계(총 시간 정확)
    recentGames = owned.slice(0, 5).map((r) => ({ appid: r.appid, name: r.steam_apps?.name ?? `앱 ${r.appid}`, minutes: r.playtime_2weeks }))
  }

  return NextResponse.json({
    ok: true,
    hasMember: Boolean(lookup.member),
    memberId: lookup.member?.id ?? null,
    steam: toPayload(lookup.member),
    recentGames,
    recentMinutes,
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { steam_input?: unknown } | null

  const lookup = await findMyMember(user.id, getDiscordId(user))
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, message: lookup.message }, { status: lookup.status })
  }
  if (!lookup.member) {
    return NextResponse.json(
      { ok: false, message: '먼저 프로필에서 멤버 등록을 완료해주세요.' },
      { status: 400 },
    )
  }

  // 본인 경로만 user_id 를 묶는다(user_id 미연결 행을 본인에게 연결 — member 라우트와 동일 원칙).
  const result = await linkSteam(lookup.member.id, body?.steam_input, { bindUserId: user.id })
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    steam: result.steam,
    syncWarning: result.syncWarning,
    message: result.message,
  })
}

export async function DELETE() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const lookup = await findMyMember(user.id, getDiscordId(user))
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, message: lookup.message }, { status: lookup.status })
  }
  if (!lookup.member) {
    return NextResponse.json({ ok: false, message: '멤버 정보가 없습니다.' }, { status: 404 })
  }

  const result = await unlinkSteam(lookup.member.id)
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status })
  }
  return NextResponse.json({ ok: true, message: result.message })
}
