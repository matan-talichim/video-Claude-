import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DailyUsage {
  date: string
  youtubeUnits: number
  gptCalls: number
  gptEstimatedCost: number
  sessionsRun: number
}

interface MonthlyUsage {
  month: string
  totalYoutubeUnits: number
  totalGptCalls: number
  totalEstimatedCost: number
  totalSessions: number
}

interface RateLimitStore {
  daily: DailyUsage
  monthly: MonthlyUsage

  DAILY_YOUTUBE_LIMIT: 5000
  DAILY_SESSION_LIMIT: 3
  DAILY_GPT_CALL_LIMIT: 15
  MONTHLY_COST_LIMIT: 5

  canRunSession: () => { allowed: boolean; reason?: string }
  recordYoutubeUsage: (units: number) => void
  recordGptCall: (estimatedCost: number) => void
  recordSession: () => void
  getUsageSummary: () => {
    today: { youtube: string; youtubePercent: number; gptCalls: string; cost: string; sessions: string }
    month: { youtube: string; gptCalls: number; cost: string; costPercent: number; sessions: number }
  }
  resetDaily: () => void
}

const today = () => new Date().toISOString().split('T')[0]
const thisMonth = () => new Date().toISOString().substring(0, 7)

export const useRateLimitStore = create<RateLimitStore>()(
  persist(
    (set, get) => {
      const ensureToday = () => {
        const state = get()
        if (state.daily.date !== today()) {
          set({
            daily: { date: today(), youtubeUnits: 0, gptCalls: 0, gptEstimatedCost: 0, sessionsRun: 0 },
            monthly: state.monthly.month === thisMonth() ? state.monthly : {
              month: thisMonth(), totalYoutubeUnits: 0, totalGptCalls: 0, totalEstimatedCost: 0, totalSessions: 0,
            },
          })
        }
      }

      return {
        daily: { date: today(), youtubeUnits: 0, gptCalls: 0, gptEstimatedCost: 0, sessionsRun: 0 },
        monthly: { month: thisMonth(), totalYoutubeUnits: 0, totalGptCalls: 0, totalEstimatedCost: 0, totalSessions: 0 },

        DAILY_YOUTUBE_LIMIT: 5000,
        DAILY_SESSION_LIMIT: 3,
        DAILY_GPT_CALL_LIMIT: 15,
        MONTHLY_COST_LIMIT: 5,

        canRunSession: () => {
          ensureToday()
          const state = get()

          if (state.daily.sessionsRun >= 3) {
            return { allowed: false, reason: 'הגעת למגבלת 3 סשנים ליום. נסה שוב מחר.' }
          }
          if (state.daily.youtubeUnits >= 5000) {
            return { allowed: false, reason: 'הגעת למגבלת YouTube היומית (5,000 יחידות). נסה שוב מחר.' }
          }
          if (state.daily.gptCalls >= 15) {
            return { allowed: false, reason: 'הגעת למגבלת קריאות GPT היומית. נסה שוב מחר.' }
          }
          if (state.monthly.totalEstimatedCost >= 5) {
            return { allowed: false, reason: 'הגעת למגבלת $5 לחודש. מתאפס בתחילת החודש הבא.' }
          }

          return { allowed: true }
        },

        recordYoutubeUsage: (units) => {
          ensureToday()
          set(state => ({
            daily: { ...state.daily, youtubeUnits: state.daily.youtubeUnits + units },
            monthly: { ...state.monthly, totalYoutubeUnits: state.monthly.totalYoutubeUnits + units },
          }))
        },

        recordGptCall: (estimatedCost) => {
          ensureToday()
          set(state => ({
            daily: { ...state.daily, gptCalls: state.daily.gptCalls + 1, gptEstimatedCost: state.daily.gptEstimatedCost + estimatedCost },
            monthly: { ...state.monthly, totalGptCalls: state.monthly.totalGptCalls + 1, totalEstimatedCost: state.monthly.totalEstimatedCost + estimatedCost },
          }))
        },

        recordSession: () => {
          ensureToday()
          set(state => ({
            daily: { ...state.daily, sessionsRun: state.daily.sessionsRun + 1 },
            monthly: { ...state.monthly, totalSessions: state.monthly.totalSessions + 1 },
          }))
        },

        getUsageSummary: () => {
          ensureToday()
          const state = get()
          return {
            today: {
              youtube: `${state.daily.youtubeUnits} / 5,000`,
              youtubePercent: Math.round(state.daily.youtubeUnits / 50),
              gptCalls: `${state.daily.gptCalls} / 15`,
              cost: `$${state.daily.gptEstimatedCost.toFixed(2)}`,
              sessions: `${state.daily.sessionsRun} / 3`,
            },
            month: {
              youtube: state.monthly.totalYoutubeUnits.toLocaleString(),
              gptCalls: state.monthly.totalGptCalls,
              cost: `$${state.monthly.totalEstimatedCost.toFixed(2)} / $5.00`,
              costPercent: Math.round(state.monthly.totalEstimatedCost / 5 * 100),
              sessions: state.monthly.totalSessions,
            },
          }
        },

        resetDaily: () => {
          set({
            daily: { date: today(), youtubeUnits: 0, gptCalls: 0, gptEstimatedCost: 0, sessionsRun: 0 },
          })
        },
      }
    },
    { name: 'rate-limit-storage' }
  )
)
