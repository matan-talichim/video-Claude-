import { create } from 'zustand'

export type AiAdStep =
  | 'idle'
  | 'splitting'
  | 'generating_prompts'
  | 'generating_videos'
  | 'uploading'
  | 'merging'
  | 'done'
  | 'error'

export interface SceneStatus {
  index: number
  hebrewText: string
  englishPrompt: string
  videoProvider: 'veo' | 'seedance' | null
  videoUrl: string | null
  r2Url: string | null
  status: 'pending' | 'generating_prompt' | 'generating_video' | 'fallback' | 'uploading' | 'done' | 'error'
  error: string | null
}

interface AiAdStore {
  step: AiAdStep
  script: string
  scenes: SceneStatus[]
  progress: { current: number; total: number; label?: string }
  logs: string[]
  error: string | null
  finalVideoUrl: string | null

  setScript: (script: string) => void
  setStep: (step: AiAdStep) => void
  setScenes: (scenes: SceneStatus[]) => void
  updateScene: (index: number, update: Partial<SceneStatus>) => void
  setProgress: (p: { current: number; total: number; label?: string }) => void
  setError: (msg: string) => void
  setFinalVideoUrl: (url: string) => void
  addLog: (msg: string) => void
  reset: () => void
}

const initialState = {
  step: 'idle' as AiAdStep,
  script: '',
  scenes: [] as SceneStatus[],
  progress: { current: 0, total: 0 },
  logs: [] as string[],
  error: null as string | null,
  finalVideoUrl: null as string | null,
}

export const useAiAdStore = create<AiAdStore>((set, get) => ({
  ...initialState,

  setScript: (script) => set({ script }),

  setStep: (step) => {
    console.log(`[AI-AD] Step: ${get().step} → ${step}`)
    set({ step, error: null })
    get().addLog(`שלב: ${step}`)
  },

  setScenes: (scenes) => set({ scenes }),

  updateScene: (index, update) =>
    set((s) => ({
      scenes: s.scenes.map((sc, i) => (i === index ? { ...sc, ...update } : sc)),
    })),

  setProgress: (progress) => set({ progress }),

  setError: (msg) => {
    set({ step: 'error', error: msg })
    get().addLog(`שגיאה: ${msg}`)
  },

  setFinalVideoUrl: (finalVideoUrl) => set({ finalVideoUrl }),

  addLog: (msg) => {
    const timestamp = new Date().toLocaleTimeString('he-IL')
    set((s) => ({ logs: [...s.logs, `[${timestamp}] ${msg}`] }))
  },

  reset: () => set(initialState),
}))
