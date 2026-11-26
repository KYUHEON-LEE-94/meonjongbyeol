'use client'

import { useEffect } from 'react'

const TOAST_MS = 4000

/**
 * 라이브 참가 알림 토스트. 새 메시지가 오면 이전 것을 대체한다(key 로 타이머 리셋).
 * 모바일은 하단 탭바 위(bottom-24), lg+ 는 bottom-6.
 */
export default function LiveToast({
  toast,
  onDismiss,
}: {
  toast: { id: number; message: string } | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, TOAST_MS)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center lg:bottom-6 lg:left-64"
    >
      {toast && (
        <div
          key={toast.id}
          className="seat-pop pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl bg-surface-raised px-4 py-3 text-sm font-bold text-fg shadow-[0_16px_40px_-16px_var(--color-shadow)] ring-1 ring-line"
        >
          <span className="live-pulse h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <span className="min-w-0 break-keep">{toast.message}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-1 shrink-0 rounded-lg px-1.5 text-xs text-subtle hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            aria-label="알림 닫기"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  )
}
