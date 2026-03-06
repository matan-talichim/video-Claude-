import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Download, RefreshCw, ExternalLink } from 'lucide-react'
import ConfettiEffect from '../ConfettiEffect'
import { useUploadsStore } from '../../stores/uploadsStore'

interface CompletionStepProps {
  onReset: () => void
  onClose: () => void
  source: 'prompt' | 'script'
}

export default function CompletionStep({ onReset, onClose, source }: CompletionStepProps) {
  const navigate = useNavigate()
  const addFile = useUploadsStore((s) => s.addFile)

  useEffect(() => {
    // Save to uploads
    addFile({
      name: source === 'prompt' ? 'סרטון מפרומפט' : 'סרטון מסקריפט',
      size: '45MB',
      sizeBytes: 45 * 1024 * 1024,
      type: 'video',
      source,
      status: 'ready',
      progress: 100,
      thumbnailGradient: source === 'prompt' ? 'from-purple-600/30 to-pink-600/30' : 'from-orange-600/30 to-red-600/30',
      duration: '2:30',
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenEditor = () => {
    onClose()
    navigate('/editor/new')
  }

  return (
    <div className="max-w-lg mx-auto py-6 text-center">
      <ConfettiEffect />

      <div className="text-5xl mb-4 animate-bounce">🎉</div>
      <h3 className="text-2xl font-bold text-text-primary mb-2">הסרטון מוכן!</h3>
      <p className="text-text-muted mb-8">הסרטון נוצר בהצלחה ושמור בקבצים שלך</p>

      {/* Preview placeholder */}
      <div className="relative aspect-video rounded-2xl overflow-hidden mb-8 bg-gradient-to-br from-accent-purple/20 to-accent-blue/20 border border-white/[0.06]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
            <Play size={28} className="text-white mr-[-3px]" />
          </div>
        </div>
        <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-black/60 text-xs text-white font-mono">
          2:30
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleOpenEditor}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
        >
          <ExternalLink size={16} /> פתח בעורך
        </button>
        <button
          className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors border border-white/[0.06]"
        >
          <Download size={16} /> הורד
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors border border-white/[0.06]"
        >
          <RefreshCw size={16} /> צור עוד
        </button>
      </div>
    </div>
  )
}
