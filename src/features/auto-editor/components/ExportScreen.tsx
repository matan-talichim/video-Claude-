import { useState } from 'react'
import { Download, Play, CheckCircle, Square, CheckSquare, PartyPopper } from 'lucide-react'
import { useAutoEditorStore, type ExportResult } from '../store/autoEditorStore'

const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok', ratio: '9:16' },
  { key: 'reels', label: 'Reels', ratio: '9:16' },
  { key: 'youtube_shorts', label: 'YouTube Shorts', ratio: '9:16' },
  { key: 'linkedin', label: 'LinkedIn', ratio: '1:1' },
]

interface ExportScreenProps {
  onReset: () => void
}

export default function ExportScreen({ onReset }: ExportScreenProps) {
  const results = useAutoEditorStore((s) => s.results)
  const input = useAutoEditorStore((s) => s.input)

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    PLATFORMS.map((p) => p.key)
  )
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null)

  if (!results || results.length === 0) return null

  // Group results by video index
  const videoGroups = results.reduce<Record<number, ExportResult[]>>((acc, r) => {
    if (!acc[r.videoIndex]) acc[r.videoIndex] = []
    acc[r.videoIndex].push(r)
    return acc
  }, {})

  const videoCount = Object.keys(videoGroups).length

  const togglePlatform = (key: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    )
  }

  const handleDownloadSelected = () => {
    const toDownload = results.filter((r) => selectedPlatforms.includes(r.platform))
    toDownload.forEach((r) => {
      const a = document.createElement('a')
      a.href = r.url
      a.download = r.fileName
      a.click()
    })
  }

  const handleDownloadAll = () => {
    results.forEach((r) => {
      const a = document.createElement('a')
      a.href = r.url
      a.download = r.fileName
      a.click()
    })
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto">
    <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-2xl mx-auto space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center border border-green-500/20">
          <PartyPopper size={28} className="text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">
          {videoCount} הסרטונים שלך מוכנים!
        </h2>
        <p className="text-sm text-text-muted">בחר פלטפורמות ליצוא</p>
      </div>

      {/* Video list */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] divide-y divide-white/[0.06]">
        {Object.entries(videoGroups).map(([idx, exports]) => {
          const videoIdx = parseInt(idx)
          return (
            <button
              key={videoIdx}
              onClick={() => setSelectedVideo(selectedVideo === videoIdx ? null : videoIdx)}
              className={`w-full flex items-center gap-3 p-4 text-right transition-colors hover:bg-white/[0.03] ${
                selectedVideo === videoIdx ? 'bg-white/[0.04]' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center">
                <Play size={18} className="text-accent-purple" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-text-primary">
                  סרטון {videoIdx}
                </div>
                <div className="text-xs text-text-muted">
                  {input?.targetDuration} שניות &middot; {exports.length} פורמטים
                </div>
              </div>
              <CheckCircle size={18} className="text-green-400" />
            </button>
          )
        })}
      </div>

      {/* Platform selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-text-primary block">ייצא לפלטפורמה:</label>
        <div className="space-y-2">
          {PLATFORMS.map((p) => {
            const isSelected = selectedPlatforms.includes(p.key)
            return (
              <button
                key={p.key}
                onClick={() => togglePlatform(p.key)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-right ${
                  isSelected
                    ? 'border-accent-purple/40 bg-accent-purple/5'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                }`}
              >
                {isSelected ? (
                  <CheckSquare size={18} className="text-accent-purple shrink-0" />
                ) : (
                  <Square size={18} className="text-white/30 shrink-0" />
                )}
                <span className={`text-sm flex-1 ${isSelected ? 'text-text-primary' : 'text-text-muted'}`}>
                  {p.label}
                </span>
                <span className="text-xs text-text-muted">({p.ratio})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleDownloadSelected}
          disabled={selectedPlatforms.length === 0}
          className="flex items-center gap-2 px-5 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={16} />
          ייצא סרטון נבחר
        </button>
        <button
          onClick={handleDownloadAll}
          className="flex items-center gap-2 px-5 py-3 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] rounded-xl text-sm font-medium text-text-secondary transition-colors"
        >
          <Download size={16} />
          ייצא הכל
        </button>
      </div>

      {/* Start over */}
      <div className="text-center pt-2 pb-8">
        <button
          onClick={onReset}
          className="text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          ← התחל מחדש
        </button>
      </div>
    </div>
    </div>
  )
}
