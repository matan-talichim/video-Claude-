import { useEffect, useRef } from 'react'
import { useSocialLearningStore } from '../stores/socialLearningStore'
import { useRateLimitStore } from '../stores/rateLimitStore'
import { runLearningSession } from '../features/auto-editor/services/socialLearningService'

const ALL_CATEGORIES = [
  'viral_editing', 'hooks', 'pacing', 'subtitles',
  'broll', 'marketing', 'transitions', 'color_grading',
]

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 10_000

function getWeeklyCategories(): string[] {
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
  const offset = (weekNumber * 3) % ALL_CATEGORIES.length
  const result: string[] = []
  for (let i = 0; i < 3; i++) {
    result.push(ALL_CATEGORIES[(offset + i) % ALL_CATEGORIES.length])
  }
  return result
}

export function useSilentLearning() {
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const timer = setTimeout(async () => {
      try {
        const lastFetch = useSocialLearningStore.getState().lastFetchDate
        const timeSinceLastFetch = Date.now() - lastFetch

        if (lastFetch > 0 && timeSinceLastFetch < SEVEN_DAYS_MS) {
          return
        }

        const canRun = useRateLimitStore.getState().canRunSession()
        if (!canRun.allowed) {
          return
        }

        const categories = getWeeklyCategories()
        await runLearningSession(categories)
      } catch {
        // Silent failure - no UI to show errors
      }
    }, STARTUP_DELAY_MS)

    return () => clearTimeout(timer)
  }, [])
}
