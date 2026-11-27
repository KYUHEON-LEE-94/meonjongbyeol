import 'server-only'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/app/lib/isAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncOneMember } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'
import { writeSyncLog } from '@/lib/sync/writeSyncLog'

/**
 * 관리자 멤버 계정(라이엇·스팀) 라우트 공용 헬퍼.
 * `/api/admin/members/[id]/{accounts,riot-accounts/*,steam}` 가 사용한다.
 */

export type AdminTargetMember = { id: string; member_name: string; status: string | null }

export type AdminTarget =
  | { ok: true; adminUserId: string; member: AdminTargetMember }
  | { ok: false; response: NextResponse }

/** requireAdmin(403) → path 의 멤버 조회(404). 대상 멤버는 오직 path param 으로만 특정한다. */
export async function loadAdminTarget(memberId: string): Promise<AdminTarget> {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 }),
    }
  }

  const { data, error } = await supabaseAdmin
    .from('members')
    .select('id, member_name, status')
    .eq('id', memberId)
    .maybeSingle()

  if (error) {
    return { ok: false, response: NextResponse.json({ ok: false, message: error.message }, { status: 500 }) }
  }
  if (!data) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: '해당 멤버를 찾을 수 없습니다.' }, { status: 404 }),
    }
  }

  return { ok: true, adminUserId: admin.user.id, member: data as AdminTargetMember }
}

/**
 * 관리자가 대표 계정을 바꾼 직후 즉시 동기화한다(approve 라우트와 같은 패턴).
 * rejected 멤버는 공개 랭킹에 나오지 않으므로 Riot 호출을 쓰지 않는다.
 * 실패는 롤백하지 않고 경고 문자열로만 돌려준다. skipped(in_progress)는 실패가 아니다.
 */
export async function syncAfterAdminChange(member: AdminTargetMember): Promise<string | null> {
  if (member.status === 'rejected') return null

  const t0 = Date.now()
  try {
    const result = await syncOneMember(member.id, doSyncMember)
    const skipped = result.skipped === 'in_progress'
    await writeSyncLog({
      type: 'manual',
      memberId: member.id,
      status: skipped ? 'skipped' : result.ok ? 'success' : 'error',
      message: skipped ? 'in_progress' : result.error ?? null,
      durationMs: Date.now() - t0,
    })
    if (!result.ok && !skipped) {
      return result.error ?? '동기화에 실패했습니다. Riot ID를 확인해주세요.'
    }
    revalidatePath('/lol')
    revalidatePath('/')
    return null
  } catch (e) {
    return e instanceof Error ? e.message : '동기화 중 오류가 발생했습니다.'
  }
}

/** 관리자 조작 감사 로그. Riot ID·스팀 ID 원문·puuid·키는 남기지 않는다. */
export function auditAdminAction(input: {
  adminUserId: string
  memberId: string
  action: string
  accountId?: string
}) {
  console.info('[admin-audit]', input)
}
