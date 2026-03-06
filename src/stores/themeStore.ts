import { create } from 'zustand'

interface ThemeState {
  isDark: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: true,
  toggle: () => set((state) => {
    const newDark = !state.isDark
    // Add transition class for smooth theme switch
    document.documentElement.classList.add('theme-transitioning')
    document.documentElement.classList.toggle('dark', newDark)
    document.body.style.backgroundColor = newDark ? '#0A0A0F' : '#FAFBFC'
    document.body.style.color = newDark ? '#FFFFFF' : '#1A1A2E'
    // Remove transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning')
    }, 500)
    return { isDark: newDark }
  }),
}))
