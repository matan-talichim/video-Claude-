import { useState } from 'react'
import { Volume2, VolumeX, Lock, Unlock, Eye, EyeOff, ChevronDown, ChevronLeft, GripVertical } from 'lucide-react'
import { useTimelineStore, type TimelineTrack } from '../../../stores/timelineStore'

interface TrackHeaderProps {
  track: TimelineTrack
  onDragStart?: () => void
}

export default function TrackHeader({ track }: TrackHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(track.label)
  const { toggleTrackMute, toggleTrackLock, toggleTrackVisibility, toggleTrackCollapse, renameTrack } = useTimelineStore()

  const handleNameSubmit = () => {
    if (editName.trim()) {
      renameTrack(track.id, editName.trim())
    } else {
      setEditName(track.label)
    }
    setIsEditing(false)
  }

  return (
    <div
      className={`flex items-center gap-1 px-2 border-s border-white/[0.06] bg-bg-panel shrink-0 transition-opacity ${
        track.muted ? 'opacity-50' : ''
      } ${track.collapsed ? 'h-6' : 'h-10'}`}
      style={{ width: 140 }}
    >
      {/* Drag handle */}
      <div className="cursor-grab text-text-muted/30 hover:text-text-muted transition-colors">
        <GripVertical size={10} />
      </div>

      {/* Track icon + name */}
      <span className="text-xs shrink-0">{track.icon}</span>
      {isEditing ? (
        <input
          className="text-[10px] bg-white/[0.06] text-text-primary px-1 py-0.5 rounded w-16 outline-none border border-accent-purple/40"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleNameSubmit}
          onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
          autoFocus
        />
      ) : (
        <span
          className="text-[10px] text-text-secondary truncate cursor-pointer hover:text-text-primary transition-colors max-w-[50px]"
          onDoubleClick={() => { setIsEditing(true); setEditName(track.label) }}
          title={track.label}
        >
          {track.label}
        </span>
      )}

      {/* Controls */}
      <div className="flex items-center gap-0 ms-auto">
        <HeaderButton
          active={track.muted}
          activeColor="text-red-400"
          onClick={() => toggleTrackMute(track.id)}
          title={track.muted ? 'בטל השתקה' : 'השתק'}
        >
          {track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
        </HeaderButton>
        <HeaderButton
          active={track.locked}
          activeColor="text-yellow-400"
          onClick={() => toggleTrackLock(track.id)}
          title={track.locked ? 'בטל נעילה' : 'נעל'}
        >
          {track.locked ? <Lock size={10} /> : <Unlock size={10} />}
        </HeaderButton>
        <HeaderButton
          active={!track.visible}
          activeColor="text-gray-500"
          onClick={() => toggleTrackVisibility(track.id)}
          title={track.visible ? 'הסתר' : 'הצג'}
        >
          {track.visible ? <Eye size={10} /> : <EyeOff size={10} />}
        </HeaderButton>
        <HeaderButton
          active={track.collapsed}
          activeColor="text-text-muted"
          onClick={() => toggleTrackCollapse(track.id)}
          title={track.collapsed ? 'הרחב' : 'כווץ'}
        >
          {track.collapsed ? <ChevronLeft size={10} /> : <ChevronDown size={10} />}
        </HeaderButton>
      </div>
    </div>
  )
}

function HeaderButton({ children, active, activeColor, onClick, title }: {
  children: React.ReactNode
  active: boolean
  activeColor: string
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`p-0.5 rounded transition-colors ${
        active ? `${activeColor} hover:opacity-80` : 'text-text-muted/40 hover:text-text-muted hover:bg-white/[0.04]'
      }`}
      title={title}
    >
      {children}
    </button>
  )
}
