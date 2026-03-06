import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  hideHeader?: boolean
}

export default function Modal({ isOpen, onClose, title, subtitle, children, size = 'md', hideHeader = false }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Modal content */}
      <div
        className={`relative ${sizeClasses[size]} w-full glass rounded-2xl shadow-2xl overflow-hidden animate-scale-in`}
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        {!hideHeader && (
          <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
            <div>
              {title && <h2 className="text-lg font-bold text-text-primary">{title}</h2>}
              {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors text-text-muted hover:text-text-primary"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {/* Body */}
        <div className={`p-5 overflow-y-auto ${size === 'full' ? 'max-h-[85vh]' : 'max-h-[70vh]'}`}>{children}</div>
      </div>
    </div>
  )
}
