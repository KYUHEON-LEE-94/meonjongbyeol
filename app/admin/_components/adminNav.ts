// 관리자 내비 단일 소스. 사이드바(lg+)와 모바일 메뉴 시트가 같은 목록을 쓴다.
// ⚠ 메뉴를 추가·삭제할 때는 여기만 고친다(레이아웃 쪽에 링크를 하드코딩하지 않는다).

export type AdminNavIconName = 'UserPlus' | 'Users' | 'Activity' | 'Logs' | 'Image' | 'Coins'

export type AdminNavItem = { href: string; label: string; icon: AdminNavIconName; description: string }
export type AdminNavSection = { label: string; items: AdminNavItem[] }

export const ADMIN_NAV: AdminNavSection[] = [
  {
    label: '멤버',
    items: [
      { href: '/admin/members/control', label: '멤버 관리', icon: 'UserPlus', description: '가입 승인·거절, 멤버 등록·수정·추방' },
      { href: '/admin/members/sync', label: '멤버 동기화', icon: 'Users', description: '롤 솔로랭크 조회·동기화 현황' },
    ],
  },
  {
    label: '커뮤니티',
    items: [
      { href: '/admin/points', label: '포인트 관리', icon: 'Coins', description: '운영 포인트 지급·차감과 내역' },
      { href: '/admin/profile-frames', label: '상점 관리', icon: 'Image', description: '프레임·랭킹 카드 배경 상품' },
      { href: '/admin/discord-activity', label: '디스코드 활동', icon: 'Activity', description: '기간별 음성·메시지 집계' },
    ],
  },
  {
    label: '시스템',
    items: [{ href: '/admin/logs', label: '동기화 로그', icon: 'Logs', description: '동기화 성공·스킵·실패 기록' }],
  },
]

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap((s) => s.items)

export function isAdminNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function findAdminNavItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS.find((item) => isAdminNavActive(pathname, item.href))
}
