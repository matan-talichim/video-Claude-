import { useEditorStore } from '../../stores/editorStore'
import type { ShapeOverlay } from '../../stores/editorStore'

interface ShapePropertiesPanelProps {
  shape: ShapeOverlay
}

export default function ShapePropertiesPanel({ shape }: ShapePropertiesPanelProps) {
  const { updateShape, removeShape } = useEditorStore()

  const update = (updates: Partial<ShapeOverlay>) => {
    updateShape(shape.id, updates)
  }

  return (
    <div className="space-y-4 p-4 overflow-y-auto max-h-[60vh]" dir="rtl">
      <h3 className="font-bold text-white text-sm">עריכת צורה</h3>

      <div>
        <span className="text-xs text-gray-400 block mb-1">סוג:</span>
        <select
          value={shape.type}
          onChange={(e) => update({ type: e.target.value as ShapeOverlay['type'] })}
          className="w-full bg-black/30 text-white rounded p-2 text-sm border border-white/10"
        >
          <option value="rectangle">מלבן</option>
          <option value="circle">עיגול</option>
          <option value="triangle">משולש</option>
          <option value="star">כוכב</option>
          <option value="arrow">חץ</option>
          <option value="line">קו</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">מילוי:</span>
        <input type="color" value={shape.fill} onChange={(e) => update({ fill: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
        <input
          type="range"
          min="0"
          max="100"
          value={shape.fillOpacity}
          onChange={(e) => update({ fillOpacity: +e.target.value })}
          className="flex-1 accent-purple-500"
        />
        <span className="text-xs text-white">{shape.fillOpacity}%</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">קו:</span>
        <input type="color" value={shape.stroke} onChange={(e) => update({ stroke: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
        <input
          type="range"
          min="0"
          max="20"
          value={shape.strokeWidth}
          onChange={(e) => update({ strokeWidth: +e.target.value })}
          className="flex-1 accent-purple-500"
        />
        <span className="text-xs text-white">{shape.strokeWidth}px</span>
      </div>

      {shape.type === 'rectangle' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">פינות:</span>
          <input
            type="range"
            min="0"
            max="50"
            value={shape.cornerRadius}
            onChange={(e) => update({ cornerRadius: +e.target.value })}
            className="flex-1 accent-purple-500"
          />
          <span className="text-xs text-white">{shape.cornerRadius}px</span>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <span className="text-xs text-gray-400">התחלה:</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={shape.startTime}
            onChange={(e) => update({ startTime: Math.max(0, +e.target.value) })}
            className="w-full bg-black/30 text-white rounded px-2 py-1 text-sm border border-white/10"
          />
        </div>
        <div className="flex-1">
          <span className="text-xs text-gray-400">סיום:</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={shape.endTime}
            onChange={(e) => update({ endTime: Math.max(shape.startTime + 0.1, +e.target.value) })}
            className="w-full bg-black/30 text-white rounded px-2 py-1 text-sm border border-white/10"
          />
        </div>
      </div>

      <button
        onClick={() => removeShape(shape.id)}
        className="w-full bg-red-600/20 text-red-400 py-2 rounded mt-4 text-sm hover:bg-red-600/30 transition-colors"
      >
        מחק צורה
      </button>
    </div>
  )
}
