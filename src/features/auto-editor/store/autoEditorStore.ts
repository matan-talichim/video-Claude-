import { create } from 'zustand'

export type AutoEditorStep =
  | 'idle'
  | 'transcribing'
  | 'validating'
  | 'planning'
  | 'generating_assets'
  | 'editing'
  | 'exporting'
  | 'done'
  | 'error'

export interface ExportResult {
  videoIndex: number
  platform: string
  url: string
  fileName: string
  width: number
  height: number
}

export interface AutoEditorInput {
  videoUrls: string[]
  userPrompt: string
  targetDuration: number
  numberOfVideos: number
  brollGenerator: 'seedance' | 'veo'
}

interface AutoEditorStore {
  // State
  step: AutoEditorStep
  progress: { current: number; total: number }
  error: string | null
  results: ExportResult[] | null
  logs: string[]

  // Input saved for reference
  input: AutoEditorInput | null

  // Completed steps tracking
  completedSteps: AutoEditorStep[]

  // Actions
  setStep: (step: AutoEditorStep) => void
  setProgress: (p: { current: number; total: number }) => void
  setError: (msg: string) => void
  setResults: (r: ExportResult[]) => void
  addLog: (msg: string) => void
  setInput: (input: AutoEditorInput) => void
  markStepCompleted: (step: AutoEditorStep) => void
  reset: () => void
}

const initialState = {
  step: 'idle' as AutoEditorStep,
  progress: { current: 0, total: 0 },
  error: null as string | null,
  results: null as ExportResult[] | null,
  logs: [] as string[],
  input: null as AutoEditorInput | null,
  completedSteps: [] as AutoEditorStep[],
}

export const useAutoEditorStore = create<AutoEditorStore>((set, get) => ({
  ...initialState,

  setStep: (step) => {
    const prev = get().step
    set({ step, error: null })
    if (prev !== 'idle' && prev !== 'error') {
      get().markStepCompleted(prev)
    }
    get().addLog(`שלב: ${step}`)
  },

  setProgress: (progress) => set({ progress }),

  setError: (msg) => {
    set({ step: 'error', error: msg })
    get().addLog(`שגיאה: ${msg}`)
  },

  setResults: (results) => set({ results }),

  addLog: (msg) => {
    const timestamp = new Date().toLocaleTimeString('he-IL')
    set((s) => ({ logs: [...s.logs, `[${timestamp}] ${msg}`] }))
  },

  setInput: (input) => set({ input }),

  markStepCompleted: (step) => {
    set((s) => ({
      completedSteps: s.completedSteps.includes(step)
        ? s.completedSteps
        : [...s.completedSteps, step],
    }))
  },

  reset: () => set(initialState),
}))
