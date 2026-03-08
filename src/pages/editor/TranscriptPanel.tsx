import { useState, useRef } from 'react'
import { Search, X, Upload, Settings, Link2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useEditorStore } from '../../stores/editorStore'

const speakerColors: Record<string, string> = {
  'border-blue-400': 'bg-blue-500',
  'border-green-400': 'bg-green-500',
  'border-purple-400': 'bg-purple-500',
  'border-orange-400': 'bg-orange-500',
}

function getInitial(name: string): string {
  return name.charAt(0)
}

function getSpeakerBg(color: string): string {
  return speakerColors[color] || 'bg-accent-purple'
}

export default function TranscriptPanel() {
  const navigate = useNavigate()
  const { transcript, currentTime, setCurrentTime, transcriptMode, setTranscriptMode, isDemo, mediaBlobUrl, setTranscript } = useEditorStore()
  const totalWords = transcript.reduce((sum, seg) => sum + seg.words.length, 0)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [manualText, setManualText] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const handleImportTranscript = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) {
        const words = text.split(/\s+/).filter(Boolean).map((w, i) => ({
          text: w, start: i * 0.5, end: (i + 1) * 0.5, isFiller: false,
        }))
        if (words.length > 0) {
          setTranscript([{ speaker: 'דובר', color: 'border-blue-400', startTime: '00:00', words }])
        }
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleManualSave = () => {
    if (!manualText.trim()) return
    const words = manualText.trim().split(/\s+/).map((w, i) => ({
      text: w, start: i * 0.5, end: (i + 1) * 0.5, isFiller: false,
    }))
    setTranscript([{ speaker: 'דובר', color: 'border-blue-400', startTime: '00:00', words }])
  }

  const hasRealMedia = !!mediaBlobUrl && !isDemo
  const showApiPrompt = transcriptMode === 'real' && transcript.length === 0 && hasRealMedia

  return (
    <div className="flex flex-col h-full bg-bg-panel rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <h3 className="font-bold text-text-primary text-sm">תמלול</h3>
        <div className="flex items-center gap-3">
          {totalWords > 0 && <span className="text-xs text-text-muted">{totalWords} מילים</span>}
          <button onClick={() => setShowSearch(!showSearch)} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary">
            <Search size={14} />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/[0.06] shrink-0">
        <div className="flex bg-white/[0.04] rounded-lg p-0.5">
          <button onClick={() => setTranscriptMode('real')} className={`flex-1 py-1 text-xs rounded-md transition-all font-medium ${transcriptMode === 'real' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>
            מצב אמיתי
          </button>
          <button onClick={() => setTranscriptMode('demo')} className={`flex-1 py-1 text-xs rounded-md transition-all font-medium ${transcriptMode === 'demo' ? 'bg-accent-purple text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>
            מצב דמו
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="px-4 py-2 border-b border-white/[0.06] animate-fade-up">
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-1.5">
            <Search size={13} className="text-text-muted shrink-0" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="חפש בתמלול..." className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none" autoFocus />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="text-text-muted hover:text-text-primary"><X size={13} /></button>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {showApiPrompt && (
          <div className="space-y-4">
            <div className="p-4 bg-accent-purple/5 border border-accent-purple/20 rounded-xl text-center space-y-3">
              <Link2 size={24} className="mx-auto text-accent-purple" />
              <p className="text-sm text-text-primary font-medium">חבר API של OpenAI Whisper כדי לקבל תמלול אמיתי</p>
              <p className="text-xs text-text-muted">ממתין לחיבור שירות תמלול...</p>
              <button onClick={() => navigate('/settings')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-sm transition-colors">
                <Settings size={14} /> הגדרות API
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-text-muted">או הזן תמלול ידנית:</p>
              <textarea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="הקלד או הדבק תמלול כאן..." className="w-full h-32 px-3 py-2 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none leading-relaxed" />
              <div className="flex items-center gap-2">
                <button onClick={handleManualSave} disabled={!manualText.trim()} className="px-4 py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-lg text-sm font-medium transition-all disabled:opacity-50">שמור תמלול</button>
                <input ref={importRef} type="file" accept=".srt,.vtt,.txt" className="hidden" onChange={handleImportTranscript} />
                <button onClick={() => importRef.current?.click()} className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-sm text-text-secondary transition-colors border border-white/[0.06]">
                  <Upload size={14} /> ייבא תמלול
                </button>
              </div>
            </div>
          </div>
        )}

        {transcript.map((segment, si) => (
          <div key={si} className="group">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded-full ${getSpeakerBg(segment.color)} flex items-center justify-center text-[10px] font-bold text-white`}>{getInitial(segment.speaker)}</div>
              <span className="text-xs font-medium text-text-primary">{segment.speaker}</span>
              <span className="text-[11px] text-text-muted font-mono">{segment.startTime}</span>
            </div>
            <p className="text-body leading-[1.8] pr-8" dir="rtl">
              {segment.words.map((word, wi) => {
                const isPlaying = currentTime >= word.start && currentTime < word.end
                const matchesSearch = searchQuery && word.text.includes(searchQuery)
                return (
                  <span key={wi} onClick={() => setCurrentTime(word.start)} className={`cursor-pointer rounded px-0.5 transition-all duration-150 inline-block ${isPlaying ? 'bg-accent-purple/30 text-white' : word.isFiller ? 'bg-warning/15 text-warning relative group/filler' : matchesSearch ? 'bg-accent-blue/20 text-accent-blue' : 'hover:bg-white/[0.06] text-text-primary'}`}>
                    {word.text}
                    {word.isFiller && (
                      <button onClick={(e) => { e.stopPropagation() }} className="absolute -top-1 -left-1 w-3.5 h-3.5 bg-warning/80 rounded-full flex items-center justify-center opacity-0 group-hover/filler:opacity-100 transition-opacity">
                        <X size={8} className="text-bg-deepest" />
                      </button>
                    )}
                    {' '}
                  </span>
                )
              })}
            </p>
          </div>
        ))}

        {transcript.length === 0 && !showApiPrompt && (
          <div className="text-center py-8 text-text-muted text-sm">אין תמלול זמין</div>
        )}
      </div>
    </div>
  )
}
