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

  return (
    <div className="h-screen flex flex-col bg-[#1A1A2E] text-white overflow-hidden">
      {/* Top nav */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[#16213E]/80 border-b border-white/10 shrink-0">
        <Link to="/" className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors">
          <ArrowRight size={16} />
          חזרה
        </Link>
        <div className="flex-1" />
        {!showAI && (
          <button onClick={() => setShowAI(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
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
          <div className="w-72 shrink-0 p-2">
            <AISidebar onClose={() => setShowAI(false)} />
          </div>
        )}

        {/* Center content */}
        <div className="flex-1 flex flex-col overflow-hidden p-2 gap-2">
          <div className="flex flex-1 gap-2 overflow-hidden">
            {/* Video Panel */}
            <div className="flex-1">
              <VideoPanel />
            </div>
            {/* Transcript Panel */}
            <div className="w-[40%] shrink-0">
              <TranscriptPanel />
            </div>
          </div>
          {/* Timeline */}
          <div className="h-48 shrink-0">
            <TimelinePanel />
          </div>
        </div>
      </div>

      <EditorModals />
      <ToastContainer />
    </div>
  )
}
