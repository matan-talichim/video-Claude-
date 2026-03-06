import { Link } from 'react-router-dom'
import { Sparkles, Upload, Monitor, FileText, MoreVertical } from 'lucide-react'
import { useProjectsStore } from '../stores/projectsStore'

const quickActions = [
  { label: 'העלה קובץ', icon: Upload, gradient: 'from-blue-500 to-blue-700' },
  { label: 'הקלט מסך', icon: Monitor, gradient: 'from-green-500 to-green-700' },
  { label: 'צור מפרומפט', icon: Sparkles, gradient: 'from-purple-500 to-purple-700' },
  { label: 'הדבק סקריפט', icon: FileText, gradient: 'from-orange-500 to-orange-700' },
]

const statusColors: Record<string, string> = {
  'טיוטה': 'bg-gray-500/20 text-gray-300',
  'מוכן': 'bg-green-500/20 text-green-300',
  'פורסם': 'bg-blue-500/20 text-blue-300',
}

export default function Dashboard() {
  const { projects } = useProjectsStore()
  const recentProjects = projects.slice(0, 6)

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center space-y-4 pt-8">
        <h1 className="text-3xl font-bold">מה נעשה היום?</h1>
        <div className="relative max-w-2xl mx-auto">
          <input
            type="text"
            placeholder="תאר מה אתה רוצה לעשות..."
            className="w-full px-5 py-4 bg-[#16213E] rounded-2xl border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#0F3460] focus:ring-1 focus:ring-[#0F3460] transition-all"
          />
          <Sparkles size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#E94560]" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.label}
              className={`bg-gradient-to-br ${action.gradient} p-5 rounded-2xl text-center hover:scale-105 hover:shadow-xl transition-all duration-200 group`}
            >
              <Icon size={28} className="mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">{action.label}</span>
            </button>
          )
        })}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">פרויקטים אחרונים</h2>
          <Link to="/projects" className="text-sm text-[#E94560] hover:underline">הצג הכל</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentProjects.map((project) => (
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
        <div className="bg-[#16213E] rounded-xl p-4 border border-white/5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white/60">שעות מדיה</span>
            <span>14/20</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: '70%' }} />
          </div>
        </div>
        <div className="bg-[#16213E] rounded-xl p-4 border border-white/5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-white/60">AI Credits</span>
            <span>280/400</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: '70%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
