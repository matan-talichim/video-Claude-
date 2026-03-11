import { create } from 'zustand'
import { useUserProfileStore } from './userProfileStore'

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
  source: 'ai' | 'stock' | 'upload' | 'video'
  prompt?: string
  mediaType?: 'image' | 'video'
  provider?: string
  // Position
  displayMode: 'fullscreen' | 'pip' | 'halfLeft' | 'halfRight' | 'halfTop' | 'halfBottom' | 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft' | 'pipSmall' | 'pipMedium'
  x: number
  y: number
  width: number
  height: number
  lockAspectRatio: boolean
  rotation: number
  flipH: boolean
  flipV: boolean
  // Animation
  entranceAnimation: 'none' | 'fadeIn' | 'slideRight' | 'slideLeft' | 'slideUp' | 'slideDown' | 'zoomIn' | 'rotate' | 'bounce'
  stayingAnimation: 'none' | 'gentleFloat' | 'pulse' | 'hover' | 'slowRotate' | 'blink'
  exitAnimation: 'none' | 'fadeOut' | 'slideRight' | 'slideLeft' | 'slideUp' | 'slideDown' | 'zoomOut'
  animationDuration: number
  animationEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce' | 'elastic'
  animationDelay: number
  stayingSpeed: 'slow' | 'medium' | 'fast'
  // Visual
  opacity: number
  borderRadius: number
  shadowEnabled: boolean
  shadowIntensity: number
  shadowColor: string
  shadowBlur: number
  shadowX: number
  shadowY: number
  borderEnabled: boolean
  borderColor: string
  borderWidth: number
  blurBackground: boolean
  // Filters
  brightness: number
  contrast: number
  saturation: number
  blur: number
  grayscale: boolean
  sepia: boolean
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light'
  // Fit
  objectFit: 'cover' | 'contain' | 'fill'
  // Layer
  zIndex: number
  // Group
  groupId?: string
}

export interface BRollHistoryItem {
  id: string
  imageUrl: string
  prompt?: string
  source: 'ai' | 'stock' | 'upload' | 'video'
  provider?: string
  createdAt: number
  aspectRatio?: string
  style?: string
}

export interface BRollTemplate {
  id: string
  name: string
  description: string
  positions: Partial<BRollItem>[]
}

export interface DeletedRegion {
  startTime: number
  endTime: number
  description?: string
}

export interface EditHistoryEntry {
  action: string
  description: string
  timestamp: number
  previousTranscript?: Segment[]
  previousDeletedRegions?: DeletedRegion[]
}

export interface SpeakerInfo {
  id: number
  name: string
  description?: string
  color: string
}

export interface TrackState {
  muted: boolean
  locked: boolean
  visible: boolean
}

// === New overlay types for Kapwing-level editor ===

export interface TextOverlay {
  id: string
  text: string
  x: number           // percentage 0-100
  y: number
  width: number
  height: number
  rotation: number
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  color: string
  backgroundColor: string
  backgroundOpacity: number
  textAlign: 'right' | 'center' | 'left'
  lineHeight: number
  letterSpacing: number
  shadow: { color: string; blur: number; x: number; y: number } | null
  outline: { color: string; width: number } | null
  animation: { entrance: string; exit: string; duration: number }
  startTime: number
  endTime: number
}

export interface ShapeOverlay {
  id: string
  type: 'rectangle' | 'circle' | 'line' | 'arrow' | 'star' | 'triangle'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
  cornerRadius: number
  startTime: number
  endTime: number
  animation: string
}

export interface StickerOverlay {
  id: string
  emoji: string
  x: number
  y: number
  size: number
  rotation: number
  startTime: number
  endTime: number
}

export interface ColorCorrection {
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  highlights: number
  shadows: number
  sharpness: number
  vignette: number
}

export interface SelectedCanvasItem {
  type: 'text' | 'shape' | 'sticker' | 'broll'
  id: string
}

export interface ChapterMarker {
  title: string
  startTime: number
  endTime?: number
}

export interface EditedFile {
  id: string
  name: string
  format: string
  duration: number
  blob: Blob
  blobUrl: string
  createdAt: Date
  appliedEdits: string[]
}

export interface CaptionTrack {
  id: string
  language: string
  languageName: string
  flag: string
  captions: Array<{ id: string; text: string; startTime: number; endTime: number }>
  isVisible: boolean
  isSource: boolean
}

export const languageFlags: Record<string, string> = {
  'he': '🇮🇱', 'en': '🇬🇧', 'ar': '🇸🇦', 'ru': '🇷🇺',
  'fr': '🇫🇷', 'es': '🇪🇸', 'de': '🇩🇪', 'ja': '🇯🇵',
  'zh': '🇨🇳', 'ko': '🇰🇷', 'hi': '🇮🇳', 'tr': '🇹🇷',
  'pt': '🇧🇷', 'it': '🇮🇹', 'nl': '🇳🇱', 'pl': '🇵🇱',
  'cs': '🇨🇿', 'ro': '🇷🇴', 'bg': '🇧🇬', 'el': '🇬🇷',
  'fi': '🇫🇮', 'sv': '🇸🇪', 'da': '🇩🇰', 'uk': '🇺🇦',
  'id': '🇮🇩', 'hu': '🇭🇺', 'nb': '🇳🇴', 'vi': '🇻🇳',
  'sk': '🇸🇰', 'sl': '🇸🇮', 'et': '🇪🇪', 'lv': '🇱🇻', 'lt': '🇱🇹',
}

export const languageNames: Record<string, string> = {
  'he': 'עברית', 'en': 'English', 'ar': 'العربية', 'ru': 'Русский',
  'fr': 'Français', 'es': 'Español', 'de': 'Deutsch', 'ja': '日本語',
  'zh': '中文', 'ko': '한국어', 'hi': 'हिन्दी', 'tr': 'Türkçe',
  'pt': 'Português', 'it': 'Italiano', 'nl': 'Nederlands', 'pl': 'Polski',
  'cs': 'Čeština', 'ro': 'Română', 'bg': 'Български', 'el': 'Ελληνικά',
  'fi': 'Suomi', 'sv': 'Svenska', 'da': 'Dansk', 'uk': 'Українська',
  'id': 'Bahasa', 'hu': 'Magyar', 'nb': 'Norsk', 'vi': 'Tiếng Việt',
  'sk': 'Slovenčina', 'sl': 'Slovenščina', 'et': 'Eesti', 'lv': 'Latviešu', 'lt': 'Lietuvių',
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
  bRollHistory: BRollHistoryItem[]
  editHistory: EditHistoryEntry[]
  redoHistory: EditHistoryEntry[]
  lastSavedAt: number | null
  isDirty: boolean
  speakers: SpeakerInfo[]
  deletedRegions: DeletedRegion[]
  // Editor tool settings
  editorEffects: Record<string, any>
  // Chapters
  chapters: ChapterMarker[]
  // Enhanced audio buffer (after processing)
  enhancedAudioBuffer: AudioBuffer | null
  // Applied edits tracking
  appliedEdits: string[]
  // Edited/exported files
  editedFiles: EditedFile[]
  // Track states
  trackStates: {
    video: TrackState
    audio: TrackState
    captions: TrackState
    broll: TrackState
  }

  // Multi-language caption tracks
  captionTracks: CaptionTrack[]
  activeCaptionTrackId: string | null
  setActiveCaptionTrack: (trackId: string) => void
  addCaptionTrack: (language: string, languageName: string, flag: string, captions: CaptionTrack['captions']) => void
  removeCaptionTrack: (trackId: string) => void
  updateCaptionInTrack: (trackId: string, captionIndex: number, newText: string) => void
  hideAllCaptionTracks: () => void
  initSourceCaptionTrack: () => void

  // Audio panel settings
  masterVolume: number
  noiseReduction: boolean
  noiseReductionIntensity: number
  eq: { bass: number; mid: number; treble: number; preset: string }
  fadeIn: number
  fadeOut: number

  // Background music
  backgroundMusic: {
    file: File | null
    blobUrl: string
    name: string
    duration: number
    volume: number
    startOffset: number
    ducking: boolean
    fadeOut: boolean
    trackId: string
  } | null

  setMasterVolume: (v: number) => void
  setNoiseReduction: (enabled: boolean) => void
  setNoiseReductionIntensity: (v: number) => void
  setEq: (eq: { bass: number; mid: number; treble: number; preset: string }) => void
  setFadeIn: (seconds: number) => void
  setFadeOut: (seconds: number) => void
  setBackgroundMusic: (music: EditorState['backgroundMusic']) => void
  setMusicVolume: (volume: number) => void
  setMusicDucking: (enabled: boolean) => void
  removeBackgroundMusic: () => void

  setProjectId: (id: string | null) => void
  setProjectName: (name: string) => void
  setIsDemo: (demo: boolean) => void
  setMediaFile: (file: File | null) => void
  setMediaBlobUrl: (url: string | null) => void
  setMediaType: (type: 'video' | 'audio' | null) => void
  loadMedia: (file: File, blobUrl: string, type: 'video' | 'audio') => void
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
  addBRollItem: (item: Partial<BRollItem> & Pick<BRollItem, 'id' | 'imageUrl' | 'startTime' | 'duration' | 'source'>) => void
  removeBRollItem: (id: string) => void
  removeAllBRollItems: () => void
  updateBRollItem: (id: string, updates: Partial<BRollItem>) => void
  duplicateBRollItem: (id: string) => void
  moveBRollLayer: (id: string, direction: 'up' | 'down') => void
  bringToFront: (id: string) => void
  sendToBack: (id: string) => void
  selectedBRollId: string | null
  setSelectedBRollId: (id: string | null) => void
  addBRollHistoryItem: (item: BRollHistoryItem) => void
  clearBRollHistory: () => void
  removeBRollHistoryItem: (id: string) => void
  // Muted regions for AI
  mutedRegions: Array<{ start: number; end: number }>
  addMutedRegion: (start: number, end: number) => void
  // Translated captions
  translatedCaptions: Array<{ text: string; startTime: number; endTime: number; language: string }>
  setTranslatedCaptions: (captions: Array<{ text: string; startTime: number; endTime: number }>, lang: string) => void
  addEditHistory: (entry: Omit<EditHistoryEntry, 'timestamp'>) => void
  markSaved: () => void
  setIsDirty: (dirty: boolean) => void
  setSpeakers: (speakers: SpeakerInfo[]) => void
  addDeletedRegion: (region: DeletedRegion) => void
  removeDeletedRegion: (startTime: number, endTime: number) => void
  clearDeletedRegions: () => void
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
    deletedRegions?: DeletedRegion[]
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
  splitAtPlayhead: () => void
  muteTimeRange: (startTime: number, endTime: number) => void
  rangeStart: number | null
  rangeEnd: number | null
  setRangeStart: (t: number | null) => void
  setRangeEnd: (t: number | null) => void
  clearRange: () => void
  toggleTrackMute: (track: 'video' | 'audio' | 'captions' | 'broll') => void
  toggleTrackLock: (track: 'video' | 'audio' | 'captions' | 'broll') => void
  toggleTrackVisibility: (track: 'video' | 'audio' | 'captions' | 'broll') => void
  // Chapters
  setChapters: (chapters: ChapterMarker[]) => void
  // Enhanced audio
  setEnhancedAudioBuffer: (buffer: AudioBuffer | null) => void
  // Applied edits
  addAppliedEdit: (desc: string) => void
  clearAppliedEdits: () => void
  // Edited files
  addEditedFile: (file: EditedFile) => void
  removeEditedFile: (id: string) => void
  clearEditedFiles: () => void
  // Silence shortening - creates deleted regions for silences
  shortenSilences: (threshold: number, keepDuration?: number) => { count: number; timeSaved: number }
  // Count helpers
  countFillerWords: () => Record<string, number>
  countSilences: (threshold: number) => { count: number; totalDuration: number; gaps: Array<{ start: number; end: number; duration: number }> }
  // Drag-and-drop operations
  reorderTranscriptSegments: (fromIdx: number, toIdx: number) => void
  moveBRollItemTime: (id: string, newStartTime: number) => void
  trimBRollItem: (id: string, edge: 'start' | 'end', newTime: number) => void
  moveCaptionTime: (trackId: string, captionId: string, newStartTime: number) => void
  trimCaption: (trackId: string, captionId: string, edge: 'start' | 'end', newTime: number) => void

  // === New overlay state ===
  textOverlays: TextOverlay[]
  addTextOverlay: (text: TextOverlay) => void
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void
  removeTextOverlay: (id: string) => void

  shapes: ShapeOverlay[]
  addShape: (shape: ShapeOverlay) => void
  updateShape: (id: string, updates: Partial<ShapeOverlay>) => void
  removeShape: (id: string) => void

  stickers: StickerOverlay[]
  addSticker: (sticker: StickerOverlay) => void
  updateSticker: (id: string, updates: Partial<StickerOverlay>) => void
  removeSticker: (id: string) => void

  colorCorrection: ColorCorrection
  setColorCorrection: (correction: Partial<ColorCorrection>) => void
  resetColorCorrection: () => void

  clipSpeed: number
  clipReversed: boolean
  setClipSpeed: (speed: number) => void
  setClipReversed: (reversed: boolean) => void

  clipCrop: { top: number; right: number; bottom: number; left: number }
  setClipCrop: (crop: Partial<{ top: number; right: number; bottom: number; left: number }>) => void
  resetClipCrop: () => void

  selectedCanvasItem: SelectedCanvasItem | null
  setSelectedCanvasItem: (item: SelectedCanvasItem | null) => void
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
  bRollHistory: [],
  selectedBRollId: null,
  mutedRegions: [],
  translatedCaptions: [],
  rangeStart: null,
  rangeEnd: null,
  trackStates: {
    video: { muted: false, locked: false, visible: true },
    audio: { muted: false, locked: false, visible: true },
    captions: { muted: false, locked: false, visible: true },
    broll: { muted: false, locked: false, visible: true },
  },
  editHistory: [],
  redoHistory: [],
  lastSavedAt: null,
  isDirty: false,
  speakers: [],
  deletedRegions: [],
  editorEffects: {},
  chapters: [],
  enhancedAudioBuffer: null,
  appliedEdits: [],
  editedFiles: [],

  // === New overlay state defaults ===
  textOverlays: [],
  shapes: [],
  stickers: [],
  colorCorrection: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 },
  clipSpeed: 1,
  clipReversed: false,
  clipCrop: { top: 0, right: 0, bottom: 0, left: 0 },
  selectedCanvasItem: null,

  // Multi-language caption tracks
  captionTracks: [],
  activeCaptionTrackId: null,

  // Audio panel defaults
  masterVolume: 80,
  noiseReduction: false,
  noiseReductionIntensity: 50,
  eq: { bass: 0, mid: 0, treble: 0, preset: 'standard' },
  fadeIn: 0,
  fadeOut: 0,
  backgroundMusic: null,

  setProjectId: (id) => set({ projectId: id }),
  setProjectName: (name) => set({ projectName: name, isDirty: true }),
  setIsDemo: (demo) => set({ isDemo: demo }),
  setMediaFile: (file) => set({ mediaFile: file }),
  setMediaBlobUrl: (url) => set({ mediaBlobUrl: url }),
  setMediaType: (type) => set({ mediaType: type }),
  loadMedia: (file, blobUrl, type) => set({ mediaFile: file, mediaBlobUrl: blobUrl, mediaType: type, currentTime: 0, isPlaying: false, waveformData: null }),
  setWaveformData: (data) => set({ waveformData: data }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setVolume: (volume) => set({ volume }),
  setMasterVolume: (v) => set({ masterVolume: v }),
  setNoiseReduction: (enabled) => set({ noiseReduction: enabled }),
  setNoiseReductionIntensity: (v) => set({ noiseReductionIntensity: v }),
  setEq: (eq) => set({ eq }),
  setFadeIn: (seconds) => set({ fadeIn: seconds }),
  setFadeOut: (seconds) => set({ fadeOut: seconds }),
  setBackgroundMusic: (music) => set({ backgroundMusic: music }),
  setMusicVolume: (volume) => {
    set((s) => s.backgroundMusic ? { backgroundMusic: { ...s.backgroundMusic, volume } } : {})
    // Silent learning: track music volume changes
    const pid = get().projectId
    if (pid) {
      useUserProfileStore.getState().recordUserChange(pid, { type: 'changed_music_volume', detail: String(volume), timestamp: Date.now() })
    }
  },
  setMusicDucking: (enabled) => set((s) => s.backgroundMusic ? { backgroundMusic: { ...s.backgroundMusic, ducking: enabled } } : {}),
  removeBackgroundMusic: () => {
    const pid = get().projectId
    set((s) => {
      if (s.backgroundMusic?.blobUrl) URL.revokeObjectURL(s.backgroundMusic.blobUrl)
      return { backgroundMusic: null }
    })
    // Silent learning: track music removal
    if (pid) {
      useUserProfileStore.getState().recordUserChange(pid, { type: 'removed_music', detail: '', timestamp: Date.now() })
    }
  },
  setTranscript: (transcript) => set({ transcript, isDirty: true }),
  setShowCaptions: (show) => {
    set({ showCaptions: show })
    // Silent learning: track caption removal
    const pid = get().projectId
    if (pid && !show) {
      useUserProfileStore.getState().recordUserChange(pid, { type: 'removed_captions', detail: '', timestamp: Date.now() })
    }
  },
  setCaptions: (captions) => set({ captions }),
  setCaptionStyle: (style) => {
    set((s) => ({ captionStyle: { ...s.captionStyle, ...style } }))
    // Silent learning: track caption style changes
    const pid = get().projectId
    if (pid && style.preset) {
      useUserProfileStore.getState().recordUserChange(pid, { type: 'changed_caption_style', detail: style.preset, timestamp: Date.now() })
    }
  },
  setSelectedBRollId: (id) => set({ selectedBRollId: id }),
  setRangeStart: (t) => set({ rangeStart: t }),
  setRangeEnd: (t) => set({ rangeEnd: t }),
  clearRange: () => set({ rangeStart: null, rangeEnd: null }),
  addBRollItem: (item) => set((s) => {
    const maxZ = s.bRollItems.reduce((m, b) => Math.max(m, b.zIndex || 0), 0)
    const full: BRollItem = {
      displayMode: 'fullscreen', x: 0, y: 0, width: 100, height: 100, lockAspectRatio: true,
      rotation: 0, flipH: false, flipV: false,
      entranceAnimation: 'fadeIn', stayingAnimation: 'none', exitAnimation: 'fadeOut',
      animationDuration: 0.5, animationEasing: 'ease-in-out', animationDelay: 0, stayingSpeed: 'medium',
      opacity: 100, borderRadius: 0,
      shadowEnabled: false, shadowIntensity: 50, shadowColor: '#000000', shadowBlur: 10, shadowX: 0, shadowY: 4,
      borderEnabled: false, borderColor: '#FFFFFF', borderWidth: 2, blurBackground: false,
      brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, sepia: false, blendMode: 'normal',
      objectFit: 'cover', zIndex: maxZ + 1,
      ...item,
    }
    // Also add to history
    const historyItem: BRollHistoryItem = {
      id: `hist-${Date.now()}`,
      imageUrl: item.imageUrl,
      prompt: item.prompt,
      source: item.source,
      provider: item.provider,
      createdAt: Date.now(),
    }
    const newHistory = [historyItem, ...s.bRollHistory].slice(0, 50)
    // Silent learning: track B-Roll addition
    const pid = get().projectId
    if (pid) {
      useUserProfileStore.getState().recordUserChange(pid, { type: 'added_broll', detail: item.prompt || '', timestamp: Date.now() })
    }
    return { bRollItems: [...s.bRollItems, full], bRollHistory: newHistory, isDirty: true }
  }),
  removeBRollItem: (id) => {
    set((s) => ({
      bRollItems: s.bRollItems.filter((b) => b.id !== id),
      selectedBRollId: s.selectedBRollId === id ? null : s.selectedBRollId,
      isDirty: true,
    }))
    // Silent learning: track B-Roll removal
    const pid = get().projectId
    if (pid) {
      useUserProfileStore.getState().recordUserChange(pid, { type: 'removed_broll', detail: id, timestamp: Date.now() })
    }
  },
  updateBRollItem: (id, updates) => set((s) => ({
    bRollItems: s.bRollItems.map((b) => b.id === id ? { ...b, ...updates } : b),
    isDirty: true,
  })),
  duplicateBRollItem: (id) => set((s) => {
    const item = s.bRollItems.find((b) => b.id === id)
    if (!item) return s
    const maxZ = s.bRollItems.reduce((m, b) => Math.max(m, b.zIndex || 0), 0)
    const dup: BRollItem = { ...item, id: `broll-${Date.now()}`, startTime: item.startTime + item.duration, zIndex: maxZ + 1 }
    return { bRollItems: [...s.bRollItems, dup], isDirty: true }
  }),
  moveBRollLayer: (id, direction) => set((s) => {
    const sorted = [...s.bRollItems].sort((a, b) => a.zIndex - b.zIndex)
    const idx = sorted.findIndex((b) => b.id === id)
    if (idx < 0) return s
    const swapIdx = direction === 'up' ? idx + 1 : idx - 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return s
    const items = s.bRollItems.map((b) => {
      if (b.id === sorted[idx].id) return { ...b, zIndex: sorted[swapIdx].zIndex }
      if (b.id === sorted[swapIdx].id) return { ...b, zIndex: sorted[idx].zIndex }
      return b
    })
    return { bRollItems: items, isDirty: true }
  }),
  removeAllBRollItems: () => set({ bRollItems: [], selectedBRollId: null, isDirty: true }),
  bringToFront: (id) => set((s) => {
    const maxZ = s.bRollItems.reduce((m, b) => Math.max(m, b.zIndex || 0), 0)
    return { bRollItems: s.bRollItems.map((b) => b.id === id ? { ...b, zIndex: maxZ + 1 } : b), isDirty: true }
  }),
  sendToBack: (id) => set((s) => {
    const minZ = s.bRollItems.reduce((m, b) => Math.min(m, b.zIndex || 0), Infinity)
    return { bRollItems: s.bRollItems.map((b) => b.id === id ? { ...b, zIndex: minZ - 1 } : b), isDirty: true }
  }),
  addBRollHistoryItem: (item) => set((s) => ({ bRollHistory: [item, ...s.bRollHistory].slice(0, 50) })),
  clearBRollHistory: () => set({ bRollHistory: [] }),
  removeBRollHistoryItem: (id) => set((s) => ({ bRollHistory: s.bRollHistory.filter((h) => h.id !== id) })),
  addMutedRegion: (start, end) => set((s) => ({ mutedRegions: [...s.mutedRegions, { start, end }] })),
  setTranslatedCaptions: (captions, lang) => set({ translatedCaptions: captions.map((c) => ({ ...c, language: lang })) }),

  setActiveCaptionTrack: (trackId) => set((s) => ({
    captionTracks: s.captionTracks.map((t) => ({
      ...t,
      isVisible: t.id === trackId,
    })),
    activeCaptionTrackId: trackId,
    showCaptions: true,
  })),

  addCaptionTrack: (language, languageName, flag, captions) => set((s) => ({
    captionTracks: [...s.captionTracks, {
      id: `track-${language}-${Date.now()}`,
      language,
      languageName,
      flag,
      captions,
      isVisible: false,
      isSource: false,
    }],
    isDirty: true,
  })),

  removeCaptionTrack: (trackId) => set((s) => {
    const newTracks = s.captionTracks.filter((t) => t.id !== trackId)
    return {
      captionTracks: newTracks,
      activeCaptionTrackId: s.activeCaptionTrackId === trackId
        ? (newTracks.find((t) => t.isVisible)?.id ?? null)
        : s.activeCaptionTrackId,
      isDirty: true,
    }
  }),

  updateCaptionInTrack: (trackId, captionIndex, newText) => set((s) => ({
    captionTracks: s.captionTracks.map((t) => {
      if (t.id !== trackId) return t
      const newCaptions = [...t.captions]
      if (newCaptions[captionIndex]) {
        newCaptions[captionIndex] = { ...newCaptions[captionIndex], text: newText }
      }
      return { ...t, captions: newCaptions }
    }),
    isDirty: true,
  })),

  hideAllCaptionTracks: () => set((s) => ({
    captionTracks: s.captionTracks.map((t) => ({ ...t, isVisible: false })),
    activeCaptionTrackId: null,
  })),

  initSourceCaptionTrack: () => {
    const { captions, captionTracks } = get()
    if (captions.length === 0) return
    const hasSource = captionTracks.some((t) => t.isSource)
    if (hasSource) {
      set((s) => ({
        captionTracks: s.captionTracks.map((t) =>
          t.isSource
            ? { ...t, captions: captions.map((c) => ({ id: c.id, text: c.text, startTime: c.startTime, endTime: c.endTime })) }
            : t
        ),
      }))
    } else {
      const trackId = `track-he-${Date.now()}`
      set((s) => ({
        captionTracks: [{
          id: trackId,
          language: 'he',
          languageName: 'עברית',
          flag: '🇮🇱',
          captions: captions.map((c) => ({ id: c.id, text: c.text, startTime: c.startTime, endTime: c.endTime })),
          isVisible: true,
          isSource: true,
        }, ...s.captionTracks],
        activeCaptionTrackId: trackId,
      }))
    }
  },

  addEditHistory: (entry) => set((s) => ({
    editHistory: [...s.editHistory, { ...entry, timestamp: Date.now() }],
    redoHistory: [],
    isDirty: true,
  })),
  markSaved: () => set({ lastSavedAt: Date.now(), isDirty: false }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setSpeakers: (speakers) => set({ speakers }),
  addDeletedRegion: (region) => set((s) => ({
    deletedRegions: [...s.deletedRegions, region].sort((a, b) => a.startTime - b.startTime),
  })),
  removeDeletedRegion: (startTime, endTime) => set((s) => ({
    deletedRegions: s.deletedRegions.filter(r => !(r.startTime === startTime && r.endTime === endTime)),
  })),
  clearDeletedRegions: () => set({ deletedRegions: [] }),
  setEditorEffect: (key, value) => {
    set((s) => ({
      editorEffects: { ...s.editorEffects, [key]: value },
      isDirty: true,
    }))
    // Silent learning: track effect changes
    const pid = get().projectId
    if (pid) {
      if (key === 'eyeContact') {
        useUserProfileStore.getState().recordUserChange(pid, { type: value ? 'enabled_eye_contact' : 'disabled_eye_contact', detail: '', timestamp: Date.now() })
      } else if (key === 'reframe' && value?.ratio) {
        useUserProfileStore.getState().recordUserChange(pid, { type: 'changed_format', detail: value.ratio, timestamp: Date.now() })
      }
    }
  },

  toggleTrackMute: (track) => set((s) => ({
    trackStates: { ...s.trackStates, [track]: { ...s.trackStates[track], muted: !s.trackStates[track].muted } },
  })),
  toggleTrackLock: (track) => set((s) => ({
    trackStates: { ...s.trackStates, [track]: { ...s.trackStates[track], locked: !s.trackStates[track].locked } },
  })),
  toggleTrackVisibility: (track) => set((s) => ({
    trackStates: { ...s.trackStates, [track]: { ...s.trackStates[track], visible: !s.trackStates[track].visible } },
  })),

  setChapters: (chapters) => set({ chapters, isDirty: true }),
  setEnhancedAudioBuffer: (buffer) => set({ enhancedAudioBuffer: buffer }),
  addAppliedEdit: (desc) => set((s) => ({ appliedEdits: [...s.appliedEdits, desc] })),
  clearAppliedEdits: () => set({ appliedEdits: [] }),
  addEditedFile: (file) => set((s) => ({ editedFiles: [...s.editedFiles, file] })),
  removeEditedFile: (id) => set((s) => ({
    editedFiles: s.editedFiles.filter((f) => {
      if (f.id === id && f.blobUrl) URL.revokeObjectURL(f.blobUrl)
      return f.id !== id
    }),
  })),
  clearEditedFiles: () => set((s) => {
    s.editedFiles.forEach((f) => { if (f.blobUrl) URL.revokeObjectURL(f.blobUrl) })
    return { editedFiles: [] }
  }),

  shortenSilences: (threshold, keepDuration = 0.3) => {
    const { transcript, editHistory, deletedRegions } = get()
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const previousDeletedRegions = JSON.parse(JSON.stringify(deletedRegions))
    const allWords = transcript.flatMap((s) => s.words)
    const newDeletedRegions = [...deletedRegions]
    let count = 0
    let timeSaved = 0

    for (let i = 1; i < allWords.length; i++) {
      const gap = allWords[i].start - allWords[i - 1].end
      if (gap > threshold) {
        const trimStart = allWords[i - 1].end + keepDuration
        const trimEnd = allWords[i].start
        if (trimEnd > trimStart) {
          newDeletedRegions.push({ startTime: trimStart, endTime: trimEnd, description: `קיצור שתיקה (${gap.toFixed(1)}s)` })
          count++
          timeSaved += trimEnd - trimStart
        }
      }
    }

    set({
      deletedRegions: newDeletedRegions.sort((a, b) => a.startTime - b.startTime),
      isDirty: true,
      redoHistory: [],
      editHistory: [...editHistory, {
        action: 'shortenSilences',
        description: `קוצרו ${count} שתיקות, נחסכו ${timeSaved.toFixed(1)} שניות`,
        timestamp: Date.now(),
        previousTranscript,
        previousDeletedRegions,
      }],
    })
    // Silent learning: record silence shortening
    const pid = get().projectId
    if (pid) {
      useUserProfileStore.getState().recordAutoEditResult(pid, ['shorten_silences'], { count, threshold })
    }
    return { count, timeSaved }
  },

  countFillerWords: () => {
    const { transcript } = get()
    const fillerList = ['אממ', 'אההה', 'כאילו', 'נו', 'בעצם', 'אז', 'סתם', 'יודע', 'יודעת', 'אה', 'אמ', 'כזה', 'פשוט']
    const counts: Record<string, number> = {}
    for (const seg of transcript) {
      for (const w of seg.words) {
        const clean = w.text.replace(/[.,!?]/g, '')
        if (w.isFiller || fillerList.includes(clean)) {
          counts[clean] = (counts[clean] || 0) + 1
        }
      }
    }
    return counts
  },

  countSilences: (threshold) => {
    const { transcript } = get()
    const allWords = transcript.flatMap((s) => s.words)
    const gaps: Array<{ start: number; end: number; duration: number }> = []
    let totalDuration = 0
    for (let i = 1; i < allWords.length; i++) {
      const gap = allWords[i].start - allWords[i - 1].end
      if (gap > threshold) {
        gaps.push({ start: allWords[i - 1].end, end: allWords[i].start, duration: gap })
        totalDuration += gap
      }
    }
    return { count: gaps.length, totalDuration, gaps }
  },

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
      captionTracks: [],
      activeCaptionTrackId: null,
      bRollItems: [],
      waveformData: null,
      speakers: [],
      editorEffects: {},
      deletedRegions: opts.deletedRegions ?? [],
    })
  },

  resetEditor: () => set({
    projectId: null, projectName: '', isDemo: false,
    mediaFile: null, mediaBlobUrl: null, mediaType: null, waveformData: null,
    currentTime: 0, duration: 0, isPlaying: false, playbackSpeed: 1, volume: 80,
    transcript: [], showCaptions: false, captions: [], captionStyle: { ...defaultCaptionStyle },
    captionTracks: [], activeCaptionTrackId: null,
    bRollItems: [], bRollHistory: [], selectedBRollId: null, mutedRegions: [], translatedCaptions: [],
    rangeStart: null, rangeEnd: null, editHistory: [], redoHistory: [], lastSavedAt: null, isDirty: false,
    speakers: [], editorEffects: {}, deletedRegions: [], chapters: [], enhancedAudioBuffer: null,
    appliedEdits: [],
    masterVolume: 80, noiseReduction: false, noiseReductionIntensity: 50,
    eq: { bass: 0, mid: 0, treble: 0, preset: 'standard' },
    fadeIn: 0, fadeOut: 0, backgroundMusic: null,
  }),

  removeFillerWords: () => {
    const { transcript, editHistory, deletedRegions } = get()
    const fillerList = ['אממ', 'אההה', 'כאילו', 'נו', 'בעצם', 'אז', 'סתם', 'יודע', 'יודעת']
    const removed: Record<string, number> = {}
    let timeSaved = 0
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const previousDeletedRegions = JSON.parse(JSON.stringify(deletedRegions))
    const newDeletedRegions = [...deletedRegions]

    const newTranscript = transcript.map((seg) => ({
      ...seg,
      words: seg.words.filter((w) => {
        if (w.isFiller || fillerList.includes(w.text.replace(/[.,!?]/g, ''))) {
          const word = w.text.replace(/[.,!?]/g, '')
          removed[word] = (removed[word] || 0) + 1
          timeSaved += w.end - w.start
          newDeletedRegions.push({ startTime: w.start, endTime: w.end, description: `מילת מילוי: ${word}` })
          return false
        }
        return true
      }),
    })).filter((seg) => seg.words.length > 0)

    const totalRemoved = Object.values(removed).reduce((s, c) => s + c, 0)
    set({
      transcript: newTranscript,
      deletedRegions: newDeletedRegions.sort((a, b) => a.startTime - b.startTime),
      isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'removeFillerWords', description: `הוסרו ${totalRemoved} מילות מילוי`, timestamp: Date.now(), previousTranscript, previousDeletedRegions }],
    })
    // Silent learning: record filler removal
    const pid = get().projectId
    if (pid) {
      useUserProfileStore.getState().recordAutoEditResult(pid, ['remove_fillers'], { count: totalRemoved })
    }
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
    const { transcript, editHistory, deletedRegions } = get()
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const previousDeletedRegions = JSON.parse(JSON.stringify(deletedRegions))
    const newTranscript = transcript.map((seg) => ({
      ...seg,
      words: seg.words.filter((w) => w.start < startTime || w.end > endTime),
    })).filter((seg) => seg.words.length > 0)
    set({
      transcript: newTranscript,
      deletedRegions: [...deletedRegions, { startTime, endTime, description: `נמחק קטע` }].sort((a, b) => a.startTime - b.startTime),
      isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'removeTimeRange', description: `נמחק קטע מ-${startTime.toFixed(1)} עד ${endTime.toFixed(1)}`, timestamp: Date.now(), previousTranscript, previousDeletedRegions }],
    })
  },

  deleteWords: (segIdx, wordIndices) => {
    const { transcript, editHistory, deletedRegions } = get()
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const previousDeletedRegions = JSON.parse(JSON.stringify(deletedRegions))

    // Collect time ranges of deleted words for video edit points
    const seg = transcript[segIdx]
    const deletedWords = wordIndices.map(wi => seg.words[wi]).filter(Boolean)
    const newDeletedRegions = [...deletedRegions]

    if (deletedWords.length > 0) {
      // Group consecutive words into contiguous regions
      const sorted = [...deletedWords].sort((a, b) => a.start - b.start)
      let regionStart = sorted[0].start
      let regionEnd = sorted[0].end
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].start - regionEnd < 0.15) {
          regionEnd = sorted[i].end
        } else {
          newDeletedRegions.push({ startTime: regionStart, endTime: regionEnd, description: `נמחקו מילים` })
          regionStart = sorted[i].start
          regionEnd = sorted[i].end
        }
      }
      newDeletedRegions.push({ startTime: regionStart, endTime: regionEnd, description: `נמחקו מילים` })
    }

    const newTranscript = transcript.map((s, si) => {
      if (si !== segIdx) return s
      return {
        ...s,
        words: s.words.filter((_, wi) => !wordIndices.includes(wi)),
      }
    }).filter((s) => s.words.length > 0)

    set({
      transcript: newTranscript,
      deletedRegions: newDeletedRegions.sort((a, b) => a.startTime - b.startTime),
      isDirty: true,
      redoHistory: [],
      editHistory: [...editHistory, { action: 'deleteWords', description: `נמחקו ${wordIndices.length} מילים`, timestamp: Date.now(), previousTranscript, previousDeletedRegions }],
    })
  },

  undoLastEdit: () => {
    const { editHistory, transcript, redoHistory, deletedRegions, projectId } = get()
    if (editHistory.length === 0) return null
    const lastEdit = editHistory[editHistory.length - 1]
    if (lastEdit.previousTranscript) {
      set({
        transcript: lastEdit.previousTranscript,
        deletedRegions: lastEdit.previousDeletedRegions ?? deletedRegions,
        editHistory: editHistory.slice(0, -1),
        redoHistory: [...redoHistory, { ...lastEdit, previousTranscript: JSON.parse(JSON.stringify(transcript)), previousDeletedRegions: JSON.parse(JSON.stringify(deletedRegions)) }],
        isDirty: true,
      })
    }
    // Silent learning: track what user undid
    if (projectId) {
      const profile = useUserProfileStore.getState()
      if (lastEdit.action === 'removeFillerWords') {
        profile.recordUserChange(projectId, { type: 'undo_filler_removal', detail: lastEdit.description, timestamp: Date.now() })
      } else if (lastEdit.action === 'shortenSilences') {
        profile.recordUserChange(projectId, { type: 'undo_silence_shortening', detail: '', timestamp: Date.now() })
      }
    }
    return lastEdit.description
  },

  redoLastEdit: () => {
    const { redoHistory, transcript, editHistory, deletedRegions } = get()
    if (redoHistory.length === 0) return null
    const lastRedo = redoHistory[redoHistory.length - 1]
    if (lastRedo.previousTranscript) {
      set({
        transcript: lastRedo.previousTranscript,
        deletedRegions: lastRedo.previousDeletedRegions ?? deletedRegions,
        redoHistory: redoHistory.slice(0, -1),
        editHistory: [...editHistory, { ...lastRedo, previousTranscript: JSON.parse(JSON.stringify(transcript)), previousDeletedRegions: JSON.parse(JSON.stringify(deletedRegions)) }],
        isDirty: true,
      })
    }
    return lastRedo.description
  },

  generateCaptionsFromTranscript: () => {
    const { transcript, captionStyle } = get()
    const captions: Caption[] = []
    const MAX_CHARS = 42

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
    // Auto-init the source caption track
    setTimeout(() => get().initSourceCaptionTrack(), 0)
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

  splitAtPlayhead: () => {
    const { currentTime, transcript, editHistory } = get()
    if (transcript.length === 0) return
    // Find segment containing the playhead
    for (let si = 0; si < transcript.length; si++) {
      const seg = transcript[si]
      const segStart = seg.words[0]?.start ?? 0
      const segEnd = seg.words[seg.words.length - 1]?.end ?? 0
      if (currentTime >= segStart && currentTime <= segEnd) {
        // Find the word boundary closest to currentTime
        let wordIdx = 0
        for (let wi = 0; wi < seg.words.length; wi++) {
          if (seg.words[wi].start >= currentTime) {
            wordIdx = wi
            break
          }
          wordIdx = wi + 1
        }
        if (wordIdx > 0 && wordIdx < seg.words.length) {
          const previousTranscript = JSON.parse(JSON.stringify(transcript))
          const formatTs = (s: number) => {
            const m = Math.floor(s / 60); const sec = Math.floor(s % 60)
            return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
          }
          const firstWords = seg.words.slice(0, wordIdx)
          const secondWords = seg.words.slice(wordIdx)
          const seg1: Segment = { ...seg, words: firstWords, endTime: formatTs(firstWords[firstWords.length - 1]?.end ?? 0), segEnd: firstWords[firstWords.length - 1]?.end }
          const seg2: Segment = { ...seg, words: secondWords, startTime: formatTs(secondWords[0]?.start ?? 0), segStart: secondWords[0]?.start }
          const newTranscript = [...transcript.slice(0, si), seg1, seg2, ...transcript.slice(si + 1)]
          set({
            transcript: newTranscript, isDirty: true, redoHistory: [],
            editHistory: [...editHistory, { action: 'splitAtPlayhead', description: `פוצל בנקודת ה-playhead (${formatTs(currentTime)})`, timestamp: Date.now(), previousTranscript }],
          })
          return
        }
      }
    }
  },

  muteTimeRange: (startTime, endTime) => {
    const { deletedRegions, editHistory, transcript } = get()
    const previousDeletedRegions = JSON.parse(JSON.stringify(deletedRegions))
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    set({
      deletedRegions: [...deletedRegions, { startTime, endTime, description: 'השתקת קטע' }].sort((a, b) => a.startTime - b.startTime),
      isDirty: true, redoHistory: [],
      editHistory: [...editHistory, { action: 'muteTimeRange', description: `הושתק קטע מ-${startTime.toFixed(1)} עד ${endTime.toFixed(1)}`, timestamp: Date.now(), previousTranscript, previousDeletedRegions }],
    })
  },

  // ─── Drag-and-drop operations ───
  reorderTranscriptSegments: (fromIdx, toIdx) => {
    const { transcript, editHistory } = get()
    if (fromIdx < 0 || fromIdx >= transcript.length || toIdx < 0 || toIdx >= transcript.length || fromIdx === toIdx) return
    const previousTranscript = JSON.parse(JSON.stringify(transcript))
    const newTranscript = [...transcript]
    const [moved] = newTranscript.splice(fromIdx, 1)
    newTranscript.splice(toIdx, 0, moved)
    set({
      transcript: newTranscript,
      isDirty: true,
      redoHistory: [],
      editHistory: [...editHistory, {
        action: 'reorderSegments',
        description: `קטע ${fromIdx + 1} הועבר למיקום ${toIdx + 1}`,
        timestamp: Date.now(),
        previousTranscript,
      }],
    })
  },

  moveBRollItemTime: (id, newStartTime) => {
    const { bRollItems, duration } = get()
    const item = bRollItems.find((b) => b.id === id)
    if (!item) return
    const clamped = Math.max(0, Math.min(newStartTime, duration - item.duration))
    set({
      bRollItems: bRollItems.map((b) => b.id === id ? { ...b, startTime: clamped } : b),
      isDirty: true,
    })
  },

  trimBRollItem: (id, edge, newTime) => {
    const { bRollItems, duration } = get()
    const item = bRollItems.find((b) => b.id === id)
    if (!item) return
    if (edge === 'start') {
      const clamped = Math.max(0, Math.min(newTime, item.startTime + item.duration - 0.1))
      const newDuration = (item.startTime + item.duration) - clamped
      set({
        bRollItems: bRollItems.map((b) => b.id === id ? { ...b, startTime: clamped, duration: newDuration } : b),
        isDirty: true,
      })
    } else {
      const endTime = Math.max(item.startTime + 0.1, Math.min(newTime, duration))
      const newDuration = endTime - item.startTime
      set({
        bRollItems: bRollItems.map((b) => b.id === id ? { ...b, duration: newDuration } : b),
        isDirty: true,
      })
    }
  },

  moveCaptionTime: (trackId, captionId, newStartTime) => {
    const { captionTracks, duration } = get()
    set({
      captionTracks: captionTracks.map((t) => {
        if (t.id !== trackId) return t
        return {
          ...t,
          captions: t.captions.map((c) => {
            if (c.id !== captionId) return c
            const capDuration = c.endTime - c.startTime
            const clamped = Math.max(0, Math.min(newStartTime, duration - capDuration))
            return { ...c, startTime: clamped, endTime: clamped + capDuration }
          }),
        }
      }),
      isDirty: true,
    })
  },

  // === New overlay actions ===
  addTextOverlay: (text) => set((s) => ({ textOverlays: [...s.textOverlays, text], isDirty: true })),
  updateTextOverlay: (id, updates) => set((s) => ({
    textOverlays: s.textOverlays.map((t) => t.id === id ? { ...t, ...updates } : t),
    isDirty: true,
  })),
  removeTextOverlay: (id) => set((s) => ({
    textOverlays: s.textOverlays.filter((t) => t.id !== id),
    selectedCanvasItem: s.selectedCanvasItem?.id === id ? null : s.selectedCanvasItem,
    isDirty: true,
  })),

  addShape: (shape) => set((s) => ({ shapes: [...s.shapes, shape], isDirty: true })),
  updateShape: (id, updates) => set((s) => ({
    shapes: s.shapes.map((sh) => sh.id === id ? { ...sh, ...updates } : sh),
    isDirty: true,
  })),
  removeShape: (id) => set((s) => ({
    shapes: s.shapes.filter((sh) => sh.id !== id),
    selectedCanvasItem: s.selectedCanvasItem?.id === id ? null : s.selectedCanvasItem,
    isDirty: true,
  })),

  addSticker: (sticker) => set((s) => ({ stickers: [...s.stickers, sticker], isDirty: true })),
  updateSticker: (id, updates) => set((s) => ({
    stickers: s.stickers.map((st) => st.id === id ? { ...st, ...updates } : st),
    isDirty: true,
  })),
  removeSticker: (id) => set((s) => ({
    stickers: s.stickers.filter((st) => st.id !== id),
    selectedCanvasItem: s.selectedCanvasItem?.id === id ? null : s.selectedCanvasItem,
    isDirty: true,
  })),

  setColorCorrection: (correction) => set((s) => ({
    colorCorrection: { ...s.colorCorrection, ...correction },
    isDirty: true,
  })),
  resetColorCorrection: () => set({
    colorCorrection: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 },
    isDirty: true,
  }),

  setClipSpeed: (speed) => set({ clipSpeed: speed, isDirty: true }),
  setClipReversed: (reversed) => set({ clipReversed: reversed, isDirty: true }),

  setClipCrop: (crop) => set((s) => ({
    clipCrop: { ...s.clipCrop, ...crop },
    isDirty: true,
  })),
  resetClipCrop: () => set({ clipCrop: { top: 0, right: 0, bottom: 0, left: 0 }, isDirty: true }),

  setSelectedCanvasItem: (item) => set({ selectedCanvasItem: item }),

  trimCaption: (trackId, captionId, edge, newTime) => {
    const { captionTracks, duration } = get()
    set({
      captionTracks: captionTracks.map((t) => {
        if (t.id !== trackId) return t
        return {
          ...t,
          captions: t.captions.map((c) => {
            if (c.id !== captionId) return c
            if (edge === 'start') {
              const clamped = Math.max(0, Math.min(newTime, c.endTime - 0.1))
              return { ...c, startTime: clamped }
            } else {
              const clamped = Math.max(c.startTime + 0.1, Math.min(newTime, duration))
              return { ...c, endTime: clamped }
            }
          }),
        }
      }),
      isDirty: true,
    })
  },
}))
