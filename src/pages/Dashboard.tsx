import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Upload, Monitor, FileText, MoreVertical, Play,
  Clock, Zap, ArrowLeft, Copy, Share2, Trash2, FolderOpen
} from 'lucide-react'
import { useProjectsStore } from '../stores/projectsStore'
import { useUIStore } from '../stores/uiStore'
import UploadModal from '../components/upload/UploadModal'
import RecordingModal from '../components/recording/RecordingModal'
import GenerateFromPromptModal from '../components/generate/GenerateFromPromptModal'
import PasteScriptModal from '../components/generate/PasteScriptModal'

const quickActions = [
  { label: 'העלה קובץ', desc: 'העלה וידאו או אודיו', icon: Upload, gradient: 'from-blue-600/20 to-blue-400/5', hoverGradient: 'from-blue-600/30 to-blue-400/10', iconColor: 'text-accent-blue', action: 'upload' },
  { label: 'הקלט מסך', desc: 'הקלטת מסך עם מצלמה', icon: Monitor, gradient: 'from-green-600/20 to-green-400/5', hoverGradient: 'from-green-600/30 to-green-400/10', iconColor: 'text-success', action: 'screenRecord' },
  { label: 'צור מפרומפט', desc: 'AI ייצור עבורך וידאו', icon: Sparkles, gradient: 'from-purple-600/20 to-purple-400/5', hoverGradient: 'from-purple-600/30 to-purple-400/10', iconColor: 'text-accent-purple', action: 'generatePrompt' },
  { label: 'הדבק סקריפט', desc: 'הפוך טקסט לווידאו', icon: FileText, gradient: 'from-orange-600/20 to-orange-400/5', hoverGradient: 'from-orange-600/30 to-orange-400/10', iconColor: 'text-warning', action: 'pasteScript' },
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

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'בוקר טוב'
  if (hour < 17) return 'צהריים טובים'
  return 'ערב טוב'
}

export default function Dashboard() {
  const { projects } = useProjectsStore()
  const { activeModal, openModal, closeModal } = useUIStore()
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
            <button
              key={action.label}
              onClick={() => openModal(action.action)}
              className={`relative bg-gradient-to-br ${action.gradient} hover:bg-gradient-to-br p-6 rounded-2xl text-center border border-white/[0.06] hover:border-white/[0.12] hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 transition-all duration-200 group overflow-hidden`}
              style={{ minHeight: '150px' }}
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/[0.06] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon size={24} className={action.iconColor} />
              </div>
              <div className="font-medium text-sm text-text-primary">{action.label}</div>
              <div className="text-xs text-text-muted mt-1">{action.desc}</div>
              <ArrowLeft size={16} className="absolute top-4 left-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )
        })}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent projects - takes 2 columns */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-subtitle font-bold text-text-primary">פרויקטים אחרונים</h2>
            {recentProjects.length > 0 && (
              <Link to="/projects" className="text-sm text-accent-purple hover:text-accent-blue transition-colors flex items-center gap-1">
                הצג הכל
                <ArrowLeft size={14} />
              </Link>
            )}
          </div>

          {recentProjects.length === 0 ? (
            <div className="bg-bg-card rounded-2xl border border-white/[0.06] p-12 text-center space-y-4">
              <FolderOpen size={48} className="mx-auto text-text-muted opacity-40" />
              <p className="text-text-secondary text-sm">אין פרויקטים עדיין. העלה קובץ כדי להתחיל!</p>
              <button
                onClick={() => openModal('upload')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
              >
                <Upload size={16} /> העלה קובץ
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentProjects.slice(0, 4).map((project) => {
                const status = statusConfig[project.status] || statusConfig['טיוטה']
                return (
                  <Link
                    key={project.id}
                    to={`/editor/${project.id}`}
                    className="bg-bg-card rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200 group border border-white/[0.06] hover:border-white/[0.12] relative"
                  >
                    <div className={`aspect-video bg-gradient-to-br ${project.gradient} relative overflow-hidden`}>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all">
                          <Play size={20} className="text-white mr-[-2px]" />
                        </div>
                      </div>
                    </div>
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
          )}
        </div>

        {/* Activity feed - right column */}
        <div>
          <h2 className="text-subtitle font-bold text-text-primary mb-4">פעילות אחרונה</h2>
          <div className="bg-bg-card rounded-2xl border border-white/[0.06] p-4">
            {projects.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <Clock size={32} className="mx-auto text-text-muted opacity-30" />
                <p className="text-sm text-text-muted">אין פעילות עדיין</p>
                <p className="text-xs text-text-muted">העלה קובץ כדי להתחיל</p>
              </div>
            ) : (
              <div className="space-y-0">
                {projects.slice(0, 4).map((project, i) => (
                  <div key={project.id} className="flex gap-3 relative">
                    {i < Math.min(projects.length, 4) - 1 && (
                      <div className="absolute right-[7px] top-5 bottom-0 w-px bg-white/[0.06]" />
                    )}
                    <div className="w-[15px] shrink-0 pt-1.5">
                      <div className="w-[7px] h-[7px] rounded-full bg-accent-purple mx-auto" />
                    </div>
                    <div className="pb-4 flex-1">
                      <div className="text-sm text-text-primary">נוצר '{project.name}'</div>
                      <div className="text-xs text-text-muted mt-0.5">{project.updatedAt}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
        <div className="bg-bg-card rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-blue/10 flex items-center justify-center">
              <Clock size={20} className="text-accent-blue" />
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">פרויקטים</div>
              <div className="text-2xl font-bold text-text-primary">{projects.length}</div>
            </div>
          </div>
        </div>
        <div className="bg-bg-card rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-purple/10 flex items-center justify-center">
              <Zap size={20} className="text-accent-purple" />
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">מוכנים לפרסום</div>
              <div className="text-2xl font-bold text-text-primary">
                {projects.filter((p) => p.status === 'מוכן' || p.status === 'פורסם').length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <UploadModal isOpen={activeModal === 'upload'} onClose={closeModal} />
      <RecordingModal isOpen={activeModal === 'screenRecord'} onClose={closeModal} />
      <GenerateFromPromptModal isOpen={activeModal === 'generatePrompt'} onClose={closeModal} />
      <PasteScriptModal isOpen={activeModal === 'pasteScript'} onClose={closeModal} />
    </div>
  )
}
