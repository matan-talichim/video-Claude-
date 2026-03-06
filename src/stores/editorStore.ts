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
  words: Word[]
}

const mockTranscript: Segment[] = [
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

interface EditorState {
  currentTime: number
  duration: number
  isPlaying: boolean
  playbackSpeed: number
  volume: number
  transcript: Segment[]
  projectName: string
  setCurrentTime: (time: number) => void
  setIsPlaying: (playing: boolean) => void
  togglePlay: () => void
  setPlaybackSpeed: (speed: number) => void
  setVolume: (volume: number) => void
  setProjectName: (name: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  currentTime: 0,
  duration: 167,
  isPlaying: false,
  playbackSpeed: 1,
  volume: 80,
  transcript: mockTranscript,
  projectName: 'פודקאסט שבועי #47',
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setVolume: (volume) => set({ volume: volume }),
  setProjectName: (name) => set({ projectName: name }),
}))
