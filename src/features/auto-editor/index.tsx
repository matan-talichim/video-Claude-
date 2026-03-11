import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import AutoEditorSettings from './components/AutoEditorSettings'
import ProcessingProgress from './components/ProcessingProgress'
import ExportScreen from './components/ExportScreen'
import { useAutoEditorStore, type AutoEditorInput } from './store/autoEditorStore'
import { runAutoEditor } from './orchestrator'

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
  const reset = useAutoEditorStore((s) => s.reset)

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

  const handleReset = () => {
    reset()
    onBack()
  }

  // Render via portal so fixed positioning works (escapes Modal's transform)
  let content: ReactNode

  // Screen 3: Results
  if (step === 'done') {
    content = <ExportScreen onReset={handleReset} />
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

  return createPortal(content, document.body)
}
