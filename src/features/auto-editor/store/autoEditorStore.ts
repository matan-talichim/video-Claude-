import { create } from 'zustand'

export type AutoEditorStep =
  | 'idle'
  | 'transcribing'
  | 'validating'
  | 'analyzing_visuals'
  | 'cleaning'
  | 'enriching'
  | 'review_enrichment'
  | 'planning'
  | 'generating_assets'
  | 'editing'
  | 'comparing'
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
  includeSubtitles: boolean
  includeBackground: boolean
  animatedSubtitles: boolean
  animationStyle: string
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

export interface QualityReport {
  score: number
  issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string }>
  passed: string[]
}

export interface ABVersionResult {
  approach: string
  files: PlatformFile[]
  videoIndex: number
  optimalDuration?: number
  durationReasoning?: string
  recommendedPlatform?: string
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

  // Enrichment data
  enrichment: any | null
  transcript: any | null

  // Visual & Energy analysis
  visualAnalysis: any | null
  energyAnalysis: any | null

  // Main presenter selection
  mainPresenter: string | null
  detectedPresenter: string | null
  presenterConfidence: 'high' | 'medium' | 'low' | null
  presenterDescription: string | null

  // A/B version comparison
  versionA: ABVersionResult[] | null
  versionB: ABVersionResult[] | null
  versionAApproach: string
  versionBApproach: string
  selectedVersion: 'A' | 'B' | null

  // Quality report
  qualityReport: QualityReport | null

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
  setEnrichment: (data: any) => void
  setTranscript: (data: any) => void
  setVisualAnalysis: (data: any) => void
  setEnergyAnalysis: (data: any) => void
  setVersionA: (data: ABVersionResult[], approach: string) => void
  setVersionB: (data: ABVersionResult[], approach: string) => void
  setMainPresenter: (speaker: string | null) => void
  setDetectedPresenter: (speaker: string | null, confidence: 'high' | 'medium' | 'low', description?: string) => void
  setSelectedVersion: (v: 'A' | 'B') => void
  setQualityReport: (report: QualityReport) => void
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
  enrichment: null as any | null,
  transcript: null as any | null,
  visualAnalysis: null as any | null,
  energyAnalysis: null as any | null,
  mainPresenter: null as string | null,
  detectedPresenter: null as string | null,
  presenterConfidence: null as 'high' | 'medium' | 'low' | null,
  presenterDescription: null as string | null,
  versionA: null as ABVersionResult[] | null,
  versionB: null as ABVersionResult[] | null,
  versionAApproach: '',
  versionBApproach: '',
  selectedVersion: null as 'A' | 'B' | null,
  qualityReport: null as QualityReport | null,
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
  setEnrichment: (enrichment) => set({ enrichment }),
  setTranscript: (transcript) => set({ transcript }),
  setVisualAnalysis: (visualAnalysis) => set({ visualAnalysis }),
  setEnergyAnalysis: (energyAnalysis) => set({ energyAnalysis }),
  setVersionA: (data, approach) => set({ versionA: data, versionAApproach: approach }),
  setVersionB: (data, approach) => set({ versionB: data, versionBApproach: approach }),
  setMainPresenter: (mainPresenter) => set({ mainPresenter }),
  setDetectedPresenter: (detectedPresenter, presenterConfidence, presenterDescription) =>
    set({ detectedPresenter, presenterConfidence, presenterDescription: presenterDescription || null }),
  setSelectedVersion: (selectedVersion) => set({ selectedVersion }),
  setQualityReport: (qualityReport) => set({ qualityReport }),

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
