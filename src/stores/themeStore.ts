import { create } from 'zustand'

interface ThemeState {
  isDark: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: true,
  toggle: () => set((state) => {
    const newDark = !state.isDark
    document.documentElement.classList.toggle('dark', newDark)
    document.body.style.backgroundColor = newDark ? '#1A1A2E' : '#F3F4F6'
    document.body.style.color = newDark ? '#FFFFFF' : '#1F2937'
    return { isDark: newDark }
  }),
}))
