import { create } from 'zustand'

export type TrackType = 'video' | 'audio' | 'captions' | 'broll' | 'music' | 'text'

export interface TimelineTrack {
  id: string
  type: TrackType
  label: string
  icon: string
  color: string
  muted: boolean
  locked: boolean
  visible: boolean
  collapsed: boolean
  order: number
}

export interface TimelineMarker {
  id: string
  time: number
  label: string
  color: string
}

export interface TimelineClip {
  id: string
  trackId: string
  startTime: number
  duration: number
  label: string
  speed: number
  reversed: boolean
  frozen: boolean
}

export interface TransitionItem {
  id: string
  type: 'none' | 'fade' | 'dissolve' | 'slideRight' | 'slideLeft' | 'wipe' | 'zoom' | 'spin' | 'blur' | 'flash' | 'glitch'
  duration: number
  clipBeforeId: string
  clipAfterId: string
}

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  clipId: string | null
  trackId: string | null
  time: number
}

interface TimelineState {
  // Zoom
  zoom: number
  scrollLeft: number

  // Modes
  snapEnabled: boolean
  rippleEnabled: boolean
  speedTrimEnabled: boolean

  // Selection
  selectedClipIds: string[]
  selectionRect: { x: number; y: number; w: number; h: number } | null

  // Markers
  markers: TimelineMarker[]

  // Tracks
  tracks: TimelineTrack[]

  // Clips (video segments)
  clips: TimelineClip[]

  // Transitions
  transitions: TransitionItem[]

  // Context menu
  contextMenu: ContextMenuState

  // Clipboard
  clipboard: TimelineClip[]

  // Timeline height (resizable)
  timelineHeight: number

  // Actions - Zoom
  setZoom: (zoom: number) => void
  fitToScreen: (duration: number, containerWidth: number) => void
  setScrollLeft: (scrollLeft: number) => void

  // Actions - Modes
  toggleSnap: () => void
  toggleRipple: () => void
  toggleSpeedTrim: () => void

  // Actions - Selection
  selectClip: (clipId: string, additive?: boolean) => void
  toggleClipSelection: (clipId: string) => void
  selectAllClips: () => void
  clearSelection: () => void
  setSelectionRect: (rect: { x: number; y: number; w: number; h: number } | null) => void

  // Actions - Markers
  addMarker: (time: number, label?: string) => void
  removeMarker: (id: string) => void
  renameMarker: (id: string, label: string) => void

  // Actions - Tracks
  addTrack: (type: TrackType) => void
  removeTrack: (id: string) => void
  toggleTrackMute: (id: string) => void
  toggleTrackLock: (id: string) => void
  toggleTrackVisibility: (id: string) => void
  toggleTrackCollapse: (id: string) => void
  renameTrack: (id: string, label: string) => void
  reorderTracks: (trackIds: string[]) => void

  // Actions - Clips
  addClip: (clip: TimelineClip) => void
  removeClip: (id: string) => void
  removeSelectedClips: () => void
  moveClip: (id: string, startTime: number) => void
  splitClip: (id: string, time: number) => void
  setClipSpeed: (id: string, speed: number) => void
  reverseClip: (id: string) => void
  duplicateSelected: () => void

  // Actions - Transitions
  addTransition: (transition: TransitionItem) => void
  removeTransition: (id: string) => void

  // Actions - Clipboard
  copySelected: () => void
  pasteAtTime: (time: number) => void
  cutSelected: () => void

  // Actions - Context Menu
  showContextMenu: (x: number, y: number, clipId: string | null, trackId: string | null, time: number) => void
  hideContextMenu: () => void

  // Actions - Resize
  setTimelineHeight: (height: number) => void
}

const MARKER_COLORS = ['#FF6B8A', '#7C5CFF', '#4ADE80', '#FBBF24', '#5C8AFF', '#F97316', '#EC4899', '#14B8A6']

const defaultTracks: TimelineTrack[] = [
  { id: 'video-1', type: 'video', label: 'וידאו 1', icon: '🎥', color: '#5C8AFF', muted: false, locked: false, visible: true, collapsed: false, order: 0 },
  { id: 'audio-1', type: 'audio', label: 'אודיו 1', icon: '🎵', color: '#4ADE80', muted: false, locked: false, visible: true, collapsed: false, order: 1 },
  { id: 'captions-1', type: 'captions', label: 'כתוביות', icon: '💬', color: '#FBBF24', muted: false, locked: false, visible: true, collapsed: false, order: 2 },
  { id: 'broll-1', type: 'broll', label: 'B-Roll', icon: '🖼️', color: '#A855F7', muted: false, locked: false, visible: true, collapsed: false, order: 3 },
  { id: 'music-1', type: 'music', label: 'מוזיקה', icon: '🎵', color: '#EC4899', muted: false, locked: false, visible: true, collapsed: false, order: 4 },
  { id: 'text-1', type: 'text', label: 'טקסט', icon: '📝', color: '#06B6D4', muted: false, locked: false, visible: true, collapsed: false, order: 5 },
]

export const useTimelineStore = create<TimelineState>((set, get) => ({
  zoom: 100,
  scrollLeft: 0,
  snapEnabled: true,
  rippleEnabled: false,
  speedTrimEnabled: false,
  selectedClipIds: [],
  selectionRect: null,
  markers: [],
  tracks: defaultTracks,
  clips: [],
  transitions: [],
  contextMenu: { visible: false, x: 0, y: 0, clipId: null, trackId: null, time: 0 },
  clipboard: [],
  timelineHeight: 280,

  setZoom: (zoom) => set({ zoom: Math.max(25, Math.min(400, zoom)) }),
  fitToScreen: (duration, containerWidth) => {
    if (duration <= 0 || containerWidth <= 0) return
    const zoom = Math.round((containerWidth / (duration * 1)) * 100)
    set({ zoom: Math.max(25, Math.min(400, zoom)), scrollLeft: 0 })
  },
  setScrollLeft: (scrollLeft) => set({ scrollLeft: Math.max(0, scrollLeft) }),

  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  toggleRipple: () => set((s) => ({ rippleEnabled: !s.rippleEnabled })),
  toggleSpeedTrim: () => set((s) => ({ speedTrimEnabled: !s.speedTrimEnabled })),

  selectClip: (clipId, additive) => set((s) => {
    if (additive) {
      return { selectedClipIds: [...s.selectedClipIds, clipId] }
    }
    return { selectedClipIds: [clipId] }
  }),
  toggleClipSelection: (clipId) => set((s) => {
    if (s.selectedClipIds.includes(clipId)) {
      return { selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId) }
    }
    return { selectedClipIds: [...s.selectedClipIds, clipId] }
  }),
  selectAllClips: () => set((s) => ({
    selectedClipIds: s.clips.map((c) => c.id),
  })),
  clearSelection: () => set({ selectedClipIds: [] }),
  setSelectionRect: (rect) => set({ selectionRect: rect }),

  addMarker: (time, label) => {
    const id = `marker-${Date.now()}`
    const color = MARKER_COLORS[get().markers.length % MARKER_COLORS.length]
    set((s) => ({
      markers: [...s.markers, { id, time, label: label || `סמן ${s.markers.length + 1}`, color }],
    }))
  },
  removeMarker: (id) => set((s) => ({
    markers: s.markers.filter((m) => m.id !== id),
  })),
  renameMarker: (id, label) => set((s) => ({
    markers: s.markers.map((m) => m.id === id ? { ...m, label } : m),
  })),

  addTrack: (type) => {
    const count = get().tracks.filter((t) => t.type === type).length + 1
    const config: Record<TrackType, { icon: string; label: string; color: string }> = {
      video: { icon: '🎥', label: `וידאו ${count}`, color: '#5C8AFF' },
      audio: { icon: '🎵', label: `אודיו ${count}`, color: '#4ADE80' },
      captions: { icon: '💬', label: `כתוביות ${count}`, color: '#FBBF24' },
      broll: { icon: '🖼️', label: `B-Roll ${count}`, color: '#A855F7' },
      music: { icon: '🎵', label: `מוזיקה ${count}`, color: '#EC4899' },
      text: { icon: '📝', label: `טקסט ${count}`, color: '#06B6D4' },
    }
    const c = config[type]
    const id = `${type}-${Date.now()}`
    set((s) => ({
      tracks: [...s.tracks, { id, type, label: c.label, icon: c.icon, color: c.color, muted: false, locked: false, visible: true, collapsed: false, order: s.tracks.length }],
    }))
  },
  removeTrack: (id) => set((s) => ({
    tracks: s.tracks.filter((t) => t.id !== id),
    clips: s.clips.filter((c) => c.trackId !== id),
  })),
  toggleTrackMute: (id) => set((s) => ({
    tracks: s.tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t),
  })),
  toggleTrackLock: (id) => set((s) => ({
    tracks: s.tracks.map((t) => t.id === id ? { ...t, locked: !t.locked } : t),
  })),
  toggleTrackVisibility: (id) => set((s) => ({
    tracks: s.tracks.map((t) => t.id === id ? { ...t, visible: !t.visible } : t),
  })),
  toggleTrackCollapse: (id) => set((s) => ({
    tracks: s.tracks.map((t) => t.id === id ? { ...t, collapsed: !t.collapsed } : t),
  })),
  renameTrack: (id, label) => set((s) => ({
    tracks: s.tracks.map((t) => t.id === id ? { ...t, label } : t),
  })),
  reorderTracks: (trackIds) => set((s) => ({
    tracks: trackIds.map((id, i) => {
      const track = s.tracks.find((t) => t.id === id)!
      return { ...track, order: i }
    }),
  })),

  addClip: (clip) => set((s) => ({ clips: [...s.clips, clip] })),
  removeClip: (id) => set((s) => ({
    clips: s.clips.filter((c) => c.id !== id),
    selectedClipIds: s.selectedClipIds.filter((cid) => cid !== id),
  })),
  removeSelectedClips: () => {
    const { selectedClipIds, rippleEnabled, clips } = get()
    if (selectedClipIds.length === 0) return
    if (rippleEnabled) {
      // For ripple: find earliest removed clip, shift everything after it
      const removedClips = clips.filter((c) => selectedClipIds.includes(c.id))
      const remaining = clips.filter((c) => !selectedClipIds.includes(c.id))
      // Group by track
      const trackGroups = new Map<string, typeof removedClips>()
      for (const rc of removedClips) {
        if (!trackGroups.has(rc.trackId)) trackGroups.set(rc.trackId, [])
        trackGroups.get(rc.trackId)!.push(rc)
      }
      const adjusted = remaining.map((c) => {
        const removed = trackGroups.get(c.trackId) || []
        let shift = 0
        for (const r of removed) {
          if (r.startTime < c.startTime) shift += r.duration
        }
        return shift > 0 ? { ...c, startTime: c.startTime - shift } : c
      })
      set({ clips: adjusted, selectedClipIds: [] })
    } else {
      set((s) => ({
        clips: s.clips.filter((c) => !selectedClipIds.includes(c.id)),
        selectedClipIds: [],
      }))
    }
  },
  moveClip: (id, startTime) => set((s) => ({
    clips: s.clips.map((c) => c.id === id ? { ...c, startTime: Math.max(0, startTime) } : c),
  })),
  splitClip: (id, time) => {
    const clip = get().clips.find((c) => c.id === id)
    if (!clip) return
    if (time <= clip.startTime || time >= clip.startTime + clip.duration) return
    const firstDur = time - clip.startTime
    const secondDur = clip.duration - firstDur
    set((s) => ({
      clips: [
        ...s.clips.filter((c) => c.id !== id),
        { ...clip, duration: firstDur },
        { ...clip, id: `${id}-split-${Date.now()}`, startTime: time, duration: secondDur },
      ],
    }))
  },
  setClipSpeed: (id, speed) => set((s) => ({
    clips: s.clips.map((c) => c.id === id ? { ...c, speed, duration: c.duration * (c.speed / speed) } : c),
  })),
  reverseClip: (id) => set((s) => ({
    clips: s.clips.map((c) => c.id === id ? { ...c, reversed: !c.reversed } : c),
  })),
  duplicateSelected: () => {
    const { selectedClipIds, clips } = get()
    const selected = clips.filter((c) => selectedClipIds.includes(c.id))
    const dupes = selected.map((c) => ({
      ...c,
      id: `${c.id}-dup-${Date.now()}`,
      startTime: c.startTime + c.duration,
    }))
    set((s) => ({
      clips: [...s.clips, ...dupes],
      selectedClipIds: dupes.map((d) => d.id),
    }))
  },

  addTransition: (transition) => set((s) => ({
    transitions: [...s.transitions, transition],
  })),
  removeTransition: (id) => set((s) => ({
    transitions: s.transitions.filter((t) => t.id !== id),
  })),

  copySelected: () => {
    const { selectedClipIds, clips } = get()
    set({ clipboard: clips.filter((c) => selectedClipIds.includes(c.id)) })
  },
  pasteAtTime: (time) => {
    const { clipboard } = get()
    if (clipboard.length === 0) return
    const earliest = Math.min(...clipboard.map((c) => c.startTime))
    const pasted = clipboard.map((c) => ({
      ...c,
      id: `${c.id}-paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startTime: c.startTime - earliest + time,
    }))
    set((s) => ({
      clips: [...s.clips, ...pasted],
      selectedClipIds: pasted.map((p) => p.id),
    }))
  },
  cutSelected: () => {
    const { selectedClipIds, clips } = get()
    set({
      clipboard: clips.filter((c) => selectedClipIds.includes(c.id)),
      clips: clips.filter((c) => !selectedClipIds.includes(c.id)),
      selectedClipIds: [],
    })
  },

  showContextMenu: (x, y, clipId, trackId, time) => set({
    contextMenu: { visible: true, x, y, clipId, trackId, time },
  }),
  hideContextMenu: () => set({
    contextMenu: { visible: false, x: 0, y: 0, clipId: null, trackId: null, time: 0 },
  }),

  setTimelineHeight: (height) => set({
    timelineHeight: Math.max(150, Math.min(window.innerHeight * 0.6, height)),
  }),
}))
