import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'

const navLinks = [
  { path: '/', label: 'בית' },
  { path: '/projects', label: 'פרויקטים' },
  { path: '/voices', label: 'קולות' },
  { path: '/translation', label: 'תרגום' },
  { path: '/avatars', label: 'אווטארים' },
]

export default function Header() {
  const location = useLocation()
  const { isDark, toggle } = useThemeStore()

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-5 bg-[#16213E]/80 backdrop-blur-sm shrink-0">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold">
        <Sparkles size={22} className="text-[#E94560]" />
        <span>סטודיו AI</span>
      </Link>

      <nav className="hidden md:flex items-center gap-1">
        {navLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              location.pathname === link.path
                ? 'bg-[#0F3460] text-white'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E94560] to-[#0F3460] flex items-center justify-center text-xs font-bold">
          מ
        </div>
      </div>
    </header>
  )
}
