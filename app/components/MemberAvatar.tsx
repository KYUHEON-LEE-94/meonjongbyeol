'use client'

import { useState } from 'react'
import Image from 'next/image'

type Props = {
  /** `resolveAvatarUrl()` 로 검증된 URL 만 넘긴다. null 이면 이니셜. */
  src: string | null | undefined
  name: string
  /** next/image sizes 힌트(px). */
  size: number
  /** 크기·모양·이니셜 폴백 색 클래스. 이미지가 있으면 그 위를 덮는다. */
  className: string
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

/**
 * 멤버 아바타 박스. Discord 아바타가 있으면 이미지, 없거나 로드 실패(디스코드 프로필 변경으로
 * 옛 해시가 404)면 호출부가 준 스타일 그대로 이니셜을 보여준다.
 */
export default function MemberAvatar({ src, name, size, className }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = !!src && failedSrc !== src

  return (
    <span aria-hidden="true" className={`relative flex items-center justify-center overflow-hidden ${className}`}>
      {showImage ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initialOf(name)
      )}
    </span>
  )
}
