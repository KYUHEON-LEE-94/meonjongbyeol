import 'server-only'

import type { DiscordTop5Entry } from '@/app/components/home/DashboardDiscordTop5'
import { fetchDiscordMemberActivity } from './memberActivity'
import { formatDiscordVoiceDuration, getKstDateRange } from './activityHelpers'

/**
 * 최근 7일(KST) Discord 음성 시간 TOP5. 홈(ISR)이 쓰는 공개 집계라 세션을 읽지 않는다.
 * discord_id·user_id 는 결과에 싣지 않는다(Client Component 로 넘어가지 않도록).
 * 미설정·API 실패는 빈 배열로 degrade 한다.
 */
export async function fetchWeeklyDiscordTop5(now: Date = new Date()): Promise<DiscordTop5Entry[]> {
  try {
    const result = await fetchDiscordMemberActivity(getKstDateRange(now, 7), { includeUnlinked: false })
    if (result.status !== 'ready') return []
    return result.rows
      .filter((row) => row.voiceSeconds > 0)
      .slice(0, 5)
      .map((row) => ({
        name: row.displayName,
        avatarUrl: row.avatarUrl,
        voiceLabel: formatDiscordVoiceDuration(row.voiceSeconds),
      }))
  } catch (e) {
    console.warn('[discord] 주간 TOP5 조회 실패', e instanceof Error ? e.message : '오류 발생')
    return []
  }
}
