import { OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og/card'
import { renderBrandCard } from '@/lib/og/presets'

// 로컬 TTF 로드 + supabase-js 를 쓰므로 edge 금지.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = '먼종별 — 종겜방 내전 · 스팀 · 롤 랭킹'

export default function Image() {
  return renderBrandCard()
}
