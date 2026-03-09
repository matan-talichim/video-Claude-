import { create } from 'zustand'

export interface Word {
  text: string
  start: number
  end: number
  isFiller: boolean
  isEdited?: boolean
  isDeleted?: boolean
}

export interface Segment {
  speaker: string
  speakerId?: number
  color: string
  startTime: string
  endTime?: string
  segStart?: number
  segEnd?: number
  words: Word[]
}

export interface Caption {
  id: string
  text: string
  startTime: number
  endTime: number
  style: CaptionStyle
  words?: { text: string; start: number; end: number }[]
}

export interface CaptionStyle {
  preset: 'classic' | 'modern' | 'karaoke' | 'minimal'
  fontSize: number
  fontFamily: string
  textColor: string
  bgColor: string
  bgOpacity: number
  position: 'top' | 'center' | 'bottom'
  alignment: 'right' | 'center' | 'left'
  bold: boolean
  italic: boolean
  outline: boolean
  outlineColor: string
  animation: 'none' | 'fade' | 'slideUp' | 'typewriter' | 'wordByWord' | 'bounce' | 'zoom'
}

export interface BRollItem {
  id: string
  imageUrl: string
  startTime: number
  duration: number
  source: 'ai' | 'stock' | 'upload'
  prompt?: string
}

export interface EditHistoryEntry {
  action: string
  description: string
  timestamp: number
  previousTranscript?: Segment[]
}

export interface SpeakerInfo {
  id: number
  name: string
  description?: string
  color: string
}

interface EditorState {
  projectId: string | null
  projectName: string
  isDemo: boolean
  mediaFile: File | null
  mediaBlobUrl: string | null
  mediaType: 'video' | 'audio' | null
  waveformData: number[] | null
  currentTime: number
  duration: number
  isPlaying: boolean
  playbackSpeed: number
  volume: number
  transcript: Segment[]
  showCaptions: boolean
  captions: Caption[]
  captionStyle: CaptionStyle
  bRollItems: BRollItem[]
  editHistory: EditHistoryEntry[]
  redoHistory: EditHistoryEntry[]
  lastSavedAt: number | null
  isDirty: boolean
  speakers: SpeakerInfo[]
  // Editor tool settings
  editorEffects: Record<string, any>

  setProjectId: (id: string | null) => void
  setProjectName: (name: string) => void
  setIsDemo: (demo: boolean) => void
  setMediaFile: (file: File | null) => void
  setMediaBlobUrl: (url: string | null) => void
  setMediaType: (type: 'video' | 'audio' | null) => void
  setWaveformData: (data: number[] | null) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setIsPlaying: (playing: boolean) => void
  togglePlay: () => void
  setPlaybackSpeed: (speed: number) => void
  setVolume: (volume: number) => void
  setTranscript: (transcript: Segment[]) => void
  setShowCaptions: (show: boolean) => void
  setCaptions: (captions: Caption[]) => void
  setCaptionStyle: (style: Partial<CaptionStyle>) => void
  addBRollItem: (item: BRollItem) => void
  removeBRollItem: (id: string) => void
  updateBRollItem: (id: string, updates: Partial<BRollItem>) => void
  addEditHistory: (entry: Omit<EditHistoryEntry, 'timestamp'>) => void
  markSaved: () => void
  setIsDirty: (dirty: boolean) => void
  setSpeakers: (speakers: SpeakerInfo[]) => void
  setEditorEffect: (key: string, value: any) => void
  loadProject: (opts: {
    id: string
    name: string
    isDemo?: boolean
    mediaFile?: File | null
    mediaBlobUrl?: string | null
    mediaType?: 'video' | 'audio' | null
    transcript?: Segment[]
    duration?: number
    editHistory?: EditHistoryEntry[]
  }) => void
  resetEditor: () => void
  removeFillerWords: () => { removed: Record<string, number>; totalRemoved: number; timeSaved: number }
  replaceWord: (oldWord: string, newWord: string) => number
  removeTimeRange: (startTime: number, endTime: number) => void
  deleteWords: (segIdx: number, wordIndices: number[]) => void
  undoLastEdit: () => string | null
  redoLastEdit: () => string | null
  generateCaptionsFromTranscript: () => void
  renameSpeaker: (oldName: string, newName: string) => void
  reassignSegmentSpeaker: (segIdx: number, speakerId: number) => void
  splitSegment: (segIdx: number, wordIdx: number) => void
  mergeSegments: (segIdx1: number, segIdx2: number) => void
}

const defaultCaptionStyle: CaptionStyle = {
  preset: 'classic',
  fontSize: 24,
  fontFamily: 'Heebo',
  textColor: '#FFFFFF',
  bgColor: '#000000',
  bgOpacity: 0.7,
  position: 'bottom',
  alignment: 'center',
  bold: false,
  italic: false,
  outline: false,
  outlineColor: '#000000',
  animation: 'none',
}

const SPEAKER_COLORS = ['border-blue-400', 'border-green-400', 'border-purple-400', 'border-orange-400']
const SPEAKER_HEX_COLORS = ['#5C8AFF', '#4ADE80', '#FBBF24', '#F472B6']

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  projectName: '',
  isDemo: false,
  mediaFile: null,
  mediaBlobUrl: null,
  mediaType: null,
  waveformData: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  playbackSpeed: 1,
  volume: 80,
  transcript: [],
  showCaptions: false,
  captions: [],
  captionStyle: { ...defaultCaptionStyle },
  bRollItems: [],
  editHistory: [],
  redoHistory: [],
  lastSavedAt: null,
  isDirty: false,
  speakers: [],
  editorEffects: {},

  setProjectId: (id) => set({ projectId: id }),
  setProjectName: (name) => set({ projectName: name, isDirty: true }),
  setIsDemo: (demo) => set({ isDemo: demo }),
  setMediaFile: (file) => set({ mediaFile: file }),
  setMediaBlobUrl: (url) => set({ mediaBlobUrl: url }),
  setMediaType: (type) => set({ mediaType: type }),
  setWaveformData: (data) => set({ waveformData: data }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setVolume: (volume) => set({ volume }),
  setTranscript: (transcript) => set({ transcript, isDirty: true }),
  setShowCaptions: (show) => set({ showCaptions: show }),
  setCaptions: (captions) => set({ captions }),
  setCaptionStyle: (style) => set((s) => ({ captionStyle: { ...s.captionStyle, ...style } })),
  addBRollItem: (item) => set((s) => ({ bRollItems: [...s.bRollItems, item], isDirty: true })),
  removeBRollItem: (id) => set((s) => ({ bRollItems: s.bRollItems.filter((b) => b.id !== id), isDirty: true })),
  updateBRollItem: (id, updates) => set((s) => ({
    bRollItems: s.bRollItems.map((b) => b.id === id ? { ...b, ...updates } : b),
    isDirty: true,
  })),
  addEditHistory: (entry) => set((s) => ({
    editHistory: [...s.editHistory, { ...entry, timestamp: Date.now() }],
    redoHistory: [],
    isDirty: true,
  })),
  markSaved: () => set({ lastSavedAt: Date.now(), isDirty: false }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setSpeakers: (speakers) => set({ speakers }),
  setEditorEffect: (key, value) => set((s) => ({
    editorEffects: { ...s.editorEffects, [key]: value },
    isDirty: true,
  })),

  loadProject: (opts) => {
    const isDemo = opts.isDemo ?? false
    const hasTranscript = opts.transcript && opts.transcript.length > 0
    set({
      projectId: opts.id,
      projectName: opts.name,
      isDemo,
      mediaFile: opts.mediaFile ?? null,
      mediaBlobUrl: opts.mediaBlobUrl ?? null,
      mediaType: opts.mediaType ?? null,
      transcript: hasTranscript ? opts.transcript! : [],
      duration: opts.duration ?? 0,
      editHistory: opts.editHistory ?? [],
      redoHistory: [],
      currentTime: 0,
      isPlaying: false,
      playbackSpeed: 1,
      isDirty: false,
      lastSavedAt: null,
      showCaptions: false,
      captions: [],
      captionStyle: { ...defaultCaptionStyle },
      bRollItems: [],
      waveformData: null,
      speakers: [],
      editorEffects: {},
    })
  },

  resetEditor: () => set({
    projectId: null, projectName: '', isDemo: false,
    mediaFile: null, mediaBlobUrl: null, mediaType: null, waveformData: null,
    currentTime: 0, duration: 0, isPlaying: false, playbackSpeed: 1, volume: 80,
    transcript: [], showCaptions: false, captions: [], captionStyle: { ...defaultCaptionStyle },
    bRollItems: [], editHistory: [], redoHistory: [], lastSavedAt: null, isDirty: false,
    speakers: [], editorEffects: {},
  }),

  removeFillerWords: () => {
    const { transcript, editHistory } = get()
    const fillerList = ['אממ', 'אההה', 'כאילו', 'נו', 'בעצם', 'אז', 'סתם', 'יודע', 'יודעת']
    const removed: Record<string, number> = {}
    let timeSaved = 0
    const previousTranscript = JSON.parse(JSON.stringify(transcript))

    const newTranscript = transcript.map((seg) => ({
      ...seg,
      words: seg.words.filter((w) => {
        if (w.isFiller || fillerList.includes(w.text.replace(/[.,!?]/g, ''))) {
          const word = w.text.replace(/[.,!?]/g, '')
          removed[word] = (removed[word] || 0) + 1
          timeSaved += w.end - w.start
          return false
        }
        return true
      }),
    })).filter((seg) => seg.words.length > 0)

    const totalRemoved = Object.values(removed).reduce((s, c) => s + c, 0)
    set({
      transcript: newTranscript, isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'removeFillerWords', description: `הוסרו ${totalRemoved} מילות מילוי`, timestamp: Date.now(), previousTranscript }],
    })
    return { removed, totalRemoved, timeSaved }
  },

  replaceWord: (oldWord, newWord) => {
    const { transcript, editHistory } = get()
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    let count = 0
    const newTranscript = transcript.map((seg) => ({
      ...seg,
      words: seg.words.map((w) => {
        const clean = w.text.replace(/[.,!?]/g, '')
        if (w.text === oldWord || clean === oldWord) {
          count++
          const suffix = w.text.slice(clean.length)
          return { ...w, text: newWord + suffix, isEdited: true }
        }
        return w
      }),
    }))
    if (count > 0) {
      set({
        transcript: newTranscript, isDirty: true, redoHistory: [],
        editHistory: [...editHistory, { action: 'replaceWord', description: `הוחלפו ${count} מופעים של '${oldWord}' ב-'${newWord}'`, timestamp: Date.now(), previousTranscript }],
      })
    }
    return count
  },

  removeTimeRange: (startTime, endTime) => {
    const { transcript, editHistory } = get()
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const newTranscript = transcript.map((seg) => ({
      ...seg,
      words: seg.words.filter((w) => w.start < startTime || w.end > endTime),
    })).filter((seg) => seg.words.length > 0)
    set({
      transcript: newTranscript, isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'removeTimeRange', description: `נמחק קטע מ-${startTime.toFixed(1)} עד ${endTime.toFixed(1)}`, timestamp: Date.now(), previousTranscript }],
    })
  },

  deleteWords: (segIdx, wordIndices) => {
    const { transcript, editHistory } = get()
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const newTranscript = transcript.map((seg, si) => {
      if (si !== segIdx) return seg
      return {
        ...seg,
        words: seg.words.filter((_, wi) => !wordIndices.includes(wi)),
      }
    }).filter((seg) => seg.words.length > 0)
    set({
      transcript: newTranscript, isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'deleteWords', description: `נמחקו ${wordIndices.length} מילים`, timestamp: Date.now(), previousTranscript }],
    })
  },

  undoLastEdit: () => {
    const { editHistory, transcript, redoHistory } = get()
    if (editHistory.length === 0) return null
    const lastEdit = editHistory[editHistory.length - 1]
    if (lastEdit.previousTranscript) {
      set({
        transcript: lastEdit.previousTranscript,
        editHistory: editHistory.slice(0, -1),
        redoHistory: [...redoHistory, { ...lastEdit, previousTranscript: JSON.parse(JSON.stringify(transcript)) }],
        isDirty: true,
      })
    }
    return lastEdit.description
  },

  redoLastEdit: () => {
    const { redoHistory, transcript, editHistory } = get()
    if (redoHistory.length === 0) return null
    const lastRedo = redoHistory[redoHistory.length - 1]
    if (lastRedo.previousTranscript) {
      set({
        transcript: lastRedo.previousTranscript,
        redoHistory: redoHistory.slice(0, -1),
        editHistory: [...editHistory, { ...lastRedo, previousTranscript: JSON.parse(JSON.stringify(transcript)) }],
        isDirty: true,
      })
    }
    return lastRedo.description
  },

  generateCaptionsFromTranscript: () => {
    const { transcript, captionStyle } = get()
    const captions: Caption[] = []
    const MAX_CHARS = 42
    const MAX_LINES = 2

    for (const seg of transcript) {
      let currentWords: Word[] = []
      let currentLine = ''

      for (const word of seg.words) {
        const testLine = currentLine ? `${currentLine} ${word.text}` : word.text
        if (testLine.length > MAX_CHARS && currentWords.length > 0) {
          const captionId = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
          captions.push({
            id: captionId,
            text: currentWords.map((w) => w.text).join(' '),
            startTime: currentWords[0].start,
            endTime: currentWords[currentWords.length - 1].end,
            style: { ...captionStyle },
            words: currentWords.map((w) => ({ text: w.text, start: w.start, end: w.end })),
          })
          currentWords = [word]
          currentLine = word.text
        } else {
          currentWords.push(word)
          currentLine = testLine
        }
      }
      if (currentWords.length > 0) {
        const captionId = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        captions.push({
          id: captionId,
          text: currentWords.map((w) => w.text).join(' '),
          startTime: currentWords[0].start,
          endTime: currentWords[currentWords.length - 1].end,
          style: { ...captionStyle },
          words: currentWords.map((w) => ({ text: w.text, start: w.start, end: w.end })),
        })
      }
    }

    set({ captions, showCaptions: true })
  },

  renameSpeaker: (oldName, newName) => {
    const { transcript, speakers } = get()
    const newTranscript = transcript.map((seg) =>
      seg.speaker === oldName ? { ...seg, speaker: newName } : seg
    )
    const newSpeakers = speakers.map((s) =>
      s.name === oldName ? { ...s, name: newName } : s
    )
    set({ transcript: newTranscript, speakers: newSpeakers, isDirty: true })
  },

  reassignSegmentSpeaker: (segIdx, speakerId) => {
    const { transcript, speakers } = get()
    const speaker = speakers.find((s) => s.id === speakerId)
    if (!speaker) return
    const colorIdx = (speakerId - 1) % SPEAKER_COLORS.length
    const newTranscript = transcript.map((seg, i) =>
      i === segIdx
        ? { ...seg, speaker: speaker.name, speakerId, color: SPEAKER_COLORS[colorIdx] }
        : seg
    )
    set({ transcript: newTranscript, isDirty: true })
  },

  splitSegment: (segIdx, wordIdx) => {
    const { transcript, editHistory } = get()
    if (segIdx < 0 || segIdx >= transcript.length) return
    const seg = transcript[segIdx]
    if (wordIdx <= 0 || wordIdx >= seg.words.length) return
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const firstWords = seg.words.slice(0, wordIdx)
    const secondWords = seg.words.slice(wordIdx)
    const formatTs = (s: number) => {
      const m = Math.floor(s / 60); const sec = Math.floor(s % 60)
      return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }
    const seg1: Segment = { ...seg, words: firstWords, endTime: formatTs(firstWords[firstWords.length - 1]?.end ?? 0), segEnd: firstWords[firstWords.length - 1]?.end }
    const seg2: Segment = { ...seg, words: secondWords, startTime: formatTs(secondWords[0]?.start ?? 0), segStart: secondWords[0]?.start }
    const newTranscript = [...transcript.slice(0, segIdx), seg1, seg2, ...transcript.slice(segIdx + 1)]
    set({
      transcript: newTranscript, isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'splitSegment', description: `פוצל קטע ${segIdx + 1}`, timestamp: Date.now(), previousTranscript }],
    })
  },

  mergeSegments: (segIdx1, segIdx2) => {
    const { transcript, editHistory } = get()
    const idx1 = Math.min(segIdx1, segIdx2)
    const idx2 = Math.max(segIdx1, segIdx2)
    if (idx1 < 0 || idx2 >= transcript.length || idx1 === idx2) return
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const merged: Segment = {
      ...transcript[idx1],
      words: [...transcript[idx1].words, ...transcript[idx2].words],
      endTime: transcript[idx2].endTime,
      segEnd: transcript[idx2].segEnd,
    }
    const newTranscript = [...transcript.slice(0, idx1), merged, ...transcript.slice(idx2 + 1)]
    set({
      transcript: newTranscript, isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'mergeSegments', description: `מוזגו קטעות ${idx1 + 1} ו-${idx2 + 1}`, timestamp: Date.now(), previousTranscript }],
    })
  },
}))
