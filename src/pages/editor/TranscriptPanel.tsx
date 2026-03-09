import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, Upload, Link2, Loader2, Pencil, Download, RefreshCw, Clock } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { useUsageStore } from '../../stores/usageStore'
import { useApiStatusStore } from '../../stores/apiStatusStore'
import { api, ApiError } from '../../services/api'

const speakerColors: Record<string, string> = {
  'border-blue-400': 'bg-blue-500',
  'border-green-400': 'bg-green-500',
  'border-purple-400': 'bg-purple-500',
  'border-orange-400': 'bg-orange-500',
}

const speakerDots: Record<string, string> = {
  'border-blue-400': '🔵',
  'border-green-400': '🟢',
  'border-purple-400': '🟣',
  'border-orange-400': '🟠',
}

function getInitial(name: string): string {
  return name.charAt(0)
}

function getSpeakerBg(color: string): string {
  return speakerColors[color] || 'bg-accent-purple'
}

function getSpeakerDot(color: string): string {
  return speakerDots[color] || '🔵'
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 60) return 'לפני כמה שניות'
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שעות`
  return `לפני ${Math.floor(diff / 86400)} ימים`
}

const FILLER_WORDS = ['אממ', 'אההה', 'כאילו', 'נו', 'בעצם', 'אז', 'סתם', 'יודע', 'יודעת']

export default function TranscriptPanel() {
  const { transcript, currentTime, duration, setCurrentTime, transcriptMode, setTranscriptMode, isDemo, mediaBlobUrl, mediaFile, setTranscript } = useEditorStore()
  const { addToast } = useUIStore()
  const addWhisperUsage = useUsageStore((s) => s.addWhisperUsage)
  const openaiConnected = useApiStatusStore((s) => s.openai.connected)
  const apiChecked = useApiStatusStore((s) => s.checked)
  const totalWords = transcript.reduce((sum, seg) => sum + seg.words.length, 0)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [manualText, setManualText] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeProgress, setTranscribeProgress] = useState('')
  const [transcribedAt, setTranscribedAt] = useState<number | null>(null)
  const [editingSpeaker, setEditingSpeaker] = useState<number | null>(null)
  const [speakerEditValue, setSpeakerEditValue] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const autoTranscribeTriggered = useRef(false)
  const transcriptContainerRef = useRef<HTMLDivElement>(null)

  // Find currently active segment based on video time
  const activeSegmentIdx = transcript.findIndex((seg, i) => {
    const segStart = seg.words[0]?.start ?? 0
    const nextSeg = transcript[i + 1]
    const segEnd = nextSeg ? (nextSeg.words[0]?.start ?? Infinity) : Infinity
    return currentTime >= segStart && currentTime < segEnd
  })

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentIdx >= 0 && transcriptContainerRef.current) {
      const el = transcriptContainerRef.current.querySelector(`[data-segment="${activeSegmentIdx}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [activeSegmentIdx])

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
    setShowManualInput(false)
  }

  const handleAutoTranscribe = async () => {
    if (!mediaFile) {
      addToast('אין קובץ מדיה לתמלול.', 'warning')
      return
    }
    setIsTranscribing(true)

    const fileSizeMB = mediaFile.size / (1024 * 1024)

    if (fileSizeMB > 100) {
      setTranscribeProgress('מתמלל קובץ גדול מאוד... ⏳ (עד 10 דקות)')
    } else if (fileSizeMB > 25) {
      setTranscribeProgress('מתמלל קובץ גדול... ⏳ (עד 3 דקות)')
    } else {
      setTranscribeProgress('מעלה לשרת...')
    }

    await new Promise(r => setTimeout(r, 500))

    const ext = mediaFile.name.split('.').pop()?.toLowerCase() || ''
    const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']
    const needsConversion = !supportedFormats.includes(ext)

    if (needsConversion) {
      setTranscribeProgress('ממיר פורמט...')
    } else {
      setTranscribeProgress('מתמלל את הקובץ... ⏳')
    }

    try {
      const result = await api.transcribe(mediaFile)

      setTranscribeProgress('מעבד תוצאות...')

      if (result.duration) {
        addWhisperUsage(result.duration / 60)
      }

      const fillerList = FILLER_WORDS
      const colorList = ['border-blue-400', 'border-green-400', 'border-purple-400', 'border-orange-400']

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
          if (words.length === 0 && seg.text) {
            const textWords = seg.text.split(/\s+/).filter(Boolean)
            const segDuration = (seg.end || 0) - (seg.start || 0)
            const wordDuration = segDuration / textWords.length
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
          const endMins = Math.floor((seg.end || 0) / 60)
          const endSecs = Math.floor((seg.end || 0) % 60)
          return {
            speaker: seg.speaker || `דובר ${(i % 2) + 1}`,
            color: colorList[i % colorList.length],
            startTime: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
            endTime: `${endMins.toString().padStart(2, '0')}:${endSecs.toString().padStart(2, '0')}`,
            segStart: seg.start || 0,
            segEnd: seg.end || 0,
            words,
          }
        }).filter((s: any) => s.words.length > 0)

        setTranscript(segments)
        setTranscribedAt(Date.now())
        const wordCount = segments.reduce((s: number, seg: any) => s + seg.words.length, 0)
        addToast(`התמלול הושלם! נמצאו ${wordCount} מילים`, 'success')
      } else if (result.text) {
        const words = result.words?.length
          ? result.words.map((w: any) => {
              const clean = (w.word || '').replace(/[.,!?]/g, '')
              return { text: w.word, start: w.start || 0, end: w.end || 0, isFiller: fillerList.includes(clean) }
            })
          : result.text.split(/\s+/).map((w: string, i: number) => ({
              text: w, start: i * 0.5, end: (i + 1) * 0.5, isFiller: fillerList.includes(w.replace(/[.,!?]/g, '')),
            }))
        setTranscript([{ speaker: 'דובר 1', color: 'border-blue-400', startTime: '00:00', words }])
        setTranscribedAt(Date.now())
        addToast('התמלול הושלם!', 'success')
      }

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

  // Auto-transcribe when API is connected and media file is available
  useEffect(() => {
    if (
      apiChecked &&
      openaiConnected &&
      mediaFile &&
      !isDemo &&
      transcriptMode === 'real' &&
      transcript.length === 0 &&
      !isTranscribing &&
      !autoTranscribeTriggered.current
    ) {
      autoTranscribeTriggered.current = true
      handleAutoTranscribe()
    }
  }, [apiChecked, openaiConnected, mediaFile, isDemo, transcriptMode, transcript.length, isTranscribing])

  const handleSpeakerRename = (segIdx: number) => {
    if (!speakerEditValue.trim()) {
      setEditingSpeaker(null)
      return
    }
    const newTranscript = [...transcript]
    const oldName = newTranscript[segIdx].speaker
    // Rename all segments with the same speaker name
    newTranscript.forEach((seg, i) => {
      if (seg.speaker === oldName) {
        newTranscript[i] = { ...seg, speaker: speakerEditValue.trim() }
      }
    })
    setTranscript(newTranscript)
    setEditingSpeaker(null)
  }

  const handleWordEdit = useCallback((segIdx: number, wordIdx: number, newText: string) => {
    const newTranscript = [...transcript]
    const seg = { ...newTranscript[segIdx] }
    const words = [...seg.words]
    words[wordIdx] = { ...words[wordIdx], text: newText }
    seg.words = words
    newTranscript[segIdx] = seg
    setTranscript(newTranscript)
  }, [transcript, setTranscript])

  const handleExportTranscript = () => {
    const text = transcript.map((seg) => {
      const time = seg.startTime
      return `[${time}] ${seg.speaker}:\n${seg.words.map(w => w.text).join(' ')}`
    }).join('\n\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transcript.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFillerClick = (segIdx: number, wordIdx: number) => {
    const newTranscript = [...transcript]
    const seg = { ...newTranscript[segIdx] }
    const words = seg.words.filter((_, i) => i !== wordIdx)
    seg.words = words
    newTranscript[segIdx] = seg
    setTranscript(newTranscript.filter(s => s.words.length > 0))
  }

  const hasRealMedia = !!mediaBlobUrl && !isDemo
  const showApiPrompt = transcriptMode === 'real' && transcript.length === 0 && hasRealMedia && !isTranscribing && !openaiConnected && apiChecked
  const showTranscribeButton = transcriptMode === 'real' && transcript.length === 0 && hasRealMedia && !isTranscribing && openaiConnected && apiChecked

  return (
    <div className="flex flex-col h-full bg-bg-panel rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <h3 className="font-bold text-text-primary text-sm">תמלול</h3>
        <div className="flex items-center gap-3">
          {totalWords > 0 && <span className="text-xs text-text-muted">{totalWords} מילים</span>}
          {duration > 0 && transcript.length > 0 && <span className="text-xs text-text-muted">{formatDuration(duration)}</span>}
          {transcript.length > 0 && (
            <button onClick={handleExportTranscript} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary" title="ייצא תמלול">
              <Download size={14} />
            </button>
          )}
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

      <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Loading state while transcribing */}
        {isTranscribing && (
          <div className="text-center py-12 space-y-4">
            <Loader2 size={32} className="mx-auto text-accent-purple animate-spin" />
            <p className="text-sm text-text-primary font-medium">{transcribeProgress || 'מתמלל את הקובץ... ⏳'}</p>
            <p className="text-xs text-text-muted">זה יכול לקחת עד דקה</p>
            <div className="max-w-[200px] mx-auto h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-accent-purple rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {/* API not connected - show connect prompt */}
        {showApiPrompt && (
          <div className="space-y-4">
            <div className="p-4 bg-accent-purple/5 border border-accent-purple/20 rounded-xl text-center space-y-3">
              <Link2 size={24} className="mx-auto text-accent-purple" />
              <p className="text-sm text-text-primary font-medium">חבר API של OpenAI Whisper כדי לקבל תמלול אמיתי</p>
              <p className="text-xs text-text-muted">ממתין לחיבור שירות תמלול...</p>
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

        {/* API connected - show transcribe button */}
        {showTranscribeButton && (
          <div className="text-center py-8 space-y-4">
            <button
              onClick={handleAutoTranscribe}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 text-white rounded-xl text-base font-medium transition-all shadow-lg shadow-accent-purple/20"
            >
              <span className="text-xl">🎙️</span> תמלל אוטומטית
            </button>
            <p className="text-xs text-text-muted">לחץ להתחלת תמלול אוטומטי עם OpenAI Whisper</p>
          </div>
        )}

        {/* Transcript content - editable segments */}
        {transcript.map((segment, si) => {
          const isActive = si === activeSegmentIdx
          const segStartTime = segment.words[0]?.start ?? 0
          const segEndTime = segment.words[segment.words.length - 1]?.end ?? 0

          return (
            <div
              key={si}
              data-segment={si}
              className={`rounded-xl border transition-all ${isActive ? 'bg-accent-purple/10 border-accent-purple/30' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
            >
              {/* Segment header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{getSpeakerDot(segment.color)}</span>
                  {editingSpeaker === si ? (
                    <input
                      value={speakerEditValue}
                      onChange={(e) => setSpeakerEditValue(e.target.value)}
                      onBlur={() => handleSpeakerRename(si)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSpeakerRename(si)}
                      className="bg-white/[0.06] rounded px-2 py-0.5 text-xs text-text-primary outline-none border border-accent-purple/30 w-24"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingSpeaker(si); setSpeakerEditValue(segment.speaker) }}
                      className="text-xs font-medium text-text-primary hover:text-accent-purple transition-colors"
                      title="לחץ לשנות שם דובר"
                    >
                      {segment.speaker}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setCurrentTime(segStartTime)}
                  className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] font-mono text-text-muted hover:text-accent-purple transition-colors"
                  title="לחץ לדלג לזמן זה"
                >
                  {formatTimestamp(segStartTime)} - {formatTimestamp(segEndTime)}
                </button>
              </div>

              {/* Segment text */}
              <div className="px-3 py-2">
                <p className="text-body leading-[1.8]" dir="rtl">
                  {segment.words.map((word, wi) => {
                    const isPlaying = currentTime >= word.start && currentTime < word.end
                    const matchesSearch = searchQuery && word.text.includes(searchQuery)
                    return (
                      <span
                        key={wi}
                        onClick={() => {
                          if (word.isFiller) return
                          setCurrentTime(word.start)
                        }}
                        contentEditable={!word.isFiller}
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const newText = e.currentTarget.textContent || ''
                          if (newText !== word.text) {
                            handleWordEdit(si, wi, newText)
                          }
                        }}
                        className={`cursor-pointer rounded px-0.5 transition-all duration-150 inline-block outline-none focus:ring-1 focus:ring-accent-purple/40 ${
                          isPlaying
                            ? 'bg-accent-purple/30 text-white'
                            : word.isFiller
                              ? 'bg-warning/15 text-warning relative group/filler cursor-pointer'
                              : matchesSearch
                                ? 'bg-accent-blue/20 text-accent-blue'
                                : 'hover:bg-white/[0.06] text-text-primary'
                        }`}
                        title={word.isFiller ? 'מילת מילוי - לחץ למחיקה' : undefined}
                      >
                        {word.text}
                        {word.isFiller && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleFillerClick(si, wi) }}
                            className="absolute -top-1 -left-1 w-3.5 h-3.5 bg-warning/80 rounded-full flex items-center justify-center opacity-0 group-hover/filler:opacity-100 transition-opacity"
                          >
                            <X size={8} className="text-bg-deepest" />
                          </button>
                        )}
                        {' '}
                      </span>
                    )
                  })}
                </p>
              </div>
            </div>
          )
        })}

        {/* Manual edit link when transcript is showing */}
        {transcript.length > 0 && !showManualInput && (
          <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
            <button
              onClick={() => setShowManualInput(true)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <Pencil size={12} /> ערוך תמלול ידנית
            </button>
            <button
              onClick={handleAutoTranscribe}
              disabled={isTranscribing || !mediaFile}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} /> תמלל מחדש
            </button>
            {transcribedAt && (
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                <Clock size={10} /> תומלל {timeAgo(transcribedAt)}
              </span>
            )}
          </div>
        )}

        {/* Manual input fallback (shown by link click) */}
        {showManualInput && transcript.length > 0 && (
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <textarea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="הקלד או הדבק תמלול כאן..." className="w-full h-24 px-3 py-2 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30 resize-none leading-relaxed" />
            <div className="flex items-center gap-2">
              <button onClick={handleManualSave} disabled={!manualText.trim()} className="px-3 py-1.5 bg-accent-purple hover:bg-accent-purple/90 rounded-lg text-xs font-medium transition-all disabled:opacity-50">שמור</button>
              <button onClick={() => setShowManualInput(false)} className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-xs text-text-secondary transition-colors">ביטול</button>
            </div>
          </div>
        )}

        {transcript.length === 0 && !showApiPrompt && !showTranscribeButton && !isTranscribing && (
          <div className="text-center py-8 text-text-muted text-sm">אין תמלול זמין</div>
        )}
      </div>
    </div>
  )
}
