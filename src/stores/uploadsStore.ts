import { create } from 'zustand'
import { useUIStore } from './uiStore'

export interface UploadFile {
  id: string
  name: string
  size: string
  sizeBytes: number
  type: 'video' | 'audio'
  source: 'upload' | 'recording' | 'prompt' | 'script'
  status: 'waiting' | 'uploading' | 'transcribing' | 'ready' | 'error'
  progress: number
  thumbnailGradient: string
  createdAt: Date
  duration?: string
  projectId?: string
  file?: File
  blobUrl?: string
}

interface UploadsState {
  files: UploadFile[]
  viewMode: 'grid' | 'table'
  filterTab: 'all' | 'inProgress' | 'ready' | 'error'
  sortBy: 'date' | 'name' | 'size' | 'status'
  selectedIds: string[]

  addFile: (file: Omit<UploadFile, 'id' | 'createdAt'>) => string
  updateFile: (id: string, updates: Partial<UploadFile>) => void
  removeFiles: (ids: string[]) => void
  simulateUpload: (id: string, onComplete?: (uploadId: string) => void) => void
  retryUpload: (id: string) => void

  setViewMode: (mode: 'grid' | 'table') => void
  setFilterTab: (tab: UploadsState['filterTab']) => void
  setSortBy: (sort: UploadsState['sortBy']) => void
  toggleSelect: (id: string) => void
  selectAll: () => void
  clearSelection: () => void

  getActiveUploads: () => UploadFile[]
  getFilteredFiles: () => UploadFile[]
}

const gradients = [
  'from-blue-600/30 to-purple-600/30',
  'from-green-600/30 to-teal-600/30',
  'from-orange-600/30 to-red-600/30',
  'from-pink-600/30 to-purple-600/30',
  'from-cyan-600/30 to-blue-600/30',
]

export const useUploadsStore = create<UploadsState>((set, get) => ({
  files: [],
  viewMode: 'grid',
  filterTab: 'all',
  sortBy: 'date',
  selectedIds: [],

  addFile: (file) => {
    const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const gradient = gradients[Math.floor(Math.random() * gradients.length)]
    set((s) => ({
      files: [
        { ...file, id, createdAt: new Date(), thumbnailGradient: file.thumbnailGradient || gradient },
        ...s.files,
      ],
    }))
    return id
  },

  updateFile: (id, updates) => {
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    }))
  },

  removeFiles: (ids) => {
    set((s) => ({
      files: s.files.filter((f) => !ids.includes(f.id)),
      selectedIds: s.selectedIds.filter((id) => !ids.includes(id)),
    }))
  },

  simulateUpload: (id, onComplete) => {
    const { updateFile } = get()
    const addToast = useUIStore.getState().addToast

    updateFile(id, { status: 'uploading', progress: 0 })
    let uploadProgress = 0
    const uploadInterval = setInterval(() => {
      uploadProgress += 10
      const file = get().files.find((f) => f.id === id)
      if (!file) {
        clearInterval(uploadInterval)
        return
      }
      if (uploadProgress >= 100) {
        clearInterval(uploadInterval)
        updateFile(id, { status: 'transcribing', progress: 0 })
        addToast('ההעלאה הושלמה, מעבד...', 'info')

        let transcribeProgress = 0
        const transcribeInterval = setInterval(() => {
          transcribeProgress += 20
          const f = get().files.find((f) => f.id === id)
          if (!f) {
            clearInterval(transcribeInterval)
            return
          }
          if (transcribeProgress >= 100) {
            clearInterval(transcribeInterval)
            updateFile(id, { status: 'ready', progress: 100 })
            addToast('הקובץ מוכן לעריכה!', 'success')
            onComplete?.(id)
          } else {
            updateFile(id, { progress: Math.min(transcribeProgress, 100) })
          }
        }, 600)
      } else {
        updateFile(id, { progress: uploadProgress })
      }
    }, 300)
  },

  retryUpload: (id) => {
    get().simulateUpload(id)
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setFilterTab: (tab) => set({ filterTab: tab }),
  setSortBy: (sort) => set({ sortBy: sort }),

  toggleSelect: (id) => {
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((i) => i !== id)
        : [...s.selectedIds, id],
    }))
  },

  selectAll: () => {
    const filtered = get().getFilteredFiles()
    set({ selectedIds: filtered.map((f) => f.id) })
  },

  clearSelection: () => set({ selectedIds: [] }),

  getActiveUploads: () => {
    return get().files.filter((f) => f.status === 'uploading' || f.status === 'transcribing')
  },

  getFilteredFiles: () => {
    const { files, filterTab, sortBy } = get()
    let filtered = [...files]

    switch (filterTab) {
      case 'inProgress':
        filtered = filtered.filter((f) => f.status === 'uploading' || f.status === 'transcribing' || f.status === 'waiting')
        break
      case 'ready':
        filtered = filtered.filter((f) => f.status === 'ready')
        break
      case 'error':
        filtered = filtered.filter((f) => f.status === 'error')
        break
    }

    switch (sortBy) {
      case 'date':
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        break
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'he'))
        break
      case 'size':
        filtered.sort((a, b) => b.sizeBytes - a.sizeBytes)
        break
      case 'status': {
        const order = { error: 0, uploading: 1, transcribing: 2, waiting: 3, ready: 4 }
        filtered.sort((a, b) => order[a.status] - order[b.status])
        break
      }
    }

    return filtered
  },
}))
