import { type ReactNode } from 'react'
import { X, ChevronRight } from 'lucide-react'
import Modal from './Modal'

interface WizardModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  steps: string[]
  currentStep: number
  onBack?: () => void
  children: ReactNode
}

export default function WizardModal({ isOpen, onClose, title, steps, currentStep, onBack, children }: WizardModalProps) {
  const progress = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 100

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" hideHeader>
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/[0.06]">
        <div
          className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Custom header */}
      <div className="flex items-center justify-between mb-6 -mt-1">
        {/* Back button (right side in RTL) */}
        <div className="w-24">
          {currentStep > 0 && onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronRight size={16} />
              חזרה
            </button>
          )}
        </div>

        {/* Title + Step dots */}
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <div className="flex items-center gap-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      i === currentStep
                        ? 'bg-accent-purple scale-125 shadow-lg shadow-accent-purple/40'
                        : i < currentStep
                          ? 'bg-accent-purple/60'
                          : 'bg-white/[0.12]'
                    }`}
                  />
                  <span className={`text-[10px] whitespace-nowrap ${
                    i === currentStep ? 'text-text-primary' : 'text-text-muted'
                  }`}>
                    {step}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-8 h-px mt-[-14px] ${i < currentStep ? 'bg-accent-purple/60' : 'bg-white/[0.08]'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Close button (left side in RTL) */}
        <div className="w-24 flex justify-end">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors text-text-muted hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      {children}
    </Modal>
  )
}
