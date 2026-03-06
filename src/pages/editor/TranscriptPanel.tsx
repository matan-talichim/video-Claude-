import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

const speakerColors: Record<string, string> = {
  'border-blue-400': 'bg-blue-500',
  'border-green-400': 'bg-green-500',
  'border-purple-400': 'bg-purple-500',
  'border-orange-400': 'bg-orange-500',
}

function getInitial(name: string): string {
  return name.charAt(0)
}

function getSpeakerBg(color: string): string {
  return speakerColors[color] || 'bg-accent-purple'
}

export default function TranscriptPanel() {
  const { transcript, currentTime, setCurrentTime } = useEditorStore()
  const totalWords = transcript.reduce((sum, seg) => sum + seg.words.length, 0)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="flex flex-col h-full bg-bg-panel rounded-xl border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <h3 className="font-bold text-text-primary text-sm">תמלול</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">{totalWords} מילים</span>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1 hover:bg-white/[0.06] rounded transition-colors text-text-muted hover:text-text-primary"
          >
            <Search size={14} />
          </button>
        </div>
      </div>

      {/* Inline search */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-white/[0.06] animate-fade-up">
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-1.5">
            <Search size={13} className="text-text-muted shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חפש בתמלול..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-text-muted hover:text-text-primary">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Transcript content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {transcript.map((segment, si) => (
          <div key={si} className="group">
            {/* Speaker tag */}
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded-full ${getSpeakerBg(segment.color)} flex items-center justify-center text-[10px] font-bold text-white`}>
                {getInitial(segment.speaker)}
              </div>
              <span className="text-xs font-medium text-text-primary">{segment.speaker}</span>
              <span className="text-[11px] text-text-muted font-mono">{segment.startTime}</span>
            </div>

            {/* Words */}
            <p className="text-body leading-[1.8] pr-8" dir="rtl">
              {segment.words.map((word, wi) => {
                const isPlaying = currentTime >= word.start && currentTime < word.start + 0.5
                const matchesSearch = searchQuery && word.text.includes(searchQuery)
                return (
                  <span
                    key={wi}
                    onClick={() => setCurrentTime(word.start)}
                    className={`cursor-pointer rounded px-0.5 transition-all duration-150 inline-block ${
                      isPlaying
                        ? 'bg-accent-purple/30 text-white'
                        : word.isFiller
                        ? 'bg-warning/15 text-warning relative group/filler'
                        : matchesSearch
                        ? 'bg-accent-blue/20 text-accent-blue'
                        : 'hover:bg-white/[0.06] text-text-primary'
                    }`}
                  >
                    {word.text}
                    {word.isFiller && (
                      <button
                        onClick={(e) => { e.stopPropagation() }}
                        className="absolute -top-1 -left-1 w-3.5 h-3.5 bg-warning/80 rounded-full flex items-center justify-center opacity-0 group-hover/filler:opacity-100 transition-opacity"
                      >
                        <X size={8} className="text-bg-deepest" />
                      </button>
                    )}
                    {' '}
                  </span>
                )
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
