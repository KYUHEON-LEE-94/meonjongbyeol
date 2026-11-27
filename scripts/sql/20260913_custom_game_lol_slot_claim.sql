-- ============================================================================
-- 20260913 롤 협곡 내전 — 확정 참가자 본인 슬롯 선점 + 관리자 저장 낙관적 동시성
-- ============================================================================
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- 순서: ★ SQL 먼저 → 배포 나중.
--   미적용이면 선점 API 는 503 안내, 관리자 저장은 기존 delete+insert 경로로 degrade 한다.
-- 전제: 20260731(position) · 20260732(guest_name) · 20260733(check_one_player 제거) 적용 완료.
--
-- 이 파일이 바꾸는 것:
--   1) custom_game_teams 1인 1슬롯 부분 유니크 인덱스
--   2) RPC 3개 (claim_lol_slot / release_lol_slot / replace_lol_teams) — service_role 전용
-- 바꾸지 않는 것: 새 컬럼 0, RLS·정책 0줄, publication 0줄.
--   custom_game_teams 는 B 그룹(정책 0개) 그대로다. 쓰기는 오직 서버 라우트 → service role RPC.
--
-- ⚠ 확정/대기 판정은 SQL 이 하지 않는다. 대기열은 (joined_at, id) 순번에서 서버 TS 가 파생하고
--   (lib/customGames/lolSlots.ts getConfirmedMemberIds), 그 결과를 p_confirmed 로 넘긴다.
--   ⚠ p_member_id 는 서버가 세션에서 해석한 값만 넘긴다(요청 body 의 member 식별자 불신).
--   그래서 anon/authenticated 실행권이 남으면 남의 슬롯을 조작할 수 있다 → STEP 5 revoke 필수.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0. (읽기 전용) 기존 중복 확인 — 0행이어야 STEP 1 인덱스가 생성된다.
-- ---------------------------------------------------------------------------
-- select custom_game_id, round_number, member_id, count(*)
--   from public.custom_game_teams
--  where member_id is not null
--  group by 1, 2, 3
-- having count(*) > 1;
--
-- 중복이 있으면 그룹별 1행만 남기고 정리한 뒤 STEP 1 을 실행한다:
-- delete from public.custom_game_teams t
--  using (
--    select custom_game_id, round_number, member_id, min(ctid::text)::tid as keep
--      from public.custom_game_teams
--     where member_id is not null
--     group by 1, 2, 3
--    having count(*) > 1
--  ) d
--  where t.custom_game_id = d.custom_game_id
--    and t.round_number = d.round_number
--    and t.member_id = d.member_id
--    and t.ctid <> d.keep;

-- ---------------------------------------------------------------------------
-- STEP 1. 1인 1슬롯 — 같은 게임·라운드에서 한 멤버는 한 슬롯만.
--   직렬화는 RPC 의 advisory lock 이 담당하고, 이 인덱스는 최후 방어선(23505)이다.
-- ---------------------------------------------------------------------------
create unique index if not exists custom_game_teams_member_uniq
  on public.custom_game_teams(custom_game_id, round_number, member_id)
  where member_id is not null;

-- ---------------------------------------------------------------------------
-- STEP 2. claim_lol_slot — 본인 슬롯 선점/이동
--   반환: 'claimed' | 'moved' | 'noop' | 'taken' | 'closed' | 'not_rift'
--        | 'not_participant' | 'not_confirmed' | 'invalid' | 'not_found'
--   ★ custom_games 를 for update 로 잠그지 않는다 — 참가 INSERT 의 FK(FOR KEY SHARE)와 충돌한다.
--     같은 게임의 슬롯 쓰기(claim/release/replace)는 게임 단위 advisory xact lock 으로 직렬화한다.
--   표시 필터(서버)는 확정 집합 밖 멤버 행을 숨기므로, 그런 잔존 행이 대상 슬롯을 점유하고 있으면
--   "빈 슬롯처럼 보이는데 taken" 이 되지 않도록 정리하고 선점을 진행한다.
-- ---------------------------------------------------------------------------
create or replace function public.claim_lol_slot(
  p_game_id uuid,
  p_member_id uuid,
  p_team_index int,
  p_position text,
  p_confirmed uuid[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_mode text;
  v_status text;
  v_occupant uuid;
  v_occupied boolean := false;
  v_had_slot boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('lol_slots:' || p_game_id::text, 0));

  if p_game_id is null or p_member_id is null
     or p_team_index is null or p_team_index not in (1, 2)
     or p_position is null or p_position not in ('top', 'jungle', 'mid', 'adc', 'support') then
    return 'invalid';
  end if;

  select g.game_kind, g.lol_mode, g.status
    into v_kind, v_mode, v_status
    from public.custom_games g
   where g.id = p_game_id;

  if not found then
    return 'not_found';
  end if;
  if v_kind is distinct from 'lol' or v_mode is distinct from 'rift' then
    return 'not_rift';
  end if;
  if v_status is distinct from 'recruiting' then
    return 'closed';
  end if;

  if not exists (
    select 1 from public.custom_game_participants p
     where p.custom_game_id = p_game_id and p.member_id = p_member_id
  ) then
    return 'not_participant';
  end if;
  if p_confirmed is null or not (p_member_id = any(p_confirmed)) then
    return 'not_confirmed';
  end if;

  select t.member_id, true
    into v_occupant, v_occupied
    from public.custom_game_teams t
   where t.custom_game_id = p_game_id
     and t.round_number = 1
     and t.team_index = p_team_index
     and t.position = p_position
   limit 1;

  if v_occupied then
    if v_occupant = p_member_id then
      return 'noop';
    end if;
    if v_occupant is null or v_occupant = any(p_confirmed) then
      return 'taken';
    end if;
    -- 확정 집합 밖(대기로 밀린 등) 멤버의 잔존 행 — 화면에 보이지 않는 슬롯이므로 정리한다.
    delete from public.custom_game_teams t
     where t.custom_game_id = p_game_id
       and t.round_number = 1
       and t.team_index = p_team_index
       and t.position = p_position;
  end if;

  delete from public.custom_game_teams t
   where t.custom_game_id = p_game_id
     and t.round_number = 1
     and t.member_id = p_member_id;
  v_had_slot := found;

  insert into public.custom_game_teams
    (custom_game_id, round_number, team_index, member_id, guest_id, guest_name, position)
  values
    (p_game_id, 1, p_team_index, p_member_id, null, null, p_position);

  return case when v_had_slot then 'moved' else 'claimed' end;
exception
  when unique_violation then
    return 'taken';
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 3. release_lol_slot — 본인 슬롯 해제
--   반환: 'released' | 'none' | 'closed' | 'not_found' | 'invalid'
--   확정 여부를 묻지 않는다(자기 행 삭제뿐이라 남에게 영향이 없다).
-- ---------------------------------------------------------------------------
create or replace function public.release_lol_slot(p_game_id uuid, p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended('lol_slots:' || p_game_id::text, 0));

  if p_game_id is null or p_member_id is null then
    return 'invalid';
  end if;

  select g.status into v_status from public.custom_games g where g.id = p_game_id;
  if not found then
    return 'not_found';
  end if;
  if v_status is distinct from 'recruiting' then
    return 'closed';
  end if;

  delete from public.custom_game_teams t
   where t.custom_game_id = p_game_id
     and t.round_number = 1
     and t.member_id = p_member_id;

  return case when found then 'released' else 'none' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 4. replace_lol_teams — 관리자 일괄 저장 (낙관적 동시성, 새 컬럼 없음)
--   반환: 'ok' | 'conflict' | 'closed' | 'not_found'
--   p_expected = 클라가 로드 시점에 본 lol_teams. 현재 행과 정규화 문자열 집합이 다르면 'conflict'.
--   ★ 현재 행 필터 = 표시 필터와 동일 규칙: round_number=1 and (member_id is null or 확정 멤버).
--     둘이 어긋나면 화면에 안 보이는 행 때문에 저장이 영구 409 가 된다.
--   delete+insert 가 한 트랜잭션이라 CHECK 위반 시 기존 배정이 보존된다(check_violation 은 재raise).
-- ---------------------------------------------------------------------------
create or replace function public.replace_lol_teams(
  p_game_id uuid,
  p_rows jsonb,
  p_expected jsonb,
  p_confirmed uuid[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_status text;
  v_current text[];
  v_expected text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('lol_slots:' || p_game_id::text, 0));

  select g.game_kind, g.status into v_kind, v_status
    from public.custom_games g
   where g.id = p_game_id;
  if not found then
    return 'not_found';
  end if;
  if v_kind is distinct from 'lol' or v_status in ('ended', 'cancelled') then
    return 'closed';
  end if;

  select coalesce(array_agg(s order by s), '{}')
    into v_current
    from (
      select concat_ws('|',
               t.team_index::text,
               coalesce(t.member_id::text, ''),
               coalesce(t.guest_name, ''),
               coalesce(t.position, '')) as s
        from public.custom_game_teams t
       where t.custom_game_id = p_game_id
         and t.round_number = 1
         and (t.member_id is null or t.member_id = any(coalesce(p_confirmed, '{}')))
    ) cur;

  select coalesce(array_agg(s order by s), '{}')
    into v_expected
    from (
      select concat_ws('|',
               e.team_index::text,
               coalesce(nullif(e.member_id, '')::uuid::text, ''),
               coalesce(e.guest_name, ''),
               coalesce(e.position, '')) as s
        from jsonb_to_recordset(coalesce(p_expected, '[]'::jsonb))
             as e(team_index int, member_id text, guest_name text, position text)
    ) exp;

  if v_current is distinct from v_expected then
    return 'conflict';
  end if;

  delete from public.custom_game_teams t where t.custom_game_id = p_game_id;

  insert into public.custom_game_teams
    (custom_game_id, round_number, team_index, member_id, guest_id, guest_name, position)
  select p_game_id, 1, x.team_index, x.member_id, null, x.guest_name, x.position
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
         as x(team_index int, member_id uuid, guest_name text, position text);

  return 'ok';
exception
  when unique_violation then
    return 'conflict';
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 5. 권한 — service_role 전용. authenticated 실행권이 남으면 브라우저에서
--   임의의 p_member_id 로 남의 슬롯을 선점/해제할 수 있다.
-- ---------------------------------------------------------------------------
revoke all on function public.claim_lol_slot(uuid, uuid, int, text, uuid[]) from public, anon, authenticated;
revoke all on function public.release_lol_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.replace_lol_teams(uuid, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_lol_slot(uuid, uuid, int, text, uuid[]) to service_role;
grant execute on function public.release_lol_slot(uuid, uuid) to service_role;
grant execute on function public.replace_lol_teams(uuid, jsonb, jsonb, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- STEP 6. 검증 / 롤백
-- ---------------------------------------------------------------------------
-- 인덱스: select indexname from pg_indexes
--          where schemaname='public' and tablename='custom_game_teams' and indexname='custom_game_teams_member_uniq';
-- 권한:   select has_function_privilege('authenticated', 'public.claim_lol_slot(uuid, uuid, int, text, uuid[])', 'execute');  -- false
--         select has_function_privilege('anon', 'public.replace_lol_teams(uuid, jsonb, jsonb, uuid[])', 'execute');        -- false
--
-- 롤백 (배포된 코드를 먼저 이전 버전으로 되돌린 뒤 실행할 것):
-- drop function if exists public.claim_lol_slot(uuid, uuid, int, text, uuid[]);
-- drop function if exists public.release_lol_slot(uuid, uuid);
-- drop function if exists public.replace_lol_teams(uuid, jsonb, jsonb, uuid[]);
-- drop index if exists public.custom_game_teams_member_uniq;
