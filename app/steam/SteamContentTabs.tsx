'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type TabId = 'together' | 'shared' | 'deals'

const TABS: { id: TabId; label: string }[] = [
  { id: 'together', label: '함께 할 게임' },
  { id: 'shared', label: '나와 같은 게임' },
  { id: 'deals', label: '스팀 할인' },
]

type SteamContentTabsProps = {
  together: ReactNode
  shared: ReactNode
  deals: ReactNode
}

export default function SteamContentTabs({ together, shared, deals }: SteamContentTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('together')
  const panels: Record<TabId, ReactNode> = { together, shared, deals }
  const idPrefix = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectTab = (index: number) => {
    const tab = TABS[index]
    if (!tab) return
    setActiveTab(tab.id)
    tabRefs.current[index]?.focus()
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      selectTab((index + 1) % TABS.length)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      selectTab((index - 1 + TABS.length) % TABS.length)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      selectTab(0)
    }
    if (event.key === 'End') {
      event.preventDefault()
      selectTab(TABS.length - 1)
    }
  }

  return (
    <section>
      <div
        role="tablist"
        aria-label="스팀 콘텐츠"
        className="mb-5 flex w-full gap-1 overflow-x-auto rounded-2xl bg-surface p-1 sm:w-fit"
      >
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.id
          const tabId = `${idPrefix}-${tab.id}-tab`
          const panelId = `${idPrefix}-${tab.id}-panel`

          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:flex-none ${
                isActive
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        const tabId = `${idPrefix}-${tab.id}-tab`
        const panelId = `${idPrefix}-${tab.id}-panel`

        return (
          <div
            key={tab.id}
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId}
            hidden={!isActive}
          >
            {panels[tab.id]}
          </div>
        )
      })}
    </section>
  )
}
