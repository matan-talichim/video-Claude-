import { Link } from 'react-router-dom'
import {
  Grid3X3, List, Video, Music, Trash2, Download,
  ExternalLink, RefreshCw, Upload, CheckCircle, XCircle, Loader2,
  Clock, SortAsc
} from 'lucide-react'
import { useUploadsStore, type UploadFile } from '../stores/uploadsStore'

const filterTabs = [
  { key: 'all' as const, label: 'הכל' },
  { key: 'inProgress' as const, label: 'בתהליך' },
  { key: 'ready' as const, label: 'מוכנים' },
  { key: 'error' as const, label: 'שגיאות' },
]

const sortOptions = [
  { key: 'date' as const, label: 'תאריך' },
  { key: 'name' as const, label: 'שם' },
  { key: 'size' as const, label: 'גודל' },
  { key: 'status' as const, label: 'סטטוס' },
]

const statusConfig: Record<UploadFile['status'], { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  waiting: { label: 'ממתין', color: 'text-text-muted', bg: 'bg-text-muted/10', icon: Clock },
  uploading: { label: 'מעלה', color: 'text-accent-blue', bg: 'bg-accent-blue/10', icon: Loader2 },
  transcribing: { label: 'מתמלל', color: 'text-accent-purple', bg: 'bg-accent-purple/10', icon: Loader2 },
  ready: { label: 'מוכן', color: 'text-success', bg: 'bg-success/10', icon: CheckCircle },
  error: { label: 'שגיאה', color: 'text-error', bg: 'bg-error/10', icon: XCircle },
}

function formatDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'עכשיו'
  if (minutes < 60) return `לפני ${minutes} דקות`
  if (hours < 24) return `לפני ${hours} שעות`
  if (days < 7) return `לפני ${days} ימים`
  return date.toLocaleDateString('he-IL')
}

function StatusBadge({ file }: { file: UploadFile }) {
  const config = statusConfig[file.status]
  const Icon = config.icon
  const isAnimating = file.status === 'uploading' || file.status === 'transcribing'

  return (
    <div className="space-y-1.5">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
        <Icon size={13} className={isAnimating ? 'animate-spin' : ''} />
        {config.label} {isAnimating && `${Math.round(file.progress)}%`}
      </span>
      {isAnimating && (
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden w-24">
          <div
            className={`h-full rounded-full transition-all duration-500 ${file.status === 'uploading' ? 'bg-accent-blue' : 'bg-accent-purple'}`}
            style={{ width: `${file.progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default function Uploads() {
  const {
    viewMode, filterTab, sortBy, selectedIds,
    setViewMode, setFilterTab, setSortBy,
    toggleSelect, selectAll, clearSelection,
    removeFiles, retryUpload, getFilteredFiles,
  } = useUploadsStore()

  const files = getFilteredFiles()
  const allFiles = useUploadsStore((s) => s.files)
  const totalSize = allFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
  const totalGB = (totalSize / (1024 * 1024 * 1024)).toFixed(1)
  const maxGB = 10

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-title font-bold text-text-primary">הקבצים שלי</h1>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">{selectedIds.length} נבחרו</span>
            <button
              onClick={() => removeFiles(selectedIds)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error rounded-lg text-sm hover:bg-error/20 transition-colors"
            >
              <Trash2 size={14} /> מחק נבחרים
            </button>
            <button onClick={clearSelection} className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
              בטל בחירה
            </button>
          </div>
        )}
      </div>

      {/* Storage bar */}
      <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06]">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-text-secondary">נפח אחסון</span>
          <span className="text-text-muted font-mono">{totalGB}GB / {maxGB}GB</span>
        </div>
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-l from-accent-purple to-accent-blue transition-all duration-500"
            style={{ width: `${Math.min((parseFloat(totalGB) / maxGB) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter tabs */}
        <div className="flex gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                filterTab === tab.key
                  ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20'
                  : 'bg-bg-card text-text-muted hover:text-text-primary border border-white/[0.06]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <SortAsc size={14} className="text-text-muted" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-primary focus:outline-none cursor-pointer"
          >
            {sortOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* View toggle */}
        <div className="flex border border-white/[0.06] rounded-xl overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-accent-purple/15 text-accent-purple' : 'bg-bg-card text-text-muted hover:text-text-primary'}`}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2.5 transition-colors ${viewMode === 'table' ? 'bg-accent-purple/15 text-accent-purple' : 'bg-bg-card text-text-muted hover:text-text-primary'}`}
          >
            <List size={16} />
          </button>
        </div>

        {/* Select all */}
        <button
          onClick={selectedIds.length === files.length && files.length > 0 ? clearSelection : selectAll}
          className="px-3 py-2 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          {selectedIds.length === files.length && files.length > 0 ? 'בטל הכל' : 'בחר הכל'}
        </button>
      </div>

      {/* Content */}
      {files.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.04] flex items-center justify-center">
            <Upload size={28} className="text-text-muted" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">אין קבצים</h3>
          <p className="text-text-muted text-sm mb-4">העלה את הקובץ הראשון שלך!</p>
          <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all">
            <Upload size={16} /> העלה קובץ
          </Link>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file) => (
            <div
              key={file.id}
              className={`bg-bg-card rounded-2xl overflow-hidden border transition-all duration-200 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 ${
                selectedIds.includes(file.id) ? 'border-accent-purple/40' : 'border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              {/* Thumbnail */}
              <div className={`aspect-video bg-gradient-to-br ${file.thumbnailGradient} relative flex items-center justify-center`}>
                {file.type === 'video' ? <Video size={32} className="text-white/30" /> : <Music size={32} className="text-white/30" />}
                {/* Select checkbox */}
                <button
                  onClick={() => toggleSelect(file.id)}
                  className={`absolute top-3 right-3 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                    selectedIds.includes(file.id)
                      ? 'bg-accent-purple border-accent-purple text-white'
                      : 'border-white/30 hover:border-white/60'
                  }`}
                >
                  {selectedIds.includes(file.id) && <CheckCircle size={14} />}
                </button>
              </div>
              {/* Info */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm text-text-primary truncate">{file.name}</h3>
                  <span className="text-xs text-text-muted shrink-0">{file.size}</span>
                </div>
                <StatusBadge file={file} />
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span>{formatDate(file.createdAt)}</span>
                  {file.duration && <span>{file.duration}</span>}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {file.status === 'ready' && (
                    <Link
                      to={`/editor/${file.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-purple/10 text-accent-purple rounded-lg text-xs hover:bg-accent-purple/20 transition-colors"
                    >
                      <ExternalLink size={12} /> פתח בעורך
                    </Link>
                  )}
                  {file.status === 'error' && (
                    <button
                      onClick={() => retryUpload(file.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 text-warning rounded-lg text-xs hover:bg-warning/20 transition-colors"
                    >
                      <RefreshCw size={12} /> נסה שוב
                    </button>
                  )}
                  {file.status === 'ready' && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] text-text-muted rounded-lg text-xs hover:bg-white/[0.08] transition-colors">
                      <Download size={12} /> הורד
                    </button>
                  )}
                  <button
                    onClick={() => removeFiles([file.id])}
                    className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10 transition-colors mr-auto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-bg-card rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-text-muted">
                <th className="text-right p-3 font-medium w-8"></th>
                <th className="text-right p-3 font-medium">שם</th>
                <th className="text-right p-3 font-medium">סוג</th>
                <th className="text-right p-3 font-medium">גודל</th>
                <th className="text-right p-3 font-medium">סטטוס</th>
                <th className="text-right p-3 font-medium">תאריך</th>
                <th className="text-right p-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const status = statusConfig[file.status]
                const StatusIcon = status.icon
                const isAnimating = file.status === 'uploading' || file.status === 'transcribing'
                return (
                  <tr key={file.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => toggleSelect(file.id)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          selectedIds.includes(file.id) ? 'bg-accent-purple border-accent-purple text-white' : 'border-white/20 hover:border-white/40'
                        }`}
                      >
                        {selectedIds.includes(file.id) && <CheckCircle size={12} />}
                      </button>
                    </td>
                    <td className="p-3 text-text-primary font-medium">{file.name}</td>
                    <td className="p-3 text-text-muted">
                      {file.type === 'video' ? <Video size={16} /> : <Music size={16} />}
                    </td>
                    <td className="p-3 text-text-muted">{file.size}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs ${status.color}`}>
                          <StatusIcon size={13} className={isAnimating ? 'animate-spin' : ''} />
                          {status.label} {isAnimating && `${Math.round(file.progress)}%`}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-text-muted">{formatDate(file.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {file.status === 'ready' && (
                          <Link to={`/editor/${file.id}`} className="p-1.5 text-accent-purple hover:bg-accent-purple/10 rounded transition-colors">
                            <ExternalLink size={14} />
                          </Link>
                        )}
                        {file.status === 'error' && (
                          <button onClick={() => retryUpload(file.id)} className="p-1.5 text-warning hover:bg-warning/10 rounded transition-colors">
                            <RefreshCw size={14} />
                          </button>
                        )}
                        <button onClick={() => removeFiles([file.id])} className="p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
