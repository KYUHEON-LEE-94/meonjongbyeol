import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { UUID_RE, isRecord } from '@/lib/calendar/events'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { resolveAvatarUrl, withAvatarColumn } from '@/lib/members/avatar'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const POST_KEYS = new Set(['memberId', 'amount', 'requestId', 'description'])
const KNOWN_REASONS = ['daily_login', 'custom_game_participation', 'cosmetic_purchase', 'shop_purchase', 'admin_adjustment', 'hall_of_fame']
const MAX_LEDGER_QUERY_LEN = 40
const MAX_NAME_MATCH_IDS = 200
const SUMMARY_WINDOW_HOURS = 24
// 24시간 합계용 amount 스캔 상한(1000행 × 10페이지). PostgREST 기본 max-rows 가 1000 이라 나눠 읽는다.
const SUMMARY_SCAN_PAGES = 10
const SUMMARY_SCAN_PAGE_SIZE = 1000

type MemberRow = { id: string; member_name: string; status: string; discord_avatar_url?: string | null }
type Summary = { total_balance: number; member_count: number; earned_24h: number; spent_24h: number; window_hours: number }

/**
 * 검색어 정규화. PostgREST `.or()` 필터 문자열에 그대로 들어가므로
 * 문법 문자(쉼표·괄호·따옴표·역슬래시·콜론)와 와일드카드(%, *, _)를 제거한다.
 */
function sanitizeQuery(raw: string | null): string {
  return (raw ?? '')
    .replace(/[,()"'\\:%*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEDGER_QUERY_LEN)
}

function isMemberRow(value: unknown): value is MemberRow {
  return isRecord(value) && typeof value.id === 'string' && typeof value.member_name === 'string' && typeof value.status === 'string'
}

/** 최근 24시간 지급·차감 합계. 실패하면 null(통계만 비우고 나머지는 정상 응답). */
async function sumRecentLedger(): Promise<{ earned: number; spent: number } | null> {
  const sinceIso = new Date(Date.now() - SUMMARY_WINDOW_HOURS * 3600_000).toISOString()
  let earned = 0
  let spent = 0
  for (let i = 0; i < SUMMARY_SCAN_PAGES; i += 1) {
    const from = i * SUMMARY_SCAN_PAGE_SIZE
    const { data, error } = await supabaseAdmin
      .from('point_ledger')
      .select('amount')
      .gte('created_at', sinceIso)
      .order('id', { ascending: true })
      .range(from, from + SUMMARY_SCAN_PAGE_SIZE - 1)
    if (error) {
      console.error('[admin/points] 24시간 합계 실패', error.message)
      return null
    }
    const rows = data ?? []
    for (const row of rows) {
      if (row.amount > 0) earned += row.amount
      else spent += row.amount
    }
    if (rows.length < SUMMARY_SCAN_PAGE_SIZE) break
  }
  return { earned, spent }
}

/**
 * GET /api/admin/points
 *   q         지급 대상(승인 멤버) 이름 검색
 *   page      1-based, 범위 밖이면 마지막 페이지로 보정
 *   pageSize  10~100 (기본 20)
 *   reason    내역 유형
 *   ledgerQ   내역 검색 — 멤버 이름 또는 사유 부분 일치
 *   sign      earn(amount>0) | spend(amount<0)
 *   memberId  특정 멤버 내역만
 */
export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403, headers: NO_STORE })
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 50)
  const parsedSize = Number(url.searchParams.get('pageSize') ?? '20')
  const pageSize = Number.isInteger(parsedSize) && parsedSize >= 10 && parsedSize <= 100 ? parsedSize : 20
  const parsedPage = Number(url.searchParams.get('page') ?? '1')
  const requestedPage = Number.isInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 100_000 ? parsedPage : 1
  // 유형 필터(선택). 없으면 전체(출석·내전·구매·명예의전당·관리자 등)를 다 보여준다.
  const reasonFilter = url.searchParams.get('reason')
  const reason = reasonFilter && KNOWN_REASONS.includes(reasonFilter) ? reasonFilter : null
  const ledgerQ = sanitizeQuery(url.searchParams.get('ledgerQ'))
  const signParam = url.searchParams.get('sign')
  const sign = signParam === 'earn' || signParam === 'spend' ? signParam : null
  const memberIdParam = url.searchParams.get('memberId') ?? ''
  const memberFilter = UUID_RE.test(memberIdParam) ? memberIdParam : null

  // 이름 매핑은 대기·거절·추방 전 멤버 내역도 이름이 보이도록 전체 members 기준.
  const [{ data: memberData, error: memberError }, { data: accounts, error: accountError }, { data: actors }] = await Promise.all([
    withAvatarColumn((cols) => supabaseAdmin.from('members').select(`id,member_name,status${cols}`).order('member_name')),
    supabaseAdmin.from('point_accounts').select('member_id,balance'),
    supabaseAdmin.from('admins').select('user_id,display_name'),
  ])
  const baseError = memberError ?? accountError
  if (baseError) {
    if (isMissingTableError(baseError)) return NextResponse.json({ error: '포인트 마이그레이션이 필요합니다', migration_required: true }, { status: 503, headers: NO_STORE })
    console.error('[admin/points] 조회 실패', baseError.message)
    return NextResponse.json({ error: '포인트 정보를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }
  const allMembers = (Array.isArray(memberData) ? memberData : []).filter(isMemberRow)
  const memberById = new Map(allMembers.map((m) => [m.id, m]))
  const approved = allMembers.filter((m) => m.status === 'approved')
  const balances = new Map((accounts ?? []).map((row) => [row.member_id, row.balance]))
  const actorNames = new Map((actors ?? []).filter((row) => row.user_id).map((row) => [row.user_id as string, row.display_name ?? '관리자']))

  // 검색: 이름이 맞는 멤버 id + 사유 부분 일치를 OR 로 묶는다(uuid 는 안전한 문자만 포함).
  let searchFilter: string | null = null
  if (ledgerQ) {
    const needle = ledgerQ.toLocaleLowerCase('ko-KR')
    const nameIds = allMembers
      .filter((m) => m.member_name.toLocaleLowerCase('ko-KR').includes(needle))
      .map((m) => m.id)
      .slice(0, MAX_NAME_MATCH_IDS)
    const parts = [`description.ilike.%${ledgerQ}%`]
    if (nameIds.length > 0) parts.push(`member_id.in.(${nameIds.join(',')})`)
    searchFilter = parts.join(',')
  }

  const buildLedgerQuery = (page: number) => {
    const from = (page - 1) * pageSize
    let query = supabaseAdmin
      .from('point_ledger')
      .select('id,member_id,amount,reason,description,balance_after,created_at,created_by', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1)
    if (reason) query = query.eq('reason', reason)
    if (sign === 'earn') query = query.gt('amount', 0)
    if (sign === 'spend') query = query.lt('amount', 0)
    if (memberFilter) query = query.eq('member_id', memberFilter)
    if (searchFilter) query = query.or(searchFilter)
    return query
  }

  const [ledgerRes, recent] = await Promise.all([buildLedgerQuery(requestedPage), sumRecentLedger()])
  let { data: ledger, count: ledgerCount } = ledgerRes
  if (ledgerRes.error) {
    if (isMissingTableError(ledgerRes.error)) return NextResponse.json({ error: '포인트 마이그레이션이 필요합니다', migration_required: true }, { status: 503, headers: NO_STORE })
    console.error('[admin/points] 내역 조회 실패', ledgerRes.error.message)
    return NextResponse.json({ error: '포인트 정보를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }

  // 범위를 벗어난 페이지(필터 변경 직후 등)는 마지막 페이지로 다시 조회한다.
  const firstTotal = ledgerCount ?? 0
  const firstTotalPages = Math.max(1, Math.ceil(firstTotal / pageSize))
  let page = requestedPage
  if (requestedPage > firstTotalPages && firstTotal > 0) {
    page = firstTotalPages
    const retry = await buildLedgerQuery(page)
    if (retry.error) {
      console.error('[admin/points] 내역 재조회 실패', retry.error.message)
      return NextResponse.json({ error: '포인트 정보를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
    }
    ledger = retry.data
    ledgerCount = retry.count
  }
  const total = ledgerCount ?? 0

  const summary: Summary | null = recent
    ? {
        total_balance: approved.reduce((sum, m) => sum + (balances.get(m.id) ?? 0), 0),
        member_count: approved.length,
        earned_24h: recent.earned,
        spent_24h: recent.spent,
        window_hours: SUMMARY_WINDOW_HOURS,
      }
    : null

  const qLower = q.toLocaleLowerCase('ko-KR')
  return NextResponse.json({
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    summary,
    members: approved
      .filter((row) => !q || row.member_name.toLocaleLowerCase('ko-KR').includes(qLower))
      .slice(0, 100)
      .map((row) => ({ id: row.id, name: row.member_name, balance: balances.get(row.id) ?? 0, avatar_url: resolveAvatarUrl(row) })),
    ledger: (ledger ?? []).map((row) => {
      const member = memberById.get(row.member_id)
      return {
        id: row.id,
        member_id: row.member_id,
        member_name: member?.member_name ?? '알 수 없는 멤버',
        member_avatar_url: resolveAvatarUrl(member),
        amount: row.amount,
        reason: row.reason,
        description: row.description,
        balance_after: row.balance_after,
        created_at: row.created_at,
        // 관리자 수동 지급만 관리자명을 붙이고, 나머지(출석·내전·구매·명예의전당 등)는 시스템 자동이다.
        actor_name: row.created_by ? actorNames.get(row.created_by) ?? '관리자' : '시스템',
      }
    }),
  }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403, headers: NO_STORE })
  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body) || Object.keys(body).some((key) => !POST_KEYS.has(key))) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400, headers: NO_STORE })
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (typeof body.memberId !== 'string' || !UUID_RE.test(body.memberId) || typeof body.requestId !== 'string' || !UUID_RE.test(body.requestId) || typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount === 0 || body.amount < -10000 || body.amount > 10000 || description.length < 1 || description.length > 200) {
    return NextResponse.json({ error: '멤버, 포인트(-10,000~10,000, 0 제외), 사유를 확인해 주세요.' }, { status: 400, headers: NO_STORE })
  }
  const { data, error } = await supabaseAdmin.rpc('grant_member_points', { p_member_id: body.memberId, p_amount: body.amount, p_request_id: body.requestId, p_actor_user_id: admin.user.id, p_description: description })
  if (error) {
    if (isMissingFunctionError(error) || isMissingTableError(error)) return NextResponse.json({ error: '포인트 마이그레이션이 필요합니다', migration_required: true }, { status: 503, headers: NO_STORE })
    console.error('[admin/points] 지급 실패', error.message)
    return NextResponse.json({ error: '포인트를 지급하지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }
  const result = data?.[0]
  if (!result) return NextResponse.json({ error: '지급 결과가 없습니다.' }, { status: 500, headers: NO_STORE })
  const statusCode = result.status === 'forbidden' ? 403 : result.status === 'not_found' ? 404 : result.status === 'insufficient' ? 409 : result.status === 'request_conflict' ? 409 : result.status.startsWith('invalid_') ? 400 : 200
  return NextResponse.json(result, { status: statusCode, headers: NO_STORE })
}
