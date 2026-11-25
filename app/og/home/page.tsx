import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 600

export const metadata: Metadata = {
  title: '먼종별',
  description: '종겜방 멤버 전용 내전 · 스팀 · 롤 랭킹',
  openGraph: {
    type: 'website',
    siteName: '먼종별',
    locale: 'ko_KR',
    title: '먼종별',
    description: '종겜방 멤버 전용 내전 · 스팀 · 롤 랭킹',
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
}

export default function OgHomePage() {
  return (
    <>
      <h1>먼종별</h1>
      <p>종겜방 멤버 전용 내전 · 스팀 · 롤 랭킹</p>
      <Link href="/login">로그인하고 보기</Link>
    </>
  )
}
