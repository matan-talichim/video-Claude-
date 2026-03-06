import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'

export default function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  return (
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border transition-all duration-300 animate-slide-in ${
            toast.type === 'success' ? 'bg-green-900/80 border-green-500/30' :
            toast.type === 'error' ? 'bg-red-900/80 border-red-500/30' :
            'bg-blue-900/80 border-blue-500/30'
          }`}
        >
          {toast.type === 'success' && <CheckCircle size={18} className="text-green-400 shrink-0" />}
          {toast.type === 'error' && <XCircle size={18} className="text-red-400 shrink-0" />}
          {toast.type === 'info' && <Info size={18} className="text-blue-400 shrink-0" />}
          <span className="text-sm">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="p-0.5 hover:bg-white/10 rounded">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
