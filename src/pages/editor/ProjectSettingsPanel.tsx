import { useState } from 'react'
import { Settings, Trash2, Download, Clock, Film, HardDrive, Calendar } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { useProjectsStore } from '../../stores/projectsStore'
import { useUIStore } from '../../stores/uiStore'

const formatOptions = [
  { value: '16:9', label: '16:9 (רחב)' },
  { value: '9:16', label: '9:16 (אנכי)' },
  { value: '1:1', label: '1:1 (מרובע)' },
  { value: '4:5', label: '4:5 (פורטרט)' },
]

const resolutions = ['720p', '1080p', '4K']
const frameRates = [24, 25, 30, 60]
const languages = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'ערבית' },
]

export default function ProjectSettingsPanel({ onClose }: { onClose?: () => void }) {
  const { projectId, projectName, setProjectName, duration } = useEditorStore()
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId))
  const updateProject = useProjectsStore((s) => s.updateProject)
  const { addToast, openModal } = useUIStore()

  const [format, setFormat] = useState('16:9')
  const [resolution, setResolution] = useState('1080p')
  const [frameRate, setFrameRate] = useState(30)
  const [bgColor, setBgColor] = useState('#000000')
  const [language, setLanguage] = useState('he')
  const [autoSave, setAutoSave] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
    const sec = Math.floor(s % 60).toString().padStart(2, '0')
    if (h > 0) return `${h}:${m}:${sec}`
    return `${m}:${sec}`
  }

  const handleNameChange = (name: string) => {
    setProjectName(name)
    if (projectId) {
      updateProject(projectId, { name })
    }
  }

  const handleExport = () => {
    openModal('export')
  }

  const handleDelete = () => {
    addToast('הפרויקט נמחק', 'info')
    setShowDeleteConfirm(false)
  }

  const totalFiles = project?.videos?.length || 0
  const totalSize = project?.size || '0KB'
  const createdDate = project?.createdAt
    ? new Date(project.createdAt).toLocaleDateString('he-IL')
    : '-'

  return (
    <div className="flex flex-col h-full glass rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between p-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-text-secondary" />
          <span className="font-bold text-sm text-text-primary">הגדרות פרויקט</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary transition-colors">סגור</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Project Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary">שם הפרויקט</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-purple/40 transition-colors"
            dir="rtl"
          />
        </div>

        {/* Format */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary">פורמט</label>
          <div className="grid grid-cols-2 gap-1.5">
            {formatOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`px-3 py-2 rounded-lg text-[11px] transition-all ${
                  format === opt.value
                    ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                    : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary">רזולוציה</label>
          <div className="flex gap-1.5">
            {resolutions.map((res) => (
              <button
                key={res}
                onClick={() => setResolution(res)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] transition-all ${
                  resolution === res
                    ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                    : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary">קצב פריימים</label>
          <div className="flex gap-1.5">
            {frameRates.map((fps) => (
              <button
                key={fps}
                onClick={() => setFrameRate(fps)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] transition-all ${
                  frameRate === fps
                    ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                    : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                {fps} fps
              </button>
            ))}
          </div>
        </div>

        {/* Background Color */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary">צבע רקע</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-8 h-8 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent"
            />
            <span className="text-[10px] text-text-muted font-mono">{bgColor}</span>
          </div>
        </div>

        {/* Language */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-primary">שפה</label>
          <div className="flex gap-1.5">
            {languages.map((lang) => (
              <button
                key={lang.value}
                onClick={() => setLanguage(lang.value)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] transition-all ${
                  language === lang.value
                    ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                    : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-save */}
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
          <span className="text-xs font-medium text-text-primary">שמירה אוטומטית</span>
          <button
            onClick={() => setAutoSave(!autoSave)}
            className={`w-9 h-5 rounded-full transition-colors relative ${autoSave ? 'bg-accent-purple' : 'bg-white/[0.12]'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoSave ? 'right-0.5' : 'right-[18px]'}`} />
          </button>
        </div>

        {/* Project Info */}
        <div className="space-y-2 p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
          <span className="text-xs font-medium text-text-primary">מידע על הפרויקט</span>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <Calendar size={10} />
              <span>נוצר:</span>
              <span className="mr-auto">{createdDate}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <Clock size={10} />
              <span>משך:</span>
              <span className="mr-auto font-mono">{formatTime(duration)}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <Film size={10} />
              <span>קבצים:</span>
              <span className="mr-auto">{totalFiles}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <HardDrive size={10} />
              <span>גודל:</span>
              <span className="mr-auto">{totalSize}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium text-white transition-all"
          >
            <Download size={14} />
            ייצא פרויקט
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs text-red-400 transition-all"
          >
            <Trash2 size={12} />
            מחק פרויקט
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="glass rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4 animate-scale-in" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Trash2 size={20} className="text-red-400" />
              <h3 className="font-bold text-text-primary text-sm">מחיקת פרויקט</h3>
            </div>
            <p className="text-sm text-text-secondary">האם אתה בטוח שברצונך למחוק את הפרויקט? פעולה זו לא ניתנת לביטול.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-medium text-white transition-all">
                מחק
              </button>
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
