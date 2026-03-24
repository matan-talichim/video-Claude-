import React, { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import AutoEditorSettings from './components/AutoEditorSettings'
import ProcessingProgress from './components/ProcessingProgress'
import ExportScreen from './components/ExportScreen'
import EnrichmentReview from './components/EnrichmentReview'
import { useAutoEditorStore, type AutoEditorInput } from './store/autoEditorStore'
import { runAutoEditor, continueAfterEnrichment, resetAutoEditorSession } from './orchestrator'

// Error boundary to catch React errors without redirecting away
class AutoEditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error) {
    console.error('[AUTO-EDITOR] React error caught:', error.message, error.stack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center min-h-screen bg-gray-900 text-white p-8" dir="rtl">
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-xl font-bold text-red-400">שגיאה בעריכה</h2>
            <p className="text-gray-400 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              נסה שוב
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const API_BASE = 'http://localhost:3001/api'

interface LocalFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  type: 'video' | 'audio'
  nativeFile: File
}

interface AutoEditorEntryProps {
  files: LocalFile[]
  onBack: () => void
  onClose: () => void
}

async function uploadFilesToServer(files: LocalFile[]): Promise<string[]> {
  const { addLog, setProgress } = useAutoEditorStore.getState()
  addLog(`מעלה ${files.length} קבצים לשרת...`)

  const serverUrls: string[] = []
  for (let i = 0; i < files.length; i++) {
    setProgress({ current: i + 1, total: files.length })
    addLog(`מעלה קובץ ${i + 1}/${files.length}: ${files[i].name}`)

    const formData = new FormData()
    formData.append('file', files[i].nativeFile)

    const res = await fetch(`${API_BASE}/upload-temp`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`שגיאה בהעלאת קובץ: ${err.message || res.statusText}`)
    }

    const data = await res.json()
    serverUrls.push(data.url)
    addLog(`קובץ ${files[i].name} הועלה בהצלחה`)
  }

  return serverUrls
}

export default function AutoEditorEntry({ files, onBack, onClose }: AutoEditorEntryProps) {
  const step = useAutoEditorStore((s) => s.step)
  const enrichment = useAutoEditorStore((s) => s.enrichment)
  const reset = useAutoEditorStore((s) => s.reset)

  // Warn user before closing tab during processing
  // Skip warning during Vite HMR updates to avoid false "leave page?" dialogs
  useEffect(() => {
    const isProcessing = step !== 'idle' && step !== 'done' && step !== 'error'
    if (isProcessing) {
      let hmrUpdating = false

      if (import.meta.hot) {
        import.meta.hot.on('vite:beforeUpdate', () => { hmrUpdating = true })
        import.meta.hot.on('vite:afterUpdate', () => { hmrUpdating = false })
      }

      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (hmrUpdating) return
        e.preventDefault()
        e.returnValue = 'העריכה עדיין בתהליך. בטוח שרוצה לצאת?'
        return e.returnValue
      }
      window.addEventListener('beforeunload', handleBeforeUnload)
      return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [step])

  // Warn if component unmounts during processing
  useEffect(() => {
    return () => {
      const currentStep = useAutoEditorStore.getState().step
      if (currentStep !== 'idle' && currentStep !== 'done' && currentStep !== 'error') {
        console.error('[AUTO-EDITOR] Component unmounted during processing! Step:', currentStep)
      }
    }
  }, [])

  const handleStart = async (settings: Omit<AutoEditorInput, 'videoUrls'>) => {
    const { setStep, setError } = useAutoEditorStore.getState()

    try {
      // Upload local files to server first (instead of blob URLs)
      setStep('transcribing')
      const videoUrls = await uploadFilesToServer(files)

      runAutoEditor({
        videoUrls,
        ...settings,
      })
    } catch (err: any) {
      setError(err.message || 'שגיאה בהעלאת קבצים')
    }
  }

  const handleEnrichmentApprove = (editedPrompt: string, selectedBRoll: any[], mainPresenter?: string) => {
    // If user selected a different presenter, update transcript segments
    if (mainPresenter) {
      const store = useAutoEditorStore.getState()
      store.setMainPresenter(mainPresenter)
      const transcript = store.transcript
      if (transcript?.segments) {
        transcript.segments.forEach((seg: any) => {
          seg.isPresenter = (seg.speaker === mainPresenter)
        })
        transcript.mainSpeaker = mainPresenter
        transcript.autoDetected = false
        store.setTranscript({ ...transcript })
      }
    }

    continueAfterEnrichment({
      userPrompt: editedPrompt,
      selectedBRoll,
    })
  }

  const handleReset = () => {
    resetAutoEditorSession()
    reset()
    onBack()
  }

  // Render via portal so fixed positioning works (escapes Modal's transform)
  let content: ReactNode

  // Screen 4: Results
  if (step === 'done') {
    console.log('Auto-editor: showing results')
    content = <ExportScreen onReset={handleReset} />
  }
  // Screen 3: Enrichment Review
  else if (step === 'review_enrichment' && enrichment) {
    content = (
      <EnrichmentReview
        enrichment={enrichment}
        onApprove={handleEnrichmentApprove}
      />
    )
  }
  // Screen 2: Processing
  else if (step !== 'idle') {
    content = <ProcessingProgress />
  }
  // Screen 1: Settings
  else {
    content = (
      <AutoEditorSettings
        files={files}
        onStart={handleStart}
        onBack={onBack}
        onClose={onClose}
      />
    )
  }

  return createPortal(
    <AutoEditorErrorBoundary>{content}</AutoEditorErrorBoundary>,
    document.body
  )
}
