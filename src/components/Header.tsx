import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Bell, Search, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import { useUIStore } from '../stores/uiStore'

const breadcrumbMap: Record<string, string> = {
  '/': 'דשבורד',
  '/projects': 'פרויקטים',
  '/voices': 'קולות AI',
  '/translation': 'תרגום',
  '/avatars': 'אווטארים',
  '/recording': 'הקלטה',
  '/brand': 'סטודיו מותג',
  '/settings': 'הגדרות',
}

export default function Header() {
  const location = useLocation()
  const { isDark, toggle } = useThemeStore()
  const { toggleCommandPalette } = useUIStore()

  const currentPage = breadcrumbMap[location.pathname] || 'דשבורד'

  return (
    <header className="h-14 flex items-center justify-between px-5 glass gradient-border-bottom shrink-0 relative z-30">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2">
        <Sparkles size={20} className="text-accent-purple animate-sparkle" />
        <span className="text-lg font-bold tracking-tight">
          סטודיו<span className="text-accent-purple mr-1">AI</span>
        </span>
      </Link>

      {/* Center - Breadcrumb */}
      <div className="hidden md:flex items-center gap-2 text-sm">
        <Link to="/" className="text-text-muted hover:text-text-secondary transition-colors">דשבורד</Link>
        {location.pathname !== '/' && (
          <>
            <span className="text-text-muted">/</span>
            <span className="text-text-secondary">{currentPage}</span>
          </>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Cmd+K search hint */}
        <button
          onClick={toggleCommandPalette}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/[0.06] hover:border-white/[0.12] text-text-muted hover:text-text-secondary transition-all text-xs"
        >
          <Search size={13} />
          <span>חיפוש</span>
          <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px] font-mono">⌘K</kbd>
        </button>

        {/* Notification bell */}
        <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-text-primary">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent-pink rounded-full" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-text-primary"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Avatar */}
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-xs font-bold text-white">
            מ
          </div>
          <span className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-bg-panel" />
        </div>
      </div>
    </header>
  )
}
