import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Upload, Monitor, FileText, MoreVertical, Play,
  Clock, Zap, ArrowLeft, Copy, Share2, Trash2
} from 'lucide-react'
import { useProjectsStore } from '../stores/projectsStore'

const quickActions = [
  { label: 'העלה קובץ', desc: 'העלה וידאו או אודיו', icon: Upload, gradient: 'from-blue-600/20 to-blue-400/5', hoverGradient: 'from-blue-600/30 to-blue-400/10', iconColor: 'text-accent-blue', path: '/projects' },
  { label: 'הקלט מסך', desc: 'הקלטת מסך עם מצלמה', icon: Monitor, gradient: 'from-green-600/20 to-green-400/5', hoverGradient: 'from-green-600/30 to-green-400/10', iconColor: 'text-success', path: '/recording' },
  { label: 'צור מפרומפט', desc: 'AI ייצור עבורך וידאו', icon: Sparkles, gradient: 'from-purple-600/20 to-purple-400/5', hoverGradient: 'from-purple-600/30 to-purple-400/10', iconColor: 'text-accent-purple', path: '/editor/demo' },
  { label: 'הדבק סקריפט', desc: 'הפוך טקסט לווידאו', icon: FileText, gradient: 'from-orange-600/20 to-orange-400/5', hoverGradient: 'from-orange-600/30 to-orange-400/10', iconColor: 'text-warning', path: '/editor/demo' },
]

const statusConfig: Record<string, { dot: string; label: string }> = {
  'טיוטה': { dot: 'bg-text-muted', label: 'טיוטה' },
  'מוכן': { dot: 'bg-warning', label: 'מוכן' },
  'פורסם': { dot: 'bg-success', label: 'פורסם' },
}

const placeholders = [
  'תאר את הסרטון שאתה רוצה...',
  'ערוך את הפודקאסט שלי...',
  'צור קליפים לאינסטגרם...',
  'תרגם את הסרטון לאנגלית...',
]

const activityItems = [
  { text: "ערכת 'פודקאסט #47'", time: 'לפני שעתיים' },
  { text: 'התרגום לאנגלית הושלם', time: 'אתמול' },
  { text: 'נוצרו 3 קליפים', time: 'לפני 3 ימים' },
  { text: "פורסם 'מדריך TypeScript'", time: 'לפני שבוע' },
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'בוקר טוב'
  if (hour < 17) return 'צהריים טובים'
  return 'ערב טוב'
}

function CircularProgress({ value, max, color, label, icon: Icon }: {
  value: number; max: number; color: string; label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}) {
  const pct = (value / max) * 100
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  const statusColor = pct > 80 ? 'text-error' : pct > 60 ? 'text-warning' : 'text-success'

  return (
    <div className="bg-bg-card rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.12] transition-all">
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r={radius} fill="none"
              stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon size={20} className={statusColor} />
          </div>
        </div>
        <div>
          <div className="text-sm text-text-secondary mb-1">{label}</div>
          <div className="text-2xl font-bold text-text-primary animate-count-up">
            {value}<span className="text-text-muted text-base font-normal">/{max}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { projects } = useProjectsStore()
  const recentProjects = projects.slice(0, 6)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [placeholderFade, setPlaceholderFade] = useState(true)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderFade(false)
      setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % placeholders.length)
        setPlaceholderFade(true)
      }, 300)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hero greeting */}
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-hero font-bold text-text-primary">
          {getGreeting()}, <span className="gradient-text">מתן</span>
        </h1>
        <p className="text-text-muted text-body">מה ניצור היום?</p>

        {/* AI Input */}
        <div className="relative max-w-2xl mx-auto">
          <div className="relative">
            <input
              type="text"
              className="w-full px-5 py-4 bg-bg-card rounded-2xl border border-white/[0.06] text-text-primary text-body focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/30 transition-all animate-pulse-glow placeholder-transparent peer"
            />
            {/* Cycling placeholder */}
            <div
              className={`absolute right-5 top-1/2 -translate-y-1/2 text-text-muted text-body pointer-events-none transition-opacity duration-300 peer-focus:opacity-0 ${
                placeholderFade ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {placeholders[placeholderIdx]}
            </div>
            <Sparkles size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-purple animate-sparkle" />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              to={action.path}
              className={`relative bg-gradient-to-br ${action.gradient} hover:bg-gradient-to-br p-6 rounded-2xl text-center border border-white/[0.06] hover:border-white/[0.12] hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 transition-all duration-200 group overflow-hidden`}
              style={{ minHeight: '150px' }}
            >
              <div className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-white/[0.06] flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <Icon size={24} className={action.iconColor} />
              </div>
              <div className="font-medium text-sm text-text-primary">{action.label}</div>
              <div className="text-xs text-text-muted mt-1">{action.desc}</div>
              <ArrowLeft size={16} className="absolute top-4 left-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )
        })}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent projects - takes 2 columns */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-subtitle font-bold text-text-primary">פרויקטים אחרונים</h2>
            <Link to="/projects" className="text-sm text-accent-purple hover:text-accent-blue transition-colors flex items-center gap-1">
              הצג הכל
              <ArrowLeft size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentProjects.slice(0, 4).map((project) => {
              const status = statusConfig[project.status] || statusConfig['טיוטה']
              return (
                <Link
                  key={project.id}
                  to={`/editor/${project.id}`}
                  className="bg-bg-card rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200 group border border-white/[0.06] hover:border-white/[0.12] relative"
                >
                  {/* Thumbnail */}
                  <div className={`aspect-video bg-gradient-to-br ${project.gradient} relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all">
                        <Play size={20} className="text-white mr-[-2px]" />
                      </div>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-sm text-text-primary">{project.name}</h3>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setOpenMenu(openMenu === project.id ? null : project.id)
                          }}
                          className="p-1 hover:bg-white/[0.08] rounded transition-colors"
                        >
                          <MoreVertical size={16} className="text-text-muted" />
                        </button>
                        {openMenu === project.id && (
                          <div className="absolute left-0 top-full mt-1 glass rounded-xl py-1 min-w-[140px] z-10 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors">
                              <Copy size={14} /> שכפל
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors">
                              <Share2 size={14} /> שתף
                            </button>
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors">
                              <Trash2 size={14} /> מחק
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span>{project.updatedAt}</span>
                      <span>{project.duration}</span>
                      <span className="flex items-center gap-1 mr-auto">
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Activity feed - right column */}
        <div>
          <h2 className="text-subtitle font-bold text-text-primary mb-4">פעילות אחרונה</h2>
          <div className="bg-bg-card rounded-2xl border border-white/[0.06] p-4">
            <div className="space-y-0">
              {activityItems.map((item, i) => (
                <div key={i} className="flex gap-3 relative">
                  {/* Timeline line */}
                  {i < activityItems.length - 1 && (
                    <div className="absolute right-[7px] top-5 bottom-0 w-px bg-white/[0.06]" />
                  )}
                  {/* Dot */}
                  <div className="w-[15px] shrink-0 pt-1.5">
                    <div className="w-[7px] h-[7px] rounded-full bg-accent-purple mx-auto" />
                  </div>
                  {/* Content */}
                  <div className="pb-4 flex-1">
                    <div className="text-sm text-text-primary">{item.text}</div>
                    <div className="text-xs text-text-muted mt-0.5">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
        <CircularProgress value={14} max={20} color="#5C8AFF" label="שעות מדיה" icon={Clock} />
        <CircularProgress value={280} max={400} color="#7C5CFF" label="AI Credits" icon={Zap} />
      </div>
    </div>
  )
}
