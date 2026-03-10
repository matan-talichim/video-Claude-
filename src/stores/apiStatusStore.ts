import { create } from 'zustand'
import { api } from '../services/api'

interface ApiStatusState {
  openai: { connected: boolean }
  elevenlabs: { connected: boolean }
  deepl: { connected: boolean }
  gemini: { connected: boolean }
  seedance: { connected: boolean }
  pixabay: { connected: boolean }
  loading: boolean
  checked: boolean
  lastCheckedAt: number
  checkStatus: () => Promise<void>
}

const STATUS_CACHE_TTL = 60000 // 60 seconds

export const useApiStatusStore = create<ApiStatusState>((set, get) => ({
  openai: { connected: false },
  elevenlabs: { connected: false },
  deepl: { connected: false },
  gemini: { connected: false },
  seedance: { connected: false },
  pixabay: { connected: false },
  loading: false,
  checked: false,
  lastCheckedAt: 0,
  checkStatus: async () => {
    const state = get()
    // Cache: skip if checked within last 60 seconds
    if (state.checked && Date.now() - state.lastCheckedAt < STATUS_CACHE_TTL) {
      return
    }
    set({ loading: true })
    try {
      const status = await api.checkApiStatus()
      set({
        openai: { connected: status.openai?.connected || false },
        elevenlabs: { connected: status.elevenlabs?.connected || false },
        deepl: { connected: status.deepl?.connected || false },
        gemini: { connected: status.gemini?.connected || false },
        seedance: { connected: status.seedance?.connected || false },
        pixabay: { connected: status.pixabay?.connected || false },
        loading: false,
        checked: true,
        lastCheckedAt: Date.now(),
      })
    } catch {
      set({
        openai: { connected: false },
        elevenlabs: { connected: false },
        deepl: { connected: false },
        gemini: { connected: false },
        seedance: { connected: false },
        pixabay: { connected: false },
        loading: false,
        checked: true,
        lastCheckedAt: Date.now(),
      })
    }
  },
}))
