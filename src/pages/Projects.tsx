import { Link } from 'react-router-dom'
import { Search, Grid3X3, List, Plus, MoreVertical, Play } from 'lucide-react'
import { useProjectsStore } from '../stores/projectsStore'

const filters = ['הכל', 'טיוטה', 'מוכן', 'פורסם']
const sortOptions = ['תאריך', 'שם', 'גודל', 'סטטוס']

const statusConfig: Record<string, { dot: string; bg: string; text: string }> = {
  'טיוטה': { dot: 'bg-text-muted', bg: 'bg-text-muted/10', text: 'text-text-muted' },
  'מוכן': { dot: 'bg-warning', bg: 'bg-warning/10', text: 'text-warning' },
  'פורסם': { dot: 'bg-success', bg: 'bg-success/10', text: 'text-success' },
}

export default function Projects() {
  const { viewMode, filter, searchQuery, sortBy, setViewMode, setFilter, setSearchQuery, setSortBy, filteredProjects } = useProjectsStore()
  const projects = filteredProjects()

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-title font-bold text-text-primary">פרויקטים</h1>
        <Link to="/editor/new" className="flex items-center gap-2 px-4 py-2 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20">
          <Plus size={16} /> פרויקט חדש
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input type="text" placeholder="חפש פרויקט..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/30 transition-colors" />
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-4 py-2.5 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-primary focus:outline-none cursor-pointer">
          {sortOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <div className="flex border border-white/[0.06] rounded-xl overflow-hidden">
          <button onClick={() => setViewMode('grid')} className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-accent-purple/15 text-accent-purple' : 'bg-bg-card text-text-muted hover:text-text-primary'}`}><Grid3X3 size={16} /></button>
          <button onClick={() => setViewMode('list')} className={`p-2.5 transition-colors ${viewMode === 'list' ? 'bg-accent-purple/15 text-accent-purple' : 'bg-bg-card text-text-muted hover:text-text-primary'}`}><List size={16} /></button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-full text-sm transition-all ${filter === f ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20' : 'bg-bg-card text-text-muted hover:text-text-primary border border-white/[0.06]'}`}>{f}</button>
        ))}
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const status = statusConfig[project.status] || statusConfig['טיוטה']
            return (
              <Link key={project.id} to={`/editor/${project.id}`} className="bg-bg-card rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200 group border border-white/[0.06] hover:border-white/[0.12]">
                <div className={`aspect-video bg-gradient-to-br ${project.gradient} relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all">
                      <Play size={18} className="text-white mr-[-2px]" />
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm text-text-primary">{project.name}</h3>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation() }} className="p-1 hover:bg-white/[0.08] rounded transition-colors"><MoreVertical size={16} className="text-text-muted" /></button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>{project.updatedAt}</span><span>{project.duration}</span>
                    <span className="flex items-center gap-1 mr-auto"><span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />{project.status}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="bg-bg-card rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-text-muted"><th className="text-right p-3 font-medium">שם</th><th className="text-right p-3 font-medium">סטטוס</th><th className="text-right p-3 font-medium">משך</th><th className="text-right p-3 font-medium">תאריך עדכון</th><th className="text-right p-3 font-medium">גודל</th></tr></thead>
            <tbody>{projects.map((project) => {
              const status = statusConfig[project.status] || statusConfig['טיוטה']
              return (
                <tr key={project.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                  <td className="p-3"><Link to={`/editor/${project.id}`} className="text-text-primary hover:text-accent-purple transition-colors">{project.name}</Link></td>
                  <td className="p-3"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${status.bg} ${status.text}`}><span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />{project.status}</span></td>
                  <td className="p-3 text-text-muted">{project.duration}</td>
                  <td className="p-3 text-text-muted">{project.updatedAt}</td>
                  <td className="p-3 text-text-muted">{project.size}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
