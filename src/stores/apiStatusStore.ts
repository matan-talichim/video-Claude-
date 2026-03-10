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
  checkStatus: () => Promise<void>
}

export const useApiStatusStore = create<ApiStatusState>((set) => ({
  openai: { connected: false },
  elevenlabs: { connected: false },
  deepl: { connected: false },
  gemini: { connected: false },
  seedance: { connected: false },
  pixabay: { connected: false },
  loading: false,
  checked: false,
  checkStatus: async () => {
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
      })
    }
  },
}))
