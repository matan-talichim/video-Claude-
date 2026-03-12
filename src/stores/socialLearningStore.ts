import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EditingRule {
  rule: string
  applies_to: string
  confidence: number
}

interface LearnedPattern {
  editing_rules?: EditingRule[]
  editingRules?: EditingRule[]
  learnedAt: number
  [key: string]: unknown
}

interface MissingFeature {
  name: string
  name_en: string
  description: string
  why_important: string
  viral_evidence: string
  difficulty: 'easy' | 'medium' | 'hard'
  needs_new_api: boolean
  suggested_api: string
  priority: 'critical' | 'important' | 'nice_to_have'
  implementation_hint: string
}

interface SocialLearningStore {
  analyzedVideos: unknown[]
  learnedPatterns: Record<string, LearnedPattern>
  missingFeatures: MissingFeature[]
  lastFetchDate: number
  totalVideosAnalyzed: number

  addAnalysis: (analysis: unknown) => void
  setPatterns: (category: string, patterns: Record<string, unknown>) => void
  setMissingFeatures: (features: MissingFeature[]) => void
  getEditingRulesForPrompt: (contentType: string) => string
  getStats: () => { totalAnalyzed: number; categories: number; totalRules: number; missingFeatures: number; lastFetch: number }
  clearAll: () => void
}

export const useSocialLearningStore = create<SocialLearningStore>()(
  persist(
    (set, get) => ({
      analyzedVideos: [],
      learnedPatterns: {},
      missingFeatures: [],
      lastFetchDate: 0,
      totalVideosAnalyzed: 0,

      addAnalysis: (analysis) => set(state => ({
        analyzedVideos: [...state.analyzedVideos.slice(-50), analysis],
        totalVideosAnalyzed: state.totalVideosAnalyzed + 1,
      })),

      setPatterns: (category, patterns) => set(state => ({
        learnedPatterns: { ...state.learnedPatterns, [category]: { ...patterns, learnedAt: Date.now() } as LearnedPattern },
        lastFetchDate: Date.now(),
      })),

      setMissingFeatures: (features) => set({ missingFeatures: features }),

      getEditingRulesForPrompt: (contentType) => {
        const rules: string[] = []
        Object.values(get().learnedPatterns).forEach((pattern) => {
          const rulesList = pattern.editing_rules || pattern.editingRules || []
          rulesList.forEach((rule) => {
            if ((rule.applies_to === 'all' || rule.applies_to === contentType) && rule.confidence >= 0.6) {
              rules.push(`- ${rule.rule} (${Math.round(rule.confidence * 100)}%)`)
            }
          })
        })
        if (rules.length === 0) return ''
        return `\n=== כללים שנלמדו מ-${get().totalVideosAnalyzed} סרטונים ויראליים ===\n${rules.join('\n')}\n===`
      },

      getStats: () => {
        const state = get()
        return {
          totalAnalyzed: state.totalVideosAnalyzed,
          categories: Object.keys(state.learnedPatterns).length,
          totalRules: Object.values(state.learnedPatterns)
            .reduce((sum: number, p) => sum + ((p.editing_rules || p.editingRules)?.length || 0), 0),
          missingFeatures: state.missingFeatures.length,
          lastFetch: state.lastFetchDate,
        }
      },

      clearAll: () => set({
        analyzedVideos: [], learnedPatterns: {}, missingFeatures: [],
        lastFetchDate: 0, totalVideosAnalyzed: 0,
      }),
    }),
    { name: 'social-learning-storage' }
  )
)
