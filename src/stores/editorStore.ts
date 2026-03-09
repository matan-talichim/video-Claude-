import { create } from 'zustand'

export interface Word {
  text: string
  start: number
  end: number
  isFiller: boolean
}

export interface Segment {
  speaker: string
  color: string
  startTime: string
  endTime?: string
  segStart?: number
  segEnd?: number
  words: Word[]
}

const demoTranscript: Segment[] = [
  {
    speaker: 'דני',
    color: 'border-blue-400',
    startTime: '00:00',
    words: [
      { text: 'שלום', start: 0, end: 0.4, isFiller: false },
      { text: 'לכולם', start: 0.4, end: 0.9, isFiller: false },
      { text: 'וברוכים', start: 0.9, end: 1.4, isFiller: false },
      { text: 'הבאים', start: 1.4, end: 1.8, isFiller: false },
      { text: 'לפודקאסט', start: 1.8, end: 2.4, isFiller: false },
      { text: 'השבועי', start: 2.4, end: 2.9, isFiller: false },
      { text: 'שלנו.', start: 2.9, end: 3.3, isFiller: false },
      { text: 'היום', start: 3.5, end: 3.9, isFiller: false },
      { text: 'אנחנו', start: 3.9, end: 4.3, isFiller: false },
      { text: 'הולכים', start: 4.3, end: 4.7, isFiller: false },
      { text: 'לדבר', start: 4.7, end: 5.1, isFiller: false },
      { text: 'על', start: 5.1, end: 5.3, isFiller: false },
      { text: 'אממ', start: 5.3, end: 5.7, isFiller: true },
      { text: 'טכנולוגיה', start: 5.7, end: 6.3, isFiller: false },
      { text: 'ובינה', start: 6.3, end: 6.8, isFiller: false },
      { text: 'מלאכותית.', start: 6.8, end: 7.4, isFiller: false },
    ],
  },
  {
    speaker: 'מיכל',
    color: 'border-green-400',
    startTime: '00:15',
    words: [
      { text: 'תודה', start: 15, end: 15.4, isFiller: false },
      { text: 'דני.', start: 15.4, end: 15.8, isFiller: false },
      { text: 'כאילו', start: 15.8, end: 16.3, isFiller: true },
      { text: 'זה', start: 16.3, end: 16.5, isFiller: false },
      { text: 'נושא', start: 16.5, end: 16.9, isFiller: false },
      { text: 'מרתק.', start: 16.9, end: 17.4, isFiller: false },
      { text: 'אני', start: 17.5, end: 17.8, isFiller: false },
      { text: 'חושבת', start: 17.8, end: 18.2, isFiller: false },
      { text: 'שבעצם', start: 18.2, end: 18.7, isFiller: true },
      { text: 'יש', start: 18.7, end: 19.0, isFiller: false },
      { text: 'הרבה', start: 19.0, end: 19.4, isFiller: false },
      { text: 'מה', start: 19.4, end: 19.6, isFiller: false },
      { text: 'לדבר', start: 19.6, end: 20.0, isFiller: false },
      { text: 'על', start: 20.0, end: 20.2, isFiller: false },
      { text: 'איך', start: 20.2, end: 20.5, isFiller: false },
      { text: 'AI', start: 20.5, end: 20.9, isFiller: false },
      { text: 'משנה', start: 20.9, end: 21.3, isFiller: false },
      { text: 'את', start: 21.3, end: 21.5, isFiller: false },
      { text: 'עולם', start: 21.5, end: 21.9, isFiller: false },
      { text: 'יצירת', start: 21.9, end: 22.4, isFiller: false },
      { text: 'התוכן.', start: 22.4, end: 23.0, isFiller: false },
    ],
  },
  {
    speaker: 'דני',
    color: 'border-blue-400',
    startTime: '00:28',
    words: [
      { text: 'בהחלט.', start: 28, end: 28.5, isFiller: false },
      { text: 'אז', start: 28.5, end: 28.8, isFiller: true },
      { text: 'נו', start: 28.8, end: 29.1, isFiller: true },
      { text: 'בואי', start: 29.1, end: 29.5, isFiller: false },
      { text: 'נתחיל', start: 29.5, end: 30.0, isFiller: false },
      { text: 'מהבסיס.', start: 30.0, end: 30.6, isFiller: false },
      { text: 'מה', start: 30.8, end: 31.0, isFiller: false },
      { text: 'זה', start: 31.0, end: 31.2, isFiller: false },
      { text: 'בעצם', start: 31.2, end: 31.7, isFiller: true },
      { text: 'עריכה', start: 31.7, end: 32.2, isFiller: false },
      { text: 'מבוססת', start: 32.2, end: 32.7, isFiller: false },
      { text: 'טקסט?', start: 32.7, end: 33.2, isFiller: false },
    ],
  },
  {
    speaker: 'מיכל',
    color: 'border-green-400',
    startTime: '00:35',
    words: [
      { text: 'אז', start: 35, end: 35.3, isFiller: true },
      { text: 'העיקרון', start: 35.3, end: 35.8, isFiller: false },
      { text: 'הוא', start: 35.8, end: 36.0, isFiller: false },
      { text: 'פשוט.', start: 36.0, end: 36.5, isFiller: false },
      { text: 'במקום', start: 36.7, end: 37.1, isFiller: false },
      { text: 'לעבוד', start: 37.1, end: 37.5, isFiller: false },
      { text: 'עם', start: 37.5, end: 37.7, isFiller: false },
      { text: 'ציר', start: 37.7, end: 38.0, isFiller: false },
      { text: 'זמן', start: 38.0, end: 38.3, isFiller: false },
      { text: 'מסורתי,', start: 38.3, end: 38.9, isFiller: false },
      { text: 'אתה', start: 39.0, end: 39.3, isFiller: false },
      { text: 'פשוט', start: 39.3, end: 39.7, isFiller: false },
      { text: 'עורך', start: 39.7, end: 40.1, isFiller: false },
      { text: 'את', start: 40.1, end: 40.3, isFiller: false },
      { text: 'הטקסט', start: 40.3, end: 40.7, isFiller: false },
      { text: 'כמו', start: 40.7, end: 41.0, isFiller: false },
      { text: 'מסמך', start: 41.0, end: 41.4, isFiller: false },
      { text: 'רגיל.', start: 41.4, end: 41.9, isFiller: false },
      { text: 'מוחק', start: 42.0, end: 42.4, isFiller: false },
      { text: 'מילה', start: 42.4, end: 42.7, isFiller: false },
      { text: '-', start: 42.7, end: 42.8, isFiller: false },
      { text: 'היא', start: 42.8, end: 43.1, isFiller: false },
      { text: 'נעלמת', start: 43.1, end: 43.6, isFiller: false },
      { text: 'מהסרטון.', start: 43.6, end: 44.2, isFiller: false },
    ],
  },
]

export interface EditHistoryEntry {
  action: string
  description: string
  timestamp: number
  previousTranscript?: Segment[]
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
  transcriptMode: 'real' | 'demo'
  showCaptions: boolean
  editHistory: EditHistoryEntry[]
  lastSavedAt: number | null
  isDirty: boolean

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
  setTranscriptMode: (mode: 'real' | 'demo') => void
  setShowCaptions: (show: boolean) => void
  addEditHistory: (entry: Omit<EditHistoryEntry, 'timestamp'>) => void
  markSaved: () => void
  setIsDirty: (dirty: boolean) => void
  loadProject: (opts: {
    id: string
    name: string
    isDemo?: boolean
    mediaFile?: File | null
    mediaBlobUrl?: string | null
    mediaType?: 'video' | 'audio' | null
    transcript?: Segment[]
    transcriptMode?: 'real' | 'demo'
    duration?: number
    editHistory?: EditHistoryEntry[]
  }) => void
  resetEditor: () => void
  removeFillerWords: () => { removed: Record<string, number>; totalRemoved: number; timeSaved: number }
  replaceWord: (oldWord: string, newWord: string) => number
  removeTimeRange: (startTime: number, endTime: number) => void
  undoLastEdit: () => string | null
  getDemoTranscript: () => Segment[]
}

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
  transcriptMode: 'real',
  showCaptions: false,
  editHistory: [],
  lastSavedAt: null,
  isDirty: false,

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
  setTranscriptMode: (mode) => {
    if (mode === 'demo') {
      set({ transcriptMode: mode, transcript: demoTranscript })
    } else {
      set({ transcriptMode: mode, transcript: [] })
    }
  },
  setShowCaptions: (show) => set({ showCaptions: show }),
  addEditHistory: (entry) => set((s) => ({
    editHistory: [...s.editHistory, { ...entry, timestamp: Date.now() }],
    isDirty: true,
  })),
  markSaved: () => set({ lastSavedAt: Date.now(), isDirty: false }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),

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
      transcript: hasTranscript ? opts.transcript! : isDemo ? demoTranscript : [],
      transcriptMode: opts.transcriptMode ?? (isDemo ? 'demo' : 'real'),
      duration: opts.duration ?? (isDemo ? 167 : 0),
      editHistory: opts.editHistory ?? [],
      currentTime: 0,
      isPlaying: false,
      playbackSpeed: 1,
      isDirty: false,
      lastSavedAt: null,
      showCaptions: false,
      waveformData: null,
    })
  },

  resetEditor: () => set({
    projectId: null, projectName: '', isDemo: false,
    mediaFile: null, mediaBlobUrl: null, mediaType: null, waveformData: null,
    currentTime: 0, duration: 0, isPlaying: false, playbackSpeed: 1, volume: 80,
    transcript: [], transcriptMode: 'real', showCaptions: false,
    editHistory: [], lastSavedAt: null, isDirty: false,
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
      transcript: newTranscript, isDirty: true,
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
          return { ...w, text: newWord + suffix }
        }
        return w
      }),
    }))
    if (count > 0) {
      set({
        transcript: newTranscript, isDirty: true,
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
      transcript: newTranscript, isDirty: true,
      editHistory: [...editHistory, { action: 'removeTimeRange', description: `נמחק קטע מ-${startTime.toFixed(1)} עד ${endTime.toFixed(1)}`, timestamp: Date.now(), previousTranscript }],
    })
  },

  undoLastEdit: () => {
    const { editHistory } = get()
    if (editHistory.length === 0) return null
    const lastEdit = editHistory[editHistory.length - 1]
    if (lastEdit.previousTranscript) {
      set({ transcript: lastEdit.previousTranscript, editHistory: editHistory.slice(0, -1), isDirty: true })
    }
    return lastEdit.description
  },

  getDemoTranscript: () => demoTranscript,
}))
