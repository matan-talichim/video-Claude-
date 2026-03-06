import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Bell, Search, Sun, Moon, CloudUpload, ExternalLink, RefreshCw, Loader2, CheckCircle } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import { useUIStore } from '../stores/uiStore'
import { useUploadsStore } from '../stores/uploadsStore'

const breadcrumbMap: Record<string, string> = {
  '/': 'דשבורד',
  '/projects': 'פרויקטים',
  '/uploads': 'הקבצים שלי',
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
  const activeUploads = useUploadsStore((s) => s.getActiveUploads())
  const allFiles = useUploadsStore((s) => s.files)
  const retryUpload = useUploadsStore((s) => s.retryUpload)
  const [showUploadDropdown, setShowUploadDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentPage = breadcrumbMap[location.pathname] || 'דשבורד'

  // Recent uploads for dropdown (last 5)
  const recentUploads = allFiles.slice(0, 5)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUploadDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

        {/* Upload indicator */}
        {recentUploads.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowUploadDropdown(!showUploadDropdown)}
              className="relative p-2 rounded-lg hover:bg-white/5 transition-colors text-text-secondary hover:text-text-primary"
            >
              <CloudUpload size={18} className={activeUploads.length > 0 ? 'text-accent-purple' : ''} />
              {activeUploads.length > 0 && (
                <>
                  <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-accent-purple rounded-full text-[9px] font-bold flex items-center justify-center text-white">
                    {activeUploads.length}
                  </span>
                  {/* Mini progress bar under icon */}
                  <div className="absolute bottom-0.5 left-1 right-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-purple rounded-full transition-all duration-500"
                      style={{
                        width: `${activeUploads.length > 0 ? activeUploads.reduce((sum, f) => sum + f.progress, 0) / activeUploads.length : 0}%`,
                      }}
                    />
                  </div>
                </>
              )}
            </button>

            {/* Dropdown */}
            {showUploadDropdown && (
              <div
                className="absolute left-0 top-full mt-2 w-80 glass rounded-xl shadow-2xl overflow-hidden animate-scale-in z-50"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="p-3 border-b border-white/[0.06]">
                  <h3 className="text-sm font-medium text-text-primary">העלאות אחרונות</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {recentUploads.map((file) => {
                    const isActive = file.status === 'uploading' || file.status === 'transcribing'
                    return (
                      <div key={file.id} className="px-3 py-2.5 hover:bg-white/[0.04] transition-colors border-b border-white/[0.04] last:border-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm text-text-primary truncate">{file.name}</span>
                          {file.status === 'ready' && (
                            <Link
                              to={`/editor/${file.id}`}
                              onClick={() => setShowUploadDropdown(false)}
                              className="text-xs text-accent-purple hover:underline flex items-center gap-1 shrink-0"
                            >
                              פתח בעורך <ExternalLink size={10} />
                            </Link>
                          )}
                          {file.status === 'error' && (
                            <button
                              onClick={() => retryUpload(file.id)}
                              className="text-xs text-warning hover:underline flex items-center gap-1 shrink-0"
                            >
                              נסה שוב <RefreshCw size={10} />
                            </button>
                          )}
                        </div>
                        {isActive && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  file.status === 'uploading' ? 'bg-accent-blue' : 'bg-accent-purple'
                                }`}
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-text-muted flex items-center gap-1">
                              <Loader2 size={10} className="animate-spin" />
                              {file.status === 'uploading' ? 'מעלה' : 'מתמלל'} {Math.round(file.progress)}%
                            </span>
                          </div>
                        )}
                        {file.status === 'ready' && (
                          <span className="text-[10px] text-success flex items-center gap-1">
                            <CheckCircle size={10} /> מוכן לעריכה
                          </span>
                        )}
                        {file.status === 'error' && (
                          <span className="text-[10px] text-error">שגיאה בהעלאה</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <Link
                  to="/uploads"
                  onClick={() => setShowUploadDropdown(false)}
                  className="block text-center py-2.5 text-xs text-accent-purple hover:bg-white/[0.04] transition-colors border-t border-white/[0.06]"
                >
                  הצג הכל
                </Link>
              </div>
            )}
          </div>
        )}

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
