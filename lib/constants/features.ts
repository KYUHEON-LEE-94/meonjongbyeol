// 빌드 타임에 인라인되는 NEXT_PUBLIC_* 플래그.
// 반드시 process.env.NEXT_PUBLIC_XXX 전체 표현식을 그대로 써야 Next 가 치환한다.

/**
 * Discord 서버(길드) 로그인 게이트.
 *
 * 값이 있으면 → 그 길드 멤버만 로그인 허용 (게이트 ON).
 * 비어 있으면 → 게이트 OFF (아무 Discord 계정 로그인 가능, 기존 동작 유지).
 *
 * 길드 ID는 공개 식별자라 NEXT_PUBLIC_ 이어도 비밀 노출이 아니다.
 * 실제 강제는 서버측 콜백(app/auth/callback)에서 provider_token 으로 수행한다 —
 * 클라이언트의 scopes 요청은 토큰 획득용일 뿐이다.
 */
export const GUILD_GATE_ID = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID ?? ''
