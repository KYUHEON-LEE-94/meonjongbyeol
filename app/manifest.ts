import type { MetadataRoute } from 'next'

/**
 * Next 규약 파일 → `/manifest.webmanifest`.
 * iOS 는 홈 화면에 추가한 PWA 안에서만 웹 푸시를 지원하므로(iOS 16.4+) manifest 가 필수다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '먼종별',
    short_name: '먼종별',
    description: '먼가 종겜하는 별난 것들 — 종겜방 멤버 전용 내전·스팀·롤 랭킹 커뮤니티',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // 스플래시 배경을 보라 다크 캔버스와 맞춘다.
    background_color: '#1F1D2B',
    theme_color: '#6C5DD3',
    lang: 'ko',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
