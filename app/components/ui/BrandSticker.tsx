import Image from 'next/image'

// ⚠ 순수 컴포넌트. 'use client'·훅·세션·쿠키·supabase·server-only import 금지
//    (ISR 페이지와 Client Component 양쪽에서 import 된다).
// 캐릭터 원본은 흰 배경 불투명 PNG 라 배경 제거·mix-blend 를 시도하지 않는다.
// 대신 "흰 스티커 카드"로 감싸 흰 배경을 디자인 요소로 쓴다.

// hero-lg / hero-md 는 HeroBanner 전용 반응형 크기(모바일 80px → sm 이상 160/128px). 이미지 1장으로 처리한다.
type StickerSize = 'xs' | 'sm' | 'md' | 'lg' | 'hero-lg' | 'hero-md'

const SIZE: Record<StickerSize, { box: string; sizes: string; pad: string; radius: string }> = {
  xs: { box: 'h-8 w-8', sizes: '32px', pad: 'p-0.5', radius: 'rounded-lg' },
  sm: { box: 'h-20 w-20', sizes: '80px', pad: 'p-1', radius: 'rounded-2xl' },
  md: { box: 'h-32 w-32', sizes: '128px', pad: 'p-1.5', radius: 'rounded-3xl' },
  lg: { box: 'h-40 w-40', sizes: '160px', pad: 'p-2', radius: 'rounded-3xl' },
  'hero-lg': { box: 'h-20 w-20 sm:h-40 sm:w-40', sizes: '(min-width: 640px) 160px, 80px', pad: 'p-1 sm:p-2', radius: 'rounded-2xl sm:rounded-3xl' },
  'hero-md': { box: 'h-20 w-20 sm:h-32 sm:w-32', sizes: '(min-width: 640px) 128px, 80px', pad: 'p-1 sm:p-1.5', radius: 'rounded-2xl sm:rounded-3xl' },
}

export default function BrandSticker({
  size = 'md',
  rotate = true,
  priority = false,
  className = '',
}: {
  size?: StickerSize
  rotate?: boolean
  priority?: boolean
  className?: string
}) {
  const s = SIZE[size]
  return (
    <span
      className={`inline-block shrink-0 bg-white ring-1 ring-black/5 shadow-[0_14px_30px_-12px_var(--color-shadow)] ${s.box} ${s.pad} ${s.radius} ${
        rotate ? 'rotate-6' : ''
      } ${className}`}
    >
      <Image
        src="/images/brand/meonjongbyeol.png"
        alt=""
        width={511}
        height={509}
        sizes={s.sizes}
        priority={priority}
        className={`h-full w-full object-contain ${size === 'xs' ? 'rounded-md' : 'rounded-xl'}`}
      />
    </span>
  )
}
