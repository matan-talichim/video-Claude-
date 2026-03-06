import { create } from 'zustand'

export interface Project {
  id: string
  name: string
  status: 'טיוטה' | 'מוכן' | 'פורסם'
  duration: string
  updatedAt: string
  size: string
  gradient: string
}

const mockProjects: Project[] = [
  { id: '1', name: 'פודקאסט שבועי #47', status: 'מוכן', duration: '05:32', updatedAt: 'לפני 2 שעות', size: '128MB', gradient: 'from-blue-500 to-purple-600' },
  { id: '2', name: 'סרטון הדרכה למוצר', status: 'טיוטה', duration: '12:45', updatedAt: 'לפני 5 שעות', size: '340MB', gradient: 'from-green-500 to-teal-600' },
  { id: '3', name: 'ראיון עם CEO', status: 'פורסם', duration: '28:10', updatedAt: 'אתמול', size: '890MB', gradient: 'from-orange-500 to-red-600' },
  { id: '4', name: 'קורס מקוון - שיעור 3', status: 'טיוטה', duration: '45:22', updatedAt: 'לפני 3 ימים', size: '1.2GB', gradient: 'from-pink-500 to-rose-600' },
  { id: '5', name: 'סרטון שיווקי Q4', status: 'מוכן', duration: '01:30', updatedAt: 'לפני שבוע', size: '85MB', gradient: 'from-cyan-500 to-blue-600' },
  { id: '6', name: 'וובינר - טרנדים 2026', status: 'פורסם', duration: '52:18', updatedAt: 'לפני שבועיים', size: '1.5GB', gradient: 'from-violet-500 to-indigo-600' },
  { id: '7', name: 'תדריך צוות שבועי', status: 'טיוטה', duration: '08:45', updatedAt: 'לפני 4 ימים', size: '210MB', gradient: 'from-amber-500 to-orange-600' },
  { id: '8', name: 'סקירת מוצר חדש', status: 'מוכן', duration: '03:20', updatedAt: 'לפני יום', size: '95MB', gradient: 'from-emerald-500 to-green-600' },
  { id: '9', name: 'פרומו לאירוע השקה', status: 'פורסם', duration: '00:45', updatedAt: 'לפני 6 ימים', size: '42MB', gradient: 'from-red-500 to-pink-600' },
]

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
        default: return 0
      }
    })
  },
}))
