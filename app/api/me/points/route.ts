import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const H = { 'Cache-Control': 'private, no-store' }

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const LEDGER_COLUMNS = 'id,amount,description,reason,created_at,balance_after'
// 이번 달 요약은 금액만 합산한다. 한 달 변동이 이 상한을 넘을 일은 사실상 없고, 넘으면 요약을 생략한다.
const SUMMARY_ROW_CAP = 2000

type Cursor = { createdAt: string; id: number }

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n)))
}

const CURSOR_TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/

// 커서 = "<created_at ISO>~<id>". (created_at, id) desc 키셋이라 같은 시각 행도 누락·중복 없이 넘어간다.
function parseCursor(raw: string | null): Cursor | null {
  if (!raw) return null
  const sep = raw.lastIndexOf('~')
  if (sep <= 0) return null
  const createdAt = raw.slice(0, sep)
  const id = Number(raw.slice(sep + 1))
  // .or() 필터 문자열에 그대로 들어가므로 엄격한 타임스탬프 형식만 허용한다(따옴표·쉼표 주입 차단).
  // toISOString 정규화는 Postgres 마이크로초를 잘라 키셋 경계가 어긋나므로 쓰지 않는다.
  if (!Number.isInteger(id) || id < 1 || !CURSOR_TS_RE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return null
  return { createdAt, id }
}

// KST 이번 달 1일 00:00 의 UTC ISO.
function kstMonthStartIso(): string {
  const kstNow = new Date(Date.now() + 9 * 3600_000)
  return new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1) - 9 * 3600_000).toISOString()
}

// 네비 칩(파라미터 없음 → 최근 20건)과 /points 상세(limit·cursor·summary)가 함께 쓴다.
// 미로그인·미승인·마이그레이션 미적용이면 balance:null → 클라이언트는 숫자일 때만 렌더한다.
export async function GET(request: Request) {
  const mine = await getMyMember()
  if (!mine.ok || !mine.member || mine.member.status !== 'approved') {
    return NextResponse.json({ balance: null }, { headers: H })
  }
  const memberId = mine.member.id
  const params = new URL(request.url).searchParams
  const limit = parseLimit(params.get('limit'))
  const rawCursor = params.get('cursor')
  const cursor = parseCursor(rawCursor)
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: '잘못된 cursor 입니다.' }, { status: 400, headers: H })
  }
  const wantSummary = params.get('summary') === '1' && !cursor

  let ledgerQuery = supabaseAdmin
    .from('point_ledger')
    .select(LEDGER_COLUMNS)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (cursor) {
    ledgerQuery = ledgerQuery.or(
      `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
    )
  }

  const [account, ledger, month] = await Promise.all([
    supabaseAdmin.from('point_accounts').select('balance').eq('member_id', memberId).maybeSingle(),
    ledgerQuery,
    wantSummary
      ? supabaseAdmin.from('point_ledger').select('amount').eq('member_id', memberId).gte('created_at', kstMonthStartIso()).limit(SUMMARY_ROW_CAP)
      : Promise.resolve(null),
  ])
  if (account.error) {
    if (!isMissingTableError(account.error)) console.error('[me/points] 조회 실패', account.error.message)
    return NextResponse.json({ balance: null, ledger: [], hasMore: false, nextCursor: null }, { headers: H })
  }
  if (ledger.error) console.error('[me/points] 내역 조회 실패', ledger.error.message)

  const rows = ledger.data ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const nextCursor = hasMore && last ? `${last.created_at}~${last.id}` : null

  let summary: { monthEarned: number; monthSpent: number } | null = null
  if (month && !month.error && month.data && month.data.length < SUMMARY_ROW_CAP) {
    let earned = 0
    let spent = 0
    for (const r of month.data) {
      if (r.amount > 0) earned += r.amount
      else spent += -r.amount
    }
    summary = { monthEarned: earned, monthSpent: spent }
  }

  return NextResponse.json(
    { balance: account.data?.balance ?? 0, ledger: page, hasMore, nextCursor, ...(wantSummary ? { summary } : {}) },
    { headers: H },
  )
}
