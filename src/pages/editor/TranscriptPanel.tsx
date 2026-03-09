import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, Upload, Link2, Loader2, Pencil, Download, RefreshCw, Clock, Trash2, Copy, FileText, ChevronDown, Merge, SplitSquareVertical, Replace, MessageSquare } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { useUsageStore } from '../../stores/usageStore'
import { useApiStatusStore } from '../../stores/apiStatusStore'
import { api, ApiError } from '../../services/api'

const SPEAKER_COLORS: Record<string, string> = {
  'border-blue-400': '#5C8AFF', 'border-green-400': '#4ADE80',
  'border-purple-400': '#FBBF24', 'border-orange-400': '#F472B6',
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
function formatDuration(seconds: number): string {
  return formatTimestamp(seconds)
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
  const {
    transcript, currentTime, duration, setCurrentTime, mediaBlobUrl,
    mediaFile, setTranscript, speakers, setSpeakers, reassignSegmentSpeaker,
    renameSpeaker, deleteWords, splitSegment, mergeSegments,
  } = useEditorStore()
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
  const [speakerDropdown, setSpeakerDropdown] = useState<number | null>(null)
  const [selectedWords, setSelectedWords] = useState<{ segIdx: number; wordIndices: number[] } | null>(null)
  const [floatingToolbar, setFloatingToolbar] = useState<{ x: number; y: number } | null>(null)
  const [replaceDialog, setReplaceDialog] = useState<{ segIdx: number; wordIdx: number; original: string } | null>(null)
  const [replaceText, setReplaceText] = useState('')
  const [isReplacingAudio, setIsReplacingAudio] = useState(false)
  const [commentDialog, setCommentDialog] = useState<{ segIdx: number; wordIdx: number } | null>(null)
  const [commentText, setCommentText] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const transcriptContainerRef = useRef<HTMLDivElement>(null)

  const activeSegmentIdx = transcript.findIndex((seg, i) => {
    const segStart = seg.words[0]?.start ?? 0
    const nextSeg = transcript[i + 1]
    const segEnd = nextSeg ? (nextSeg.words[0]?.start ?? Infinity) : Infinity
    return currentTime >= segStart && currentTime < segEnd
  })

  useEffect(() => {
    if (activeSegmentIdx >= 0 && transcriptContainerRef.current) {
      const el = transcriptContainerRef.current.querySelector(`[data-segment="${activeSegmentIdx}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeSegmentIdx])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.contentEditable === 'true') return
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const desc = useEditorStore.getState().undoLastEdit()
        if (desc) addToast(`בוטל: ${desc}`, 'info')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        const desc = useEditorStore.getState().redoLastEdit()
        if (desc) addToast(`שוחזר: ${desc}`, 'info')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleImportTranscript = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) {
        const words = text.split(/\s+/).filter(Boolean).map((w, i) => ({ text: w, start: i * 0.5, end: (i + 1) * 0.5, isFiller: false }))
        if (words.length > 0) setTranscript([{ speaker: 'דובר', color: 'border-blue-400', startTime: '00:00', words }])
      }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const handleManualSave = () => {
    if (!manualText.trim()) return
    const words = manualText.trim().split(/\s+/).map((w, i) => ({ text: w, start: i * 0.5, end: (i + 1) * 0.5, isFiller: false }))
    setTranscript([{ speaker: 'דובר', color: 'border-blue-400', startTime: '00:00', words }])
    setShowManualInput(false)
  }

  const handleAutoTranscribe = async () => {
    if (!mediaFile) { addToast('אין קובץ מדיה לתמלול.', 'warning'); return }
    setIsTranscribing(true)
    const fileSizeMB = mediaFile.size / (1024 * 1024)
    if (fileSizeMB > 100) setTranscribeProgress('מתמלל קובץ גדול מאוד... (עד 10 דקות)')
    else if (fileSizeMB > 25) setTranscribeProgress('מתמלל קובץ גדול... (עד 3 דקות)')
    else setTranscribeProgress('מעלה לשרת...')
    await new Promise(r => setTimeout(r, 500))
    const ext = mediaFile.name.split('.').pop()?.toLowerCase() || ''
    const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']
    setTranscribeProgress(supportedFormats.includes(ext) ? 'מתמלל את הקובץ...' : 'ממיר פורמט...')
    try {
      const result = await api.transcribe(mediaFile)
      setTranscribeProgress('מעבד תוצאות...')
      if (result.duration) addWhisperUsage(result.duration / 60)
      const fillerList = FILLER_WORDS
      const colorList = ['border-blue-400', 'border-green-400', 'border-purple-400', 'border-orange-400']
      if (result.segments && result.segments.length > 0) {
        const segments = result.segments.map((seg: any) => {
          const words = (seg.words || []).map((w: any) => {
            const clean = (w.word || '').replace(/[.,!?]/g, '')
            return { text: w.word || '', start: w.start || 0, end: w.end || 0, isFiller: fillerList.includes(clean) }
          })
          if (words.length === 0 && seg.text) {
            const textWords = seg.text.split(/\s+/).filter(Boolean)
            const segDuration = (seg.end || 0) - (seg.start || 0); const wordDuration = segDuration / textWords.length
            textWords.forEach((w: string, wi: number) => {
              words.push({ text: w, start: (seg.start || 0) + wi * wordDuration, end: (seg.start || 0) + (wi + 1) * wordDuration, isFiller: fillerList.includes(w.replace(/[.,!?]/g, '')) })
            })
          }
          const speakerId = seg.speakerId || 1
          return { speaker: seg.speaker || `דובר ${speakerId}`, speakerId, color: colorList[(speakerId - 1) % colorList.length], startTime: formatTimestamp(seg.start || 0), endTime: formatTimestamp(seg.end || 0), segStart: seg.start || 0, segEnd: seg.end || 0, words }
        }).filter((s: any) => s.words.length > 0)
        setTranscript(segments)
        if (result.speakers?.length > 0) {
          setSpeakers(result.speakers.map((s: any, i: number) => ({ id: s.id || i + 1, name: s.name || `דובר ${i + 1}`, description: s.description || '', color: ['#5C8AFF', '#4ADE80', '#FBBF24', '#F472B6'][(s.id || i + 1) - 1 % 4] })))
        }
        setTranscribedAt(Date.now())
        const wordCount = segments.reduce((s: number, seg: any) => s + seg.words.length, 0)
        addToast(`התמלול הושלם! נמצאו ${wordCount} מילים`, 'success')
      } else if (result.text) {
        const words = result.words?.length
          ? result.words.map((w: any) => ({ text: w.word, start: w.start || 0, end: w.end || 0, isFiller: fillerList.includes((w.word || '').replace(/[.,!?]/g, '')) }))
          : result.text.split(/\s+/).map((w: string, i: number) => ({ text: w, start: i * 0.5, end: (i + 1) * 0.5, isFiller: fillerList.includes(w.replace(/[.,!?]/g, '')) }))
        setTranscript([{ speaker: 'דובר 1', color: 'border-blue-400', startTime: '00:00', words }])
        setTranscribedAt(Date.now()); addToast('התמלול הושלם!', 'success')
      }
      setTranscribeProgress('מוכן!'); await new Promise(r => setTimeout(r, 800))
    } catch (err) { addToast(err instanceof ApiError ? err.message : 'שגיאה בתמלול. נסה שוב.', 'error') }
    setIsTranscribing(false); setTranscribeProgress('')
  }

  // Transcription is manual only - user clicks the button

  const handleSpeakerRename = (segIdx: number) => {
    if (!speakerEditValue.trim()) { setEditingSpeaker(null); return }
    const seg = transcript[segIdx]; if (!seg) { setEditingSpeaker(null); return }
    renameSpeaker(seg.speaker, speakerEditValue.trim()); setEditingSpeaker(null)
  }

  const handleSegmentInput = useCallback((segIdx: number, e: React.FormEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.textContent || ''
    const { transcript: t, editHistory } = useEditorStore.getState()
    const seg = t[segIdx]; if (!seg) return
    const newWords = newText.split(/\s+/).filter(Boolean)
    const prev = JSON.parse(JSON.stringify(t))
    const updatedWords = newWords.map((w, i) => {
      const original = seg.words[i]
      if (original) return { ...original, text: w, isEdited: w !== original.text ? true : original.isEdited }
      const lastWord = seg.words[seg.words.length - 1]
      return { text: w, start: lastWord ? lastWord.end : 0, end: lastWord ? lastWord.end + 0.3 : 0.3, isFiller: false, isEdited: true }
    })
    const nt = [...t]; nt[segIdx] = { ...seg, words: updatedWords }
    useEditorStore.setState({ transcript: nt.filter(s => s.words.length > 0), isDirty: true, editHistory: [...editHistory, { action: 'editSegment', description: 'נערך קטע', timestamp: Date.now(), previousTranscript: prev }], redoHistory: [] })
  }, [])

  const handleExportTranscript = () => {
    const text = transcript.map((seg) => `[${seg.startTime}] ${seg.speaker}:\n${seg.words.map(w => w.text).join(' ')}`).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'transcript.txt'; a.click(); URL.revokeObjectURL(url)
  }

  const handleFillerClick = (segIdx: number, wordIdx: number) => {
    const { transcript: t, editHistory, deletedRegions } = useEditorStore.getState()
    const prev = JSON.parse(JSON.stringify(t)); const prevDeleted = JSON.parse(JSON.stringify(deletedRegions))
    const segData = t[segIdx]; if (!segData) return
    const word = segData.words[wordIdx]; const nt = [...t]; const seg = { ...nt[segIdx] }
    seg.words = seg.words.filter((_, i) => i !== wordIdx); nt[segIdx] = seg
    const newDeletedRegions = word ? [...deletedRegions, { startTime: word.start, endTime: word.end, description: `מילת מילוי: ${word.text}` }].sort((a, b) => a.startTime - b.startTime) : deletedRegions
    useEditorStore.setState({ transcript: nt.filter(s => s.words.length > 0), deletedRegions: newDeletedRegions, isDirty: true, editHistory: [...editHistory, { action: 'deleteFiller', description: 'נמחקה מילת מילוי', timestamp: Date.now(), previousTranscript: prev, previousDeletedRegions: prevDeleted }], redoHistory: [] })
  }

  const handleDeleteSelected = () => {
    if (!selectedWords) return
    deleteWords(selectedWords.segIdx, selectedWords.wordIndices)
    setSelectedWords(null); setFloatingToolbar(null)
    addToast(`נמחקו ${selectedWords.wordIndices.length} מילים`, 'info')
  }

  const handleCopySelected = () => {
    if (!selectedWords) return
    const seg = transcript[selectedWords.segIdx]
    if (!seg) return
    const text = selectedWords.wordIndices.map((wi) => seg.words[wi]?.text || '').join(' ')
    navigator.clipboard.writeText(text).catch(() => {}); addToast('הטקסט הועתק!', 'success'); setFloatingToolbar(null)
  }

  const handleTextSelection = (segIdx: number) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) { setSelectedWords(null); setFloatingToolbar(null); return }
    const container = transcriptContainerRef.current?.querySelector(`[data-segment="${segIdx}"] .segment-text`)
    if (!container) return
    const wordSpans = container.querySelectorAll('[data-word-idx]')
    const indices: number[] = []
    wordSpans.forEach((span) => {
      if (selection.containsNode(span, true)) {
        const idx = parseInt(span.getAttribute('data-word-idx') || '-1')
        if (idx >= 0) indices.push(idx)
      }
    })
    if (indices.length > 0) {
      setSelectedWords({ segIdx, wordIndices: indices })
      const range = selection.getRangeAt(0); const rect = range.getBoundingClientRect()
      setFloatingToolbar({ x: rect.left + rect.width / 2, y: rect.top - 10 })
    }
  }

  const handleOpenReplace = () => {
    if (!selectedWords || selectedWords.wordIndices.length !== 1) return
    const seg = transcript[selectedWords.segIdx]; if (!seg) return
    const word = seg.words[selectedWords.wordIndices[0]]; if (!word) return
    setReplaceDialog({ segIdx: selectedWords.segIdx, wordIdx: selectedWords.wordIndices[0], original: word.text })
    setReplaceText(''); setFloatingToolbar(null)
  }

  const handleReplaceTextOnly = () => {
    if (!replaceDialog || !replaceText.trim()) return
    const { transcript: t, editHistory } = useEditorStore.getState()
    const prev = JSON.parse(JSON.stringify(t)); const nt = [...t]
    if (!nt[replaceDialog.segIdx]) return
    const seg = { ...nt[replaceDialog.segIdx] }; const words = [...seg.words]
    words[replaceDialog.wordIdx] = { ...words[replaceDialog.wordIdx], text: replaceText.trim(), isEdited: true }
    seg.words = words; nt[replaceDialog.segIdx] = seg
    useEditorStore.setState({ transcript: nt, isDirty: true, redoHistory: [], editHistory: [...editHistory, { action: 'replaceWord', description: `הוחלפה '${replaceDialog.original}' ב-'${replaceText.trim()}'`, timestamp: Date.now(), previousTranscript: prev }] })
    addToast('המילה הוחלפה בתמלול!', 'success'); setReplaceDialog(null); setSelectedWords(null)
  }

  const handleReplaceWithAudio = async () => {
    if (!replaceDialog || !replaceText.trim()) return
    setIsReplacingAudio(true); handleReplaceTextOnly()
    try { await api.textToSpeech(replaceText.trim(), 'default'); addToast('המילה הוחלפה בתמלול ובסרטון!', 'success') }
    catch { addToast('הטקסט הוחלף אך שגיאה בהחלפת האודיו', 'warning') }
    setIsReplacingAudio(false); setReplaceDialog(null); setSelectedWords(null)
  }

  const hasRealMedia = !!mediaBlobUrl
  const showApiPrompt = transcript.length === 0 && hasRealMedia && !isTranscribing && !openaiConnected && apiChecked
  const showTranscribeButton = transcript.length === 0 && hasRealMedia && !isTranscribing && openaiConnected && apiChecked

  return (
    <div className="flex flex-col h-full bg-bg-panel rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <h3 className="font-bold text-text-primary text-sm">תמלול</h3>
        <div className="flex items-center gap-3">
          {totalWords > 0 && <span className="text-xs text-text-muted">{totalWords} מילים</span>}
          {duration > 0 && transcript.length > 0 && <span className="text-xs text-text-muted">{formatDuration(duration)}</span>}
          {transcript.length > 0 && <button onClick={handleExportTranscript} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary" title="ייצא תמלול"><Download size={14} /></button>}
          <button onClick={() => setShowSearch(!showSearch)} className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary"><Search size={14} /></button>
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

      {floatingToolbar && selectedWords && (
        <div className="fixed z-50 flex items-center gap-1 px-2 py-1 glass rounded-lg shadow-xl animate-scale-in" style={{ left: floatingToolbar.x, top: floatingToolbar.y, transform: 'translate(-50%, -100%)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {selectedWords.wordIndices.length === 1 && (
            <button onClick={handleOpenReplace} className="flex items-center gap-1 px-2 py-1 text-xs text-accent-purple hover:bg-accent-purple/10 rounded transition-colors"><Replace size={12} /> החלף מילה</button>
          )}
          <button onClick={handleDeleteSelected} className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors"><Trash2 size={12} /> מחק</button>
          <button onClick={handleCopySelected} className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:bg-white/[0.06] rounded transition-colors"><Copy size={12} /> העתק</button>
          {selectedWords.wordIndices.length > 0 && selectedWords.wordIndices[0] > 0 && (
            <button onClick={() => { splitSegment(selectedWords.segIdx, selectedWords.wordIndices[0]); setSelectedWords(null); setFloatingToolbar(null); addToast('הקטע פוצל', 'info') }} className="flex items-center gap-1 px-2 py-1 text-xs text-accent-blue hover:bg-accent-blue/10 rounded transition-colors"><SplitSquareVertical size={12} /> פצל</button>
          )}
          <button onClick={() => { setCommentDialog({ segIdx: selectedWords.segIdx, wordIdx: selectedWords.wordIndices[0] }); setCommentText(''); setFloatingToolbar(null) }} className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:bg-white/[0.06] rounded transition-colors"><MessageSquare size={12} /> הערה</button>
        </div>
      )}

      {replaceDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setReplaceDialog(null)}>
          <div className="glass rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-text-primary text-sm">החלף מילה</h3>
              <button onClick={() => setReplaceDialog(null)} className="p-1 hover:bg-white/[0.06] rounded"><X size={14} className="text-text-muted" /></button>
            </div>
            <div><label className="text-xs text-text-muted block mb-1">מילה מקורית:</label><div className="px-3 py-2 bg-white/[0.04] rounded-lg text-sm text-text-primary border border-white/[0.06]">{replaceDialog.original}</div></div>
            <div><label className="text-xs text-text-muted block mb-1">הקלד מילה חדשה:</label><input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="מילה חדשה..." className="w-full px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleReplaceTextOnly() }} /></div>
            <div className="space-y-2">
              <button onClick={handleReplaceTextOnly} disabled={!replaceText.trim()} className="w-full py-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] rounded-xl text-sm text-text-primary transition-all disabled:opacity-50">החלף בתמלול בלבד</button>
              <button onClick={handleReplaceWithAudio} disabled={!replaceText.trim() || isReplacingAudio} className="w-full py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isReplacingAudio ? <><Loader2 size={14} className="animate-spin" /> מחליף מילה...</> : 'החלף בתמלול ובסרטון'}
              </button>
            </div>
          </div>
        </div>
      )}

      {commentDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setCommentDialog(null)}>
          <div className="glass rounded-2xl p-5 max-w-sm w-full mx-4 space-y-3 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-text-primary text-sm">הוסף הערה</h3>
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="כתוב הערה..." className="w-full h-20 px-3 py-2 bg-white/[0.04] rounded-lg border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none resize-none" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { addToast('הערה נוספה!', 'success'); setCommentDialog(null) }} disabled={!commentText.trim()} className="flex-1 py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all disabled:opacity-50">שמור</button>
              <button onClick={() => setCommentDialog(null)} className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors">ביטול</button>
            </div>
          </div>
        </div>
      )}

      <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {isTranscribing && (
          <div className="text-center py-12 space-y-4">
            <Loader2 size={32} className="mx-auto text-accent-purple animate-spin" />
            <p className="text-sm text-text-primary font-medium">{transcribeProgress || 'מתמלל את הקובץ...'}</p>
            <p className="text-xs text-text-muted">זה יכול לקחת עד דקה</p>
            <div className="max-w-[200px] mx-auto h-1 bg-white/[0.06] rounded-full overflow-hidden"><div className="h-full bg-accent-purple rounded-full animate-pulse" style={{ width: '60%' }} /></div>
          </div>
        )}

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
                <button onClick={() => importRef.current?.click()} className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-sm text-text-secondary transition-colors border border-white/[0.06]"><Upload size={14} /> ייבא תמלול</button>
              </div>
            </div>
          </div>
        )}

        {showTranscribeButton && (
          <div className="text-center py-8 space-y-4">
            <button onClick={handleAutoTranscribe} className="inline-flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 text-white rounded-xl text-base font-medium transition-all shadow-lg shadow-accent-purple/20">
              <span className="text-xl">🎙️</span> תמלל אוטומטית
            </button>
            <p className="text-xs text-text-muted">לחץ להתחלת תמלול אוטומטי עם OpenAI Whisper</p>
          </div>
        )}

        {transcript.map((segment, si) => {
          const isActive = si === activeSegmentIdx
          const segStartTime = segment.words[0]?.start ?? 0
          const segEndTime = segment.words[segment.words.length - 1]?.end ?? 0
          const speakerColor = SPEAKER_COLORS[segment.color] || '#5C8AFF'
          return (
            <div key={si} data-segment={si} className={`rounded-xl border transition-all ${isActive ? 'bg-accent-purple/10 border-accent-purple/30' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
                <div className="flex items-center gap-2 relative">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: speakerColor }} />
                  {editingSpeaker === si ? (
                    <input value={speakerEditValue} onChange={(e) => setSpeakerEditValue(e.target.value)} onBlur={() => handleSpeakerRename(si)} onKeyDown={(e) => e.key === 'Enter' && handleSpeakerRename(si)} className="bg-white/[0.06] rounded px-2 py-0.5 text-xs text-text-primary outline-none border border-accent-purple/30 w-24" autoFocus />
                  ) : (
                    <div className="relative">
                      <button onClick={() => { if (speakers.length > 1) setSpeakerDropdown(speakerDropdown === si ? null : si); else { setEditingSpeaker(si); setSpeakerEditValue(segment.speaker) } }} className="text-xs font-medium text-text-primary hover:text-accent-purple transition-colors" title="לחץ לשנות שם דובר">
                        {segment.speaker}
                        {speakers.length > 1 && <ChevronDown size={10} className="inline mr-1" />}
                      </button>
                      {speakerDropdown === si && speakers.length > 1 && (
                        <div className="absolute top-full mt-1 right-0 z-20 glass rounded-lg py-1 min-w-[140px] animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                          {speakers.map((s) => (
                            <button key={s.id} onClick={() => { reassignSegmentSpeaker(si, s.id); setSpeakerDropdown(null) }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/[0.06] transition-colors ${segment.speakerId === s.id ? 'text-accent-purple' : 'text-text-secondary'}`}>
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}
                            </button>
                          ))}
                          <div className="border-t border-white/[0.06] mt-1 pt-1">
                            <button onClick={() => { setSpeakerDropdown(null); setEditingSpeaker(si); setSpeakerEditValue(segment.speaker) }} className="w-full text-right px-3 py-1.5 text-xs text-text-muted hover:bg-white/[0.06] transition-colors">שנה שם...</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {si < transcript.length - 1 && <button onClick={() => { mergeSegments(si, si + 1); addToast('הקטעים מוזגו', 'info') }} className="p-0.5 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-accent-purple" title="מזג עם הקטע הבא"><Merge size={11} /></button>}
                  <button onClick={() => setCurrentTime(segStartTime)} className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] font-mono text-text-muted hover:text-accent-purple transition-colors" title="לחץ לדלג לזמן זה">{formatTimestamp(segStartTime)} - {formatTimestamp(segEndTime)}</button>
                </div>
              </div>
              <div className="px-3 py-2">
                <div contentEditable suppressContentEditableWarning
                  className="text-body leading-[1.8] segment-text outline-none focus:bg-white/[0.02] rounded px-1 -mx-1" dir="rtl"
                  onInput={(e) => handleSegmentInput(si, e)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    // Allow normal character-by-character deletion
                    if (e.key === 'Backspace' || e.key === 'Delete') {
                      // Let the browser handle single-character deletion natively
                      // Only prevent if Ctrl/Cmd is held (which would delete whole word)
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                      }
                    }
                  }}
                  onMouseUp={() => handleTextSelection(si)}>
                  {segment.words.map((word, wi) => {
                    const isPlaying = currentTime >= word.start && currentTime < word.end
                    const matchesSearch = searchQuery && word.text.includes(searchQuery)
                    const isSelected = selectedWords?.segIdx === si && selectedWords.wordIndices.includes(wi)
                    return (
                      <span key={wi} data-word-idx={wi} onClick={() => { if (!word.isFiller) setCurrentTime(word.start) }}
                        className={`cursor-pointer rounded px-0.5 transition-all duration-150 inline-block ${
                          isSelected ? 'bg-accent-blue/30 text-accent-blue'
                            : isPlaying ? 'bg-accent-purple/30 text-white'
                            : word.isFiller ? 'bg-warning/15 text-warning relative group/filler cursor-pointer'
                            : word.isEdited ? 'border-b border-dashed border-accent-blue/50 hover:bg-white/[0.06] text-text-primary'
                            : matchesSearch ? 'bg-accent-blue/20 text-accent-blue'
                            : 'hover:bg-white/[0.06] text-text-primary'
                        }`}
                        title={word.isFiller ? 'מילת מילוי - לחץ למחיקה' : word.isEdited ? 'שונה' : undefined}>
                        {word.text}
                        {word.isFiller && (
                          <button onClick={(e) => { e.stopPropagation(); handleFillerClick(si, wi) }} className="absolute -top-1 -left-1 w-3.5 h-3.5 bg-warning/80 rounded-full flex items-center justify-center opacity-0 group-hover/filler:opacity-100 transition-opacity">
                            <X size={8} className="text-bg-deepest" />
                          </button>
                        )}{' '}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}

        {transcript.length > 0 && !showManualInput && (
          <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
            <button onClick={() => setShowManualInput(true)} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"><Pencil size={12} /> ערוך תמלול ידנית</button>
            <button onClick={handleAutoTranscribe} disabled={isTranscribing || !mediaFile} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"><RefreshCw size={12} /> תמלל מחדש</button>
            {transcribedAt && <span className="flex items-center gap-1 text-[10px] text-text-muted"><Clock size={10} /> תומלל {timeAgo(transcribedAt)}</span>}
          </div>
        )}

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
          <div className="text-center py-8 space-y-3">
            <FileText size={32} className="mx-auto text-text-muted opacity-30" />
            <p className="text-text-muted text-sm">אין תמלול זמין</p>
            <p className="text-text-muted text-xs">העלה קובץ מדיה ותמלל אותו</p>
          </div>
        )}
      </div>
    </div>
  )
}
