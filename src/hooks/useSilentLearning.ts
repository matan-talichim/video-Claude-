import { useEffect, useRef } from 'react'
import { useSocialLearningStore } from '../stores/socialLearningStore'
import { useRateLimitStore } from '../stores/rateLimitStore'
import { runLearningSession } from '../features/auto-editor/services/socialLearningService'

const ALL_CATEGORIES = [
  'viral_editing', 'hooks', 'pacing', 'subtitles',
  'broll', 'marketing', 'transitions', 'color_grading',
]

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 10_000

function getDailyCategories(): string[] {
  const dayNumber = Math.floor(Date.now() / ONE_DAY_MS)
  const startIndex = (dayNumber * 3) % ALL_CATEGORIES.length
  const result: string[] = []
  for (let i = 0; i < 3; i++) {
    result.push(ALL_CATEGORIES[(startIndex + i) % ALL_CATEGORIES.length])
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
        const daysSinceLastLearn = (Date.now() - lastFetch) / ONE_DAY_MS

        if (lastFetch > 0 && daysSinceLastLearn < 1) {
          return
        }

        const canRun = useRateLimitStore.getState().canRunSession()
        if (!canRun.allowed) {
          return
        }

        const categories = getDailyCategories()
        await runLearningSession(categories)
      } catch {
        // Silent failure
      }
    }, STARTUP_DELAY_MS)

    return () => clearTimeout(timer)
  }, [])
}
