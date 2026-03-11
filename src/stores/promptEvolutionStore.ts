import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PromptEvolution {
  modelId: string
  basePrompt: string
  additions: string[]
  version: number
  lastEvolved: number
  successRate: number
}

interface PromptEvolutionStore {
  evolutions: Record<string, PromptEvolution>

  getEvolvedPrompt: (modelId: string, basePrompt: string) => string
  recordEvolution: (modelId: string, newAdditions: string[]) => void
  recordSuccess: (modelId: string, qualityScore: number) => void
  getStats: () => { modelId: string; version: number; additions: number; successRate: number }[]
  resetModel: (modelId: string) => void
  resetAll: () => void
}

export const usePromptEvolutionStore = create<PromptEvolutionStore>()(
  persist(
    (set, get) => ({
      evolutions: {},

      getEvolvedPrompt: (modelId, basePrompt) => {
        const evo = get().evolutions[modelId]
        if (!evo || evo.additions.length === 0) return basePrompt

        const additionsText = evo.additions.join('\n')
        return `${basePrompt}

=== שיפורים שנלמדו (גרסה ${evo.version}, ${evo.additions.length} תובנות) ===
${additionsText}
=== סוף שיפורים ===`
      },

      recordEvolution: (modelId, newAdditions) => {
        set(state => {
          const existing = state.evolutions[modelId] || {
            modelId,
            basePrompt: '',
            additions: [],
            version: 0,
            lastEvolved: 0,
            successRate: 0.5,
          }

          // Deduplicate: don't add if very similar to existing
          const uniqueNew = newAdditions.filter(newAdd => {
            return !existing.additions.some(existingAdd => {
              const newWords = new Set(newAdd.split(' '))
              const existingWords = new Set(existingAdd.split(' '))
              const overlap = [...newWords].filter(w => existingWords.has(w)).length
              return overlap / Math.max(newWords.size, existingWords.size) > 0.6
            })
          })

          if (uniqueNew.length === 0) return state

          // Keep max 15 additions (remove oldest if needed)
          const allAdditions = [...existing.additions, ...uniqueNew]
          const trimmed = allAdditions.length > 15
            ? allAdditions.slice(allAdditions.length - 15)
            : allAdditions

          return {
            evolutions: {
              ...state.evolutions,
              [modelId]: {
                ...existing,
                additions: trimmed,
                version: existing.version + 1,
                lastEvolved: Date.now(),
              },
            },
          }
        })
      },

      recordSuccess: (modelId, qualityScore) => {
        set(state => {
          const existing = state.evolutions[modelId]
          if (!existing) return state

          // Running average
          const newRate = existing.successRate * 0.7 + (qualityScore / 100) * 0.3

          return {
            evolutions: {
              ...state.evolutions,
              [modelId]: { ...existing, successRate: newRate },
            },
          }
        })
      },

      getStats: () => {
        return Object.values(get().evolutions).map(e => ({
          modelId: e.modelId,
          version: e.version,
          additions: e.additions.length,
          successRate: e.successRate,
        }))
      },

      resetModel: (modelId) => {
        set(state => {
          const { [modelId]: _, ...rest } = state.evolutions
          return { evolutions: rest }
        })
      },

      resetAll: () => set({ evolutions: {} }),
    }),
    { name: 'prompt-evolution-storage' }
  )
)
