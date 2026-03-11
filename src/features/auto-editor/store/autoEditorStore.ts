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

export interface PlatformFile {
  platform: string
  ratio: string
  resolution: string
  filename: string
  url: string
  sizeMB: number
}

export interface VideoResult {
  videoIndex: number
  files: PlatformFile[]
  optimalDuration?: number
  durationReasoning?: string
  recommendedPlatform?: string
}

// Keep old type for backward compat
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
  platforms: string[]
}

export interface EditedFile {
  id: string
  name: string
  format: string
  platform: string
  blobUrl: string
  createdAt: Date
  appliedEdits: string[]
}

interface AutoEditorStore {
  // State
  step: AutoEditorStep
  progress: { current: number; total: number; label?: string }
  error: string | null
  results: ExportResult[] | null
  processedVideos: VideoResult[] | null
  logs: string[]
  editedFiles: EditedFile[]

  // Input saved for reference
  input: AutoEditorInput | null

  // Cached intermediate results for reuse / resume on failure
  cachedTranscript: any | null
  cachedEditingPlan: any | null
  cachedAssets: { backgroundImage: string; brollClips: string[]; music: string } | null

  // Completed steps tracking
  completedSteps: AutoEditorStep[]

  // Actions
  setStep: (step: AutoEditorStep) => void
  setProgress: (p: { current: number; total: number; label?: string }) => void
  setError: (msg: string) => void
  setResults: (r: ExportResult[]) => void
  setProcessedVideos: (v: VideoResult[]) => void
  addLog: (msg: string) => void
  setInput: (input: AutoEditorInput) => void
  setCachedTranscript: (t: any) => void
  setCachedEditingPlan: (p: any) => void
  setCachedAssets: (a: { backgroundImage: string; brollClips: string[]; music: string }) => void
  markStepCompleted: (step: AutoEditorStep) => void
  setEditedFiles: (files: EditedFile[]) => void
  reset: () => void
}

const initialState = {
  step: 'idle' as AutoEditorStep,
  progress: { current: 0, total: 0 } as { current: number; total: number; label?: string },
  error: null as string | null,
  results: null as ExportResult[] | null,
  processedVideos: null as VideoResult[] | null,
  logs: [] as string[],
  editedFiles: [] as EditedFile[],
  input: null as AutoEditorInput | null,
  cachedTranscript: null as any | null,
  cachedEditingPlan: null as any | null,
  cachedAssets: null as { backgroundImage: string; brollClips: string[]; music: string } | null,
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
  setProcessedVideos: (processedVideos) => set({ processedVideos }),

  addLog: (msg) => {
    const timestamp = new Date().toLocaleTimeString('he-IL')
    set((s) => ({ logs: [...s.logs, `[${timestamp}] ${msg}`] }))
  },

  setInput: (input) => set({ input }),

  setCachedTranscript: (cachedTranscript) => set({ cachedTranscript }),
  setCachedEditingPlan: (cachedEditingPlan) => set({ cachedEditingPlan }),
  setCachedAssets: (cachedAssets) => set({ cachedAssets }),

  markStepCompleted: (step) => {
    set((s) => ({
      completedSteps: s.completedSteps.includes(step)
        ? s.completedSteps
        : [...s.completedSteps, step],
    }))
  },

  setEditedFiles: (editedFiles) => set({ editedFiles }),

  reset: () => set(initialState),
}))
