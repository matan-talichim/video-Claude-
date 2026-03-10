import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useTimelineStore, type TrackType } from '../../../stores/timelineStore'

const trackOptions: { type: TrackType; icon: string; label: string }[] = [
  { type: 'video', icon: '🎥', label: 'וידאו' },
  { type: 'audio', icon: '🎵', label: 'אודיו' },
  { type: 'text', icon: '📝', label: 'טקסט' },
  { type: 'broll', icon: '🖼️', label: 'B-Roll' },
  { type: 'music', icon: '🎵', label: 'מוזיקה' },
  { type: 'captions', icon: '💬', label: 'כתוביות' },
]

export default function AddLayerButton() {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const addTrack = useTimelineStore((s) => s.addTrack)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-text-muted hover:text-accent-purple hover:bg-accent-purple/10 rounded-lg transition-colors border border-dashed border-white/[0.08] hover:border-accent-purple/30"
      >
        <Plus size={12} />
        <span>הוסף שכבה</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 right-0 min-w-[140px] py-1 bg-[#1a1a2e] border border-white/[0.12] rounded-lg shadow-2xl shadow-black/50 backdrop-blur-xl z-50">
          {trackOptions.map((opt) => (
            <button
              key={opt.type}
              onClick={() => { addTrack(opt.type); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors"
            >
              <span className="text-sm">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
