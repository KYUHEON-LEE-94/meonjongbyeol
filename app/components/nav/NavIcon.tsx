import type { IconKey } from '@/app/components/nav/navItems'

/** 인라인 SVG 아이콘. next/image 규칙은 래스터 이미지 대상이며,
 *  active/inactive 색을 currentColor 로 상속받아야 하므로 인라인 SVG 를 쓴다. */
const ICON_PATHS: Record<IconKey, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
    </>
  ),
  lol: (
    <>
      <path d="M4 3.5 10.5 10 8 12.5 3.5 8V3.5z" />
      <path d="M20 3.5 13.5 10l2.5 2.5L20.5 8V3.5z" />
      <path d="m10.5 13.5 3 3-4 4-3-3z" />
      <path d="m13.5 13.5-3 3 4 4 3-3z" />
    </>
  ),
  custom: (
    <>
      <path d="M4 4h3l9.5 9.5" />
      <path d="M20 4h-3L7.5 13.5" />
      <path d="m14.5 15.5 4 4" />
      <path d="m9.5 15.5-4 4" />
    </>
  ),
  steam: (
    <>
      <rect x="2.5" y="8" width="19" height="10" rx="4.5" />
      <path d="M7 11v4M5 13h4" />
      <circle cx="15.8" cy="12.4" r="1" />
      <circle cx="18.2" cy="14.6" r="1" />
    </>
  ),
  discord: (
    <>
      <path d="M7.5 6.5c3-1.3 6-1.3 9 0 1.6 2.3 2.4 4.9 2.5 8-1.4 1.1-2.8 1.8-4.3 2.2l-.9-1.6" />
      <path d="M7.5 6.5C5.9 8.8 5.1 11.4 5 14.5c1.4 1.1 2.8 1.8 4.3 2.2l.9-1.6" />
      <path d="M8.5 15.2c2.3.9 4.7.9 7 0" />
      <circle cx="9.6" cy="11.6" r="1" />
      <circle cx="14.4" cy="11.6" r="1" />
    </>
  ),
  shop: (
    <>
      <path d="M4 4h2l1.2 3M7.2 7l1.4 7.5a1.5 1.5 0 0 0 1.5 1.2h6.4a1.5 1.5 0 0 0 1.5-1.2L20.5 7z" />
      <circle cx="10" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </>
  ),
  points: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2.1 0 2.8 5.8 1.5 5.8 4.3 0 1.3-1.3 2.1-3 2.1-1.4 0-2.5-.6-3-1.6" />
      <path d="M12 6.3v1.5M12 16.4v1.4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c.9-3.6 3.8-5.6 7.5-5.6s6.6 2 7.5 5.6" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
}

export default function NavIcon({ name, className }: { name: IconKey; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
