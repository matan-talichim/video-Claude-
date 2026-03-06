import { useState, useEffect } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'

interface GeneratingStep {
  label: string
  emoji: string
  duration: number // in ms
}

interface GeneratingStepsProps {
  steps: GeneratingStep[]
  onComplete: () => void
}

const defaultSteps: GeneratingStep[] = [
  { label: 'כותב סקריפט...', emoji: '📝', duration: 2000 },
  { label: 'מייצר ויזואליה...', emoji: '🎨', duration: 3000 },
  { label: 'מקליט קריינות...', emoji: '🎙️', duration: 2000 },
  { label: 'עורך ומרכיב...', emoji: '✂️', duration: 3000 },
  { label: 'ליטוש סופי...', emoji: '✨', duration: 2000 },
]

export { defaultSteps }

export default function GeneratingSteps({ steps, onComplete }: GeneratingStepsProps) {
  const [completedSteps, setCompletedSteps] = useState<number>(0)
  const [currentActive, setCurrentActive] = useState(0)

  useEffect(() => {
    if (currentActive >= steps.length) {
      onComplete()
      return
    }

    const timer = setTimeout(() => {
      setCompletedSteps((prev) => prev + 1)
      setCurrentActive((prev) => prev + 1)
    }, steps[currentActive].duration)

    return () => clearTimeout(timer)
  }, [currentActive, steps, onComplete])

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent-purple/10 flex items-center justify-center">
          <Loader2 size={28} className="text-accent-purple animate-spin" />
        </div>
        <h3 className="text-lg font-bold text-text-primary mb-1">מייצר את הסרטון שלך...</h3>
        <p className="text-sm text-text-muted">זה ייקח רק כמה רגעים</p>
      </div>

      <div className="space-y-4">
        {steps.map((step, i) => {
          const isCompleted = i < completedSteps
          const isActive = i === currentActive && i < steps.length
          const isPending = i > currentActive

          return (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-500 ${
                isActive
                  ? 'bg-accent-purple/5 border border-accent-purple/20'
                  : isCompleted
                    ? 'bg-success/5'
                    : 'opacity-40'
              }`}
            >
              <span className="text-lg">{step.emoji}</span>
              <span className={`flex-1 text-sm ${isActive ? 'text-text-primary font-medium' : isCompleted ? 'text-text-secondary' : 'text-text-muted'}`}>
                {step.label}
              </span>
              {isCompleted && <CheckCircle size={18} className="text-success animate-scale-in" />}
              {isActive && <Loader2 size={18} className="text-accent-purple animate-spin" />}
              {isPending && <div className="w-[18px] h-[18px]" />}
            </div>
          )
        })}
      </div>

      {/* Overall progress */}
      <div className="mt-6">
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-1000"
            style={{ width: `${(completedSteps / steps.length) * 100}%` }}
          />
        </div>
        <div className="text-center mt-2 text-xs text-text-muted">
          {completedSteps} / {steps.length} שלבים הושלמו
        </div>
      </div>
    </div>
  )
}
