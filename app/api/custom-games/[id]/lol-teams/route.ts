import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import {
  fetchGame,
  isCheckViolation,
  isMissingColumnError,
  lolMigrationRequiredResponse,
  rejectClosedGame,
  rejectNonLolGame,
} from '@/lib/customGames/game'
import { LOL_ROUND, filterConfirmedSlots, getConfirmedMemberIds, isSlotRpcResult } from '@/lib/customGames/lolSlots'
import { isMissingFunctionError } from '@/lib/db/pgErrors'
import { LOL_CAPACITY, LOL_POSITIONS, isLolPosition } from '@/lib/customGames/constants'

export const dynamic = 'force-dynamic'

const TEAM_SIZE = LOL_CAPACITY / 2 // 5:5

type Ctx = { params: Promise<{ id: string }> }

type LolAssignment = {
  team_index: number
  member_id?: string
  guest_name?: string | null
  position?: string | null
}

const GUEST_NAME_MAX = 20

/** 클라가 로드 시점에 본 lol_teams. replace_lol_teams RPC 가 현재 행과 비교한다(낙관적 동시성). */
type ExpectedRow = {
  team_index: 1 | 2
  member_id: string | null
  guest_name: string | null
  position: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseExpected(raw: unknown): ExpectedRow[] | null {
  if (!Array.isArray(raw) || raw.length > LOL_CAPACITY) return null
  const out: ExpectedRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const r = item as Record<string, unknown>
    if (r.team_index !== 1 && r.team_index !== 2) return null
    const memberId = r.member_id ?? null
    const guestName = r.guest_name ?? null
    const position = r.position ?? null
    // RPC 가 ::uuid 로 캐스트하므로 형식이 틀리면 22P02(500)가 된다 → 여기서 400 으로 거른다.
    if (memberId !== null && (typeof memberId !== 'string' || !UUID_RE.test(memberId))) return null
    if (guestName !== null && (typeof guestName !== 'string' || guestName.length > GUEST_NAME_MAX)) return null
    if (position !== null && !isLolPosition(position)) return null
    out.push({
      team_index: r.team_index,
      // uuid::text 는 소문자다. 대소문자 차이로 거짓 conflict 가 나지 않게 맞춘다.
      member_id: memberId === null ? null : memberId.toLowerCase(),
      // guest_name 은 서버가 준 값 그대로 비교한다(trim 하지 않는다).
      guest_name: guestName,
      position,
    })
  }
  return out
}

/**
 * ★ 롤 전용 팀/포지션 배정. rejectNonLolGame() 으로만 열린다.
 *   슬롯은 확정 멤버(member_id) 또는 외부인 라벨(guest_name) 중 하나로 채운다.
 *   ★ guest_name 은 자유 텍스트 라벨이며 레거시 게스트(guest_id)와 무관하다 —
 *     롤 INSERT 는 guest_id 를 항상 null 로 둔다.
 */

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const fetched = await fetchGame(id)
  if (!fetched.ok) return fetched.response
  // ★ 표시 필터 = replace_lol_teams 비교 필터(round 1 + 외부인 또는 확정 멤버). 대기로 밀린 멤버의 잔존 행은 숨긴다.
  const confirmed = await getConfirmedMemberIds(fetched.game)
  if (!confirmed.ok) return NextResponse.json({ error: confirmed.message }, { status: 500 })

  const withPosition = await supabaseAdmin
    .from('custom_game_teams')
    .select('team_index, member_id, guest_name, position')
    .eq('custom_game_id', id)
    .eq('round_number', LOL_ROUND)
    .order('team_index')

  if (withPosition.error) {
    // position/guest_name 컬럼(20260731/20260732) 미적용 → 없이 재조회해 degrade.
    if (isMissingColumnError(withPosition.error)) {
      const { data: legacy, error } = await supabaseAdmin
        .from('custom_game_teams')
        .select('team_index, member_id, guest_id')
        .eq('custom_game_id', id)
        .eq('round_number', LOL_ROUND)
        .order('team_index')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({
        teams: filterConfirmedSlots(legacy ?? [], confirmed.ids).map((t) => ({
          team_index: t.team_index,
          member_id: t.member_id,
          position: null,
          guest_name: null,
        })),
      })
    }
    return NextResponse.json({ error: withPosition.error.message }, { status: 500 })
  }

  return NextResponse.json({ teams: filterConfirmedSlots(withPosition.data ?? [], confirmed.ids) })
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params

  const auth = await authorizeGameManage(gameId)
  if (!auth.ok) return auth.response
  const { game } = auth

  const notLol = rejectNonLolGame(game)
  if (notLol) return notLol
  const closed = rejectClosedGame(game)
  if (closed) return closed

  const isRift = game.lol_mode === 'rift'

  const body = (await req.json().catch(() => null)) as {
    assignments?: LolAssignment[]
    random?: boolean
    expected?: unknown
  } | null

  if (!body) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  // 구버전 탭(expected 미전송)은 남의 선점을 덮어쓸 수 있으므로 저장을 막는다.
  const expected = parseExpected(body.expected)
  if (!expected) {
    return NextResponse.json({ error: '새로고침 후 다시 시도해주세요' }, { status: 400 })
  }

  // ── 확정 참가자 — 상세 GET·선점과 같은 규칙(게스트 정원 포함) ──────────
  const confirmedResult = await getConfirmedMemberIds(game)
  if (!confirmedResult.ok) return NextResponse.json({ error: confirmedResult.message }, { status: 500 })
  const confirmedIds = confirmedResult.ids
  const confirmed = [...confirmedIds]

  let finalAssignments: LolAssignment[]

  if (body.random) {
    // ── 랜덤 배정 ─────────────────────────────────────────────────
    if (confirmed.length !== LOL_CAPACITY) {
      return NextResponse.json(
        { error: `랜덤 배정은 확정 참가자 ${LOL_CAPACITY}명이어야 가능합니다` },
        { status: 400 },
      )
    }
    const shuffled = [...confirmed].sort(() => Math.random() - 0.5)
    finalAssignments = shuffled.map((memberId, i) => {
      const teamIndex = i < TEAM_SIZE ? 1 : 2
      const slot = i % TEAM_SIZE
      return {
        team_index: teamIndex,
        member_id: memberId,
        position: isRift ? LOL_POSITIONS[slot] : null,
      }
    })
  } else {
    // ── 수동 배정 검증 ────────────────────────────────────────────
    // 빈 배열 허용 = 전원 배치 해제 후 저장(슬롯 비우기). replace RPC 는 0행 insert 로 처리한다.
    if (!Array.isArray(body.assignments)) {
      return NextResponse.json({ error: '팀 배정 정보가 없습니다' }, { status: 400 })
    }
    // 정규화: guest_name 은 trim 후 빈문자면 없는 것으로 취급.
    finalAssignments = body.assignments.map((a) => ({
      ...a,
      guest_name: typeof a.guest_name === 'string' ? a.guest_name.trim() : null,
    }))

    const seenMembers = new Set<string>()
    // 외부인 라벨은 슬롯 라벨이라 정원과 무관하다. 팀 전체(양팀) trim·소문자 기준 중복만 막는다.
    const seenGuestNames = new Set<string>()
    const teamCounts: Record<number, number> = { 1: 0, 2: 0 }
    const teamPositions: Record<number, Set<string>> = { 1: new Set(), 2: new Set() }

    for (const a of finalAssignments) {
      if (a.team_index !== 1 && a.team_index !== 2) {
        return NextResponse.json({ error: '팀 번호는 1 또는 2여야 합니다' }, { status: 400 })
      }

      const hasMember = typeof a.member_id === 'string' && a.member_id.length > 0
      const guestName = typeof a.guest_name === 'string' ? a.guest_name : ''
      const hasGuest = guestName.length > 0

      // ★ 슬롯 정체성: 멤버 또는 외부인 중 정확히 하나. (앱 검증 + DB identity_chk 이중 방어)
      if (hasMember === hasGuest) {
        return NextResponse.json(
          { error: '슬롯마다 멤버 또는 외부인 이름 중 하나만 지정할 수 있습니다' },
          { status: 400 },
        )
      }

      if (hasMember) {
        const memberId = a.member_id as string
        if (!confirmedIds.has(memberId)) {
          return NextResponse.json(
            { error: '확정 참가자가 아닌 대상이 배정에 포함되어 있습니다' },
            { status: 400 },
          )
        }
        if (seenMembers.has(memberId)) {
          return NextResponse.json({ error: '같은 참가자가 중복 배정되었습니다' }, { status: 400 })
        }
        seenMembers.add(memberId)
      } else {
        // 외부인은 정원(확정 10명) 계산에 넣지 않는다 — confirmedIds 검증 제외.
        if (guestName.length > GUEST_NAME_MAX) {
          return NextResponse.json(
            { error: `외부인 이름은 ${GUEST_NAME_MAX}자 이하여야 합니다` },
            { status: 400 },
          )
        }
        const key = guestName.toLowerCase()
        if (seenGuestNames.has(key)) {
          return NextResponse.json({ error: '같은 외부인 이름이 중복되었습니다' }, { status: 400 })
        }
        seenGuestNames.add(key)
      }

      teamCounts[a.team_index]++
      if (teamCounts[a.team_index] > TEAM_SIZE) {
        return NextResponse.json({ error: `한 팀에는 최대 ${TEAM_SIZE}명까지 배정할 수 있습니다` }, { status: 400 })
      }

      if (isRift) {
        if (!isLolPosition(a.position)) {
          return NextResponse.json({ error: '협곡은 포지션을 지정해야 합니다' }, { status: 400 })
        }
        if (teamPositions[a.team_index].has(a.position)) {
          return NextResponse.json({ error: '같은 팀에 포지션이 중복되었습니다' }, { status: 400 })
        }
        teamPositions[a.team_index].add(a.position)
      } else if (a.position != null) {
        return NextResponse.json({ error: '증바람은 포지션을 지정할 수 없습니다' }, { status: 400 })
      }
    }
  }

  const rows = finalAssignments.map((a) => {
    const guestName = typeof a.guest_name === 'string' ? a.guest_name.trim() : ''
    const hasMember = typeof a.member_id === 'string' && a.member_id.length > 0
    return {
      team_index: a.team_index,
      member_id: hasMember ? (a.member_id as string) : null,
      // ★ 외부인은 guest_name(라벨)에만 저장. guest_id(레거시 게스트)는 롤에서 항상 null.
      guest_name: hasMember ? null : guestName || null,
      position: isRift ? a.position ?? null : null,
    }
  })

  // ── 저장: 낙관적 동시성 RPC(비교 + delete + insert 한 트랜잭션) ─────────
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('replace_lol_teams', {
    p_game_id: gameId,
    p_rows: rows,
    p_expected: expected,
    p_confirmed: confirmed,
  })

  if (rpcError) {
    if (isMissingFunctionError(rpcError)) return legacyReplace(gameId, rows, finalAssignments)
    if (isMissingColumnError(rpcError) || isCheckViolation(rpcError)) return lolMigrationRequiredResponse()
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const result: unknown = rpcData
  if (!isSlotRpcResult(result)) {
    return NextResponse.json({ error: '알 수 없는 응답입니다' }, { status: 500 })
  }
  if (result === 'conflict') {
    return NextResponse.json(
      { error: '변경사항이 있어요. 새로고침 후 다시 배치해주세요', conflict: true },
      { status: 409 },
    )
  }
  if (result === 'closed') {
    return NextResponse.json({ error: '이미 종료된 내전입니다' }, { status: 400 })
  }
  if (result === 'not_found') {
    return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
  }
  if (result !== 'ok') {
    return NextResponse.json({ error: '알 수 없는 응답입니다' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, assignments: finalAssignments })
}

type TeamRowInput = {
  team_index: number
  member_id: string | null
  guest_name: string | null
  position: string | null
}

/**
 * 20260913(replace_lol_teams) 미적용 환경 전용 폴백 — 기존 delete+insert 경로.
 * 원자성·낙관적 동시성이 없다(마이그레이션 적용 후에는 타지 않는다).
 */
async function legacyReplace(gameId: string, rows: TeamRowInput[], finalAssignments: LolAssignment[]) {
  await supabaseAdmin.from('custom_game_teams').delete().eq('custom_game_id', gameId)
  if (rows.length === 0) return NextResponse.json({ ok: true, assignments: finalAssignments })

  const inserts = rows.map((r) => ({
    custom_game_id: gameId,
    round_number: LOL_ROUND,
    ...r,
    guest_id: null,
  }))

  const { error: insertError } = await supabaseAdmin.from('custom_game_teams').insert(inserts)
  if (insertError) {
    // position/guest_name 컬럼·CHECK(20260731/20260732)가 선행되어야 한다. 위반은 500이 아니라 안내다.
    if (isMissingColumnError(insertError) || isCheckViolation(insertError)) {
      return lolMigrationRequiredResponse()
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, assignments: finalAssignments })
}
