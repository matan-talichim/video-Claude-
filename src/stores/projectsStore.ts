import { create } from 'zustand'
import type { Segment, EditHistoryEntry } from './editorStore'

export interface Project {
  id: string
  name: string
  status: 'טיוטה' | 'מוכן' | 'פורסם'
  duration: string
  updatedAt: string
  size: string
  gradient: string
  mediaFile?: File
  mediaBlobUrl?: string
  mediaType?: 'video' | 'audio'
  transcript?: Segment[]
  transcriptMode?: 'real' | 'demo'
  editHistory?: EditHistoryEntry[]
  createdAt?: number
  updatedAtTimestamp?: number
  isDemo?: boolean
  source?: 'upload' | 'recording' | 'prompt' | 'script' | 'demo'
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

const mockProjects: Project[] = [
  { id: 'demo-1', name: 'פודקאסט שבועי #47', status: 'מוכן', duration: '05:32', updatedAt: 'לפני 2 שעות', size: '128MB', gradient: 'from-blue-500 to-purple-600', isDemo: true, source: 'demo' },
  { id: 'demo-2', name: 'סרטון הדרכה למוצר', status: 'טיוטה', duration: '12:45', updatedAt: 'לפני 5 שעות', size: '340MB', gradient: 'from-green-500 to-teal-600', isDemo: true, source: 'demo' },
  { id: 'demo-3', name: 'ראיון עם CEO', status: 'פורסם', duration: '28:10', updatedAt: 'אתמול', size: '890MB', gradient: 'from-orange-500 to-red-600', isDemo: true, source: 'demo' },
  { id: 'demo-4', name: 'קורס מקוון - שיעור 3', status: 'טיוטה', duration: '45:22', updatedAt: 'לפני 3 ימים', size: '1.2GB', gradient: 'from-pink-500 to-rose-600', isDemo: true, source: 'demo' },
  { id: 'demo-5', name: 'סרטון שיווקי Q4', status: 'מוכן', duration: '01:30', updatedAt: 'לפני שבוע', size: '85MB', gradient: 'from-cyan-500 to-blue-600', isDemo: true, source: 'demo' },
  { id: 'demo-6', name: 'וובינר - טרנדים 2026', status: 'פורסם', duration: '52:18', updatedAt: 'לפני שבועיים', size: '1.5GB', gradient: 'from-violet-500 to-indigo-600', isDemo: true, source: 'demo' },
]

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
    transcriptMode?: 'real' | 'demo'
    duration?: number
    source?: 'upload' | 'recording' | 'prompt' | 'script'
    isDemo?: boolean
  }) => string
  updateProject: (id: string, updates: Partial<Project>) => void
  getProject: (id: string) => Project | undefined
  saveEditorState: (id: string, data: {
    name?: string
    transcript?: Segment[]
    editHistory?: EditHistoryEntry[]
    mediaBlobUrl?: string
    mediaFile?: File
  }) => void
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: mockProjects,
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
    const durationStr = opts.duration ? formatDuration(opts.duration) : '00:00'
    const sizeStr = opts.mediaFile ? formatSize(opts.mediaFile.size) : '0KB'
    const project: Project = {
      id, name: opts.name, status: 'טיוטה', duration: durationStr,
      updatedAt: 'עכשיו', size: sizeStr, gradient,
      mediaFile: opts.mediaFile, mediaBlobUrl: opts.mediaBlobUrl,
      mediaType: opts.mediaType, transcript: opts.transcript,
      transcriptMode: opts.transcriptMode ?? 'real',
      createdAt: now, updatedAtTimestamp: now,
      isDemo: opts.isDemo ?? false, source: opts.source ?? 'upload',
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
}))
