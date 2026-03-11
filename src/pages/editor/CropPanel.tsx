import { useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'

export default function CropPanel() {
  const { clipCrop, setClipCrop, resetClipCrop } = useEditorStore()
  const [activeRatio, setActiveRatio] = useState('חופשי')

  const ratios = ['חופשי', '16:9', '9:16', '1:1', '4:5', '4:3']

  const applyCropRatio = (ratio: string) => {
    setActiveRatio(ratio)
    if (ratio === 'חופשי') return
    // Reset crop when changing ratio preset
    resetClipCrop()
  }

  return (
    <div className="space-y-3 p-4" dir="rtl">
      <h3 className="font-bold text-white text-sm">חיתוך</h3>

      <div className="flex gap-2 flex-wrap">
        {ratios.map((ratio) => (
          <button
            key={ratio}
            onClick={() => applyCropRatio(ratio)}
            className={`text-xs rounded px-2 py-1 transition-colors ${
              activeRatio === ratio
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15'
            }`}
          >
            {ratio}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-400">למעלה:</span>
          <input
            type="number"
            min={0}
            max={50}
            value={clipCrop.top}
            onChange={(e) => setClipCrop({ top: Math.max(0, Math.min(50, +e.target.value)) })}
            className="w-16 bg-black/30 text-white rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">למטה:</span>
          <input
            type="number"
            min={0}
            max={50}
            value={clipCrop.bottom}
            onChange={(e) => setClipCrop({ bottom: Math.max(0, Math.min(50, +e.target.value)) })}
            className="w-16 bg-black/30 text-white rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">ימין:</span>
          <input
            type="number"
            min={0}
            max={50}
            value={clipCrop.right}
            onChange={(e) => setClipCrop({ right: Math.max(0, Math.min(50, +e.target.value)) })}
            className="w-16 bg-black/30 text-white rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-400">שמאל:</span>
          <input
            type="number"
            min={0}
            max={50}
            value={clipCrop.left}
            onChange={(e) => setClipCrop({ left: Math.max(0, Math.min(50, +e.target.value)) })}
            className="w-16 bg-black/30 text-white rounded px-2 py-1"
          />
        </div>
      </div>

      <button
        onClick={resetClipCrop}
        className="w-full text-red-400 text-sm hover:text-red-300 transition-colors py-1"
      >
        אפס חיתוך
      </button>
    </div>
  )
}
