/**
 * PWA · 파비콘 아이콘 생성 스크립트 (일회성).
 *
 *   실행:  node scripts/gen-pwa-icons.mjs      (= npm run gen:pwa-icons)
 *
 * 원본: `public/images/brand/meonjongbyeol.png` — 먼종별 컨셉 이미지
 * ("먼가 종겜하는 별난 것들" 문구 + 캐릭터, 흰 배경, 511x509).
 *
 * - 홈 화면 아이콘(192/512/maskable)·apple-icon 은 **전체 컨셉 이미지**를 쓴다.
 * - 작은 크기(파비콘 app/icon.png, 알림 배지 72px)는 문구가 뭉개지므로
 *   가운데 캐릭터 얼굴만 정사각으로 크롭해 쓴다.
 *
 * 결과 PNG 는 커밋하므로 빌드·배포에는 이 스크립트도 sharp 도 필요 없다
 * (sharp 는 next 의 전이 의존이라 node_modules 에 이미 존재한다 — dependency 추가 0).
 * 원본 이미지는 절대 덮어쓰지 않는다.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCE = path.join(ROOT, 'public', 'images', 'brand', 'meonjongbyeol.png')

/** 컨셉 이미지 배경과 같은 흰색. manifest 의 background_color 와 맞춘다. */
const BACKGROUND = { r: 0xff, g: 0xff, b: 0xff, alpha: 1 }

/** 컨셉 이미지 가운데 캐릭터 얼굴 영역(실측). 작은 아이콘용. */
const FACE = { left: 190, top: 250, width: 130, height: 130 }

/** inset: 캔버스 대비 이미지 비율. maskable 은 원형 크롭을 견디도록 안전영역(약 80%)에 가둔다. */
const TARGETS = [
  { out: ['public', 'icons', 'icon-192.png'], size: 192, inset: 1, crop: null },
  { out: ['public', 'icons', 'icon-512.png'], size: 512, inset: 1, crop: null },
  { out: ['public', 'icons', 'icon-maskable-512.png'], size: 512, inset: 0.8, crop: null },
  { out: ['public', 'icons', 'badge-72.png'], size: 72, inset: 1, crop: FACE },
  { out: ['app', 'icon.png'], size: 64, inset: 1, crop: FACE },
  { out: ['app', 'apple-icon.png'], size: 180, inset: 1, crop: null },
]

async function main() {
  await mkdir(path.join(ROOT, 'public', 'icons'), { recursive: true })

  for (const { out, size, inset, crop } of TARGETS) {
    const inner = Math.round(size * inset)
    let img = sharp(SOURCE)
    if (crop) img = img.extract(crop)
    const resized = await img
      .resize(inner, inner, { fit: 'contain', background: BACKGROUND })
      .png()
      .toBuffer()

    const offset = Math.round((size - inner) / 2)
    const file = path.join(ROOT, ...out)
    await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
      .composite([{ input: resized, top: offset, left: offset }])
      .png()
      .toFile(file)

    console.log(`generated ${out.join('/')} (${size}x${size})`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : '아이콘 생성에 실패했습니다.')
  process.exit(1)
})
