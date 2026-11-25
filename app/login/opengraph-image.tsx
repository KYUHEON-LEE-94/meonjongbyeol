import { OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og/card'
import { renderBrandCard } from '@/lib/og/presets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = '먼종별 — 종겜방 내전 · 스팀 · 롤 랭킹'

// Layer 1: 홈이 /login 으로 리다이렉트되므로, 3xx 를 따라온 크롤러가 이 카드를 가져간다.
export default function Image() {
  return renderBrandCard()
}
