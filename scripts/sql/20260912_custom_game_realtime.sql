-- ============================================================================
-- 20260912 내전 라이브 — Supabase Realtime publication 등록
-- ============================================================================
-- 목적: custom_games / custom_game_participants 의 변경을 브라우저가 postgres_changes 로 받아
--       "재조회 트리거"로만 쓴다(payload 는 신뢰하지 않고 서버 API 를 다시 부른다).
--
-- 실행: Supabase SQL Editor 에서 실행. 배포 전/후 순서 무관 —
--       미적용이면 이벤트가 오지 않을 뿐 화면은 기존(수동 새로고침)과 동일하게 동작한다.
--       멱등: 여러 번 실행해도 오류가 나지 않는다.
--
-- ⚠ 이 파일은 publication 만 바꾼다. RLS·정책 문은 0줄이다.
--   두 테이블은 20260725 STEP 3 의 select using(true) 정책만 가지며 Realtime 은 그 정책으로 필터된다.
--   쓰기 정책을 추가하지 말 것(대기열 새치기·승인 우회).
--
-- 제외: custom_game_guests / custom_game_teams 는 B 그룹(정책 0개)이라 anon/authenticated 가
--       Realtime 으로도 받을 수 없다. 공개 select 정책을 열지 않기 위해 publication 에 넣지 않는다
--       (게스트·팀 배정 변경은 실시간 반영되지 않는 것이 의도된 한계).
-- REPLICA IDENTITY 는 바꾸지 않는다 — DELETE payload 의 old 는 PK(id)만 담기며 재조회 트리거로 충분하다.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_games'
  ) then
    alter publication supabase_realtime add table public.custom_games;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_game_participants'
  ) then
    alter publication supabase_realtime add table public.custom_game_participants;
  end if;
end
$$;

-- 검증: 두 행이 나와야 한다.
-- select schemaname, tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' and tablename in ('custom_games', 'custom_game_participants');

-- 롤백:
-- alter publication supabase_realtime drop table public.custom_games;
-- alter publication supabase_realtime drop table public.custom_game_participants;
