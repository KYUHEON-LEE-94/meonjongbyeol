import BrandSticker from '@/app/components/ui/BrandSticker'
import { HERO } from '@/lib/ui/styles'

// ⚠ 순수 컴포넌트. 'use client'·훅·cookies()·세션·supabase·server-only import 금지.
//    /, /steam, /lol, /discord 가 ISR(경로 단위 공유 캐시)이라 여기서 세션을 읽으면
//    A 가 처음 만든 HTML 이 B 에게 서빙된다 — 사용자 간 데이터 유출이다.
//    개인화 값(이름·포인트)은 AppShell 하위 Client Component 에서만 그린다.
//    stats 에는 서버가 이미 가진 공개 집계만 넘긴다.

type HeroStat = { label: string; value: string }

type HeroBannerProps = {
  kicker?: string
  /** kicker 옆에 붙는 작은 칩들(표시 전용 노드) */
  badges?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  stats?: HeroStat[]
  /** 'character'(기본) = 먼종별 흰 스티커 카드, 'none' = 그림 없음, 노드 = 직접 렌더 */
  illustration?: 'character' | 'none' | React.ReactNode
  size?: 'lg' | 'md'
  /** 첫 화면 LCP 인 페이지(홈·온보딩)만 true */
  priority?: boolean
  className?: string
}

function Star({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.6 6.2 6.7.6-5.1 4.4 1.6 6.5L12 16.7l-5.8 3.5 1.6-6.5L2.7 9.3l6.7-.6z" />
    </svg>
  )
}

export default function HeroBanner({
  kicker,
  badges,
  title,
  description,
  action,
  stats,
  illustration = 'character',
  size = 'lg',
  priority = false,
  className = 'mb-8',
}: HeroBannerProps) {
  const isLg = size === 'lg'
  const hasArt = illustration !== 'none' && illustration != null && illustration !== false

  return (
    <section className={`${HERO} ${isLg ? 'px-6 py-7 sm:px-10 sm:py-10' : 'px-5 py-6 sm:px-8 sm:py-7'} ${className}`}>
      {/* 장식 블롭·별 — 스크린리더 제외 */}
      <span className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-20 right-1/3 h-44 w-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
      {hasArt && (
        <>
          <Star className="pointer-events-none absolute right-[38%] top-5 hidden h-4 w-4 text-star sm:block" />
          <Star className="pointer-events-none absolute bottom-6 right-[30%] hidden h-3 w-3 text-star/90 sm:block" />
          <Star className="pointer-events-none absolute right-6 top-4 h-3 w-3 text-star min-[360px]:right-28 sm:right-48" />
        </>
      )}

      <div className={`relative max-w-full ${hasArt ? 'min-[360px]:pr-24 sm:max-w-[60%] sm:pr-0' : ''}`}>
        {kicker && !badges && (
          <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{kicker}</p>
        )}
        {badges && (
          <div className="flex flex-wrap items-center gap-2">
            {kicker && (
              <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{kicker}</p>
            )}
            {badges}
          </div>
        )}
        <h1
          className={`mt-2 font-black tracking-[-0.03em] leading-[1.12] text-white ${
            isLg ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-3xl'
          }`}
        >
          {title}
        </h1>
        {description && (
          <p className={`mt-3 max-w-xl text-sm leading-relaxed text-white/85 ${isLg ? '' : 'line-clamp-2'}`}>
            {description}
          </p>
        )}

        {stats && stats.length > 0 && (
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-xs font-semibold text-white/80">{s.label}</dt>
                <dd className="font-display text-2xl font-bold tabular-nums text-white sm:text-3xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {action && <div className="mt-5 flex flex-wrap gap-2">{action}</div>}
      </div>

      {hasArt && (
        <div
          className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 min-[360px]:block ${
            isLg ? 'right-4 sm:right-10' : 'right-4 sm:right-8'
          }`}
        >
          {illustration === 'character' ? (
            <BrandSticker size={isLg ? 'hero-lg' : 'hero-md'} priority={priority} />
          ) : (
            illustration
          )}
        </div>
      )}
    </section>
  )
}
