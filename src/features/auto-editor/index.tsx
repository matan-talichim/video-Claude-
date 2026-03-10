import AutoEditorSettings from './components/AutoEditorSettings'
import ProcessingProgress from './components/ProcessingProgress'
import ExportScreen from './components/ExportScreen'
import { useAutoEditorStore, type AutoEditorInput } from './store/autoEditorStore'
import { runAutoEditor } from './orchestrator'

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

export default function AutoEditorEntry({ files, onBack, onClose }: AutoEditorEntryProps) {
  const step = useAutoEditorStore((s) => s.step)
  const reset = useAutoEditorStore((s) => s.reset)

  const handleStart = (settings: Omit<AutoEditorInput, 'videoUrls'>) => {
    // Create blob URLs from local files as video URLs
    const videoUrls = files.map((f) => URL.createObjectURL(f.nativeFile))

    runAutoEditor({
      videoUrls,
      ...settings,
    })
  }

  const handleReset = () => {
    reset()
    onBack()
  }

  // Screen 3: Results
  if (step === 'done') {
    return <ExportScreen onReset={handleReset} />
  }

  // Screen 2: Processing
  if (step !== 'idle') {
    return <ProcessingProgress />
  }

  // Screen 1: Settings
  return (
    <AutoEditorSettings
      files={files}
      onStart={handleStart}
      onBack={onBack}
    />
  )
}
