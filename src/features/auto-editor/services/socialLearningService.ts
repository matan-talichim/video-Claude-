import { useSocialLearningStore } from '../../../stores/socialLearningStore'
import { useRateLimitStore } from '../../../stores/rateLimitStore'

interface LearningSessionResults {
  categories: Record<string, { videosAnalyzed: number; rulesLearned: number }>
  errors: string[]
  totalCost: number
  missingFeatures?: number
  error?: string
}

export async function runLearningSession(categories: string[]): Promise<LearningSessionResults> {
  const rateLimit = useRateLimitStore.getState()
  const store = useSocialLearningStore.getState()

  const check = rateLimit.canRunSession()
  if (!check.allowed) {
    return { categories: {}, errors: [], totalCost: 0, error: check.reason }
  }

  rateLimit.recordSession()

  const results: LearningSessionResults = { categories: {}, errors: [], totalCost: 0 }

  const limitedCategories = categories.slice(0, 3)

  for (const category of limitedCategories) {
    try {
      // Step 1: Fetch trends (100 YouTube units)
      console.log(`[LEARN] Fetching: ${category}`)

      const trendsRes = await fetch('http://localhost:3001/api/learning/fetch-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          maxResults: 5,
          currentDailyUnits: useRateLimitStore.getState().daily.youtubeUnits,
        }),
      })

      if (!trendsRes.ok) {
        const err = await trendsRes.json().catch(() => ({}))
        if (trendsRes.status === 429) {
          results.errors.push('YouTube limit reached. Stopping.')
          break
        }
        results.errors.push(`${category}: ${(err as { message?: string }).message}`)
        continue
      }

      const trends = await trendsRes.json()
      rateLimit.recordYoutubeUsage(trends.unitsUsed || 110)

      if (!trends.videos?.length) {
        results.errors.push(`${category}: no videos found`)
        continue
      }

      // Step 2: Analyze TOP 2 videos only
      const analyses: unknown[] = []
      const toAnalyze = trends.videos.slice(0, 2)

      for (const video of toAnalyze) {
        if (useRateLimitStore.getState().daily.gptCalls >= 15) {
          console.log('[LEARN] GPT daily limit reached, stopping analysis')
          break
        }

        try {
          console.log(`[LEARN] Analyzing: "${video.title?.substring(0, 50)}"`)

          const analysisRes = await fetch('http://localhost:3001/api/learning/analyze-viral-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId: video.id,
              videoTitle: video.title,
              videoCategory: category,
            }),
          })

          if (analysisRes.ok) {
            const result = await analysisRes.json()
            analyses.push(result.analysis)
            store.addAnalysis(result)
            rateLimit.recordGptCall(result.estimatedCost || 0.02)
            results.totalCost += result.estimatedCost || 0.02
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn(`[LEARN] Analysis failed: ${msg}`)
        }
      }

      if (analyses.length === 0) continue

      // Step 3: Synthesize (1 GPT call)
      if (useRateLimitStore.getState().daily.gptCalls < 15) {
        console.log(`[LEARN] Synthesizing ${analyses.length} analyses`)

        const synthRes = await fetch('http://localhost:3001/api/learning/synthesize-patterns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analyses, category }),
        })

        if (synthRes.ok) {
          const patterns = await synthRes.json()
          useSocialLearningStore.getState().setPatterns(category, patterns)
          rateLimit.recordGptCall(0.02)
          results.totalCost += 0.02

          results.categories[category] = {
            videosAnalyzed: analyses.length,
            rulesLearned: patterns.editing_rules?.length || 0,
          }
        }
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      results.errors.push(`${category}: ${msg}`)
    }
  }

  // Step 4: Detect missing features (1 GPT call)
  const currentPatterns = useSocialLearningStore.getState().learnedPatterns
  if (useRateLimitStore.getState().daily.gptCalls < 15 && Object.keys(currentPatterns).length > 0) {
    try {
      console.log('[LEARN] Detecting missing features...')

      const missingRes = await fetch('http://localhost:3001/api/learning/detect-missing-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnedPatterns: currentPatterns }),
      })

      if (missingRes.ok) {
        const missing = await missingRes.json()

        if (missing.missing_features?.length > 0) {
          useSocialLearningStore.getState().setMissingFeatures(missing.missing_features)
          results.missingFeatures = missing.missing_features.length

          const msg = formatTelegramMissing(missing)
          await fetch('http://localhost:3001/api/notify/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg }),
          }).catch(() => {})
        }
      }

      useRateLimitStore.getState().recordGptCall(0.02)
      results.totalCost += 0.02
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[LEARN] Missing features failed:', msg)
    }
  }

  // Summary Telegram
  const summaryMsg = formatSessionSummary(results, useRateLimitStore.getState().getUsageSummary())
  try {
    await fetch('http://localhost:3001/api/notify/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: summaryMsg }),
    })
  } catch { /* ignore */ }

  return results
}

interface MissingFeaturesData {
  summary?: string
  biggest_gap?: string
  missing_features?: Array<{
    name: string
    description: string
    viral_evidence: string
    difficulty: string
    needs_new_api: boolean
    suggested_api: string
    priority: string
  }>
}

export function formatTelegramMissing(missing: MissingFeaturesData): string {
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
  let msg = `<b>סטודיו AI - כלים חסרים</b>\n${now}\n\n`
  msg += `${missing.summary || ''}\n`
  msg += `${missing.biggest_gap || ''}\n\n`

  const pEmoji: Record<string, string> = { critical: '🔴', important: '🟡', nice_to_have: '🟢' }
  const dEmoji: Record<string, string> = { easy: '✅', medium: '⚡', hard: '🔥' }

  ;(missing.missing_features || []).forEach((f, i) => {
    msg += `${pEmoji[f.priority] || '⚪'} <b>${i + 1}. ${f.name}</b>\n`
    msg += `   ${f.description}\n`
    msg += `   ${f.viral_evidence}\n`
    msg += `   ${dEmoji[f.difficulty] || '❓'} ${f.difficulty} | ${f.needs_new_api ? '🔌 ' + f.suggested_api : '✅ אפשרי עם הקיימים'}\n\n`
  })

  return msg
}

function formatSessionSummary(
  results: LearningSessionResults,
  usage: ReturnType<ReturnType<typeof useRateLimitStore.getState>['getUsageSummary']>
): string {
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
  let msg = `<b>סיכום למידה</b> | ${now}\n\n`

  Object.entries(results.categories).forEach(([cat, data]) => {
    msg += `✅ ${cat}: ${data.videosAnalyzed} סרטונים → ${data.rulesLearned} כללים\n`
  })

  if (results.errors.length) {
    msg += `\n⚠️ שגיאות: ${results.errors.length}\n`
  }

  msg += `\n💰 עלות הסשן: $${results.totalCost?.toFixed(2) || '0.00'}\n`
  msg += `YouTube היום: ${usage.today.youtube}\n`
  msg += `GPT היום: ${usage.today.gptCalls}\n`
  msg += `החודש: ${usage.month.cost}\n`

  if (results.missingFeatures) {
    msg += `\n🔧 ${results.missingFeatures} כלים חסרים זוהו (ראה הודעה נפרדת)`
  }

  return msg
}
