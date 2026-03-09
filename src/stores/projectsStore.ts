import { create } from 'zustand'
import type { Segment, EditHistoryEntry, DeletedRegion } from './editorStore'

export interface ProjectVideo {
  id: string
  fileName: string
  file: File
  blobUrl: string
  mediaType: 'video' | 'audio'
  duration: number
  size: number
  order: number
  transcript: Segment[]
  editHistory: EditHistoryEntry[]
  deletedRegions: DeletedRegion[]
  isTranscribed: boolean
  hasUnsavedChanges: boolean
}

export interface Project {
  id: string
  name: string
  status: 'טיוטה' | 'מוכן' | 'פורסם'
  duration: string
  updatedAt: string
  size: string
  gradient: string
  // Legacy single-file fields (kept for backward compat)
  mediaFile?: File
  mediaBlobUrl?: string
  mediaType?: 'video' | 'audio'
  transcript?: Segment[]
  transcriptMode?: 'real'
  editHistory?: EditHistoryEntry[]
  deletedRegions?: DeletedRegion[]
  createdAt?: number
  updatedAtTimestamp?: number
  isDemo?: boolean
  source?: 'upload' | 'recording' | 'prompt' | 'script'
  // Multi-video fields
  videos: ProjectVideo[]
  activeVideoId: string | null
}

const gradients = [
  'from-blue-500 to-purple-600',
  'from-green-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-indigo-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-green-600',
  'from-red-500 to-pink-600',
]

// No mock projects - start empty, only real user data

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'עכשיו'
  if (minutes < 60) return `לפני ${minutes} דקות`
  if (hours < 24) return `לפני ${hours} שעות`
  if (days < 7) return `לפני ${days} ימים`
  return `לפני ${Math.floor(days / 7)} שבועות`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

interface ProjectsState {
  projects: Project[]
  viewMode: 'grid' | 'list'
  filter: string
  searchQuery: string
  sortBy: string
  setViewMode: (mode: 'grid' | 'list') => void
  setFilter: (filter: string) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sort: string) => void
  filteredProjects: () => Project[]
  addProject: (opts: {
    name: string
    mediaFile?: File
    mediaBlobUrl?: string
    mediaType?: 'video' | 'audio'
    transcript?: Segment[]
    transcriptMode?: 'real'
    duration?: number
    source?: 'upload' | 'recording' | 'prompt' | 'script'
    isDemo?: boolean
    videos?: Array<{ file: File; blobUrl: string; mediaType: 'video' | 'audio' }>
  }) => string
  updateProject: (id: string, updates: Partial<Project>) => void
  getProject: (id: string) => Project | undefined
  saveEditorState: (id: string, data: {
    name?: string
    transcript?: Segment[]
    editHistory?: EditHistoryEntry[]
    deletedRegions?: DeletedRegion[]
    mediaBlobUrl?: string
    mediaFile?: File
  }) => void
  addVideoToProject: (projectId: string, file: File, blobUrl: string, mediaType: 'video' | 'audio') => void
  updateVideoInProject: (projectId: string, videoId: string, updates: Partial<ProjectVideo>) => void
  setActiveVideo: (projectId: string, videoId: string) => void
  reorderVideos: (projectId: string, fromIndex: number, toIndex: number) => void
  removeVideoFromProject: (projectId: string, videoId: string) => void
  replaceVideosWithMerged: (projectId: string, mergedFile: File, mergedBlobUrl: string, totalDuration: number, originalFileNames: string[]) => string | null
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  viewMode: 'grid',
  filter: 'הכל',
  searchQuery: '',
  sortBy: 'תאריך',

  setViewMode: (mode) => set({ viewMode: mode }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sort) => set({ sortBy: sort }),

  filteredProjects: () => {
    const { projects, filter, searchQuery, sortBy } = get()
    const filtered = projects.filter((p) => {
      if (filter !== 'הכל' && p.status !== filter) return false
      if (searchQuery && !p.name.includes(searchQuery)) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'שם': return a.name.localeCompare(b.name, 'he')
        case 'גודל': return parseFloat(a.size) - parseFloat(b.size)
        case 'סטטוס': return a.status.localeCompare(b.status, 'he')
        default: {
          const aTime = a.updatedAtTimestamp ?? 0
          const bTime = b.updatedAtTimestamp ?? 0
          return bTime - aTime
        }
      }
    })
  },

  addProject: (opts) => {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const gradient = gradients[Math.floor(Math.random() * gradients.length)]
    const now = Date.now()

    // Build videos array
    const videos: ProjectVideo[] = []
    if (opts.videos && opts.videos.length > 0) {
      opts.videos.forEach((v, index) => {
        videos.push({
          id: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: v.file.name,
          file: v.file,
          blobUrl: v.blobUrl,
          mediaType: v.mediaType,
          duration: 0,
          size: v.file.size,
          order: index,
          transcript: [],
          editHistory: [],
          deletedRegions: [],
          isTranscribed: false,
          hasUnsavedChanges: false,
        })
      })
    } else if (opts.mediaFile) {
      videos.push({
        id: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: opts.mediaFile.name,
        file: opts.mediaFile,
        blobUrl: opts.mediaBlobUrl || '',
        mediaType: opts.mediaType || 'video',
        duration: opts.duration || 0,
        size: opts.mediaFile.size,
        order: 0,
        transcript: opts.transcript || [],
        editHistory: [],
        deletedRegions: [],
        isTranscribed: false,
        hasUnsavedChanges: false,
      })
    }

    const totalSize = videos.reduce((sum, v) => sum + v.size, 0)
    const durationStr = opts.duration ? formatDuration(opts.duration) : '00:00'
    const sizeStr = totalSize > 0 ? formatSize(totalSize) : '0KB'

    const project: Project = {
      id, name: opts.name, status: 'טיוטה', duration: durationStr,
      updatedAt: 'עכשיו', size: sizeStr, gradient,
      mediaFile: opts.mediaFile, mediaBlobUrl: opts.mediaBlobUrl,
      mediaType: opts.mediaType, transcript: opts.transcript,
      transcriptMode: opts.transcriptMode ?? 'real',
      createdAt: now, updatedAtTimestamp: now,
      isDemo: opts.isDemo ?? false, source: opts.source ?? 'upload',
      videos,
      activeVideoId: videos.length > 0 ? videos[0].id : null,
    }
    set((s) => ({ projects: [project, ...s.projects] }))
    return id
  },

  updateProject: (id, updates) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id === id) {
          const updated = { ...p, ...updates, updatedAtTimestamp: Date.now() }
          updated.updatedAt = formatRelativeTime(updated.updatedAtTimestamp)
          return updated
        }
        return p
      }),
    }))
  },

  getProject: (id) => get().projects.find((p) => p.id === id),

  saveEditorState: (id, data) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id === id) {
          const now = Date.now()
          return {
            ...p,
            ...(data.name !== undefined && { name: data.name }),
            ...(data.transcript !== undefined && { transcript: data.transcript }),
            ...(data.editHistory !== undefined && { editHistory: data.editHistory }),
            ...(data.deletedRegions !== undefined && { deletedRegions: data.deletedRegions }),
            ...(data.mediaBlobUrl !== undefined && { mediaBlobUrl: data.mediaBlobUrl }),
            ...(data.mediaFile !== undefined && { mediaFile: data.mediaFile }),
            updatedAtTimestamp: now,
            updatedAt: formatRelativeTime(now),
          }
        }
        return p
      }),
    }))
  },

  addVideoToProject: (projectId, file, blobUrl, mediaType) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        const newVideo: ProjectVideo = {
          id: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          file,
          blobUrl,
          mediaType,
          duration: 0,
          size: file.size,
          order: p.videos.length,
          transcript: [],
          editHistory: [],
          deletedRegions: [],
          isTranscribed: false,
          hasUnsavedChanges: false,
        }
        const videos = [...p.videos, newVideo]
        const totalSize = videos.reduce((sum, v) => sum + v.size, 0)
        return {
          ...p,
          videos,
          size: formatSize(totalSize),
          updatedAtTimestamp: Date.now(),
          updatedAt: 'עכשיו',
        }
      }),
    }))
  },

  updateVideoInProject: (projectId, videoId, updates) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        return {
          ...p,
          videos: p.videos.map((v) => v.id === videoId ? { ...v, ...updates } : v),
          updatedAtTimestamp: Date.now(),
          updatedAt: 'עכשיו',
        }
      }),
    }))
  },

  setActiveVideo: (projectId, videoId) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        return { ...p, activeVideoId: videoId }
      }),
    }))
  },

  reorderVideos: (projectId, fromIndex, toIndex) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        const videos = [...p.videos].sort((a, b) => a.order - b.order)
        const [moved] = videos.splice(fromIndex, 1)
        videos.splice(toIndex, 0, moved)
        return {
          ...p,
          videos: videos.map((v, i) => ({ ...v, order: i })),
        }
      }),
    }))
  },

  removeVideoFromProject: (projectId, videoId) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        const videos = p.videos.filter((v) => v.id !== videoId).map((v, i) => ({ ...v, order: i }))
        const activeVideoId = p.activeVideoId === videoId
          ? (videos[0]?.id || null)
          : p.activeVideoId
        const totalSize = videos.reduce((sum, v) => sum + v.size, 0)
        return {
          ...p,
          videos,
          activeVideoId,
          size: formatSize(totalSize),
          updatedAtTimestamp: Date.now(),
          updatedAt: 'עכשיו',
        }
      }),
    }))
  },

  replaceVideosWithMerged: (projectId, mergedFile, mergedBlobUrl, totalDuration, _originalFileNames) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return null
    const mergedVideoId = `merged-${Date.now()}`
    const mergedVideo: ProjectVideo = {
      id: mergedVideoId,
      fileName: `${project.name} (מאוחד)`,
      file: mergedFile,
      blobUrl: mergedBlobUrl,
      mediaType: 'video',
      duration: totalDuration,
      size: mergedFile.size,
      order: 0,
      transcript: [],
      editHistory: [],
      deletedRegions: [],
      isTranscribed: false,
      hasUnsavedChanges: false,
    }
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        return {
          ...p,
          videos: [mergedVideo],
          activeVideoId: mergedVideoId,
          mediaFile: mergedFile,
          mediaBlobUrl: mergedBlobUrl,
          mediaType: 'video' as const,
          size: formatSize(mergedFile.size),
          duration: formatDuration(totalDuration),
          updatedAtTimestamp: Date.now(),
          updatedAt: 'עכשיו',
        }
      }),
    }))
    return mergedVideoId
  },
}))
