import { useEditorStore } from '../../stores/editorStore'

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function SpeedPanel() {
  const { clipSpeed, clipReversed, setClipSpeed, setClipReversed, duration } = useEditorStore()

  const speedPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

  return (
    <div className="space-y-3 p-4" dir="rtl">
      <h3 className="font-bold text-white text-sm">מהירות</h3>

      <div className="grid grid-cols-4 gap-2">
        {speedPresets.map((speed) => (
          <button
            key={speed}
            onClick={() => setClipSpeed(speed)}
            className={`py-2 rounded text-sm transition-colors ${
              clipSpeed === speed
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">מותאם:</span>
        <input
          type="range"
          min="0.1"
          max="8"
          step="0.05"
          value={clipSpeed}
          onChange={(e) => setClipSpeed(+e.target.value)}
          className="flex-1 accent-purple-500"
        />
        <span className="text-white text-sm w-10">{clipSpeed.toFixed(2)}x</span>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={clipReversed}
          onChange={(e) => setClipReversed(e.target.checked)}
          className="accent-purple-500"
        />
        <span className="text-sm text-gray-300">הפוך (נגן אחורה)</span>
      </label>

      <div className="text-xs text-gray-500 mt-2">
        <div>אורך מקורי: {formatTime(duration)}</div>
        <div>אורך חדש: {formatTime(duration / clipSpeed)}</div>
      </div>
    </div>
  )
}
