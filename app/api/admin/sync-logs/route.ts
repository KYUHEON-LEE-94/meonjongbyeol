import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const STALE_HOURS = 2 // 이 시간 이상 미동기화면 '지연'으로 본다
const COUNT_WINDOW_HOURS = 24 // 상단 성공/스킵/실패 카운트 기준 기간
const VALID_STATUS = new Set(['success', 'skipped', 'error'])
const VALID_TYPE = new Set(['cron', 'manual'])
const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100
const MAX_QUERY_LEN = 40
const MAX_NAME_MATCH_IDS = 200

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * 검색어 정규화. PostgREST `.or()` 필터 문자열에 그대로 들어가므로
 * 문법 문자(쉼표·괄호·따옴표·역슬래시·콜론)와 와일드카드(%, *, _)를 제거한다.
 */
function sanitizeQuery(raw: string | null): string {
  return (raw ?? '')
    .replace(/[,()"'\\:%*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LEN)
}

/**
 * GET /api/admin/sync-logs
 *   page      1-based (기본 1)
 *   pageSize  10~100 (기본 30)
 *   status    success | skipped | error
 *   type      cron | manual
 *   q         멤버 이름 또는 메시지 부분 일치
 */
export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403, headers: NO_STORE })

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? ''
  const type = url.searchParams.get('type') ?? ''
  const q = sanitizeQuery(url.searchParams.get('q'))
  const pageSize = parseIntParam(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, 10, MAX_PAGE_SIZE)
  const requestedPage = parseIntParam(url.searchParams.get('page'), 1, 1, 100_000)

  // 이름 매핑은 추방·대기 멤버 로그도 이름이 보이도록 전체 members 기준, 지연 요약은 approved 기준.
  const { data: members, error: memErr } = await supabaseAdmin
    .from('members')
    .select('id,member_name,last_synced_at,status')
  if (memErr) {
    console.error('[admin/sync-logs] members', memErr.message)
    return NextResponse.json({ error: '로그를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }
  const allMembers = members ?? []
  const names = new Map(allMembers.map((m) => [m.id, m.member_name]))

  // 검색: 이름이 맞는 멤버 id + 메시지 부분 일치를 OR 로 묶는다(uuid 는 안전한 문자만 포함).
  let searchFilter: string | null = null
  if (q) {
    const needle = q.toLowerCase()
    const nameIds = allMembers
      .filter((m) => m.member_name?.toLowerCase().includes(needle))
      .map((m) => m.id)
      .slice(0, MAX_NAME_MATCH_IDS)
    const parts = [`message.ilike.%${q}%`]
    if (nameIds.length > 0) parts.push(`member_id.in.(${nameIds.join(',')})`)
    searchFilter = parts.join(',')
  }

  const buildLogsQuery = (page: number) => {
    const from = (page - 1) * pageSize
    let query = supabaseAdmin
      .from('sync_logs')
      .select('id,type,member_id,status,message,duration_ms,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1)
    if (VALID_STATUS.has(status)) query = query.eq('status', status)
    if (VALID_TYPE.has(type)) query = query.eq('type', type)
    if (searchFilter) query = query.or(searchFilter)
    return query
  }

  const sinceIso = new Date(Date.now() - COUNT_WINDOW_HOURS * 3600_000).toISOString()
  const countStatus = (s: string) =>
    supabaseAdmin
      .from('sync_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', s)
      .gte('created_at', sinceIso)

  const [logsRes, successRes, skippedRes, errorRes] = await Promise.all([
    buildLogsQuery(requestedPage),
    countStatus('success'),
    countStatus('skipped'),
    countStatus('error'),
  ])
  let { data: logs, count: total } = logsRes
  const logErr = logsRes.error
  if (logErr) {
    console.error('[admin/sync-logs] logs', logErr.message)
    return NextResponse.json({ error: '로그를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }

  // 범위를 벗어난 페이지(필터 변경·로그 TTL 정리 직후)는 마지막 페이지로 다시 조회한다.
  const totalCount = total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  let page = requestedPage
  if (requestedPage > totalPages && totalCount > 0) {
    page = totalPages
    const retry = await buildLogsQuery(page)
    if (retry.error) {
      console.error('[admin/sync-logs] logs retry', retry.error.message)
      return NextResponse.json({ error: '로그를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
    }
    logs = retry.data
    total = retry.count
  }

  // 지연(stale) 요약 — approved 멤버만
  const approved = allMembers.filter((m) => m.status === 'approved')
  const now = Date.now()
  const staleMs = STALE_HOURS * 3600_000
  let lastSyncedAt: string | null = null
  const stale: { id: string; member_name: string; last_synced_at: string | null }[] = []
  for (const m of approved) {
    if (m.last_synced_at && (!lastSyncedAt || m.last_synced_at > lastSyncedAt)) lastSyncedAt = m.last_synced_at
    const age = m.last_synced_at ? now - new Date(m.last_synced_at).getTime() : Infinity
    if (age > staleMs) stale.push({ id: m.id, member_name: m.member_name, last_synced_at: m.last_synced_at })
  }
  stale.sort((a, b) => (a.last_synced_at ?? '').localeCompare(b.last_synced_at ?? ''))

  return NextResponse.json({
    summary: {
      last_synced_at: lastSyncedAt,
      stale_hours: STALE_HOURS,
      stale_count: stale.length,
      approved_count: approved.length,
      count_window_hours: COUNT_WINDOW_HOURS,
      counts: {
        success: successRes.count ?? 0,
        skipped: skippedRes.count ?? 0,
        error: errorRes.count ?? 0,
      },
    },
    stale: stale.slice(0, 30),
    page,
    page_size: pageSize,
    total: total ?? 0,
    total_pages: Math.max(1, Math.ceil((total ?? 0) / pageSize)),
    logs: (logs ?? []).map((l) => ({
      id: l.id,
      type: l.type,
      status: l.status,
      member_name: l.member_id ? (names.get(l.member_id) ?? '알 수 없는 멤버') : '—',
      message: l.message,
      duration_ms: l.duration_ms,
      created_at: l.created_at,
    })),
  }, { headers: NO_STORE })
}
