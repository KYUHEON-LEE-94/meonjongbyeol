// 사이드바·모바일 상단바·하단 탭바·데스크톱 상단바가 공유하는 내비게이션 단일 소스.
// 순수 데이터/함수만 둔다('use client' 불필요 — 서버·클라 어디서 import 해도 안전).

export type IconKey =
  | 'home'
  | 'lol'
  | 'steam'
  | 'custom'
  | 'discord'
  | 'shop'
  | 'points'
  | 'profile'
  | 'admin'

export type NavSection = 'main' | 'me'

export type NavItem = {
  href: string
  label: string
  /** 하위 경로까지 active 로 볼지 여부. '/' 는 정확히 일치할 때만 active */
  exact?: boolean
  icon: IconKey
  section: NavSection
  /** 로그인한 사용자에게만 노출 */
  requiresLogin?: boolean
  /** 모바일 하단 탭바에 노출할지 여부. 4개를 넘기면 터치 타깃이 44px 밑으로 내려간다 */
  inTabBar: boolean
}

// 하단 탭바는 grid-cols-4 고정이라 4개(홈·내전·스팀·롤)만 담는다.
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', exact: true, icon: 'home', section: 'main', inTabBar: true },
  { href: '/custom-games', label: '내전', icon: 'custom', section: 'main', inTabBar: true },
  { href: '/steam', label: '스팀', icon: 'steam', section: 'main', inTabBar: true },
  { href: '/lol', label: '롤', icon: 'lol', section: 'main', inTabBar: true },
  { href: '/discord', label: '디스코드', icon: 'discord', section: 'main', inTabBar: false },
  { href: '/shop', label: '상점', icon: 'shop', section: 'me', inTabBar: false },
  { href: '/points', label: '포인트', icon: 'points', section: 'me', requiresLogin: true, inTabBar: false },
  { href: '/profile', label: '프로필', icon: 'profile', section: 'me', requiresLogin: true, inTabBar: false },
]

export const TAB_ITEMS = NAV_ITEMS.filter((item) => item.inTabBar)

export const NAV_SECTION_LABEL: Record<NavSection, string> = {
  main: '메뉴',
  me: '내 공간',
}

export const ADMIN_HREF = '/admin/members/sync'

/** 앱 내비(사이드바·상단바·탭바)를 렌더하지 않는 경로. 자체 레이아웃을 갖거나 내비가 불필요하다.
 *  이 판정은 여기 한 곳에서만 한다 — AppShell 의 lg:pl-64 패딩도 같은 판정을 따른다. */
export const HIDDEN_PREFIXES = ['/admin', '/login', '/auth', '/og']

export function isNavHidden(pathname: string): boolean {
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function isActive(pathname: string, item: Pick<NavItem, 'href' | 'exact'>): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function visibleNavItems(isLoggedIn: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.requiresLogin || isLoggedIn)
}

/** 데스크톱 상단바의 섹션 라벨. 현재 경로에 맞는 내비 항목 라벨, 없으면 브랜드명. */
export function sectionLabel(pathname: string): string {
  return NAV_ITEMS.find((item) => isActive(pathname, item))?.label ?? '먼종별'
}
