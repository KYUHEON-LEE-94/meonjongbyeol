import type { Metadata } from 'next'
import { SHELL, CONTAINER } from '@/lib/ui/styles'
import HeroBanner from '@/app/components/ui/HeroBanner'
import PointsHistory from './PointsHistory'

export const metadata: Metadata = {
  title: '포인트 내역 · 먼종별',
}

export default function PointsPage() {
  return (
    <main className={SHELL}>
      <div className={CONTAINER}>
        <HeroBanner
          kicker="Points"
          title="포인트 내역"
          description="획득하거나 사용한 포인트 이력입니다."
        />
        <PointsHistory />
      </div>
    </main>
  )
}
