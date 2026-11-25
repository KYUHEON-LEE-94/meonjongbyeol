import 'server-only'
import type { ImageResponse } from 'next/og'
import { renderOgCard } from '@/lib/og/card'
import { getLolTop3 } from '@/lib/og/data'

export const SERVICE_NAME = '먼종별'
export const SERVICE_NAME_LATIN = 'MEONJONGBYEOL'

const KST_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function updatedFooter(): { footer: string; footerLatin: string } {
  const now = new Date()
  return {
    footer: `${KST_FORMATTER.format(now)} 기준`,
    footerLatin: `Updated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  }
}

/** LoL 솔로랭크 TOP3 카드. */
export async function renderLolTop3Card(): Promise<ImageResponse> {
  try {
    const rows = await getLolTop3()
    return await renderOgCard({
      kicker: SERVICE_NAME,
      kickerLatin: SERVICE_NAME_LATIN,
      title: '리그 오브 레전드 TOP 3',
      titleLatin: 'LEAGUE OF LEGENDS TOP 3',
      rows,
      emptyText: '아직 랭킹 데이터가 없습니다',
      emptyTextLatin: 'No ranking data yet',
      ...updatedFooter(),
    })
  } catch (e) {
    console.warn('[og] LoL 카드 렌더 실패', e instanceof Error ? e.message : '오류 발생')
    return renderBrandCard()
  }
}

/** 데이터 없이도 항상 렌더되는 기본 카드. */
export function renderBrandCard(): Promise<ImageResponse> {
  return renderOgCard({
    kicker: SERVICE_NAME,
    kickerLatin: SERVICE_NAME_LATIN,
    title: '종겜방 내전 · 스팀 · 롤 랭킹',
    titleLatin: 'Custom Games · Steam · LoL Ranking',
    rows: [],
    emptyText: '디스코드로 로그인하고 함께 놀아요',
    emptyTextLatin: 'Sign in with Discord to join',
  })
}
