import 'server-only'
import { revalidatePath } from 'next/cache'
import { supabaseService } from '@/lib/supabase/service'
import { resolveSteamId } from '@/lib/steam/resolveSteamId'
import { fetchPlayerSummaries } from '@/lib/steam/api'
import { STEAM_VISIBILITY_PUBLIC, syncSteamMemberById } from '@/lib/sync/syncSteamMember'

/**
 * 스팀 연결/해제 공용 지점. 사용자(`/api/me/steam`)·관리자(`/api/admin/members/[id]/steam`)가 공유한다.
 * memberId 는 호출자가 권한을 확인한 값이어야 한다.
 */

export type SteamLinkOptions = {
  /**
   * 지정하면 members.user_id 를 이 값으로 묶는다(user_id 미연결 행을 본인에게 연결).
   * ⚠ **사용자 본인 경로에서만** 세션 user.id 를 넘긴다. 관리자 경로에서 넘기면 관리자의 로그인이
   *   남의 멤버 행에 묶여 계정 탈취와 같은 결과가 된다 → 기본값 undefined(묶지 않음).
   */
  bindUserId?: string
}

export type SteamLinkResult =
  | {
      ok: true
      steam: {
        steam_id64: string
        steam_persona: string | null
        steam_avatar_url: string | null
        steam_visibility: number | null
        is_private: boolean
      }
      syncWarning: string | null
      message: string
    }
  | { ok: false; status: number; message: string }

const TAKEN_MESSAGE = '이미 다른 멤버가 등록한 스팀 계정입니다.'

export async function linkSteam(
  memberId: string,
  rawInput: unknown,
  options: SteamLinkOptions = {},
): Promise<SteamLinkResult> {
  const { data: current, error: currentError } = await supabaseService
    .schema('public')
    .from('members')
    .select('id, steam_id64')
    .eq('id', memberId)
    .maybeSingle()

  if (currentError) return { ok: false, status: 500, message: currentError.message }
  if (!current) return { ok: false, status: 404, message: '멤버 정보를 찾을 수 없습니다.' }

  const resolved = await resolveSteamId(rawInput)
  if (!resolved.ok) return { ok: false, status: resolved.status, message: resolved.message }
  const steamId64 = resolved.steamId64

  // 소유권 증명을 하지 않으므로 선점만 막는다. 유니크 인덱스와 이중 방어.
  const { data: taken, error: takenError } = await supabaseService
    .schema('public')
    .from('members')
    .select('id')
    .eq('steam_id64', steamId64)
    .neq('id', memberId)
    .maybeSingle()

  if (takenError) return { ok: false, status: 500, message: takenError.message }
  if (taken) return { ok: false, status: 409, message: TAKEN_MESSAGE }

  let persona: string | null = null
  let avatar: string | null = null
  let visibility: number | null = null
  try {
    const [summary] = await fetchPlayerSummaries([steamId64])
    if (!summary) return { ok: false, status: 400, message: '스팀에서 해당 계정을 찾을 수 없습니다.' }
    persona = summary.personaname || null
    avatar = summary.avatarfull || null
    visibility = summary.communityvisibilitystate
  } catch (e) {
    return { ok: false, status: 502, message: e instanceof Error ? e.message : '스팀 조회에 실패했습니다.' }
  }

  const changed = current.steam_id64 !== null && current.steam_id64 !== steamId64

  const { error: updateError } = await supabaseService
    .schema('public')
    .from('members')
    .update({
      steam_id64: steamId64,
      steam_persona: persona,
      steam_avatar_url: avatar,
      steam_visibility: visibility,
      steam_linked_at: new Date().toISOString(),
      steam_sync_error: null,
      // 다른 계정으로 바뀌면 옛 동기화 시각은 새 계정과 무관하다.
      ...(changed ? { steam_synced_at: null } : {}),
      ...(options.bindUserId ? { user_id: options.bindUserId } : {}),
    })
    .eq('id', memberId)

  if (updateError) {
    // 유니크 인덱스 위반은 경합으로 뚫린 선점이므로 409 로 변환한다.
    const conflict = updateError.code === '23505'
    return { ok: false, status: conflict ? 409 : 400, message: conflict ? TAKEN_MESSAGE : updateError.message }
  }

  let syncWarning: string | null = null

  // 다른 스팀 계정으로 바꿨다면 옛 계정의 보유 게임을 지운다. 동기화가 실패하면
  // 옛 계정 게임이 새 계정 것처럼 "같은 게임"·"함께 할 게임"에 남기 때문이다.
  if (changed) {
    const { error: gamesError } = await supabaseService
      .schema('public')
      .from('steam_owned_games')
      .delete()
      .eq('member_id', memberId)
    if (gamesError) syncWarning = `이전 스팀 계정의 게임 정리에 실패했습니다: ${gamesError.message}`
  }

  // 등록 직후 이 멤버 1명만 온디맨드 동기화. 실패해도 등록 자체는 유지한다.
  try {
    const result = await syncSteamMemberById(memberId)
    if (result && !result.ok) syncWarning = syncWarning ?? result.message
  } catch (e) {
    syncWarning = syncWarning ?? (e instanceof Error ? e.message : '동기화에 실패했습니다.')
  }

  revalidatePath('/steam')
  revalidatePath('/profile')

  const isPrivate = visibility !== STEAM_VISIBILITY_PUBLIC

  return {
    ok: true,
    steam: {
      steam_id64: steamId64,
      steam_persona: persona,
      steam_avatar_url: avatar,
      steam_visibility: visibility,
      is_private: isPrivate,
    },
    syncWarning,
    message: isPrivate
      ? '스팀 계정을 연결했습니다. 프로필이 비공개라 게임 데이터는 표시되지 않습니다.'
      : '스팀 계정을 연결했습니다.',
  }
}

export async function unlinkSteam(
  memberId: string,
): Promise<{ ok: true; message: string } | { ok: false; status: number; message: string }> {
  const { error: gamesError } = await supabaseService
    .schema('public')
    .from('steam_owned_games')
    .delete()
    .eq('member_id', memberId)

  if (gamesError) return { ok: false, status: 500, message: gamesError.message }

  const { error } = await supabaseService
    .schema('public')
    .from('members')
    .update({
      steam_id64: null,
      steam_persona: null,
      steam_avatar_url: null,
      steam_visibility: null,
      steam_linked_at: null,
      steam_synced_at: null,
      steam_sync_error: null,
    })
    .eq('id', memberId)

  if (error) return { ok: false, status: 400, message: error.message }

  revalidatePath('/steam')
  revalidatePath('/profile')

  return { ok: true, message: '스팀 연결을 해제했습니다.' }
}
