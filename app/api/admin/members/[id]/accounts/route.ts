import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { MAX_RIOT_ACCOUNTS } from '@/lib/members/memberInput'
import {
  RIOT_ACCOUNTS_MIGRATION_MESSAGE,
  listRiotAccounts,
  pickPrimaryAccount,
} from '@/lib/members/primaryAccount'
import { toAdminAccount } from '@/lib/members/riotAccountOps'
import { loadAdminTarget } from '@/lib/members/adminMemberOps'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import { STEAM_VISIBILITY_PUBLIC } from '@/lib/sync/syncSteamMember'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

type SteamColumns = {
  steam_id64: string | null
  steam_persona: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_linked_at: string | null
  steam_synced_at: string | null
  steam_sync_error: string | null
}

const STEAM_COLUMNS =
  'steam_id64, steam_persona, steam_avatar_url, steam_visibility, steam_linked_at, steam_synced_at, steam_sync_error'

/** 관리자 상세: 멤버의 라이엇 계정 1~3개 + 스팀 연결 상태. puuid 는 응답하지 않는다. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params
  const target = await loadAdminTarget(memberId)
  if (!target.ok) return target.response

  const listed = await listRiotAccounts(memberId)
  let riot:
    | { accounts: ReturnType<typeof toAdminAccount>[]; primary_account_id: string | null; max: number }
    | { accounts: []; primary_account_id: null; max: number; migration_required: true; message: string }
  if (listed.ok) {
    riot = {
      accounts: listed.accounts.map(toAdminAccount),
      primary_account_id: pickPrimaryAccount(listed.accounts)?.id ?? null,
      max: MAX_RIOT_ACCOUNTS,
    }
  } else if (listed.missingTable) {
    riot = {
      accounts: [],
      primary_account_id: null,
      max: MAX_RIOT_ACCOUNTS,
      migration_required: true,
      message: RIOT_ACCOUNTS_MIGRATION_MESSAGE,
    }
  } else {
    return NextResponse.json({ ok: false, message: listed.message }, { status: 500 })
  }

  const { data: steamRow, error: steamError } = await supabaseAdmin
    .from('members')
    .select(STEAM_COLUMNS)
    .eq('id', memberId)
    .maybeSingle()

  if (steamError && !isMissingColumnError(steamError)) {
    return NextResponse.json({ ok: false, message: steamError.message }, { status: 500 })
  }

  const steamMigrationRequired = !!steamError
  const s = (steamRow ?? null) as SteamColumns | null

  let ownedGameCount: number | null = null
  if (s?.steam_id64) {
    const { count, error: countError } = await supabaseAdmin
      .from('steam_owned_games')
      .select('appid', { count: 'exact', head: true })
      .eq('member_id', memberId)
    // 실패는 상세 전체를 깨지 않고 '-' 로만 표시한다.
    if (!countError) ownedGameCount = count ?? 0
  }

  const steam =
    s && s.steam_id64
      ? {
          ...s,
          steam_id64: s.steam_id64,
          is_private: s.steam_visibility != null && s.steam_visibility !== STEAM_VISIBILITY_PUBLIC,
          owned_game_count: ownedGameCount,
        }
      : null

  return NextResponse.json({
    ok: true,
    member: target.member,
    riot,
    steam,
    ...(steamMigrationRequired ? { steam_migration_required: true } : {}),
  })
}
