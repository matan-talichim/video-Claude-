import { useEditorStore } from '../../stores/editorStore'

export default function TranscriptPanel() {
  const { transcript, setCurrentTime } = useEditorStore()
  const totalWords = transcript.reduce((sum, seg) => sum + seg.words.length, 0)

  return (
    <div className="flex flex-col h-full bg-[#16213E] rounded-xl border border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className="font-bold">תמלול</h3>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>{transcript.length} דוברים</span>
          <span>{totalWords} מילים</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transcript.map((segment, si) => (
          <div key={si} className={`border-r-2 ${segment.color} pr-3`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-white/80">{segment.speaker}</span>
              <span className="text-xs text-white/30">{segment.startTime}</span>
            </div>
            <p className="text-sm leading-relaxed" dir="rtl">
              {segment.words.map((word, wi) => (
                <span
                  key={wi}
                  onClick={() => setCurrentTime(word.start)}
                  className={`cursor-pointer hover:bg-white/10 rounded px-0.5 transition-colors ${
                    word.isFiller ? 'bg-orange-500/20 text-orange-300' : ''
                  }`}
                >
                  {word.text}{' '}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
