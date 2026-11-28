# 먼종별 (meonjongbyeol)

'먼가 종겜하는 별난 것들'(먼종별) — 종겜방 멤버 전용 커뮤니티 서비스.
내전 모집·스팀(같은 게임·접속 중·할인)·디스코드 활동·캘린더를 중심으로, Riot Games API(LoL 키)로 롤 솔로랭크 랭킹을 제공한다.
운영 도메인: https://meonjongbyeol.vercel.app

> 2026-11-25 리모델링: TFT(롤체) 랭킹·명예의 전당·시즌·주간 리포트·TOP5 알림은 **삭제**됐다.
> DB 테이블·컬럼(tft_*, hall_of_fame, seasons, tft_matches 등)은 DROP 하지 않고 남아 있으나 코드에서 참조하지 않는다.

## 기술 스택

- **프레임워크:** Next.js 16 (App Router) + React 19 + TypeScript 5
- **데이터베이스:** Supabase (PostgreSQL)
- **외부 API:** Riot Games API (LoL 키 단일), Steam Web API, Discord 활동 API
- **스타일:** Tailwind CSS v4 + Framer Motion
- **인증:** Supabase Auth — Discord OAuth 전용 (이메일/패스워드 로그인 미지원). `NEXT_PUBLIC_DISCORD_GUILD_ID` 설정 시 해당 Discord 서버 멤버만 로그인 허용(콜백에서 강제)
- **배포:** Vercel. 스케줄 트리거는 외부 크론(cron-job.org)이 담당 — 고빈도 랭크/스팀/알림 동기화(README '자동화' 참조)

## 빌드/실행 명령어

```bash
npm run dev       # 개발 서버 (localhost:3000)
npm run build     # 프로덕션 빌드
npm run lint      # ESLint 검사
npx tsc --noEmit  # TypeScript 타입 검사
```

## 디렉토리 구조

```
app/
  page.tsx                      # 홈 대시보드 (모집 중 내전·디스코드 TOP5·스팀 접속 중·캘린더·새 소식). ISR 60s, ⚠ 세션 접근 금지
  discord/page.tsx              # 디스코드 활동 (최근 30일, approved 매칭). ISR 300s, ⚠ 세션 접근 금지
  lol/page.tsx                  # 롤 솔로랭크 랭킹 (members 캐시 + 장착 칭호). ISR 60s
  layout.tsx                    # 루트 레이아웃 (<AppShell>로 children 감쌈, Poppins → --font-display)
  manifest.ts                   # PWA manifest (Next 규약 → /manifest.webmanifest)
  components/                   # 공용 컴포넌트
    AppShell.tsx                # 'use client'. 숨김 경로 판정 → 사이드바·상단바·탭바 + lg:pl-64. useViewer/usePointBalance 단 1회 호출
    AuthButtons.tsx             # 프로필 버튼·드롭다운(표시 전용, viewer props). variant 'avatar' | 'sidebar-card'
    nav/navItems.ts             # NAV_ITEMS·HIDDEN_PREFIXES(/admin,/login,/auth,/og)·isActive — 내비 단일 소스
    nav/NavIcon.tsx             # 인라인 SVG 내비 아이콘
    nav/useViewer.ts            # 세션·관리자 판정(/api/admin/me)·로그아웃(cleanupPushSubscription → signOut) 훅
    nav/usePointBalance.ts      # 포인트 잔액·내역 + 출석 POST(로드당 1회) 훅
    nav/PointBalance.tsx        # 포인트 칩 + 내역 드롭다운 (표시 전용)
    nav/Sidebar.tsx             # lg+ 고정 사이드바 (w-64)
    nav/MobileTopBar.tsx        # lg 미만 상단바 (햄버거·포인트·테마·아바타)
    nav/MobileTabBar.tsx        # lg 미만 하단 탭바 (홈·내전·스팀·롤)
    nav/DesktopTopbar.tsx       # lg+ 본문 상단 "Hi 이름," + 섹션 라벨(h1 아님)
    PwaServiceWorker.tsx        # /sw.js 등록 (Client, 세션 미접근·렌더 없음). 루트 레이아웃에 삽입
    PushNotifyToggle.tsx        # 웹 푸시 구독 토글 + iOS 설치 안내 (Client). 내전 상세에 배치
    Spinner.tsx                 # 로딩 스피너
    ui/HeroBanner.tsx           # 보라 그라데이션 히어로(kicker + h1 + 설명 + stats + action + 캐릭터). **순수 컴포넌트**('use client'·세션 금지 — ISR)
    ui/BrandSticker.tsx         # 먼종별 캐릭터 흰 스티커 카드(next/image). **순수 컴포넌트**('use client' 금지)
    ui/SectionHeader.tsx        # h2 + 힌트
    ui/EmptyState.tsx           # 빈 상태 카드
    home/HomeNews.tsx           # 새 소식 탭(롤 패치 노트 · 스팀 할인)
    home/DashboardDiscordTop5.tsx  # 최근 7일 음성 TOP5 (순수 컴포넌트)
    home/HomeRecruitingGames.tsx   # 'use client' 홈 '모집 중 내전' Island. 초기값=ISR props, Realtime 이벤트 때만 재조회
  admin/                        # 관리자 전용 (인증 필요)
    layout.tsx                  # 관리자 사이드바 레이아웃
    members/
      control/page.tsx          # 멤버 등록·수정·삭제
      sync/page.tsx             # 멤버 동기화 현황
    profile-frames/             # 프로필 프레임 관리
  steam/                        # 스팀 (나와 같은 게임·함께 할 수 있는 게임·최근 2주 플레이)
    page.tsx                    # Server Component, revalidate 300s. **DB만 조회 — Steam API 호출 0건**
                                # ⚠ 세션 접근 금지 (아래 "ISR × 개인화 분리" 참조)
    SteamLinkForm.tsx           # 스팀 ID 등록/해제 폼 (Client Component)
    SharedWithMe.tsx            # "나와 같은 게임을 가진 사람들" (Client Component, 개인화)
    SteamPresence.tsx           # "지금 스팀 접속 중" (Client Component, 60초 폴링 · 실시간)
  custom-games/                 # 내전 (목록·모집 폼 / [id] 상세)
    _components/SteamGamePicker.tsx  # 스팀 게임 선택(보유 게임 목록) + 직접 입력 폴백 (Client)
    _components/useCustomGamesRealtime.ts  # Realtime postgres_changes → 재조회 트리거 훅(인스턴스 고유 topic)
    _components/useGamePresence.ts  # Presence "지금 N명이 보는 중" (고정 topic + leaving Map)
    _components/useNow.ts       # 마운트 후 now tick (하이드레이션 안전)
    _components/LiveToast.tsx · QuickLiveBadge.tsx · SeatBar.tsx  # 라이브 토스트 / 번개 LIVE·만료 배지 / 인원 바
    _components/LolClaimBoard.tsx  # 협곡 비관리자 본인 포지션 선점 보드 (Client)
  login/                        # 사용자 로그인 (Discord OAuth 버튼)
  auth/callback/route.ts        # OAuth 코드 교환 + discord_id ↔ user_id 연결
  profile/                      # 프로필 이미지·프레임 편집 + 라이엇 ID 자가 등록
    MemberSelfForm.tsx          # 라이엇 ID 등록/수정 폼 + 계정 목록(최대 3, 추가/수정/삭제/대표지정)
  api/                          # API 라우트
    me/member/route.ts          # 내 멤버 조회(GET) / 자가 등록·수정(POST, 세션 소유권 기반)
    me/riot-accounts/           # 내 라이엇 계정(최대 3) — 전부 세션 user_id로만 소유권 판정
      route.ts                  #   GET 목록 / POST 추가(빈 슬롯 최솟값, 23505→409)
      [id]/route.ts             #   PATCH 수정 / DELETE 삭제(마지막 1개는 409)
      [id]/primary/route.ts     #   POST 대표 지정 (set_primary_riot_account RPC)
    me/steam/route.ts           # 내 스팀 연결 조회(GET)/등록(POST)/해제(DELETE) — 세션 소유권 기반
    me/push-subscription/route.ts  # 웹 푸시 구독 등록(POST, endpoint upsert)/해제(DELETE, member_id 조건 필수)
                                #   runtime='nodejs'. BYPASS 아님(세션 필요). 테이블 부재 → 503
    steam/                      # ⚠ 전부 force-dynamic + **DB만 조회**. `lib/steam/*` import 금지
      game-options/route.ts     #   내전 스팀 게임 후보 (steam_game_options RPC, 로그인+approved)
      shared-with-me/route.ts   #   "나와 같은 게임을 가진 사람들" 요약 (steam_shared_with_member RPC)
      shared-with-me/[memberId]/route.ts  # 상대 1명과 겹치는 전체 게임 (지연 로딩)
    steam-catalog/              # ⚠ **외부 호출 전용 경계.** `app/api/steam/` 와 의도적으로 분리한 경로다.
      search/route.ts           #   스팀 스토어 전체 카탈로그 검색 (비공식 storesearch, 서버 인메모리 캐시)
    steam-presence/route.ts     # ⚠ **외부 호출 전용 경계.** GetPlayerSummaries 로 "지금 접속 중" 조회
                                #   force-dynamic + 로그인·approved 게이트 + 인메모리 TTL 캐시. DB 저장 없음
    members/[id]/
      sync/route.ts             # 개별 멤버 동기화 (쿨다운 + 로그인·승인 게이트)
    cron/
      notify-reminders/route.ts # 내전 시작 임박 알림 (GET, Bearer 인증). 30분 창=디스코드 채널, 60분 창=웹 푸시.
                                # ★ 외부 크론(cron-job.org)이 5~10분마다 호출한다.
                                # (GitHub Actions 예약은 분 단위 주기를 대량 드롭해서 cron-job.org 로 이전 — README '자동화' 참조)
                                # reminder_sent_at 으로 내전당 1회만 발송(20260734). BYPASS_PATHS 등록 필수
    admin/
      sync-all/route.ts         # 전체 멤버 동기화 (GET=크론, POST=수동). GET은 커서 배치 1개만 처리한다.
                                # ★ 외부 크론(cron-job.org)이 30분~1시간마다 호출한다(호출당 2명씩, stale 1시간+만 갱신).
                                # (GitHub Actions 예약은 신뢰성이 낮아 이전 — README '자동화' 참조)
      sync-steam/route.ts       # 스팀 캐시 동기화 (GET=크론, POST=관리자)
      members/                  # 멤버 CRUD API (route=목록, create/update/[id])
        [id]/approve/route.ts   # 승인 + 즉시 동기화
        [id]/reject/route.ts    # 거절 + 사유
        [id]/accounts/route.ts  # GET 상세: 라이엇 계정 1~3개 + 스팀 연결 상태(puuid 비노출)
        [id]/riot-accounts/     # POST 추가 / [accountId] PATCH·DELETE / [accountId]/primary POST
        [id]/steam/route.ts     # POST 등록·변경 / DELETE 해제 — ⚠ user_id 를 절대 묶지 않는다
      profile-frames/           # 프레임 업로드·삭제 API
    profile/                    # 프로필 이미지·프레임 저장 API (service role 경유)

lib/
  db/
    pgErrors.ts                 # 42703·PGRST204/23505/23514/PGRST202·42883 판별 (마이그레이션 degrade 단일 지점)
                                # ★ 컬럼 부재는 코드가 2개다: SELECT=42703(Postgres), INSERT/UPDATE payload=PGRST204(PostgREST 스키마 캐시)
  supabase.ts                   # anon 클라이언트 + 브라우저 클라이언트
  supabaseAdmin.ts              # service role 클라이언트 (서버 전용)
  supabase/
    service.ts                  # supabaseService (service role, 서버 전용)
    browser.ts                  # createClient factory (브라우저)
  riot/
    api.ts                      # Riot API 클라이언트 (RIOT_LOL_API_KEY 단일, X-Riot-Token 헤더 인증)
    verifyRiotId.ts             # 등록 시 Riot ID 검증(LoL 키) → lol_puuid 로 저장
  steam/                        # ⚠ 전부 `import 'server-only'` — STEAM_API_KEY 클라이언트 노출 금지
    api.ts                      # Steam Web API (GetPlayerSummaries / GetOwnedGames / ResolveVanityURL)
    presence.ts                 # "지금 접속 중" 조회 + 모듈 스코프 TTL 캐시 (STEAM_PRESENCE_TTL_MS)
    resolveSteamId.ts           # 입력 5형태(ID64·/profiles·/id·친구 코드·vanity) → SteamID64 정규화
    appDetails.ts               # store appdetails(비공식)로 멀티플레이 판정
    storeSearch.ts              # store storesearch(비공식)로 전체 카탈로그 검색. 키 불필요, 타임아웃·캐시 내장
  push/                         # 웹 푸시(VAPID)
    webPush.ts                  # ⚠ `import 'server-only'` — VAPID 개인키 경계. 발송 + 410/404 만료 판별
    sendGameReminders.ts        # 60분 창 내전 푸시 (독립 select + push_reminder_sent_at claim)
    clientKey.ts                # urlBase64ToUint8Array — 브라우저 전용 순수 함수('server-only' 금지)
    clientUnsubscribe.ts        # 로그아웃 직전 이 기기 구독 해제(best-effort, 3초 타임아웃). 브라우저 전용
  sync/
    syncMember.ts               # 재시도 + 지수 백오프 래퍼
    doSyncMember.ts             # 대표 계정 LoL 솔로랭크 조회 + riot_accounts 갱신 + members 미러링
    syncSteamMember.ts          # 스팀 프로필·보유 게임 적재 + steam_apps 백필
    writeSyncLog.ts             # sync_logs 테이블 감사 로그
  discord/
    weeklyTop5.ts               # 홈용 최근 7일 음성 TOP5 (server-only, discord_id 미포함)
  members/
    memberInput.ts              # 멤버 입력 화이트리스트 파서 + 길이/포맷 검증 상수 (+ parseRiotAccountInput)
    primaryAccount.ts           # ★ 대표 계정 파생 + members 캐시 미러링 단일 지점 + 재승인 정책 상수
    riotAccountOps.ts           # 라이엇 계정 추가/수정/삭제/대표지정 공용 로직(사용자·관리자 라우트 공유, actor 'self'|'admin')
    steamLink.ts                # 스팀 연결/해제 공용 로직. bindUserId 는 사용자 본인 경로에서만 넘긴다
    adminMemberOps.ts           # 관리자 계정 라우트 공용: requireAdmin+멤버 조회, 대표 변경 후 즉시 동기화, 감사 로그
    myMember.ts                 # 세션 → 내 members 행 해석 (body의 member 식별자 불신)
    steamViewer.ts              # 개인화 스팀 섹션의 요청자 상태 해석 (approved/스팀등록/공개 여부)
  ui/
    styles.ts                   # 공통 className 상수(SHELL/CONTAINER/CARD/INPUT/BTN_*/ALERT/H1…).
                                # 순수 문자열이라 서버·클라 양쪽에서 import 한다. 'server-only' 금지

app/lib/
  isAdmin.ts                    # requireAdmin() — 세션 확인 + admins 테이블 체크

types/
  supabase.ts                   # DB 전체 TypeScript 스키마
```

## 환경 변수 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 서버 전용, 클라이언트 노출 금지
RIOT_LOL_API_KEY=                   # RGAPI-... LoL 앱 키. ★ 유일한 Riot 키(계정 조회·리그·등록 검증). 서버 전용
RIOT_ACCOUNT_BASE_URL=              # https://asia.api.riotgames.com/...
RIOT_LOL_LEAGUE_BASE_URL=           # https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid
STEAM_API_KEY=                      # ⚠ 서버 전용. NEXT_PUBLIC_ 접두사 절대 금지
STEAM_SYNC_BATCH=50                 # 1회 스팀 동기화 멤버 수
STEAM_MEMBER_DELAY_MS=400           # 멤버 간 호출 간격(ms)
STEAM_APP_DETAIL_BATCH=40           # 1회 실행에서 멀티플레이 판정할 신규 앱 수
STEAM_APP_DETAIL_DELAY_MS=1500      # 비공식 store API 호출 간격(ms)
STEAM_STORE_TIMEOUT_MS=4000         # 비공식 store API 타임아웃 (초과 시 빈 결과 degrade)
STEAM_CATALOG_CACHE_TTL_MS=600000   # 카탈로그 검색 결과 인메모리 캐시 TTL (10분)
STEAM_PRESENCE_TTL_MS=60000         # "지금 접속 중" 인메모리 캐시 TTL (1분). 뷰어 수와 무관하게 호출 1회/TTL
ADMIN_SYNC_TOKEN=                   # 크론 트리거용 시크릿 (CRON_SECRET 없을 때 fallback)
CRON_SECRET=                        # Vercel Cron 전용 시크릿 (설정 시 ADMIN_SYNC_TOKEN보다 우선)
DISCORD_WEBHOOK_URL=                 # ⚠ 서버 전용. 내전 생성·임박 알림용 디스코드 웹훅. 비우면 알림 skip
DISCORD_ACTIVITY_API_KEY=            # ⚠ 서버 전용. Discord 활동 요약 API Bearer 키. NEXT_PUBLIC_ 금지
DISCORD_ACTIVITY_GUILD_ID=1556608001845239828  # 활동을 조회할 먼종별 Discord 서버 ID (2026-11-25 새 서버로 교체 — 봇 초대 필요)
DISCORD_ACTIVITY_API_BASE_URL=https://tactician-discord-bot-mwonjonggem.up.railway.app
REMINDER_WINDOW_MIN=30              # 내전 시작 몇 분 전부터 디스코드 채널 "임박" 알림을 보낼지
NEXT_PUBLIC_VAPID_PUBLIC_KEY=       # 웹 푸시 VAPID 공개키(base64url). 공개값이라 NEXT_PUBLIC_ 가능
VAPID_PRIVATE_KEY=                  # ⚠ 서버 전용. NEXT_PUBLIC_ 절대 금지. 소스·문서·로그에 값 기록 금지
VAPID_SUBJECT=mailto:admin@example.com  # 또는 https://<사이트 도메인>
PUSH_REMINDER_WINDOW_MIN=60         # 내전 시작 몇 분 전에 웹 푸시를 보낼지 (기본 60, 1~360 클램프)
RIOT_MEMBER_DELAY_MS=800            # 멤버 간 · lol_puuid 발급 후 호출 간격(ms)
SYNC_ALL_BATCH=10                   # 1회 전체 동기화 멤버 수
SYNC_FAILED_BACKOFF_HOURS=3         # failed 멤버를 sync-all 이 다시 고르기까지의 간격(시간)
NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC=300  # 프론트 쿨다운 표시용
NEXT_PUBLIC_DISCORD_GUILD_ID=       # 값 있으면 그 Discord 서버(길드) 멤버만 로그인 허용, 비우면 게이트 off (기존 동작)
SITE_URL=                           # OG 절대 URL 기준(metadataBase). 미설정 시 VERCEL_PROJECT_PRODUCTION_URL → VERCEL_URL → localhost 폴백.
                                    # VERCEL_URL 은 배포마다 바뀌므로 운영에서는 반드시 SITE_URL 을 등록한다 (lib/og/siteUrl.ts)
```

### Discord 활동 요약

`/discord` 페이지는 서버 전용 API를 통해 KST 기준 최근 30일 음성 시간·활동일·메시지 수를 조회한다.
`members.status='approved'`인 멤버만 DB의 `discord_id`로 매칭하며, API 원본 `user_id`와 `discord_id`는 Client Component에 전달하지 않는다.
외부 API 요청은 5초 타임아웃과 5분 fetch cache를 사용한다. 환경변수가 없거나 API가 실패하면 활동 보기만 조회 불가 상태가 되고 다른 화면은 계속 렌더링된다.
실제 `DISCORD_ACTIVITY_API_KEY` 값은 소스·문서·로그에 기록하지 않고 Vercel의 서버 환경변수로만 등록한다.

**공용 조회 계층 (`lib/discord/`):**
- `activity.ts` — `fetchDiscordGuildActivityForPeriod({from,to})`(임의 기간) + `fetchDiscordGuildActivity()`(최근 30일 래퍼).
  외부 summary API 호출·스키마 검증·degrade의 단일 지점. 전부 `import 'server-only'`.
- `activityHelpers.ts` — KST 기간 계산(`getKstDateRange`/`getKstTodayDate`), 입력 검증(`parseActivityPeriod`, from≤to·최대 366일), `formatDiscordVoiceDuration`. 순수 함수라 서버·클라 공용.
- `memberActivity.ts` — 활동을 DB `members.discord_id`로 매칭. `includeUnlinked:true`=관리자(전체 유저, 미연결은 API `user_name` 폴백), `false`=공개(approved+활동데이터만). 음성시간 desc 정렬.

**소비처:**
- `/discord` → `DiscordActivityPanel`(최근 30일, 승인 멤버 매칭, ISR 300 · 세션 접근 없음).
- `/`(대시보드) → `fetchWeeklyDiscordTop5()`(`lib/discord/weeklyTop5.ts`) → `DashboardDiscordTop5`(최근 7일 음성 TOP5, '모집 중 내전' 옆). ISR(revalidate 60)이지만 공개 집계라 세션 접근 없음.
- `/admin/discord-activity` → `DiscordActivityAdminClient`(일/주/월/기간지정 → `GET /api/admin/discord-activity?from&to`, requireAdmin, force-dynamic).
  일·주·월·기간은 전부 프런트에서 from/to(YYYY-MM-DD)로 환산해 보내고, 기준일은 서버(KST)에서 시드한다.

### 웹 푸시(Web Push / VAPID) + PWA

내전 시작 **1시간 전**에 참가자 **개인 기기**로 푸시를 보낸다. 디스코드 봇 토큰이 필요 없다.
마이그레이션: `scripts/sql/20260911_web_push_subscriptions.sql`.

**★ 기존 30분 디스코드 채널 알림과 완전히 분리한다 (되돌리지 말 것).**
`notify-reminders` 라우트는 두 창을 한 호출에서 처리하지만 **쿼리·claim 컬럼이 서로 다르다**:

| 창 | 대상 | claim 컬럼 | 코드 |
|---|---|---|---|
| `REMINDER_WINDOW_MIN`(30분) | 디스코드 **채널** 웹훅 | `custom_games.reminder_sent_at` | 라우트 본문(기존) |
| `PUSH_REMINDER_WINDOW_MIN`(60분) | 참가자 **개인 기기** 웹 푸시 | `custom_games.push_reminder_sent_at` | `lib/push/sendGameReminders.ts` |

기존 select 에 `push_reminder_sent_at` 을 **절대 추가하지 않는다** — 마이그레이션 미적용 환경에서
42703 이 나 30분 디스코드 알림이 통째로 죽는다. 푸시 함수는 라우트에서 try/catch 로 감싸 호출한다.

- **대상자 = 확정 인원 ∪ 주최자.** 대기열은 저장하지 않으므로 `splitParticipants` +
  `effectiveMemberCapacity` 로 파생한다(재구현 금지). 대기자는 그 시각에 플레이하지 않아
  알림이 오정보가 되므로 제외 — 정책은 `PUSH_TO_WAITLIST = false` 상수 1줄로 뒤집는다.
- **구독 0건이어도 claim 은 수행한다.** 매 폴링마다 같은 내전을 재조회하는 낭비를 막는다.
- **410/404 응답은 만료 구독**이므로 `push_subscriptions` 에서 자동 삭제한다.
- VAPID 3종 중 하나라도 없으면 푸시 단계 **전체 skip**(`push_skipped:'vapid_not_configured'`)이고
  **claim 하지 않는다** — 나중에 키를 넣으면 그대로 동작한다.
- 키 생성: `npx web-push generate-vapid-keys` → **Vercel 서버 환경변수로만** 등록.
  ⚠ 키를 교체하면 기존 구독이 전부 무효가 된다(410 으로 자동 정리되지만 재구독 필요). 한 번 정하면 고정.
- `web-push` 는 node `crypto` 를 쓰므로 사용 라우트에 `export const runtime = 'nodejs'` 를 명시한다.
  `lib/push/webPush.ts` 는 `import 'server-only'` — 개인키가 클라 번들에 새면 안 된다.

**PWA:** `app/manifest.ts`(→ `/manifest.webmanifest`) + `public/sw.js` + `app/components/PwaServiceWorker.tsx`.
아이콘은 `npm run gen:pwa-icons`(sharp 는 next 전이 의존 — 런타임 의존성 추가 0)로 `public/images/brand/meonjongbyeol.png`
(먼종별 컨셉 이미지)에서 생성해 `public/icons/`·`app/icon.png`·`app/apple-icon.png` 에 **커밋**한다(생성물 커밋 패턴).
원본 이미지는 덮어쓰지 않는다. 작은 크기(파비콘·배지)는 캐릭터 얼굴만 크롭한다.

> **proxy 무수정:** `proxy.ts` matcher 의 "확장자 있는 요청 제외" 규칙 덕에 `/sw.js`,
> `/manifest.webmanifest`, `/icons/*.png` 는 미로그인에서도 200 이다.
> `/api/me/push-subscription` 은 세션이 필요하므로 **BYPASS_PATHS 에 넣지 않는다.**

**⚠ iOS 제약:** iOS/iPadOS 는 **홈 화면에 추가한 PWA 안에서만** 웹 푸시를 지원한다(16.4+).
Safari 탭에는 `window.PushManager` 자체가 없다. `PushNotifyToggle` 이 `isIos && !isStandalone` 을
감지해 토글 대신 설치 안내를 띄운다(미지원 브라우저·공개키 미설정이면 아예 렌더하지 않는다).

**구독 상태의 진실은 브라우저의 `pushManager.getSubscription()`** 이다. 서버 GET 을 따로 두면
기기별 진실과 어긋나므로 만들지 않고, 마운트 시 멱등 POST 로만 재동기화한다.
마운트 POST 가 401(세션 만료)/400(멤버 없음)이면 안내 + 켜기만 비활성(끄기는 허용), 503 이면 토글을 숨긴다.
마운트 시 로컬 구독을 지우지 않는다.

- **켜기 POST 실패 시 이번 호출이 새로 만든 구독만 롤백(`unsubscribe`)한다** — 서버에 없는 로컬 구독이
  남으면 토글은 켜져 보이는데 알림은 오지 않는다.
- **로그아웃 시 구독 해제:** `useViewer().logout`(`app/components/nav/useViewer.ts`)이 `signOut` **전에** `cleanupPushSubscription()` 을 호출한다
  (서버 DELETE 가 세션의 `member_id` 조건이라 signOut 뒤에는 지울 수 없다). `serviceWorker.ready` 는
  등록 실패 시 영원히 pending 이므로 `getRegistration()` 만 쓴다. 실패·타임아웃이어도 로그아웃은 진행한다.

### Discord 길드 로그인 게이트 — `NEXT_PUBLIC_DISCORD_GUILD_ID`

특정 Discord 서버(길드) 멤버만 로그인하도록 막는 스위치. 상수는 `lib/constants/features.ts` → `GUILD_GATE_ID`.
값이 있으면 게이트 ON, 비우면 OFF(아무 Discord 계정 로그인 가능 — 기존 동작). 서버를 바꾸려면 값만 교체한다.
길드 ID는 공개 식별자라 `NEXT_PUBLIC_` 이어도 비밀 노출이 아니다 — **실제 강제는 서버측 콜백에서 한다**.

- **방식 A(봇 불필요):** OAuth `guilds` 스코프. `app/login/page.tsx`가 게이트 ON일 때만
  `scopes: 'identify email guilds'`를 요청하고, `app/auth/callback/route.ts`가
  `session.provider_token`으로 `GET /users/@me/guilds`를 호출해 길드 소속을 확인한다.
- **fail-closed:** provider_token 없음(스코프 누락)·비멤버·4xx면 차단, 5xx/네트워크 오류면
  재시도 가능 안내로 구분해 차단. 차단 시 `auth.signOut()` 후 `/login?error=...`.
- 길드 확인은 **계정 연결·아바타 동기화보다 먼저** 수행한다(비멤버의 members 행을 건드리지 않도록).
- 클라이언트 스코프 요청은 토큰 획득용일 뿐이다. 콜백이 유일한 강제 지점이며 토큰은 로그에 남기지 않는다.

### Riot PUUID 규칙 (LoL 키 단일)

Riot 키는 `RIOT_LOL_API_KEY` **하나만** 쓴다(`RIOT_API_KEY`·`RIOT_TFT_*`는 사용 중단, TFT 키 폴백 금지).
`lib/riot/api.ts`의 `riotFetch(url)`는 호출 시점에 `RIOT_LOL_API_KEY`를 읽어 `X-Riot-Token` 헤더로만 보낸다.

**⚠ PUUID는 API 키에 종속된 암호문이다.** 같은 계정이라도 키가 다르면 값이 다르고, 교차 사용하면 `400 Exception decrypting`.

- `riot_accounts.lol_puuid` = **유일하게 쓰는 PUUID**(LoL 키 기준). 등록 검증(`verifyRiotId`) 결과를 즉시 저장하고,
  null이면 동기화가 lazy 발급, 400이면 **1회** 재발급한다(키 교체 시 자동 복구)
- `riot_accounts.riot_puuid` / `members.riot_puuid` = 레거시(TFT 키) **동결 값**. 새 값을 쓰지 않는다.
  Riot ID를 바꿀 때만 `riot_accounts.riot_puuid`를 null로 지운다. `synced` 판정 폴백 외에는 읽지 않으며 미러링 대상도 아니다
- `lib/members/primaryAccount.ts`의 `CLEARED_RANK_COLUMNS`에 `lol_puuid: null`이 반드시 있어야 한다(보안 불변식).
  빠지면 Riot ID를 바꿔도 옛 lol_puuid가 남아 **남의 LoL 랭크가 내 랭킹에 표시**된다.
  Riot ID 수정 경로는 cleared를 펼친 **뒤에** 검증된 새 값을 덮어쓴다: `{ ...CLEARED_RANK_COLUMNS, lol_puuid: resolved }`
- 키가 없으면 `hasLolKey()`가 false → 등록 검증은 `unverified`(등록 허용), 동기화는 `SyncError 500`
  ('LoL API를 사용할 수 없습니다'). 403도 같은 degrade(경고는 `warnOnce`로 1회)
- 후속 과제: 같은 계정 중복 등록 방어가 `(lower(game_name), lower(tagline))` 유니크만 남았다 → `lol_puuid` 부분 유니크 인덱스 검토

**최초 동기화 전까지 `/lol`은 빈 상태(EmptyState)가 정상이다.**

## 디자인 시스템

Unity Dashboard "Elegant Dark" 톤의 **보라 다크**(기본 OS 추종) + **라벤더 라이트**. 토글은 `ThemeToggle`(html `data-theme`).

**토큰 규칙:** `app/globals.css`의 `@theme`(inline 금지)에 이름만 등록하고, 실제 값은 `:root,[data-theme='light']`와
`[data-theme='dark']`에서 정의한다. **새 토큰은 세 곳 모두에 추가한다**(`:root`는 FOUC 폴백).
`dark:` variant는 `@custom-variant dark`로 `data-theme=dark`에 연결돼 있다(OS 설정이 아니다).
globals.css 주석에 임의값 대괄호 클래스 표기를 적지 않는다(Tailwind가 주석도 스캔한다).

| 역할 | 토큰 |
|---|---|
| 배경/면 | `canvas` · `surface` · `surface-2` · `surface-raised` · `panel` · `sidebar` · `line` · `line-strong` · `shadow` |
| 텍스트 | `fg` > `muted` > `subtle` > `faint`(**장식 전용, 본문 금지**) |
| 역할 필/글자 | `brand`/`brand-ink` · `ok`/`ok-ink` · `warn`/`warn-ink` · `danger`/`danger-ink` · `info`/`info-ink` |
| 장식 | `accent`(알림 점 — **위에 흰 글자 금지**) · `star`(별) · `hero-from/via/to`(히어로 그라데이션) · `discord`/`discord-hover` |

**대비 규칙:** 흰 글자 필은 `bg-brand`(#6C5DD3, 약 5.1:1)만. 히어로 위 텍스트는 흰색 투명도 80% 이상.
포커스 링(`focus-visible:ring-brand/40`)은 지우지 않는다. 숫자·라틴 헤드라인만 `font-display`(Poppins), 한글은 시스템 고딕.

**하드코딩 금지:** `indigo|slate|gray|zinc|neutral|stone-NNN` 팔레트와 대괄호 hex 임의값 색 클래스는 0건이어야 한다. `violet|purple|yellow|blue|cyan|orange|sky|emerald|red|amber|rose|pink`는
고유 의미색 화이트리스트에서만 쓰고 맵 위에 `// palette: tier|calendar|cosmetic` 주석을 단다:
`lib/customGames/display.ts` LOL_TIER_TEXT, `app/lol/page.tsx` TIER_STYLES, `app/admin/members/sync/page.tsx` TIER_BADGE,
`app/components/calendar/HomeCalendar.tsx` CHIP, `app/shop/CosmeticPreviewModal.tsx` 메달, `globals.css` 코스메틱 효과.
공통 className은 `lib/ui/styles.ts`(CARD·PANEL·INPUT·BTN_*·HERO·BTN_ON_HERO·STAT_*·LIST_*·PILL*·NAV_*)를 우선 쓴다.

**내비 구조:** lg+ = 왼쪽 고정 `Sidebar`(z-40) + 본문 `DesktopTopbar`. lg 미만 = `MobileTopBar`(sticky, z-50) + `MobileTabBar`(fixed bottom, z-40).
모달은 z-50 이상. 숨김 경로(`/admin`·`/login`·`/auth`·`/og`) 판정은 `nav/navItems.ts`의 `isNavHidden()` 한 곳 — 여기서는 `lg:pl-64`도 주지 않는다.
**`useViewer()`·`usePointBalance()`는 `AppShell`에서 단 1회만 호출하고 props로 내린다** — 사이드바·상단바가 CSS로만 숨겨져
동시에 마운트되므로 각자 호출하면 `/api/admin/me`·출석 POST·`onAuthStateChange`가 2배가 된다.
탭바가 `lg:hidden`이므로 `SHELL`·`TABBAR_SAFE_PB`의 하단 여백도 lg 기준이다. 페이지는 자체 sticky 헤더를 두지 않는다.

**캐릭터:** `public/images/brand/meonjongbyeol.png`는 흰 배경 불투명 PNG다. 배경 제거·mix-blend를 시도하지 말고
`BrandSticker`(흰 스티커 카드)로만 쓴다. `HeroBanner`의 `priority`는 첫 화면이 배너인 홈·온보딩만.
`HeroBanner`/`BrandSticker`는 ISR 페이지에서도 import 되므로 `'use client'`·훅·세션 접근 금지, `stats`에는 공개 집계만 넘긴다.

## Supabase 클라이언트 사용 규칙

| 클라이언트 | import 위치 | 사용처 |
|---|---|---|
| `supabase` | `@/lib/supabase` | Server Component (anon, 공개 데이터) |
| `supabaseClient` | `@/lib/supabase` | Client Component (브라우저, 인증 포함) |
| `supabaseService` | `@/lib/supabase/service` | Server Component / Server Action (service role) |
| `supabaseAdmin` | `@/lib/supabaseAdmin` | API Route / Sync 로직 (service role) |

> **주의:** `supabaseService`, `supabaseAdmin`은 service role key를 사용하므로
> 절대 클라이언트 컴포넌트에서 import하지 않는다.

## RLS (Row Level Security)

**모든 public 테이블에 RLS가 적용되어 있다.** anon 키는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 브라우저에 공개되므로,
RLS가 없으면 누구나 anon 키로 테이블을 직접 읽고 쓸 수 있다. 마이그레이션: `scripts/sql/20260909_enable_rls_public_tables.sql`.

- **A 그룹(공개 읽기):** `members`, `seasons`, `profile_frames` — `enable RLS` + `select using(true)` 정책만.
  공개 페이지가 anon으로 SELECT하므로 읽기는 열어두고, **쓰기 정책은 만들지 않아 브라우저 쓰기를 차단**한다.
- **B 그룹(서버 전용):** `admins`, `hall_of_fame`, `tft_matches`, `tft_match_participants`, `member_rank_history`,
  `sync_logs`, `custom_game_rounds`, `custom_game_results`, `custom_game_guests`, `custom_game_guest_results`,
  `custom_game_teams`, `push_subscriptions` — `enable RLS`만, **정책 0개**. anon/authenticated 완전 차단, service role만 접근.
  (`push_subscriptions`에 self-INSERT 정책을 주면 사용자가 콘솔에서 남의 `member_id`로 구독을 심어
  타인 기기로 알림을 보내거나 남의 구독을 지울 수 있다 — `members` self-UPDATE 금지와 같은 이유다.)
  (`admins`는 공개 select 정책조차 두지 않는다 — 관리자 명단은 anon 에게 노출되면 안 된다.)
- **service role**(`supabaseService`/`supabaseAdmin`)은 RLS를 우회하므로 서버 라우트·Server Action·Sync는 무영향.
- **`admins`는 브라우저에서 직접 읽지 않는다.** 관리자 판정은 서버 라우트 `GET /api/admin/me`로만 한다
  (`app/components/nav/useViewer.ts`가 `res.ok && body.ok === true`로 판정). `admins`에 직접 쿼리하지 말 것.

> **새 public 테이블 추가 시 규칙:** 반드시 `enable row level security`를 켜고,
> 공개 페이지가 anon으로 읽어야 하면 `for select ... using(true)` 정책을 준다(쓰기 정책은 만들지 않는다).
> 서버 전용이면 정책 0개로 둔다. 쓰기는 항상 service role(서버 라우트/Server Action) 경유.

## 동기화 흐름

### ★ 동기화 재실행·중복 실행 가드

- **`mirrorPrimaryToMember()` 이후에는 throw 하지 않는다.** 칭호 갱신·승급 알림은 try/catch 로 감싼다.
  throw 하면 `syncOneMember` 재시도가 doSync 전체를 다시 돌려 2회차의 이전값(`member.lol_tier`)이 이미 새 값이 되고
  승급 알림이 무력화된다.
- **`syncOneMember`는 조건부 claim** 이다: `sync_status`가 running 이 아니거나 `last_sync_started_at`이
  `STUCK_RUNNING_MINUTES`(30, `lib/sync/syncMember.ts` export — sync-all 과 공유) 이전일 때만 running 으로 전이.
  지면 `{ ok:false, status:409, skipped:'in_progress' }` — **실패가 아니다**(sync_logs 'skipped', approve 경고 없음,
  수동 API 는 `200 { skipped:true, reason:'in_progress' }`).
- 수동 동기화 쿨다운 기준은 `max(last_synced_at, last_sync_started_at)` — 실패하는 멤버도 5분 1회로 묶인다.

```
[프론트 동기화 버튼]
  → POST /api/members/[id]/sync
      → 인증 체크 (로그인 필수 + 승인 멤버 / 본인 소유 멤버 / 관리자)
      → 쿨다운 체크 (MIN_SYNC_INTERVAL_SEC)
      → syncOneMember() — 재시도 래퍼 (최대 5회, 지수 백오프)
          → doSyncMember()  (대표 계정만)
              → fetchLolPuuid()           Riot Account API (LoL 키) — lol_puuid null일 때만
              → fetchLolLeaguesByPuuid()  Riot LoL League API (LoL 키 + lol_puuid, 400이면 1회 재발급)
          → riot_accounts.lol_* 업데이트 → mirrorPrimaryToMember() → members 캐시
          → refreshMemberTitles() / notifyTierPromotion() (실패 무시)
      → writeSyncLog() — sync_logs 테이블 기록

[외부 크론(cron-job.org) 30분~1시간 주기]
  → GET /api/admin/sync-all (Authorization: Bearer CRON_SECRET 또는 ADMIN_SYNC_TOKEN)
      → ★ after()로 배치를 백그라운드 예약하고 즉시 202 반환 (cron-job.org 30초 타임아웃 회피)
      → (stale AND not-running) OR stuck-running 멤버 배치 동기화
      → doCleanup=true: sync_logs TTL 정리 (success 7일, 나머지 30일)

[관리자 수동 실행]
  → POST /api/admin/sync-all (requireAdmin() 세션 체크)
      → 위와 동일한 배치 동기화, doCleanup=false

[스팀 — 외부 크론(cron-job.org) 매일]
  → GET /api/admin/sync-steam (Authorization: Bearer CRON_SECRET 또는 ADMIN_SYNC_TOKEN)
      → listSteamMembers()  status='approved' + steam_id64 not null
      → GetPlayerSummaries 1회(≤100명 배치)로 persona/avatar/visibility 갱신
      → visibility!==3 이면 보유 게임 캐시를 비우고 steam_sync_error='프로필 비공개'
      → GetOwnedGames(include_appinfo, playtime_2weeks 포함) → steam_apps upsert + steam_owned_games 교체
      → backfillAppDetails(): details_checked_at is null 인 앱만 소량 배치로 멀티플레이 판정
  → POST /api/admin/sync-steam 은 requireAdmin() 수동 실행 (동일 로직)
  → 스팀 최초 등록 시 POST /api/me/steam 이 해당 멤버 1명만 온디맨드 동기화

[관리자 승인]
  → POST /api/admin/members/[id]/approve
      → status='approved' 확정 후 syncOneMember() 직접 호출
      → 동기화 실패는 롤백하지 않고 syncWarning으로만 반환
```

## Riot API 인증 및 에러 처리

**인증:** `lib/riot/api.ts`의 `riotFetch()`가 모든 요청에 `X-Riot-Token: ${RIOT_LOL_API_KEY}` 헤더를 추가한다.
URL 쿼리 파라미터(`?api_key=`)로 전송하지 않는다 — 서버 로그 노출 방지.

**에러 처리:**
- `429`: `Retry-After` 헤더 존중, 없으면 30초 대기 후 재시도
- `502/503/504`: 재시도 가능 상태코드
- 나머지: 즉시 실패 처리
- `RiotApiError` 클래스 (`lib/riot/api.ts`), `SyncError` 클래스 (`lib/sync/syncMember.ts`)

## 코드 규칙

- **타입:** `any` 사용 금지. catch 블록은 `catch (e)` + `e instanceof Error ? e.message : 'fallback'` 패턴 사용
- **Supabase 쿼리:** 필요한 컬럼만 `select`로 지정 (Server Component에서 `*` 지양). 관계 테이블 조인은 `!inner` 임베디드 선택 사용 (N+1 방지)
- **API 입력 검증:** 관리자 API의 문자열 입력은 빈값 체크 + 최대 길이 제한 필수 (`member_name` 25자, `riot_game_name` 30자, `riot_tagline` 10자)
- **catch 패턴:**
  ```ts
  // ❌ 금지
  catch (e: any) { ... e.message ... }

  // ✅ 올바른 패턴
  catch (e) { someHandler(e instanceof Error ? e.message : '오류 발생') }
  ```
- **Server Action:** `lib/actions/` 폴더, 파일 상단에 `'use server'` 선언
- **Server Action 권한 체크:** 데이터 변경(insert/update/delete) Server Action은 반드시 함수 첫 줄에 `requireAdmin()` 호출. 미체크 시 인증 없이 DB 조작 가능.
  ```ts
  const { ok } = await requireAdmin()
  if (!ok) return { ok: false, message: '관리자 권한이 필요합니다.' }
  ```
- **Client Component:** 파일 상단에 `'use client'` 선언
- **이미지:** `<img>` 대신 `next/image`의 `<Image />` 사용 (외부 URL 허용 도메인: `**.supabase.co`)

## DB 주요 테이블

| 테이블 | 설명 |
|---|---|
| `members` | **사람** 1행. 로그인 연결(`discord_id`/`user_id`) + `status` 승인 워크플로 + **대표 계정 랭크 캐시**(`riot_game_name`/`riot_tagline`/`lol_*`). `tft_*`·`riot_puuid`는 레거시 동결 |
| `riot_accounts` | **계정** 1~3행 (`account_no` 1~3 슬롯 유니크). `is_primary`로 대표 지정. 계정별 실제 랭크값 보관 |
| `admins` | 관리자 계정 (`discord_id` 사전 등록, 첫 로그인 시 `user_id` 자동 연결) |
| `seasons` | (레거시 — 코드 미참조) 시즌 목록 |
| `hall_of_fame` | (레거시 — 추방 시 스냅샷 보존 외 코드 미참조) 시즌 마감 랭크 스냅샷 |
| `profile_frames` | 프로필 프레임 메타데이터 |
| `tft_matches` / `tft_match_participants` | (레거시 — 추방 시 정리 외 코드 미참조) TFT 매치 |
| `sync_logs` | 동기화 감사 로그 |
| `custom_games` | 내전 모집글 (`host_member_id`, `game_kind`, `game_kind_label`, `steam_app_id`, `capacity`, `scheduled_at`, `status`) |
| `custom_game_participants` | 참가 신청. **확정/대기 컬럼 없음** — `(joined_at, id)` 순번에서 파생 |
| `custom_game_guests` | 레거시 롤체 내전 게스트. 조회는 정원 계산(`effectiveMemberCapacity`)용으로만 유지 |
| `custom_game_rounds` / `_results` / `_guest_results` | (레거시 — 코드 미참조) TFT 내전 라운드·결과 |
| `custom_game_teams` | 롤 내전 팀/포지션 배정(`lol-teams`) |
| `steam_apps` | 스팀 앱 메타 + `is_multiplayer` 3-값 캐시 (true/false/null=분류 미확인). 앱당 1회 조회 후 영구 보관 |
| `steam_owned_games` | 멤버별 보유 게임 + `playtime_forever`/`playtime_2weeks`(분). `/steam`이 읽는 유일한 소스 |
| `push_subscriptions` | 웹 푸시 구독. **기기(브라우저)당 1행**, `endpoint` 전역 유니크, `member_id` FK cascade. RLS 정책 0개 |

`members.discord_avatar_url` (20260729_discord_avatar.sql): Discord OAuth 세션의
`user_metadata.avatar_url` 원문. 로그인마다 `app/auth/callback/route.ts`가 갱신한다.

**스팀 RPC (전부 `security definer` + `revoke ... from public, anon, authenticated` — 서버 라우트 전용):**

| 함수 | 파일 | 용도 |
|---|---|---|
| `steam_game_options(q, mp_only, limit)` | `20260727_custom_game_steam.sql` | 내전 스팀 게임 후보 (보유자 수 desc) |
| `steam_shared_with_member(member_id, mp_only)` | `20260728_steam_shared_games.sql` | 나와 겹치는 사람 요약 + 미리보기 3개 |
| `steam_shared_games_detail(member_id, other_id, mp_only, limit)` | 〃 | 상대 1명과 겹치는 전체 게임 |

세 함수 모두 `where m.status='approved' and m.steam_id64 is not null`을 내장하고,
`mp_only=true`는 `is_multiplayer = false`만 제외한다(`null`=분류 미확인은 남긴다).
`authenticated`에 실행권을 남기면 브라우저에서 임의의 `p_member_id`로 남의 목록을 조회할 수 있다.

`members.steam_*` (20260724_steam.sql): `steam_id64`(유니크), `steam_persona`, `steam_avatar_url`,
`steam_visibility`(=`communityvisibilitystate`, 3이면 공개), `steam_linked_at`, `steam_synced_at`, `steam_sync_error`.

## 멤버 자가 등록 / 승인 워크플로

`members.status`는 `'pending' | 'approved' | 'rejected'` 세 값만 가진다 (`MemberStatus`).

```
[사용자] /profile → MemberSelfForm → POST /api/me/member
    → 대상 행은 오직 세션 user_id로 특정 (body의 id는 절대 신뢰하지 않음)
    → member_name / riot_game_name / riot_tagline 3개 컬럼만 화이트리스트로 수용
    → 항상 status='pending'. 승인된 멤버가 Riot ID를 바꿔도 pending 복귀
       (REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE 상수로 제어 — 랭킹 조작 방지)
    → 이 폼이 다루는 Riot ID는 항상 **대표 계정**이다. ensurePrimaryAccount()로
       riot_accounts slot1을 함께 정합화하고 mirrorPrimaryToMember()로 캐시를 재기록한다
       (부계정은 /api/me/riot-accounts 담당)

[관리자] /admin/members/control
    → GET  /api/admin/members[?status=pending]  대기/전체 탭, 로그인 연결 배지
    → POST /api/admin/members/[id]/approve      승인 + 즉시 동기화
    → POST /api/admin/members/[id]/reject       거절 + 사유(≤200자)
    → DELETE /api/admin/members/[id]            추방 (body.confirmName === member_name 필수)
```

## 다중 라이엇 계정 · 대표 계정 (`riot_accounts`)

`scripts/sql/20260726_riot_accounts.sql`. 멤버당 라이엇 계정 최대 3개, 그중 **대표 1개만** 공개 랭킹에 노출된다.
`scripts/sql/20260729_lol_puuid.sql` — `riot_accounts.lol_puuid` (LoL 키 전용 PUUID). 인덱스 0개, 백필 불가.

### members는 계속 1인 1행이다 ★

`members`가 사람 축을 유지하므로 `getViewerMember()`·`findMyMember()`의 `.maybeSingle()`,
`unique(custom_game_id, member_id)`, `members.steam_id64` 유니크가 전부 무변경으로 유효하다.
`members.riot_game_name`/`riot_tagline`/`lol_*`는 **대표 계정 값의 비정규화 캐시**다.
덕분에 `/lol`, `/steam`, 내전의 공개 쿼리에 대표 계정 필터를 한 줄도 추가하지 않는다.

> 불변식이 코드가 아니라 **데이터**에 걸린다: `members.lol_* == 대표 riot_accounts.lol_*`.
> **캐시 갱신은 `lib/members/primaryAccount.ts`의 `mirrorPrimaryToMember()` 한 곳에서만 한다.**
> 다른 곳에서 `members.lol_*`를 직접 쓰면 랭킹에 옛 값이 남는다.

### 제약은 전부 DB가 강제한다

| 규칙 | 방어선 |
|---|---|
| 최대 3개 | `unique (member_id, account_no)` + `check (account_no between 1 and 3)`. 앱의 select→insert는 동시요청에 반드시 뚫린다 |
| 대표 ≤1 | `unique (member_id) where is_primary` |
| 타인 계정 선점 | `unique (riot_puuid)`, `unique (lower(game_name), lower(tagline))` |
| 대표 ≥1 | **강제하지 않는다.** 아래 파생 규칙으로 "대표 없음"을 관측 불가능하게 만든다 |

전부 `23505` → **409** 매핑.

### 대표는 파생한다 — 자동 승격 UPDATE를 만들지 않는다 ★

`is_primary desc, account_no asc` 정렬의 첫 행이 대표다 (`pickPrimaryAccount()` / 뷰 `member_primary_account`).
`is_primary`가 전부 false여도 `account_no` 최솟값이 대표가 되므로 대표 삭제 시 승격 UPDATE가 필요 없고,
따라서 승격 경합도 존재하지 않는다(내전 대기열과 같은 철학).
대표 **전환**만은 파생 불가라 `is_primary` 플래그가 필요하며,
부분 유니크 인덱스가 비지연이라 해제→지정 2문장을 `set_primary_riot_account()` RPC 한 트랜잭션으로 처리한다.

### 재승인 정책

| 행위 | `members.status` |
|---|---|
| 부계정 추가 / 부계정 수정 / 부계정 삭제 | **불변** (공개 노출값이 안 바뀐다) |
| 대표 계정의 Riot ID **문자열** 수정 | `REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE = true` → **pending 복귀** |
| 대표 계정 **전환**(다른 계정을 대표로) | `REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH = false` → **불변**(운영 결정) |
| 대표 계정 삭제(파생 대표 교체) | 위 상수를 공유 |
| **관리자**가 `/admin/members/control` '계정' 모달에서 한 모든 조작 | **불변** — 대신 대표가 바뀌면 즉시 동기화(rejected 제외) + `sync_logs` manual |

두 상수 모두 `lib/members/primaryAccount.ts`에 있다. 재승인은 `lib/members/riotAccountOps.ts`가 `actor==='self'`일 때만 적용한다. 정책 반전은 상수 1개 변경으로 끝난다.
`PRIMARY_SWITCH`를 `true`로 올리면 "부계정 추가 → 대표 전환"으로 심사를 우회하는 경로가 닫힌다.
**pending 복귀는 반드시 캐시 갱신과 짝으로 수행한다** — 옛 값을 남기면 승인 순간 "심사한 계정 ≠ 표시되는 값"이 된다.

**마지막 1개 계정은 삭제 거부(409).** 0개가 되면 캐시를 갱신할 근거가 사라져 랭킹에 옛 값이 영구히 남는다.

**RLS:** `riot_accounts`는 **select 정책만** 둔다. self-UPDATE 정책이 있으면 사용자가 콘솔에서
`is_primary`/`lol_tier`를 직접 바꿔 위 재승인 규칙을 통째로 우회한다.

### 동기화 부하

- **대표 계정의 LoL 솔로랭크만** 조회한다. 부계정은 동기화하지 않는다(등록·검증만, 랭크 미표시)
- 정상 상태(lol_puuid 캐시 있음)에서 멤버당 Riot 호출 1회. 매치·랭크 히스토리 수집 없음
- 개별 동기화 쿨다운은 `members.last_synced_at`(사람 단위) 기준 유지
- **등록 시 Riot ID 검증:** `lib/riot/verifyRiotId.ts`(`server-only`, LoL 키). 404/400 → **400 거절**(DB 무변경),
  Riot 장애(429·5xx·403·키 미설정)는 등록을 막지 않고 `lol_puuid=null`로 저장. `/api/me/riot-accounts` POST·PATCH는
  해석한 puuid 를 `lol_puuid`에 즉시 저장한다. `/api/me/member`·`/api/admin/members/create|update`는 Riot ID가 **실제로 바뀔 때만**
  존재 여부만 확인한다(lol_puuid 는 동기화가 lazy 발급)
- **sync-all 선정:** `status≠'rejected'` 중 (stale ∧ running·failed 아님) ∪ (stale ∧ failed ∧ 마지막 시도가
  `SYNC_FAILED_BACKOFF_HOURS`(기본 3) 이전) ∪ (30분+ stuck running). 정렬은 `last_sync_started_at asc nulls first, id`.
  **id 커서는 쓰지 않는다**(요청의 `cursorId`는 무시). 관리자 화면 루프는 최대 50회로 방어

### 마이그레이션 미적용 시 degrade

테이블 부재는 Postgres `42P01` / PostgREST `PGRST205`로 나타난다.
`isMissingTableError()`가 이를 잡아
`/profile`·`GET /api/me/riot-accounts`는 500이 아니라 "마이그레이션 필요" 안내,
쓰기 라우트는 503, `doSyncMember()`는 `SyncError 500`(lol_puuid 를 캐시할 곳이 없어 레거시 단일 계정 경로는 삭제됐다).

**노출 필터:** `app/lol/page.tsx`, `app/steam/page.tsx`, `lib/discord/memberActivity.ts`(includeUnlinked:false),
그리고 `lib/sync/syncSteamMember.ts`의 `listSteamMembers()`에서 `.eq('status','approved')`.
이 지점들이 미승인 멤버 차단의 핵심이므로 members를 조회하는 공개 화면·집계를 추가할 때 반드시 함께 적용한다.
내전은 화면에서 members를 직접 조회하지 않고 서버가 `isApprovedMember()`로 강제한다(아래 참조).

**추방(완전 삭제):** FK의 `ON DELETE` 설정에 의존하지 않고
`app/api/admin/members/[id]/route.ts`의 `CHILD_TABLES`(`riot_accounts` 포함)를 명시적으로 정리한 뒤 members를 삭제한다.
`hall_of_fame`(레거시)만 예외로 삭제하지 않고 `member_id=null` + 이름 스냅샷을 남긴다.

**RLS 주의:** `members`에는 self-UPDATE 정책을 두지 않는다. RLS는 행 단위라 컬럼을 제한할 수 없어,
정책이 있으면 사용자가 콘솔에서 자기 `status`를 `approved`로 바꿀 수 있다.
정당한 self-UPDATE(프로필 이미지/프레임, Riot ID 신청)는 전부 서버 라우트에서 service role로 수행한다.

## 스팀 페이지 (`/steam`)

**섹션 구성(2026-11-25 개편):** HeroBanner(공개 집계 stats) → lg 2단 그리드.
- 오른쪽 사이드: `SteamLinkForm variant="compact"`(내 스팀) · `SteamPresence variant="compact"`(지금 접속 중, 실시간) · `RecentPlayedList`(최근 2주 TOP5 + 전체 보기)
- 왼쪽 메인 `SteamContentTabs` 3탭: **함께 할 게임**(`SharedGamesGrid`, 2명 이상 보유·서버 상한 24·처음 12개) / **나와 같은 게임**(`SharedWithMe`, 개인화) / **스팀 할인**
- 모바일 순서: 내 스팀 → 접속 중 → 탭 → 최근 2주. 비공개 멤버 안내·마지막 동기화는 하단 메타 한 줄.
- `SteamLinkForm`/`SteamPresence`의 기본 variant(card/default)는 온보딩·홈이 그대로 쓴다.

### "지금 스팀 접속 중" (`SteamPresence.tsx` → `/api/steam-presence`)

presence 는 **실시간이자 세션 인증이 필요**하므로 `revalidate=300` 페이지에 서버 렌더로 넣을 수 없다.
`SharedWithMe` 와 동일하게 Client → `force-dynamic` API 로만 흐른다.

- **DB 저장 금지.** presence 는 휘발성이라 컬럼을 만들면 크론이 하루 지난 "온라인"을 박제한다 → 마이그레이션 불필요
- 캐시는 `lib/steam/presence.ts` 의 모듈 스코프 단일 엔트리(`STEAM_PRESENCE_TTL_MS`, 기본 60초).
  뷰어가 몇 명이든 Steam 호출은 TTL 당 1회. 동시 요청은 in-flight 프라미스를 공유한다
- 클라이언트는 `document.visibilityState === 'visible'` 일 때만 60초 폴링 (`visibilitychange` 연동)
- 미로그인(401)·미승인(403)이면 섹션 자체를 **렌더하지 않는다**

**⚠ 오정보 방지 — 3-상태로 나눈다.** `personastate` 는 프로필이 비공개면 실제 상태와 무관하게 **항상 0** 이다.
이를 "오프라인"으로 단정하면 거짓이다.

| 조건 | state | 표시 |
|---|---|---|
| `communityvisibilitystate ≠ 3` (또는 DB `steam_visibility ≠ 3`) | `unavailable` | "표시 불가 — 프로필 비공개" |
| `personastate` 1~6 | `online` | 온라인 점 + `gameextrainfo` 게임명 배지 우선 |
| `personastate` 0 | `offline` | 미표시 |

`personastate`: 0=오프라인 1=온라인 2=바쁨 3=자리비움 4=취침 5=거래희망 6=플레이희망.
`gameextrainfo` 는 "게임 상세정보 공개"일 때만 내려온다 — 없다고 게임 중이 아닌 것은 아니다.

> "보유 게임 수 랭킹" / "총 플레이타임 랭킹"은 **제거되었다.** `RankList` 컴포넌트와
> `MemberStat`의 `gameCount`/`totalMinutes`도 함께 삭제됐다.
> `formatHours()`는 "최근 2주 플레이"가 계속 쓰므로 **삭제하지 않는다.**

### ★ ISR × 개인화 분리 (위반 금지)

`app/steam/page.tsx`는 `revalidate = 300`이고 이는 **경로 단위 공유 캐시**다.
여기서 세션을 읽어 개인화하면 **A가 처음 만든 HTML이 B에게 서빙된다** — 사용자 간 데이터 유출이다.

- `app/steam/page.tsx`에서 `cookies()` / `createRouteClient()` / `auth.getUser()`를 **절대 호출하지 않는다**
- 개인화는 오직 `SharedWithMe.tsx`(Client) → `/api/steam/shared-with-me*`(`force-dynamic`) 경로로만 흐른다
- 페이지 전체를 `force-dynamic`으로 바꾸지 않는다. 공통 섹션(함께 할 수 있는 게임 / 최근 2주)은
  전원 동일한 데이터라 캐시가 정당하고, 매 요청마다 최대 20페이지 × 1000행을 재조회하게 된다
- 개인화 섹션이 실패해도 나머지 섹션은 정상 동작해야 한다 (Client Component라 구조적으로 격리됨)
- 스팀 연결/해제 직후 `SteamLinkForm` 이 `steam-link-changed` 윈도 이벤트(`lib/client/steamLinkEvents.ts`)를
  보내고 `SharedWithMe`·`SteamPresence` 가 재조회한다. `router.refresh()` 는 Client Component 의 자체 fetch 를 다시 돌리지 않는다

### 개인화 섹션 상태별 표시 (`lib/members/steamViewer.ts`)

| 뷰어 상태 | API | 표시 |
|---|---|---|
| 미로그인 | 401 | 로그인 안내 (`/login`) |
| 멤버 행 없음 | 200 `state='no_member'` | 멤버 등록 안내 (`/profile`) |
| `status ≠ approved` | **403** | 승인 후 이용 안내 |
| 스팀 미등록 | 200 `state='no_steam'` | 스팀 ID 등록 안내 |
| `steam_visibility ≠ 3` | 200 `state='private'` | 비공개라 불러올 수 없다고 **이유를 명시** |
| RPC 미적용 | 200 `migration_required` | "기능 준비 중" |

상세 라우트(`/[memberId]`)의 path param은 **상대방 id 뿐**이다. 내 `member_id`는 항상 세션에서 유도하므로
제3자가 남의 조합(A↔B)을 조회할 수 없다.

## 내전 (custom games)

### `game_kind` vs `game_type` — 절대 합치지 말 것

| 컬럼 | 값 | 의미 |
|---|---|---|
| `game_kind` | `'tft' \| 'lol' \| 'steam' \| 'etc'` | **어떤 게임**인가. `'tft'`는 **레거시 표시 전용** — 생성은 `CREATABLE_GAME_KINDS`(lol/steam/etc)만 |
| `game_kind_label` | text ≤30자 | `'etc'`=**필수**, `'steam'`=**선택**(게임 미정 모집 허용), 그 외=반드시 null. CHECK로 상호 강제 |
| `steam_app_id` | int | `game_kind='steam'` 전용. 캡슐 이미지 표시용 스냅샷. **`steam_apps(appid)`로 FK를 걸지 않는다**(백필 전 앱 때문에 내전 생성이 실패하면 안 된다). 이름은 `game_kind_label`에 별도 스냅샷 |
| `game_type` | `'solo' \| 'team'` | 레거시 TFT **경기 방식**. 신규 생성은 항상 `'solo'` |

**롤체(tft) 내전은 더 이상 만들 수 없다.** `parseGameKind(..., { allowLegacyTft })`가 tft 를 400("롤체 내전은 더 이상 만들 수 없습니다")으로 거부한다.
기존 tft 행 PATCH(제목·일정·정원)만 `allowLegacyTft: game.game_kind === 'tft' && (body.game_kind 미지정 || 'tft')`로 통과시킨다.
rounds/teams/guests API 와 `rejectNonTftGame`은 삭제됐다(→ 404). 상세 화면은 tft 행에 "롤체 내전(종료된 기능)" 안내만 보여준다.

### 권한 규칙

```
생성   POST /api/custom-games            로그인 + members.status='approved' (관리자 여부 무관)
참가   POST|DELETE /[id]/join            로그인 + approved. 주최자는 취소 불가(삭제로 유도)
선점   POST|DELETE /[id]/lol-teams/claim  로그인 + approved + 확정 참가자 본인(세션). 협곡·모집 중만
관리   PATCH|DELETE /[id], /[id]/end,
      /[id]/lol-teams,
      /[id]/participants/[pid]           canManageGame() = 관리자 OR 주최자 본인
```

`lib/customGames/authorize.ts`
- `getViewerMember()` — 세션 `user_id`(→ `discord_id` fallback)로만 멤버를 해석한다.
  **요청 body의 어떤 member 식별자도 신뢰하지 않는다.**
- `canManageGame(game, viewerMemberId, isAdmin)` — `host_member_id`는 추방 시 null이 될 수 있으므로
  `null === null`로 통과하지 않도록 양쪽 null을 명시적으로 거부한다.
- `authorizeGameManage(gameId)` — 401/404/503/403 판정 후 `{ viewer, game }` 반환.

### 목록 상한 · 리마인더 재무장

- `GET /api/custom-games`는 활성(`ACTIVE_STATUSES`) 최신 100 + 종료·취소 최신 30만 반환한다(`fetchListRows`).
  31번째 이후 종료 내전은 목록에 없지만 상세 링크로는 접근된다. 4단계 컬럼 fallback 은 그대로다.
- PATCH 로 `scheduled_at`이 **실제로 바뀌면** `reminder_sent_at`/`push_reminder_sent_at`을 null 로 재무장한다.
  메인 patch 와 합치지 않고 컬럼별 별도 update + `isMissingColumnError` 무시 — 미적용 환경에서 일정 변경이 깨지지 않게.
- 30분 디스코드 임박 알림도 웹 푸시와 같이 `ACTIVE_STATUSES`(모집 중 + 진행 중)를 대상으로 한다.

### 내전 라이브 (Realtime · Presence · 번개) ★

마이그레이션: `scripts/sql/20260912_custom_game_realtime.sql` (publication 에 `custom_games`·`custom_game_participants`만 추가, 멱등).
미적용·WS 차단이어도 이벤트가 안 올 뿐 화면은 기존과 동일하다(최초 fetch 경로 무변경). "실시간 연결됨"을 단정 표시하지 않는다.

- **postgres_changes 는 재조회 트리거로만 쓴다.** payload 로 상태를 패치하지 않는다 — 대기열 파생·`can_manage`·`my_participation`은
  서버 API 만 계산한다. 디바운스 400ms + 지터 0~600ms, 실행 중 이벤트는 1회로 합치고, 탭이 숨겨져 있으면 visible 때 1회, 재연결 시 1회 catch-up.
- **topic 재사용 금지(R1).** realtime-js 는 같은 topic 의 기존(leaving 중) 채널을 돌려준다. postgres_changes 는 인스턴스 고유 topic,
  Presence(`custom-game:{id}` 고정)는 직전 `removeChannel` 완료를 모듈 Map 으로 기다린다.
- **라이브 재조회는 silent(R3).** 스피너·"갱신 중" 칩·오류 알림을 띄우지 않는다(404/403 만 화면 반영).
- **롤 팀 배정 draft 보호(R2).** 관리자가 저장 전 드래그 중이면(`lolDirtyRef`) 재조회를 보류하고 "새 변경사항 · 새로고침" 버튼만 띄운다.
- `custom_game_guests`·`custom_game_teams` 는 정책 0개(B 그룹)라 publication 에 넣지 않는다 → 게스트·팀 변경은 실시간 미반영(의도된 한계).
  두 테이블에 공개 select 정책을 열지 말 것. Realtime 을 위해 쓰기 정책을 추가하지 말 것.
- **Presence payload 는 `{ t }` 하나.** presence key 는 마운트마다 새 탭 id(sessionStorage 금지). 개인정보 금지.
- 목록 GET 의 `latest_joiner: { name, joined_at, is_me }`(활성 내전만)는 토스트용이며 **member_id 를 노출하지 않는다.**
- **홈 Island(R8):** `app/page.tsx`는 ISR 그대로(세션 금지) — 공개 인원 집계만 props 로 넘긴다. 시간 의존 UI(LIVE·카운트다운)는
  `useNow()`가 non-null(마운트 후)일 때만 렌더한다. 마운트 시 추가 조회 없음.

**'지금 바로'(번개) — 새 컬럼 없이 파생한다.** `isQuickGame()` = `scheduled_at - created_at ∈ [-10분, 30분+60초]`.
- 클라는 `{ quick: true, quick_start_min }`만 보낸다(5·10·20·30, 화이트리스트). **시각은 서버가** `quickScheduledAt()`으로 now+N분(분 올림).
- LIVE/만료는 표시 파생뿐(`quickGameState`) — status UPDATE 없음. 정원이 차면 만료 대신 기존 '마감'.
- 번개 생성 시 `reminder_sent_at`을 선점(에러 무시)해 30분 디스코드 임박 알림 중복을 막는다. `push_reminder_sent_at`은 건드리지 않는다.
- 트레이드오프: 일반 폼으로 30분 이내 일정도 번개로 표시되고, 일정 수정 시 분류가 바뀐다(수용).

### 롤 협곡 포지션 선점 (본인 슬롯) ★

마이그레이션: `scripts/sql/20260913_custom_game_lol_slot_claim.sql` (부분 유니크 `custom_game_teams_member_uniq` + RPC 3개). 새 컬럼·RLS·publication 변경 없음.

- **확정 참가자 본인**이 `POST|DELETE /api/custom-games/[id]/lol-teams/claim`으로 팀(`team_index` **1|2**)·포지션을 선점/이동/해제한다.
  대상 멤버는 세션(`getViewerMember`)에서만 해석 — body 의 member 식별자는 읽지 않는다. 로그인+approved, `lol_mode='rift'`, `status='recruiting'`만.
- RPC `claim_lol_slot` / `release_lol_slot` / `replace_lol_teams`는 전부 `security definer` + **service_role 전용**(revoke from public, anon, authenticated).
  같은 게임의 슬롯 쓰기는 `pg_advisory_xact_lock('lol_slots:'||game_id)`로 직렬화한다. `custom_games for update` 금지(참가 INSERT FK 와 충돌).
- **확정 판정은 서버 TS 단일 지점** `lib/customGames/lolSlots.ts`의 `getConfirmedMemberIds()`(게스트 정원 포함) → RPC 에 `p_confirmed`로 전달.
- **표시 필터 = replace 비교 필터.** 상세 GET·lol-teams GET 은 `round_number=1` + (외부인 또는 확정 멤버) 행만 반환(`filterConfirmedSlots`).
  `replace_lol_teams`의 현재 행 필터도 같은 규칙이다 — 어긋나면 관리자 저장이 영구 409 가 된다. 한쪽만 바꾸지 말 것.
- **관리자 저장 = 낙관적 동시성(새 컬럼 없음).** 클라가 로드 시점 `lol_teams`를 `expected`로 보내고(랜덤 포함, 미전송 400),
  다르면 409 `{conflict:true}` → 페이지는 draft 를 덮지 않고 새로고침 배너. RPC 미적용이면 기존 delete+insert 폴백, claim 은 503.
- 참가 취소·강퇴 성공 후 해당 멤버의 teams 행을 지운다(실패는 warn — 표시 필터가 실제 방어선).
- **실시간:** `custom_game_teams`는 B 그룹이라 postgres_changes 불가 → Presence 채널(`custom-game:{id}`)의 broadcast `teams-changed`(payload `{ t }`)로 알린다.
  수신은 `useCustomGamesRealtime().trigger` → 기존 디바운스·hidden 보류·R2·R3 재사용. 발신자는 self:false 라 직접 재조회. 위조 broadcast 는 재조회만 유발한다.
- 상세 GET 은 `my_slot: { team_index, position } | null`을 준다. 비관리자 협곡 화면은 `LolClaimBoard`, 관리자는 기존 `LolTeamAssignPanel`.

### 대기열은 저장하지 않고 순번에서 파생한다 ★

`custom_game_participants`에 `status('confirmed'|'waitlisted')` 컬럼을 **만들지 않는다.**
저장하면 취소마다 승격 UPDATE가 필요해지고, 동시 취소 2건이 같은 대기자를 중복 승격하거나
아무도 승격하지 못하는 경합이 생긴다. 앱 코드로는 막을 수 없다.

**채택: `(joined_at, id)` 정렬 상위 `capacity`명이 확정, 나머지가 대기** (`lib/customGames/waitlist.ts`).
- 취소 = DELETE 1건. 승격 로직이 존재하지 않으므로 승격 경합도 존재하지 않는다
- 정원 상/하향, 동시 취소, 취소+신청 동시 발생이 모두 자동으로 올바르다
- 게스트도 같은 정원을 소비한다 (`effectiveMemberCapacity(capacity, guestCount)`)

**DB 제약이 유일한 방어선인 곳:** `unique (custom_game_id, member_id)`.
앱의 select→insert는 더블클릭·동시요청에 반드시 뚫린다. 23505 → **409** 매핑.

**RLS:** `custom_games` / `custom_game_participants` 모두 **select 정책만** 둔다.
self-INSERT/DELETE 정책을 만들면 사용자가 콘솔에서 `joined_at`을 조작해 대기열을 새치기할 수 있다.

### API 목록

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/custom-games` | 목록 + `confirmed_count`/`waitlist_count`/`guest_count`/`host_member_name`/`can_manage`/`my_participation` |
| POST | `/api/custom-games` | 모집 생성. 주최자가 자동으로 첫 참가자 |
| GET | `/api/custom-games/[id]` | 상세 + `confirmed[]`/`waitlist[]`/`can_manage`/`my_participation` |
| PATCH | `/api/custom-games/[id]` | 수정 (화이트리스트 — `host_member_id`/`status`/`id`는 절대 안 바뀜) |
| DELETE | `/api/custom-games/[id]` | 삭제 |
| POST\|DELETE | `/api/custom-games/[id]/join` | 참가 신청 / 취소 |
| DELETE | `/api/custom-games/[id]/participants/[participantId]` | 강퇴 |
| POST | `/api/custom-games/[id]/end` | 종료 |
| GET | `/api/steam/game-options?q=&multiplayer_only=` | 스팀 게임 후보 (로그인 + approved, DB만 조회) |

**`my_participation` 필드 (목록·상세 GET, join POST 응답):** `position`(확정+대기 전체 1-based 순번, 하위호환) /
`confirmed` / `waitlist_position`(대기자일 때 1-based, 확정이면 `null`) / `is_host`(목록·상세만, UX용).
**대기 순번 표시는 `waitlist_position`만 사용한다** — `position`을 "대기 N번"으로 쓰면 확정 인원만큼 부풀려진다.
파생은 `lib/customGames/waitlist.ts`의 `participationPosition()` 한 곳(응답 시 계산만, 저장 금지).
`is_host`는 주최자 "참가 취소" 버튼 숨김용일 뿐이며 서버 join DELETE의 400 검사가 실제 방어선이다.

**생성/수정 요청 형식:**
`{ title, scheduled_date: "YYYY-MM-DD", scheduled_time: "HH:mm", capacity, game_kind, game_kind_label?, steam_app_id?, lol_mode? }` (game_kind 필수)

### 스팀 내전 게임 선택

`game_kind='steam'`이면 `steam_owned_games ⋈ steam_apps` 기반 후보 목록에서 고르거나
**직접 타이핑**할 수 있다(폴백은 항상 제공). **Steam Web API 호출 0건 — DB만 읽는다.**

| 경로 | `game_kind_label` | `steam_app_id` |
|---|---|---|
| 목록에서 선택 | 앱 이름 스냅샷 | `appid` |
| 직접 입력 | 입력한 이름 | `null` |
| 게임 미정 | `null` | `null` |

게임 검색 소스는 **2개**다.

| 소스 | API | 표시 | 기본 |
|---|---|---|---|
| 멤버 보유 게임 | `GET /api/steam/game-options` (DB, RPC) | `보유 N명` 배지 | **ON** |
| 스팀 전체 카탈로그 | `GET /api/steam-catalog/search` (외부 storesearch) | `스팀 스토어` 배지, 보유자 수 없음 | 세그먼트 토글 / 보유 결과 0건 시 유도 |

카탈로그에서 고른 앱은 `steam_apps` 에 행이 없을 수 있다.
`custom_games.steam_app_id` 에 FK 가 없으므로(20260727 STEP 1) 그대로 저장된다.
**고른 앱을 `steam_apps` 에 upsert 하지 않는다** — `backfillAppDetails()` 대상만 늘리고 얻는 게 없다.

이름을 함께 스냅샷으로 저장하므로 렌더에 `steam_apps` 조인이 필요 없다.
`steam_app_id`의 유일한 용도는 캡슐 이미지(`steamCapsuleUrl()` in `lib/customGames/display.ts`)다.
`game_kind`를 steam 이외로 바꾸면 `parseGameKind()`가 라벨·appid를 null로 만들고,
DB CHECK(`custom_games_steam_app_id_chk`)가 23514로 최종 차단한다.

### 타임존 — 클라이언트에서 절대 `new Date()`로 변환하지 않는다

`<input type="date">`/`<input type="time">` 값을 문자열 그대로 보내고,
서버의 `parseScheduledAt()`이 `new Date(\`${date}T${time}:00+09:00\`)`로 변환한다
(한국은 서머타임이 없어 고정 오프셋이 안전하다).
클라이언트에서 ISO로 변환하면 브라우저 로컬 타임존으로 해석되어 실제 일정과 어긋난다.
표시는 전부 `lib/customGames/display.ts`의 헬퍼(=`Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })`)로 고정한다.

> `lib/customGames/display.ts`는 클라이언트 컴포넌트도 import한다.
> server-only 모듈(`lib/customGames/game.ts`)을 여기서 import하면 안 된다.

### 남용 방지

| 벡터 | 대응 |
|---|---|
| 무한 모집글 | 동일 host의 `recruiting`+`in_progress` 동시 3개 제한 |
| 과거/먼 미래 날짜 | `now()-10분` ~ `now()+90일` |
| 정원 남용 | `capacity` 2~100. `lol`은 10 고정(레거시 `tft`+`team` 행은 8 고정) |
| 참가 스팸 | 유니크 인덱스 + 총 신청 상한 `min(capacity*3, 60)` |
| 문자열 | `title ≤60자`, `game_kind_label ≤30자` |

### 마이그레이션 미적용 시 degrade

`scripts/sql/20260725_custom_game_recruit.sql` 미실행 상태에서 신규 컬럼 부재는 Postgres `42703`으로
나타난다. `isMissingColumnError()`가 이를 잡아 **500이 아니라** 목록 GET은 구 컬럼 fallback +
`migration_required: true`, 나머지는 503 안내로 degrade한다. UI도 이 플래그로 배너를 띄운다.

**★ `GAME_COLUMNS`에 컬럼을 추가할 때는 반드시 fallback을 함께 넣는다.**
컬럼 하나만 추가해도 미적용 환경의 목록·상세 GET이 **전부 42703으로 죽는다.**
`lib/customGames/game.ts`는 3단계로 내려간다:
`GAME_COLUMNS` → `LEGACY_GAME_COLUMNS`(20260727 미적용) → `PRE_RECRUIT_GAME_COLUMNS`(20260725 미적용).
`fetchGame()`도 같은 fallback을 쓰고 `steam_app_id`를 `null`로 채운 뒤 `migrationRequired`를 함께 돌려준다.

스팀 관련 쓰기(라벨/appid)는 CHECK 완화(20260727)가 선행되어야 하므로
`isCheckViolation()`(23514) / `isMissingColumnError()`(42703)를 잡아 **503 안내**로 돌린다(500 금지).
RPC 부재(`PGRST202`/`42883`)는 `isMissingFunctionError()`가 잡아 **200 + `migration_required: true` + 빈 목록**이다.
판별 함수는 전부 `lib/db/pgErrors.ts` 한 곳에 있다.

## 프로필 아바타 우선순위

표시 URL은 **`lib/members/avatar.ts`의 `resolveAvatarUrl(member)` 단 하나**로만 만든다.
화면마다 스토리지 URL을 직접 조립하지 않는다.

```
discord_avatar_url (Discord CDN) → null(이니셜/기본 이미지)
```

- **프로필 사진은 Discord 전용이다.** 직접 업로드 기능(`app/api/profile/image`, `ProfileEditor`의 업로드 UI)은
  제거됐다. 표시 아바타는 Discord OAuth 로그인 때 자동으로 채워지는 `discord_avatar_url` 하나뿐이다.
  `/profile`은 "프로필 사진은 Discord 프로필을 사용합니다" 안내만 보여준다(프레임 설정은 유지).
- **`members.profile_image_path` 컬럼은 DROP하지 않는다.** 파괴적이고, hall_of_fame 스냅샷에 과거 값이 남아 있다.
  코드에서 표시 참조만 끊었고(`resolveAvatarUrl`이 더 이상 읽지 않음), 스냅샷 백필은 계속 이 컬럼을 읽는다.
- 스팀 화면(`/steam`, 온라인 상태, 같은 게임)만 예외로 `steam_avatar_url`을 먼저 쓰고
  없을 때 `resolveAvatarUrl()`로 내려간다 (맥락이 스팀이므로).

**신뢰 경계:** `user_metadata`는 IdP가 채우는 값이다. `isDiscordAvatarUrl()`이
https + `cdn.discordapp.com`만 통과시킨다. 저장(`getDiscordAvatarUrl`)과 표시(`resolveAvatarUrl`)
양쪽에서 검증한다 — 검증 없이 next/image에 넘기면 임의 외부 URL이 렌더된다.
`next.config.ts`의 `remotePatterns`도 `cdn.discordapp.com` + `/avatars/**`로 좁혀 두었다.

**마이그레이션 미적용 degrade:** `discord_avatar_url` 컬럼이 없으면 select가 42703으로 실패한다.
`withAvatarColumn()`이 이를 잡아 컬럼 없이 1회 재조회하므로 500 대신 아바타 없이(이니셜/기본 이미지)
보이는 상태로 degrade한다. members를 조회하는 화면을 추가할 때 이 헬퍼를 함께 쓴다.

## 관리자 기능

- `/admin/members/control` — 멤버 CRUD + 승인/거절/추방, 로그인 연결 현황 (Riot ID 수정 시 자동 재동기화)
  - 행의 **'계정'** 버튼 → `MemberAccountsModal`: 라이엇 계정(1~3) 추가·수정·삭제·대표 지정 + 스팀 등록·변경·해제.
    쓰기 로직은 사용자 라우트와 같은 `riotAccountOps.ts`/`steamLink.ts`를 쓴다. status 불변, 대표 변경 시 즉시 동기화.
    **관리자 스팀 경로는 `user_id`를 묶지 않는다**(사용자 경로만 `bindUserId: user.id`). 감사 로그는 `console.info('[admin-audit]')`(ID 원문 미기록).
    스팀 ID를 다른 계정으로 바꾸면 기존 `steam_owned_games`를 지우고 `steam_synced_at`을 null 로 만든 뒤 재동기화한다(사용자 경로 공통).
- `/admin/members/sync` — 개별/전체 동기화, 동기화 현황 테이블
- `/admin/profile-frames` — 프레임 이미지 업로드·삭제

관리자 여부는 `admins` 테이블에서 확인 (`/api/admin/me` 엔드포인트).
`user_id` 미연결 시 Discord identity id(`discord_id`)로 매칭 후 `user_id`를 자동 백필한다.
관리자 페이지는 별도 auth 체크 없이 API에서 `requireAdmin()` (`app/lib/isAdmin.ts`)으로 처리.

## 티어 순서 (정렬 기준)

```
CHALLENGER(1) > GRANDMASTER(2) > MASTER(3) > DIAMOND(4) >
EMERALD(5) > PLATINUM(6) > GOLD(7) > SILVER(8) > BRONZE(9) > IRON(10)
```

랭크 순서: `I(1) < II(2) < III(3) < IV(4)` (숫자 낮을수록 높은 랭크)
동점 시 LP 내림차순.

## 주의 사항

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하므로 서버 사이드에서만 사용
- 크론 엔드포인트(`GET /api/admin/sync-all`, `GET /api/admin/sync-steam`)는 `Authorization: Bearer CRON_SECRET`(또는 `ADMIN_SYNC_TOKEN`) 헤더 필수
  (두 경로 모두 `proxy.ts`의 `BYPASS_PATHS`에 등록되어 있어야 한다.
  Next 16에서 `middleware.ts` 규약이 `proxy.ts`로 이름이 바뀌었고 export 함수명도 `proxy`다)
- **스팀 API 경로 규칙 (2계층):**
  - `app/api/steam/**` = **DB 전용 경계.** force-dynamic + Supabase RPC/테이블만. `lib/steam/*` import 금지.
    이 디렉토리에 외부 호출을 넣지 않는다 — 넣고 싶으면 아래 경로를 쓴다.
  - `app/api/steam-catalog/**`, `app/api/steam-presence/**` = **외부 호출 경계.** `lib/steam/*` import 허용.
    반드시 (1) 로그인 + approved 게이트 (2) 검색어 최소 길이 (3) 서버측 캐시 (4) 타임아웃
    (5) 실패 시 200 + 빈 결과 degrade 를 모두 갖춘다.
  - 두 경계를 한 라우트에 섞지 않는다. 섞는 순간 "이 파일이 외부를 부르는가"를 경로로 판별할 수 없게 된다.
- **`STEAM_API_KEY`는 서버 전용.** Steam Web API는 헤더 인증을 지원하지 않아 키를 쿼리 파라미터로 보내므로,
  `lib/steam/*`는 전부 `import 'server-only'`이고 에러 메시지·로그에 URL을 절대 싣지 않는다.
- 스팀 입력의 **친구 코드**(숫자 1~10자리, 1~2^32-1)는 `76561197960265728 + n`(BigInt — tsconfig ES2017이라 리터럴 `n` 금지)으로
  SteamID64 로 변환한다. 10자리 이하 숫자는 vanity 보다 친구 코드로 우선 해석한다(예: 1123869352 → 76561199084135080).
- 스팀 계정은 **소유권을 증명하지 않는다**(사용자 입력). `members_steam_id64_uidx` 유니크로 선점만 막고 중복 시 409.
- 스팀 멀티플레이 판정은 `store.steampowered.com/api/appdetails`(**비공식**) 기반이라
  실패해도 전체 동기화를 깨뜨리지 않고 `is_multiplayer=null`("분류 미확인")로 남긴다.
- 수동 동기화(`POST /api/admin/sync-all`)는 Supabase 세션 기반 `requireAdmin()` 체크
- Riot API 키는 반드시 `X-Riot-Token` 헤더로 전송 — URL 쿼리 파라미터 사용 금지
- 멤버 동기화는 기본 쿨다운 300초 (`NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC`)
- 프로필 이미지: Supabase Storage `profile-images` 버킷
- 프레임 이미지: Supabase Storage `profile-frames` 버킷
- `/api/members/[id]/sync`는 **로그인 + (승인 멤버 / 본인 소유 멤버 / 관리자)** 가 호출할 수 있다.
  랭킹은 모두가 함께 보는 공개 데이터라 "내 것만" 제한은 실익이 없다. (⚠ 사용자용 동기화 버튼은 삭제된 `/tft`에만 있었고 `/lol`에는 없다 — 후속 과제)
  **레이트리밋 방어는 권한이 아니라 멤버 단위 쿨다운(`MIN_SYNC_INTERVAL_SEC`, 기본 300초)이 담당한다** —
  누가 눌러도 같은 멤버는 5분에 1회를 넘길 수 없으므로 상한은 권한을 열기 전과 동일하다.
  본인 계정은 아직 `pending`이어도 갱신할 수 있다(승인 전 랭크 확인 경로).
  무인증 호출은 여전히 401 — 이것이 레이트리밋 고갈 방어의 실제 경계다
- DB 마이그레이션은 `scripts/sql/`에 파일로만 작성하고 Supabase SQL Editor에서 직접 실행한다.
  **SQL 먼저 → 배포 나중** 순서를 지킬 것 (`members.status`, `riot_accounts.lol_puuid`를 코드가 참조함)

## 하네스: meonjongbyeol-dev

**목표:** 코드 변경 작업을 Analyst → Developer → QA 파이프라인으로 안전하게 처리

**트리거:** 기능 추가·버그 수정·리팩토링·보안 개선 등 코드 변경 요청 시 `meonjongbyeol-dev` 스킬을 사용하라. 단순 코드 설명이나 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-09 | 초기 구성 | 전체 | Analyst→Developer→QA 파이프라인 구성 |
| 2026-07-23 | 스팀 3건 | `/steam`, 내전, 명예의 전당 | 개인화 섹션 추가(ISR 분리), 내전 스팀 게임 선택, 인트로 제거 |
| 2026-07-23 | 디자인 통일 | 전 페이지, `SiteNav` | 디자인 토큰(`lib/ui/styles.ts` + `@theme`) 도입, 폰트 복원, 홈 아이콘 |
| 2026-07-23 | 카탈로그 검색 | `SteamGamePicker`, `app/api/steam-catalog/` | 내전 스팀 게임을 보유 목록 밖에서도 고를 수 있게 |
| 2026-07-23 | 지금 접속 중 | `SteamPresence`, `lib/steam/presence.ts`, `app/api/steam-presence/` | 스팀 실시간 상태. ISR 페이지 불변 + 외부 호출 경계 분리 |
| 2026-09-09 | 웹 푸시 + PWA | `lib/push/`, `app/manifest.ts`, `public/sw.js`, `notify-reminders` | 내전 시작 1시간 전 개인 기기 알림. 기존 30분 디스코드 알림은 무변경 |
| 2026-09-09 | 주간 랭크 리포트 | `lib/discord/weeklyReport.ts`, `/api/cron/weekly-rank-report`, `/api/admin/weekly-rank-report` | 매주 월요일 지난 주 랭크 요약 디스코드 자동 발송(단일행 CAS 멱등) |
| 2026-10-08 | 동기화·내전 백엔드 정비 | `lib/sync/*`, `sync-all`, `members/[id]/sync`, `custom-games`, `notify-reminders` | TOP5 반복 발송·재시도 prev 오염·동시 실행·리마인더 재무장·목록 무제한 조회 |
| 2026-11-25 | 먼종별 리모델링 | 전체 (TFT·명예의 전당·시즌·주간 리포트 삭제, `lib/riot/*`, `lib/sync/doSyncMember.ts`, 홈·`/discord`·`SiteNav`) | 종겜방 '먼종별'로 리브랜딩, LoL 키 단일화(lol_puuid), 홈을 내전·스팀·디스코드 중심으로 재구성. DB DROP 없음 |
| 2026-11-25 | 디자인 리뉴얼(보라 다크) | globals.css, styles.ts, AppShell·nav/*, HeroBanner, 전 페이지 | Unity Dashboard 톤, PC 사이드바, 캐릭터 히어로 배너. 로직·API·DB 무변경 |
| 2026-11-27 | 내전 라이브 MVP | `useCustomGamesRealtime`·`useGamePresence`·`HomeRecruitingGames`, `custom-games` 목록·상세, `20260912_custom_game_realtime.sql` | Realtime 재조회 트리거 · 번개(파생) · Presence 시청자 수. 컬럼 추가 없음 |
| 2026-11-27 | 롤 협곡 포지션 선점 | `lol-teams/claim`, `lolSlots.ts`, `LolClaimBoard`, `useGamePresence` broadcast, `20260913_custom_game_lol_slot_claim.sql` | 확정 참가자 본인 슬롯 선점·관리자 저장 낙관적 동시성. 컬럼 추가 없음 |
| 2026-11-28 | 관리자 계정 관리 | `MemberAccountsModal`, `/api/admin/members/[id]/{accounts,riot-accounts,steam}`, `lib/members/{riotAccountOps,steamLink,adminMemberOps}.ts`, `resolveSteamId` | 관리자가 멤버의 라이엇 계정·스팀 ID 조회/수정. 사용자 라우트와 로직 공유, 스팀 친구 코드 입력 지원 |
