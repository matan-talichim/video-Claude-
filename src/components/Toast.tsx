import { useState } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import type { Toast } from '../stores/uiStore'

const toastConfig: Record<Toast['type'], { icon: typeof CheckCircle; color: string; borderColor: string; bgColor: string }> = {
  success: { icon: CheckCircle, color: 'text-success', borderColor: 'border-r-success', bgColor: 'bg-success/5' },
  error: { icon: XCircle, color: 'text-error', borderColor: 'border-r-error', bgColor: 'bg-error/5' },
  warning: { icon: AlertTriangle, color: 'text-warning', borderColor: 'border-r-warning', bgColor: 'bg-warning/5' },
  info: { icon: Info, color: 'text-accent-blue', borderColor: 'border-r-accent-blue', bgColor: 'bg-accent-blue/5' },
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [paused, setPaused] = useState(false)
  const config = toastConfig[toast.type]
  const Icon = config.icon

  return (
    <div
      className={`glass ${config.bgColor} border-r-[3px] ${config.borderColor} rounded-xl shadow-lg animate-slide-in min-w-[280px] max-w-[380px]`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={18} className={`${config.color} shrink-0`} />
        <span className="text-sm text-text-primary flex-1">{toast.message}</span>
        <button
          onClick={onRemove}
          className="p-0.5 hover:bg-white/[0.08] rounded text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      {/* Auto-dismiss progress bar */}
      <div className="h-0.5 bg-white/[0.04] overflow-hidden rounded-b-xl">
        <div
          className={`h-full ${config.color.replace('text-', 'bg-')} rounded-full`}
          style={{
            animation: paused ? 'none' : 'progress-shrink 4s linear forwards',
          }}
        />
      </div>
    </div>
  )
}

export default function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  return (
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}
