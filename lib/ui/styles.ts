// 공통 className 상수. 순수 문자열이므로 서버/클라이언트 양쪽에서 import 한다.
// ⚠ 'server-only' 를 붙이지 않는다.
// ⚠ 색은 전부 globals.css 의 토큰(bg-surface·text-muted·bg-brand…)만 쓴다. 팔레트 하드코딩 금지.

// pb-28: 모바일 하단 탭바(56px) + iOS 홈 인디케이터에 콘텐츠가 가리지 않도록 확보한다.
// 탭바는 lg:hidden 이라(768~1023px 에서도 보임) 여백 복귀도 lg 기준이다.
// lg 이상은 사이드바 레이아웃이라 상단바(DesktopTopbar)가 위 여백을 대신한다.
export const SHELL = 'min-h-[calc(100dvh-3.5rem)] px-4 pt-6 pb-28 sm:px-6 lg:min-h-0 lg:px-8 lg:pt-2 lg:pb-12'

// SHELL 을 쓰지 않고 자체 셸을 가진 페이지가 하단 탭바를 피하기 위한 여백.
export const TABBAR_SAFE_PB = 'pb-28 lg:pb-0'
export const CONTAINER = 'max-w-6xl mx-auto'

export const CARD = 'rounded-3xl bg-surface shadow-[0_16px_40px_-24px_var(--color-shadow)]'
export const CARD_HOVER = `${CARD} transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-surface-raised hover:shadow-[0_22px_48px_-24px_var(--color-shadow)]`
export const PANEL = 'rounded-3xl bg-panel p-6 sm:p-8 shadow-[0_24px_64px_-28px_var(--color-shadow)]'

export const INPUT =
  'w-full px-4 py-2.5 rounded-2xl text-sm font-medium text-fg bg-surface-2 border border-transparent placeholder:text-subtle transition-colors focus:outline-none focus:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/25 disabled:opacity-50'

export const BTN_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-[color,background-color,border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 disabled:pointer-events-none'
// ⚠ BTN_PRIMARY/BTN_DANGER 의 text-white 는 필(brand/danger) 위 글자라 양 테마 흰색 유지.
export const BTN_PRIMARY = `${BTN_BASE} bg-brand text-white shadow-[0_10px_24px_-10px_var(--color-brand)] hover:bg-brand/90`
export const BTN_GHOST = `${BTN_BASE} bg-brand/12 text-brand-ink hover:bg-brand/20`
export const BTN_NEUTRAL = `${BTN_BASE} bg-surface-2 text-fg hover:bg-line-strong`
export const BTN_DANGER = `${BTN_BASE} bg-danger/90 text-white hover:bg-danger`
// 히어로 배너(보라 그라데이션) 위 버튼. 흰 필 + 진보라 글자.
export const BTN_ON_HERO = `${BTN_BASE} bg-white text-hero-from shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] hover:bg-white/90 focus-visible:ring-white/70`
// 히어로 위 보조 버튼(흰 테두리 고스트).
export const BTN_ON_HERO_GHOST = `${BTN_BASE} border border-white/70 text-white hover:bg-white/15 focus-visible:ring-white/70`
// 히어로 위 상태 칩(흰 반투명 알약). 글자는 흰색 100%.
export const HERO_CHIP =
  'inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/30'

// 히어로 배너 컨테이너. 그라데이션 위 텍스트는 항상 흰색(투명도 80% 이상).
export const HERO =
  'relative overflow-hidden rounded-3xl bg-linear-to-r from-hero-from via-hero-via to-hero-to text-white shadow-[0_24px_60px_-28px_var(--color-hero-from)]'

export const ALERT = {
  warn: 'px-4 py-3 rounded-2xl text-sm font-medium bg-warn/10 border border-warn/20 text-warn-ink',
  error: 'px-4 py-3 rounded-2xl text-sm font-medium bg-danger/10 border border-danger/20 text-danger-ink',
  ok: 'px-4 py-3 rounded-2xl text-sm font-medium bg-ok/10 border border-ok/20 text-ok-ink',
} as const

export const H1 = 'text-3xl sm:text-[2.6rem] font-black tracking-[-0.035em] leading-[1.08] text-fg'
export const H2 = 'text-lg font-bold tracking-tight text-fg'
export const KICKER = 'text-[10px] font-black tracking-[0.22em] uppercase'
export const MUTED = 'text-sm text-muted'

// 대시보드형 숫자 지표.
export const STAT_NUMBER = 'font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg tabular-nums'
export const STAT_LABEL = 'text-xs font-semibold text-subtle'

// 리스트 행(썸네일 + 텍스트 + 우측 원형 버튼).
export const LIST_ITEM =
  'flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
export const LIST_THUMB = 'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-2'
export const ICON_BTN_ROUND =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-brand hover:text-white'

// 세그먼트·필터 알약.
export const PILL = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-surface-2 text-muted transition-colors hover:text-fg'
export const PILL_ACTIVE = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-brand text-white'

// 사이드바 내비.
export const NAV_ITEM =
  'relative flex min-h-11 items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold text-subtle transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
export const NAV_ITEM_ACTIVE =
  'relative flex min-h-11 items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold bg-brand text-white shadow-[0_10px_24px_-12px_var(--color-brand)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
export const NAV_SECTION = 'px-4 pb-2 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle'
export const BADGE_DOT = 'inline-block h-2 w-2 shrink-0 rounded-full bg-accent'

// 사이드 컬럼의 작은 카드(제목 H3 + 본문). 2단 레이아웃 페이지(/steam 등)에서 쓴다.
export const SIDE_CARD = `${CARD} p-5`
export const H3 = 'text-sm font-bold tracking-tight text-fg'
export const HINT = 'text-xs leading-relaxed text-subtle'

// ─── 데이터 테이블·배지·작은 버튼 (관리자 화면 등 밀도 높은 화면용) ───────────────
// 테이블은 CARD 안에 넣고 overflow-x-auto 래퍼로 감싼다.
export const TABLE = 'w-full border-collapse text-sm'
export const TH = 'px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-subtle whitespace-nowrap'
export const TD = 'px-4 py-3 align-middle'
export const TR = 'border-t border-line transition-colors hover:bg-surface-2'

// 상태 배지(역할 토큰). 흰 글자를 쓰지 않고 -ink 글자 + 옅은 필로만 표현한다.
const BADGE_BASE = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold'
export const BADGE = {
  ok: `${BADGE_BASE} bg-ok/12 text-ok-ink`,
  warn: `${BADGE_BASE} bg-warn/12 text-warn-ink`,
  danger: `${BADGE_BASE} bg-danger/12 text-danger-ink`,
  info: `${BADGE_BASE} bg-info/12 text-info-ink`,
  brand: `${BADGE_BASE} bg-brand/12 text-brand-ink`,
  neutral: `${BADGE_BASE} bg-surface-2 text-muted`,
} as const

// 행 단위 작은 버튼. BTN_BASE 와 min-h 가 달라 별도 베이스를 둔다(클래스 덮어쓰기 충돌 방지).
const BTN_SM_BASE =
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 disabled:pointer-events-none'
export const BTN_SM_PRIMARY = `${BTN_SM_BASE} bg-brand text-white hover:bg-brand/90`
export const BTN_SM_GHOST = `${BTN_SM_BASE} bg-brand/12 text-brand-ink hover:bg-brand/20`
export const BTN_SM_NEUTRAL = `${BTN_SM_BASE} bg-surface-2 text-fg hover:bg-line-strong`
// 위험 행동(거절·추방·삭제)용 — danger 톤이지만 주 행동보다 덜 튀게 옅은 필만 쓴다.
export const BTN_SM_DANGER = `${BTN_SM_BASE} bg-danger/10 text-danger-ink hover:bg-danger/20`
export const BTN_SM_WARN = `${BTN_SM_BASE} bg-warn/10 text-warn-ink hover:bg-warn/20`

// 폼 라벨.
export const LABEL = 'block text-xs font-bold text-muted'
