import { Link, useLocation } from 'react-router-dom'
import { FolderOpen, Mic, Palette, AudioLines, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'

const menuItems = [
  { path: '/projects', icon: FolderOpen, label: 'פרויקטים' },
  { path: '/recording', icon: Mic, label: 'הקלטות מהירות' },
  { path: '/brand', icon: Palette, label: 'סטודיו מותג' },
  { path: '/voices', icon: AudioLines, label: 'דוברי AI' },
  { path: '/editor/demo', icon: LayoutGrid, label: 'חבילות עיצוב' },
]

export default function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside
      className={`${
        sidebarCollapsed ? 'w-16' : 'w-52'
      } border-l border-white/10 bg-[#16213E]/50 flex flex-col transition-all duration-300 shrink-0`}
    >
      <div className="flex-1 py-4">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-[#0F3460] text-white shadow-lg shadow-[#0F3460]/20'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon size={20} className="shrink-0" />
              {!sidebarCollapsed && <span className="text-sm whitespace-nowrap">{item.label}</span>}
            </Link>
          )
        })}
      </div>
      <button
        onClick={toggleSidebar}
        className="p-3 border-t border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-colors flex justify-center"
      >
        {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
  )
}
