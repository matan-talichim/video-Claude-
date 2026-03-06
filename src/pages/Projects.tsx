import { Link } from 'react-router-dom'
import { Search, Grid3X3, List, Plus, MoreVertical } from 'lucide-react'
import { useProjectsStore } from '../stores/projectsStore'

const filters = ['הכל', 'טיוטה', 'מוכן', 'פורסם']
const sortOptions = ['תאריך', 'שם', 'גודל', 'סטטוס']

const statusColors: Record<string, string> = {
  'טיוטה': 'bg-gray-500/20 text-gray-300',
  'מוכן': 'bg-green-500/20 text-green-300',
  'פורסם': 'bg-blue-500/20 text-blue-300',
}

export default function Projects() {
  const { viewMode, filter, searchQuery, sortBy, setViewMode, setFilter, setSearchQuery, setSortBy, filteredProjects } = useProjectsStore()
  const projects = filteredProjects()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="חפש פרויקט..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-[#16213E] rounded-xl border border-white/10 text-sm focus:outline-none focus:border-[#0F3460] transition-colors"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2.5 bg-[#16213E] rounded-xl border border-white/10 text-sm focus:outline-none cursor-pointer"
        >
          {sortOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <div className="flex border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2.5 ${viewMode === 'grid' ? 'bg-[#0F3460]' : 'bg-[#16213E] hover:bg-white/5'} transition-colors`}
          >
            <Grid3X3 size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2.5 ${viewMode === 'list' ? 'bg-[#0F3460]' : 'bg-[#16213E] hover:bg-white/5'} transition-colors`}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              filter === f ? 'bg-[#0F3460] text-white' : 'bg-[#16213E] text-white/50 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/editor/${project.id}`}
              className="bg-[#16213E] rounded-xl overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-200 group border border-white/5"
            >
              <div className={`h-28 bg-gradient-to-br ${project.gradient} opacity-80 group-hover:opacity-100 transition-opacity`} />
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">{project.name}</h3>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation() }} className="p-1 hover:bg-white/10 rounded">
                    <MoreVertical size={16} className="text-white/40" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>עודכן {project.updatedAt}</span>
                  <span>{project.duration}</span>
                </div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${statusColors[project.status]}`}>
                  {project.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-[#16213E] rounded-xl border border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="text-right p-3 font-medium">שם</th>
                <th className="text-right p-3 font-medium">סטטוס</th>
                <th className="text-right p-3 font-medium">משך</th>
                <th className="text-right p-3 font-medium">תאריך עדכון</th>
                <th className="text-right p-3 font-medium">גודל</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="p-3">
                    <Link to={`/editor/${project.id}`} className="hover:text-[#E94560]">{project.name}</Link>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[project.status]}`}>{project.status}</span>
                  </td>
                  <td className="p-3 text-white/60">{project.duration}</td>
                  <td className="p-3 text-white/60">{project.updatedAt}</td>
                  <td className="p-3 text-white/60">{project.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Link to="/editor/new" className="fixed bottom-6 left-6 bg-[#E94560] hover:bg-[#E94560]/80 text-white px-5 py-3 rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2 font-medium z-10">
        <Plus size={20} />
        פרויקט חדש
      </Link>
    </div>
  )
}
