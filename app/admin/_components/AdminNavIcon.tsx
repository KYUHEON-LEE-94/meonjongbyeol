import type { AdminNavIconName } from './adminNav'

const PATHS: Record<AdminNavIconName, React.ReactNode> = {
  UserPlus: <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />,
  Users: <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
  Image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  Coins: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  Logs: <path d="M4 6h16M4 12h16M4 18h10" />,
  Activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
}

export default function AdminNavIcon({ name, className = 'h-5 w-5' }: { name: AdminNavIconName; className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  )
}
