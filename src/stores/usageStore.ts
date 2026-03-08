import { create } from 'zustand'

interface UsageStore {
  whisperMinutes: number
  gptTokens: number
  elevenLabsCharacters: number
  deeplCharacters: number
  dalleImages: number
  estimatedCost: number

  addWhisperUsage: (minutes: number) => void
  addGptUsage: (tokens: number) => void
  addElevenLabsUsage: (characters: number) => void
  addDeeplUsage: (characters: number) => void
  addDalleUsage: () => void
  resetUsage: () => void
}

// Rough cost estimates per unit
const COSTS = {
  whisperPerMinute: 0.006,
  gptPer1kTokens: 0.005,
  elevenLabsPer1kChars: 0.30,
  deeplPer1kChars: 0.025,
  dallePerImage: 0.04,
}

function calcEstimatedCost(state: Omit<UsageStore, 'estimatedCost' | 'addWhisperUsage' | 'addGptUsage' | 'addElevenLabsUsage' | 'addDeeplUsage' | 'addDalleUsage' | 'resetUsage'>) {
  return (
    state.whisperMinutes * COSTS.whisperPerMinute +
    (state.gptTokens / 1000) * COSTS.gptPer1kTokens +
    (state.elevenLabsCharacters / 1000) * COSTS.elevenLabsPer1kChars +
    (state.deeplCharacters / 1000) * COSTS.deeplPer1kChars +
    state.dalleImages * COSTS.dallePerImage
  )
}

export const useUsageStore = create<UsageStore>((set) => ({
  whisperMinutes: 0,
  gptTokens: 0,
  elevenLabsCharacters: 0,
  deeplCharacters: 0,
  dalleImages: 0,
  estimatedCost: 0,

  addWhisperUsage: (minutes) =>
    set((s) => {
      const next = { ...s, whisperMinutes: s.whisperMinutes + minutes }
      return { ...next, estimatedCost: calcEstimatedCost(next) }
    }),

  addGptUsage: (tokens) =>
    set((s) => {
      const next = { ...s, gptTokens: s.gptTokens + tokens }
      return { ...next, estimatedCost: calcEstimatedCost(next) }
    }),

  addElevenLabsUsage: (characters) =>
    set((s) => {
      const next = { ...s, elevenLabsCharacters: s.elevenLabsCharacters + characters }
      return { ...next, estimatedCost: calcEstimatedCost(next) }
    }),

  addDeeplUsage: (characters) =>
    set((s) => {
      const next = { ...s, deeplCharacters: s.deeplCharacters + characters }
      return { ...next, estimatedCost: calcEstimatedCost(next) }
    }),

  addDalleUsage: () =>
    set((s) => {
      const next = { ...s, dalleImages: s.dalleImages + 1 }
      return { ...next, estimatedCost: calcEstimatedCost(next) }
    }),

  resetUsage: () =>
    set({
      whisperMinutes: 0,
      gptTokens: 0,
      elevenLabsCharacters: 0,
      deeplCharacters: 0,
      dalleImages: 0,
      estimatedCost: 0,
    }),
}))
