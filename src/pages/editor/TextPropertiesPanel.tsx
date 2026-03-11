import { useEditorStore } from '../../stores/editorStore'
import type { TextOverlay } from '../../stores/editorStore'

interface TextPropertiesPanelProps {
  text: TextOverlay
}

const textPresets = [
  { name: 'כותרת', fontSize: 48, fontWeight: 'bold' as const, color: '#ffffff', shadow: { color: '#000000', blur: 8, x: 0, y: 4 } },
  { name: 'כתובית', fontSize: 24, color: '#ffffff', backgroundColor: '#000000', backgroundOpacity: 60 },
  { name: 'סוציאלי', fontSize: 36, fontWeight: 'bold' as const, color: '#FFD700', outline: { color: '#000000', width: 3 } },
  { name: 'מינימלי', fontSize: 20, color: '#ffffff', fontFamily: 'Heebo' },
  { name: 'CTA', fontSize: 32, fontWeight: 'bold' as const, color: '#ffffff', backgroundColor: '#7C5CFF', backgroundOpacity: 90 },
  { name: 'ציטוט', fontSize: 28, fontStyle: 'italic' as const, color: '#E0E0E0', textAlign: 'center' as const },
]

const entranceAnimations = [
  { value: 'none', label: 'ללא' },
  { value: 'fadeIn', label: 'עמעום' },
  { value: 'slideRight', label: 'החלקה מימין' },
  { value: 'slideLeft', label: 'החלקה משמאל' },
  { value: 'slideUp', label: 'החלקה מלמטה' },
  { value: 'scaleUp', label: 'הגדלה' },
  { value: 'bounce', label: 'קפיצה' },
]

export default function TextPropertiesPanel({ text }: TextPropertiesPanelProps) {
  const { updateTextOverlay, removeTextOverlay } = useEditorStore()

  const update = (updates: Partial<TextOverlay>) => {
    updateTextOverlay(text.id, updates)
  }

  return (
    <div className="space-y-4 p-4 overflow-y-auto max-h-[60vh]" dir="rtl">
      <h3 className="font-bold text-white text-sm">עריכת טקסט</h3>

      <textarea
        value={text.text}
        onChange={(e) => update({ text: e.target.value })}
        className="w-full bg-black/30 text-white rounded p-2 text-sm border border-white/10 focus:border-purple-500 focus:outline-none resize-none"
        dir="rtl"
        rows={3}
      />

      <div>
        <span className="text-xs text-gray-400 block mb-1">גופן:</span>
        <select
          value={text.fontFamily}
          onChange={(e) => update({ fontFamily: e.target.value })}
          className="w-full bg-black/30 text-white rounded p-2 text-sm border border-white/10"
        >
          {['Arial', 'Heebo', 'David', 'Impact', 'Georgia', 'Courier New', 'Rubik', 'Assistant', 'Secular One', 'Varela Round'].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">גודל:</span>
        <input
          type="range"
          min="12"
          max="120"
          value={text.fontSize}
          onChange={(e) => update({ fontSize: +e.target.value })}
          className="flex-1 accent-purple-500"
        />
        <span className="text-white text-sm">{text.fontSize}px</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => update({ fontWeight: text.fontWeight === 'bold' ? 'normal' : 'bold' })}
          className={`px-3 py-1 rounded text-sm transition-colors ${text.fontWeight === 'bold' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'}`}
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => update({ fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={`px-3 py-1 rounded text-sm transition-colors ${text.fontStyle === 'italic' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'}`}
        >
          <em>I</em>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">צבע:</span>
        <input type="color" value={text.color} onChange={(e) => update({ color: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">רקע:</span>
        <input type="color" value={text.backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
        <input
          type="range"
          min="0"
          max="100"
          value={text.backgroundOpacity}
          onChange={(e) => update({ backgroundOpacity: +e.target.value })}
          className="flex-1 accent-purple-500"
        />
      </div>

      <div className="flex gap-2">
        {(['right', 'center', 'left'] as const).map((align) => (
          <button
            key={align}
            onClick={() => update({ textAlign: align })}
            className={`px-3 py-1 rounded text-sm transition-colors ${text.textAlign === align ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'}`}
          >
            {align === 'right' ? 'ימין' : align === 'center' ? 'מרכז' : 'שמאל'}
          </button>
        ))}
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!text.shadow}
            onChange={(e) => update({ shadow: e.target.checked ? { color: '#000000', blur: 4, x: 2, y: 2 } : null })}
            className="accent-purple-500"
          />
          <span className="text-sm text-gray-400">צל</span>
        </label>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!text.outline}
            onChange={(e) => update({ outline: e.target.checked ? { color: '#000000', width: 2 } : null })}
            className="accent-purple-500"
          />
          <span className="text-sm text-gray-400">קו מתאר</span>
        </label>
      </div>

      <div>
        <span className="text-xs text-gray-400 block mb-1">אנימציית כניסה:</span>
        <select
          value={text.animation.entrance}
          onChange={(e) => update({ animation: { ...text.animation, entrance: e.target.value } })}
          className="w-full bg-black/30 text-white rounded p-2 text-sm border border-white/10"
        >
          {entranceAnimations.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <span className="text-xs text-gray-400">התחלה:</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={text.startTime}
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
            value={text.endTime}
            onChange={(e) => update({ endTime: Math.max(text.startTime + 0.1, +e.target.value) })}
            className="w-full bg-black/30 text-white rounded px-2 py-1 text-sm border border-white/10"
          />
        </div>
      </div>

      <h4 className="text-xs text-gray-400 mt-4">תבניות מוכנות:</h4>
      <div className="grid grid-cols-2 gap-2">
        {textPresets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => update(preset as Partial<TextOverlay>)}
            className="bg-white/5 hover:bg-white/10 rounded p-2 text-sm text-white transition-colors"
          >
            {preset.name}
          </button>
        ))}
      </div>

      <button
        onClick={() => removeTextOverlay(text.id)}
        className="w-full bg-red-600/20 text-red-400 py-2 rounded mt-4 text-sm hover:bg-red-600/30 transition-colors"
      >
        מחק טקסט
      </button>
    </div>
  )
}
