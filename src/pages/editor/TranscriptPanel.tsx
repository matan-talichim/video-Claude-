import { useState, useRef } from 'react'
import { Search, X, Upload, Settings, Link2, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { useUsageStore } from '../../stores/usageStore'
import { api, ApiError } from '../../services/api'

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
  const { transcript, currentTime, setCurrentTime, transcriptMode, setTranscriptMode, isDemo, mediaBlobUrl, mediaFile, setTranscript } = useEditorStore()
  const { addToast } = useUIStore()
  const addWhisperUsage = useUsageStore((s) => s.addWhisperUsage)
  const totalWords = transcript.reduce((sum, seg) => sum + seg.words.length, 0)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [manualText, setManualText] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeProgress, setTranscribeProgress] = useState('')
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

  const handleAutoTranscribe = async () => {
    if (!mediaFile) {
      addToast('אין קובץ מדיה לתמלול.', 'warning')
      return
    }
    setIsTranscribing(true)

    // Show format-aware status messages
    const ext = mediaFile.name.split('.').pop()?.toLowerCase() || ''
    const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']
    const needsConversion = !supportedFormats.includes(ext)
    const isLargeFile = mediaFile.size > 25 * 1024 * 1024

    setTranscribeProgress('מעלה קובץ...')
    // Brief delay so user sees the upload status
    await new Promise(r => setTimeout(r, 500))

    if (needsConversion) {
      setTranscribeProgress('ממיר פורמט...')
    } else if (isLargeFile) {
      setTranscribeProgress('מחלץ אודיו...')
    } else {
      setTranscribeProgress('מתמלל...')
    }

    try {
      const result = await api.transcribe(mediaFile)

      setTranscribeProgress('מתמלל...')

      // Track usage
      if (result.duration) {
        addWhisperUsage(result.duration / 60)
      }

      // Convert API response to editor transcript format
      const fillerList = ['אממ', 'אההה', 'כאילו', 'נו', 'בעצם', 'אז', 'סתם', 'יודע', 'יודעת']
      const speakerColors = ['border-blue-400', 'border-green-400', 'border-purple-400', 'border-orange-400']

      if (result.segments && result.segments.length > 0) {
        const segments = result.segments.map((seg: any, i: number) => {
          const words = (seg.words || []).map((w: any) => {
            const clean = (w.word || '').replace(/[.,!?]/g, '')
            return {
              text: w.word || '',
              start: w.start || 0,
              end: w.end || 0,
              isFiller: fillerList.includes(clean),
            }
          })
          // If segment has no words, create from text
          if (words.length === 0 && seg.text) {
            const textWords = seg.text.split(/\s+/).filter(Boolean)
            const duration = (seg.end || 0) - (seg.start || 0)
            const wordDuration = duration / textWords.length
            textWords.forEach((w: string, wi: number) => {
              const clean = w.replace(/[.,!?]/g, '')
              words.push({
                text: w,
                start: (seg.start || 0) + wi * wordDuration,
                end: (seg.start || 0) + (wi + 1) * wordDuration,
                isFiller: fillerList.includes(clean),
              })
            })
          }
          const mins = Math.floor((seg.start || 0) / 60)
          const secs = Math.floor((seg.start || 0) % 60)
          return {
            speaker: seg.speaker || `דובר ${(i % 2) + 1}`,
            color: speakerColors[i % speakerColors.length],
            startTime: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
            words,
          }
        }).filter((s: any) => s.words.length > 0)

        setTranscript(segments)
        addToast(`התמלול הושלם! ${segments.reduce((s: number, seg: any) => s + seg.words.length, 0)} מילים`, 'success')
      } else if (result.text) {
        // Fallback: use full text with top-level words
        const words = result.words?.length
          ? result.words.map((w: any) => {
              const clean = (w.word || '').replace(/[.,!?]/g, '')
              return { text: w.word, start: w.start || 0, end: w.end || 0, isFiller: fillerList.includes(clean) }
            })
          : result.text.split(/\s+/).map((w: string, i: number) => ({
              text: w, start: i * 0.5, end: (i + 1) * 0.5, isFiller: fillerList.includes(w.replace(/[.,!?]/g, '')),
            }))
        setTranscript([{ speaker: 'דובר 1', color: 'border-blue-400', startTime: '00:00', words }])
        addToast('התמלול הושלם!', 'success')
      }

      // Try speaker detection
      setTranscribeProgress('מזהה דוברים...')
      try {
        await api.detectSpeakers(result.text, result.segments)
      } catch {
        // Speaker detection is optional
      }

      setTranscribeProgress('מוכן!')
      await new Promise(r => setTimeout(r, 800))
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'שגיאה בתמלול. נסה שוב.'
      addToast(message, 'error')
    }
    setIsTranscribing(false)
    setTranscribeProgress('')
  }

  const hasRealMedia = !!mediaBlobUrl && !isDemo
  const showApiPrompt = transcriptMode === 'real' && transcript.length === 0 && hasRealMedia && !isTranscribing

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
        {isTranscribing && (
          <div className="text-center py-12 space-y-4">
            <Loader2 size={32} className="mx-auto text-accent-purple animate-spin" />
            <p className="text-sm text-text-primary font-medium">{transcribeProgress || 'מתמלל...'}</p>
            <p className="text-xs text-text-muted">זה עלול לקחת כמה דקות</p>
          </div>
        )}

        {showApiPrompt && (
          <div className="space-y-4">
            <div className="p-4 bg-accent-purple/5 border border-accent-purple/20 rounded-xl text-center space-y-3">
              <Link2 size={24} className="mx-auto text-accent-purple" />
              <p className="text-sm text-text-primary font-medium">חבר API של OpenAI Whisper כדי לקבל תמלול אמיתי</p>
              <p className="text-xs text-text-muted">ממתין לחיבור שירות תמלול...</p>
              <div className="flex items-center justify-center gap-2">
                {mediaFile && (
                  <button onClick={handleAutoTranscribe} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-purple hover:bg-accent-purple/90 text-white rounded-lg text-sm transition-colors font-medium">
                    תמלל אוטומטית
                  </button>
                )}
                <button onClick={() => navigate('/settings')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded-lg text-sm transition-colors">
                  <Settings size={14} /> הגדרות API
                </button>
              </div>
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
