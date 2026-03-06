import { useState, useCallback } from 'react'
import WizardModal from '../WizardModal'
import GeneratingSteps, { defaultSteps } from './GeneratingSteps'
import CompletionStep from './CompletionStep'

const exampleChips = [
  'סרטון הדרכה למוצר',
  'פוסט שיווקי',
  'סיכום פגישה',
  'הסבר על שירות חדש',
]

const avatars = [
  { id: 'none', name: 'ללא אווטאר', gradient: 'from-gray-600/30 to-gray-400/30' },
  { id: 'male1', name: 'דניאל', gradient: 'from-blue-600/30 to-cyan-600/30' },
  { id: 'female1', name: 'שירה', gradient: 'from-pink-600/30 to-purple-600/30' },
  { id: 'male2', name: 'יוסי', gradient: 'from-green-600/30 to-teal-600/30' },
]

const voices = [
  { id: 'male-warm', name: 'גבר - חם' },
  { id: 'female-professional', name: 'אישה - מקצועית' },
  { id: 'male-energetic', name: 'גבר - אנרגטי' },
  { id: 'female-soft', name: 'אישה - רכה' },
]

const styles = [
  { id: 'minimal', name: 'מינימליסטי', emoji: '⬜' },
  { id: 'corporate', name: 'תאגידי', emoji: '🏢' },
  { id: 'creative', name: 'יצירתי', emoji: '🎨' },
  { id: 'dynamic', name: 'דינמי', emoji: '⚡' },
  { id: 'elegant', name: 'אלגנטי', emoji: '✨' },
  { id: 'retro', name: 'רטרו', emoji: '📼' },
]

interface GenerateFromPromptModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function GenerateFromPromptModal({ isOpen, onClose }: GenerateFromPromptModalProps) {
  const [step, setStep] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState('none')
  const [selectedVoice, setSelectedVoice] = useState(voices[0].id)
  const [selectedStyle, setSelectedStyle] = useState('minimal')
  const [duration, setDuration] = useState(120)

  const stepLabels = ['תיאור', 'הגדרות', 'יצירה', 'סיום']

  const handleClose = () => {
    setStep(0)
    setPrompt('')
    setSelectedAvatar('none')
    setSelectedVoice(voices[0].id)
    setSelectedStyle('minimal')
    setDuration(120)
    onClose()
  }

  const handleReset = () => {
    setStep(0)
    setPrompt('')
  }

  const handleGenerateComplete = useCallback(() => {
    setStep(3)
  }, [])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="צור מפרומפט"
      steps={stepLabels}
      currentStep={step}
      onBack={step > 0 && step < 2 ? () => setStep(step - 1) : undefined}
    >
      {/* Step 1: Describe */}
      {step === 0 && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="תאר את הסרטון שאתה רוצה ליצור..."
              className="w-full h-40 px-4 py-3 bg-bg-card rounded-xl border border-white/[0.06] text-text-primary text-body placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none"
            />
          </div>

          <div>
            <p className="text-xs text-text-muted mb-2">דוגמאות:</p>
            <div className="flex flex-wrap gap-2">
              {exampleChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setPrompt(chip)}
                  className="px-3 py-1.5 rounded-full text-xs bg-white/[0.04] text-text-secondary border border-white/[0.06] hover:bg-accent-purple/10 hover:text-accent-purple hover:border-accent-purple/20 transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(1)}
            disabled={!prompt.trim()}
            className="w-full px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            המשך
          </button>
        </div>
      )}

      {/* Step 2: Settings */}
      {step === 1 && (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Avatar selector */}
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-3">אווטאר</h4>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {avatars.map((avatar) => (
                <button
                  key={avatar.id}
                  onClick={() => setSelectedAvatar(avatar.id)}
                  className={`shrink-0 w-20 text-center p-2 rounded-xl border-2 transition-all ${
                    selectedAvatar === avatar.id
                      ? 'border-accent-purple bg-accent-purple/5'
                      : 'border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto rounded-full bg-gradient-to-br ${avatar.gradient} mb-1.5`} />
                  <span className="text-[11px] text-text-secondary">{avatar.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voice */}
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-3">קול</h4>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full px-4 py-2.5 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-primary focus:outline-none cursor-pointer"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Style */}
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-3">סגנון</h4>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {styles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    selectedStyle === style.id
                      ? 'border-accent-purple bg-accent-purple/5'
                      : 'border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <div className="text-xl mb-1">{style.emoji}</div>
                  <div className="text-[11px] text-text-secondary">{style.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration slider */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text-primary">משך</h4>
              <span className="text-sm text-accent-purple font-mono">{formatDuration(duration)}</span>
            </div>
            <input
              type="range"
              min={30}
              max={300}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-accent-purple"
              style={{ direction: 'ltr' }}
            />
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>0:30</span>
              <span>5:00</span>
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
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
        <CompletionStep onReset={handleReset} onClose={handleClose} source="prompt" />
      )}
    </WizardModal>
  )
}
