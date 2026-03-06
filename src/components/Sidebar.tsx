import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, Mic, Palette, AudioLines,
  Languages, UserCircle, Video, Settings, ChevronLeft, ChevronRight,
  ChevronDown
} from 'lucide-react'
import { useUIStore } from '../stores/uiStore'

interface MenuItem {
  path: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
  {
    title: 'ראשי',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'דשבורד' },
      { path: '/projects', icon: FolderOpen, label: 'פרויקטים' },
    ],
  },
  {
    title: 'יצירה',
    items: [
      { path: '/recording', icon: Mic, label: 'הקלטה' },
      { path: '/voices', icon: AudioLines, label: 'קולות AI' },
      { path: '/translation', icon: Languages, label: 'תרגום' },
      { path: '/avatars', icon: UserCircle, label: 'אווטארים' },
      { path: '/brand', icon: Palette, label: 'סטודיו מותג' },
    ],
  },
  {
    title: 'הגדרות',
    items: [
      { path: '/settings', icon: Settings, label: 'הגדרות' },
    ],
  },
]

export default function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside
      className={`${
        sidebarCollapsed ? 'w-16' : 'w-60'
      } glass border-l-0 border-r border-t-0 border-b-0 border-white/[0.06] flex flex-col transition-all duration-300 shrink-0 relative z-20`}
    >
      {/* Workspace selector */}
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-sm">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center">
              <Video size={13} className="text-white" />
            </div>
            <span className="font-medium text-text-primary">הסטודיו שלי</span>
            <ChevronDown size={14} className="text-text-muted mr-auto" />
          </button>
        </div>
      )}

      {/* Menu groups */}
      <div className="flex-1 py-2 overflow-y-auto">
        {menuGroups.map((group) => (
          <div key={group.title} className="mb-1">
            {!sidebarCollapsed && (
              <div className="px-5 py-1.5 text-[10px] uppercase tracking-wider text-text-muted font-medium">
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-lg transition-all duration-200 relative group ${
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
                  }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {/* Active right border indicator */}
                  {isActive && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-accent-purple rounded-l-full" />
                  )}
                  {/* Hover right border */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-0 bg-accent-blue/50 rounded-l-full transition-all duration-200 group-hover:h-3 opacity-0 group-hover:opacity-100" />

                  <Icon size={20} className={`shrink-0 ${isActive ? 'text-accent-purple' : ''}`} />
                  {!sidebarCollapsed && (
                    <span className="text-sm whitespace-nowrap">{item.label}</span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* Bottom section: usage + avatar + collapse */}
      <div className="border-t border-white/[0.06] p-3">
        {!sidebarCollapsed && (
          <div className="mb-3 px-1">
            {/* Usage meter */}
            <div className="flex items-center justify-between text-[11px] text-text-muted mb-1.5">
              <span>שעות מדיה</span>
              <span className="font-mono text-text-secondary">14/20</span>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full w-[70%] rounded-full bg-gradient-to-l from-accent-purple to-accent-blue transition-all duration-500" />
            </div>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-1 mb-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center text-[10px] font-bold text-white">
              מ
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-text-primary truncate">מתן</div>
              <div className="text-[10px] text-text-muted truncate">matan@studio.ai</div>
            </div>
            <Link to="/settings" className="p-1 rounded hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors">
              <Settings size={14} />
            </Link>
          </div>
        )}

        <button
          onClick={toggleSidebar}
          className="w-full p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors flex justify-center"
        >
          {sidebarCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
    </aside>
  )
}
