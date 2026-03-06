import { useState, useCallback, useRef } from 'react'
import { GripVertical, Plus, Upload, Trash2 } from 'lucide-react'
import WizardModal from '../WizardModal'
import GeneratingSteps, { defaultSteps } from './GeneratingSteps'
import CompletionStep from './CompletionStep'

interface Scene {
  id: string
  title: string
  text: string
  voice: string
}

const voiceOptions = ['קריין ראשי', 'קריינית ראשית', 'דובר אנרגטי', 'דוברת רכה']

function splitToScenes(text: string): Scene[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)
  if (paragraphs.length === 0) return []

  return paragraphs.map((p, i) => ({
    id: `scene-${i}-${Date.now()}`,
    title: `סצנה ${i + 1}`,
    text: p.trim(),
    voice: voiceOptions[0],
  }))
}

function estimateDuration(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 130) // ~130 words/min
  if (minutes < 1) return 'פחות מדקה'
  return `כ-${minutes} דקות`
}

interface PasteScriptModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function PasteScriptModal({ isOpen, onClose }: PasteScriptModalProps) {
  const [step, setStep] = useState(0)
  const [script, setScript] = useState('')
  const [scenes, setScenes] = useState<Scene[]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stepLabels = ['סקריפט', 'סצנות', 'יצירה', 'סיום']

  const wordCount = script.trim().split(/\s+/).filter(Boolean).length

  const handleClose = () => {
    setStep(0)
    setScript('')
    setScenes([])
    onClose()
  }

  const handleReset = () => {
    setStep(0)
    setScript('')
    setScenes([])
  }

  const handleContinueToScenes = () => {
    const parsed = splitToScenes(script)
    if (parsed.length === 0) {
      // If no paragraphs, make one scene with all text
      setScenes([{
        id: `scene-0-${Date.now()}`,
        title: 'סצנה 1',
        text: script.trim(),
        voice: voiceOptions[0],
      }])
    } else {
      setScenes(parsed)
    }
    setStep(1)
  }

  const handleGenerateComplete = useCallback(() => {
    setStep(3)
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) setScript(text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const updateScene = (id: string, updates: Partial<Scene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  const removeScene = (id: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== id))
  }

  const addScene = () => {
    setScenes((prev) => [
      ...prev,
      {
        id: `scene-${prev.length}-${Date.now()}`,
        title: `סצנה ${prev.length + 1}`,
        text: '',
        voice: voiceOptions[0],
      },
    ])
  }

  // Reorder drag handlers
  const handleDragStart = (idx: number) => setDragIdx(idx)

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDropIdx(idx)
  }

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null)
      setDropIdx(null)
      return
    }
    setScenes((prev) => {
      const arr = [...prev]
      const [item] = arr.splice(dragIdx, 1)
      arr.splice(targetIdx, 0, item)
      return arr
    })
    setDragIdx(null)
    setDropIdx(null)
  }

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="הדבק סקריפט"
      steps={stepLabels}
      currentStep={step}
      onBack={step > 0 && step < 2 ? () => setStep(step - 1) : undefined}
    >
      {/* Step 1: Script input */}
      {step === 0 && (
        <div className="max-w-2xl mx-auto space-y-4">
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="הדבק את הסקריפט שלך כאן..."
            className="w-full h-56 px-4 py-3 bg-bg-card rounded-xl border border-white/[0.06] text-text-primary text-body placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none leading-relaxed"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span>{wordCount} מילים</span>
              {wordCount > 0 && <span>משך משוער: {estimateDuration(wordCount)}</span>}
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.doc,.docx,.srt"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent-purple hover:bg-accent-purple/5 rounded-lg transition-colors"
              >
                <Upload size={14} /> או העלה קובץ טקסט
              </button>
            </div>
          </div>

          <button
            onClick={handleContinueToScenes}
            disabled={!script.trim()}
            className="w-full px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            המשך
          </button>
        </div>
      )}

      {/* Step 2: Scene breakdown */}
      {step === 1 && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-text-primary">חלוקה לסצנות</h3>
            <span className="text-xs text-text-muted">{scenes.length} סצנות</span>
          </div>

          <div className="space-y-3">
            {scenes.map((scene, idx) => (
              <div
                key={scene.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
                className={`p-4 rounded-xl border transition-all ${
                  dragIdx === idx
                    ? 'opacity-50 border-accent-purple/40'
                    : dropIdx === idx
                      ? 'border-accent-purple/40 bg-accent-purple/5'
                      : 'border-white/[0.06] bg-bg-card hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Drag handle */}
                  <div className="mt-1 cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary">
                    <GripVertical size={18} />
                  </div>

                  {/* Scene number */}
                  <span className="mt-1 w-6 h-6 rounded-full bg-accent-purple/10 flex items-center justify-center text-xs text-accent-purple font-bold shrink-0">
                    {idx + 1}
                  </span>

                  {/* Scene content */}
                  <div className="flex-1 space-y-2">
                    <input
                      value={scene.title}
                      onChange={(e) => updateScene(scene.id, { title: e.target.value })}
                      className="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
                    />
                    <textarea
                      value={scene.text}
                      onChange={(e) => updateScene(scene.id, { text: e.target.value })}
                      className="w-full bg-bg-elevated/50 rounded-lg px-3 py-2 text-sm text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent-purple/30 resize-none leading-relaxed"
                      rows={3}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">קול:</span>
                      <select
                        value={scene.voice}
                        onChange={(e) => updateScene(scene.id, { voice: e.target.value })}
                        className="px-2 py-1 bg-bg-elevated rounded-lg border border-white/[0.06] text-xs text-text-primary focus:outline-none cursor-pointer"
                      >
                        {voiceOptions.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeScene(scene.id)}
                    className="mt-1 p-1 text-text-muted hover:text-error rounded transition-colors hover:bg-error/10"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addScene}
            className="flex items-center gap-2 px-4 py-2 text-sm text-accent-purple hover:bg-accent-purple/5 rounded-xl transition-colors w-full justify-center border border-dashed border-accent-purple/30"
          >
            <Plus size={16} /> הוסף סצנה
          </button>

          <button
            onClick={() => setStep(2)}
            disabled={scenes.length === 0}
            className="w-full px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            צור סרטון
          </button>
        </div>
      )}

      {/* Step 3: Generating */}
      {step === 2 && (
        <GeneratingSteps steps={defaultSteps} onComplete={handleGenerateComplete} />
      )}

      {/* Step 4: Done */}
      {step === 3 && (
        <CompletionStep onReset={handleReset} onClose={handleClose} source="script" />
      )}
    </WizardModal>
  )
}
