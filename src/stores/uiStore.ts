import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

interface UIState {
  sidebarCollapsed: boolean
  activeModal: string | null
  toasts: Toast[]
  commandPaletteOpen: boolean
  shortcutsModalOpen: boolean
  toggleSidebar: () => void
  openModal: (modal: string) => void
  closeModal: () => void
  addToast: (message: string, type: Toast['type']) => void
  removeToast: (id: string) => void
  toggleCommandPalette: () => void
  toggleShortcutsModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeModal: null,
  toasts: [],
  commandPaletteOpen: false,
  shortcutsModalOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  addToast: (message, type) => {
    const id = Date.now().toString()
    set((s) => {
      // Stack up to 3 toasts
      const toasts = [...s.toasts, { id, message, type }].slice(-3)
      return { toasts }
    })
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  toggleShortcutsModal: () => set((s) => ({ shortcutsModalOpen: !s.shortcutsModalOpen })),
}))
