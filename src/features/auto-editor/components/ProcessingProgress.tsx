import { Loader2, CheckCircle, Circle, XCircle } from 'lucide-react'
import { useAutoEditorStore, type AutoEditorStep } from '../store/autoEditorStore'

const STEPS_CONFIG: { key: AutoEditorStep; label: string; activeLabel?: string }[] = [
  { key: 'transcribing', label: 'תמלול הושלם', activeLabel: 'מתמלל את הסרטון...' },
  { key: 'validating', label: 'ולידציית חומר', activeLabel: 'מאמת את החומר...' },
  { key: 'enriching', label: 'AI ניתח תוכן', activeLabel: 'AI מנתח את התוכן ומשפר פרומפט...' },
  { key: 'review_enrichment', label: 'סקירת הצעות', activeLabel: 'ממתין לאישור...' },
  { key: 'planning', label: 'תכנון דו-שלבי: במאי + עורך טכני', activeLabel: 'הבמאי מנתח → העורך מתכנן...' },
  { key: 'generating_assets', label: 'יצירת נכסים (רקע, B-Roll, מוזיקה)', activeLabel: 'מייצר נכסים...' },
  { key: 'editing', label: 'עריכת סרטונים', activeLabel: 'עורך סרטונים...' },
  { key: 'exporting', label: 'ייצוא לפלטפורמות', activeLabel: 'מייצא...' },
]

function getStepStatus(
  stepKey: AutoEditorStep,
  currentStep: AutoEditorStep,
  completedSteps: AutoEditorStep[]
): 'done' | 'active' | 'pending' {
  if (completedSteps.includes(stepKey)) return 'done'
  if (currentStep === stepKey) return 'active'
  return 'pending'
}

function StepIcon({ status }: { status: 'done' | 'active' | 'pending' }) {
  if (status === 'done') return <CheckCircle size={18} className="text-green-400" />
  if (status === 'active') return <Loader2 size={18} className="text-accent-purple animate-spin" />
  return <Circle size={18} className="text-white/20" />
}

export default function ProcessingProgress() {
  const step = useAutoEditorStore((s) => s.step)
  const progress = useAutoEditorStore((s) => s.progress)
  const error = useAutoEditorStore((s) => s.error)
  const completedSteps = useAutoEditorStore((s) => s.completedSteps)

  const totalSteps = STEPS_CONFIG.length
  const doneCount = completedSteps.length
  const overallPercent = Math.round((doneCount / totalSteps) * 100)

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex flex-col items-center justify-center py-8 px-4 max-w-2xl mx-auto space-y-6 animate-fade-in" dir="rtl">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-text-primary">
            {error ? 'אירעה שגיאה' : 'מעבד את הסרטונים שלך...'}
          </h2>
          {step === 'editing' && progress.total > 0 && (
            <p className="text-sm text-text-muted">
              {progress.label || `סרטון ${progress.current} מתוך ${progress.total}`}
            </p>
          )}
        </div>

        {/* Progress bar */}
        {!error && (
          <div className="w-full space-y-2">
            <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-700 ease-out"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-muted">
              <span>{overallPercent}%</span>
              <span>{doneCount} / {totalSteps} שלבים</span>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="w-full bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <XCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-300 font-medium">שגיאה בעיבוד</p>
              <p className="text-xs text-red-400/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Steps list */}
        <div className="w-full bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-3">
          {STEPS_CONFIG.map((s) => {
            const status = getStepStatus(s.key, step, completedSteps)
            return (
              <div
                key={s.key}
                className={`flex items-center gap-3 transition-opacity ${
                  status === 'pending' ? 'opacity-40' : 'opacity-100'
                }`}
              >
                <StepIcon status={status} />
                <span
                  className={`text-sm ${
                    status === 'active'
                      ? 'text-accent-purple font-medium'
                      : status === 'done'
                      ? 'text-text-primary'
                      : 'text-text-muted'
                  }`}
                >
                  {status === 'done' ? '✅' : status === 'active' ? '⏳' : '○'}{' '}
                  {status === 'active' && s.activeLabel ? s.activeLabel : s.label}
                  {s.key === 'planning' && status === 'active' && progress.label && (
                    <span className="text-text-muted text-xs mr-2 block">
                      {progress.label}
                    </span>
                  )}
                  {s.key === 'editing' && status === 'active' && progress.total > 0 && (
                    <span className="text-text-muted text-xs mr-2">
                      ({progress.current}/{progress.total})
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
