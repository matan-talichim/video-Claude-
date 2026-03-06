import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot } from 'lucide-react'
import EditorToolbar from './EditorToolbar'
import TranscriptPanel from './TranscriptPanel'
import VideoPanel from './VideoPanel'
import TimelinePanel from './TimelinePanel'
import AISidebar from './AISidebar'
import EditorModals from './EditorModals'
import ToastContainer from '../../components/Toast'

export default function Editor() {
  const [showAI, setShowAI] = useState(true)
  const [timelineExpanded, setTimelineExpanded] = useState(true)

  return (
    <div className="h-screen flex flex-col bg-bg-deepest text-text-primary overflow-hidden">
      {/* Top nav */}
      <div className="flex items-center gap-3 px-4 py-2 glass gradient-border-bottom shrink-0 relative z-20">
        <Link to="/" className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors">
          <ArrowRight size={16} />
          חזרה
        </Link>
        <div className="flex-1" />
        {!showAI && (
          <button
            onClick={() => setShowAI(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/20 rounded-lg text-sm text-accent-purple transition-all"
          >
            <Bot size={14} />
            עוזר AI
          </button>
        )}
      </div>

      <EditorToolbar />

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* AI Sidebar - LEFT in RTL */}
        {showAI && (
          <div className="w-80 shrink-0 p-2 animate-slide-in-right">
            <AISidebar onClose={() => setShowAI(false)} />
          </div>
        )}

        {/* Center content */}
        <div className="flex-1 flex flex-col overflow-hidden p-2 gap-2">
          <div className="flex flex-1 gap-2 overflow-hidden">
            <div className="flex-1">
              <VideoPanel />
            </div>
            <div className="w-[40%] shrink-0">
              <TranscriptPanel />
            </div>
          </div>
          {timelineExpanded && (
            <div className="h-52 shrink-0 relative">
              <button
                onClick={() => setTimelineExpanded(false)}
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-3 bg-bg-elevated rounded-full border border-white/[0.06] hover:border-white/[0.12] flex items-center justify-center cursor-pointer transition-colors"
              >
                <div className="w-4 h-0.5 bg-text-muted rounded" />
              </button>
              <TimelinePanel />
            </div>
          )}
          {!timelineExpanded && (
            <button
              onClick={() => setTimelineExpanded(true)}
              className="h-8 shrink-0 bg-bg-panel rounded-xl border border-white/[0.06] hover:border-white/[0.12] flex items-center justify-center text-text-muted hover:text-text-secondary text-xs transition-colors"
            >
              הצג ציר זמן
            </button>
          )}
        </div>
      </div>

      <EditorModals />
      <ToastContainer />
    </div>
  )
}
