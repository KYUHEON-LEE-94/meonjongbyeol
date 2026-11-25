import type { Metadata } from 'next'
import PageHeader from '@/app/components/ui/PageHeader'
import DiscordActivityPanel from '@/app/discord/DiscordActivityPanel'
import { CONTAINER, SHELL } from '@/lib/ui/styles'
import { fetchDiscordMemberActivity } from '@/lib/discord/memberActivity'
import { getKstDateRange } from '@/lib/discord/activityHelpers'
import type { DiscordActivityOverview } from '@/types/discordActivity'

// ⚠ ISR(경로 단위 공유 캐시) 페이지다. 세션을 읽지 않는다(cookies()/auth.getUser() 금지).
//   승인 멤버 매칭(approved 필터)은 fetchDiscordMemberActivity({ includeUnlinked:false })가 담당하고,
//   discord_id 는 Client Component 로 넘기지 않는다.
export const revalidate = 300

export const metadata: Metadata = {
  title: '디스코드 활동 · 먼종별',
}

async function loadOverview(): Promise<DiscordActivityOverview> {
  const period = getKstDateRange(new Date(), 30)
  try {
    const result = await fetchDiscordMemberActivity(period, { includeUnlinked: false })
    return {
      status: result.status,
      from: result.period.from,
      to: result.period.to,
      generatedAt: null,
      members: result.rows
        .filter((row): row is typeof row & { memberId: string } => row.memberId !== null)
        .map((row) => ({
          memberId: row.memberId,
          memberName: row.displayName,
          avatarUrl: row.avatarUrl,
          hasActivityData: true,
          attendanceDays: row.attendanceDays,
          voiceSeconds: row.voiceSeconds,
          voiceJoins: row.voiceJoins,
          messages: row.messages,
        })),
    }
  } catch (e) {
    console.warn('[discord] 활동 조회 실패', e instanceof Error ? e.message : '오류 발생')
    return { status: 'unavailable', from: period.from, to: period.to, generatedAt: null, members: [] }
  }
}

export default async function DiscordActivityPage() {
  const overview = await loadOverview()
  return (
    <main className={SHELL}>
      <div className={CONTAINER}>
        <PageHeader
          kicker="Discord"
          title="디스코드 활동"
          description="최근 30일(KST) 음성 시간 · 활동일 · 메시지 수를 확인하세요."
        />
        <DiscordActivityPanel overview={overview} />
      </div>
    </main>
  )
}
