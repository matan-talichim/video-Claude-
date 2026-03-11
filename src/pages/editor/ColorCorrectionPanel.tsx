import { useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'

export default function ColorCorrectionPanel() {
  const { colorCorrection, setColorCorrection, resetColorCorrection } = useEditorStore()
  const [showOriginal, setShowOriginal] = useState(false)

  const presets = [
    { name: 'רגיל', values: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: 'סינמטי', values: { brightness: 2, contrast: 15, saturation: -10, warmth: 5, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: 'חם', values: { brightness: 3, contrast: 5, saturation: 20, warmth: 15, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: 'קר', values: { brightness: 2, contrast: 10, saturation: -15, warmth: -15, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: "וינטג'", values: { brightness: 5, contrast: -5, saturation: -30, warmth: 10, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: 'שחור-לבן', values: { brightness: 5, contrast: 20, saturation: -100, warmth: 0, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: 'דרמטי', values: { brightness: -2, contrast: 20, saturation: -10, warmth: -5, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: 'חי', values: { brightness: 3, contrast: 15, saturation: 40, warmth: 5, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
    { name: 'רך', values: { brightness: 5, contrast: -10, saturation: -5, warmth: 10, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 } },
  ]

  const sliders = [
    { key: 'brightness' as const, label: 'בהירות', min: -100, max: 100 },
    { key: 'contrast' as const, label: 'ניגודיות', min: -100, max: 100 },
    { key: 'saturation' as const, label: 'רוויה', min: -100, max: 100 },
    { key: 'warmth' as const, label: 'חמימות', min: -100, max: 100 },
    { key: 'highlights' as const, label: 'בהיר', min: -100, max: 100 },
    { key: 'shadows' as const, label: 'כהה', min: -100, max: 100 },
    { key: 'sharpness' as const, label: 'חדות', min: 0, max: 100 },
    { key: 'vignette' as const, label: 'עמעום פינות', min: 0, max: 100 },
  ]

  return (
    <div className="space-y-3 p-4" dir="rtl">
      <h3 className="font-bold text-white text-sm">תיקון צבע</h3>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {presets.map((preset) => (
          <button
            key={preset.name}
            onClick={() => setColorCorrection(preset.values)}
            className="bg-white/5 hover:bg-white/10 rounded p-2 text-xs text-white transition-colors"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {sliders.map((slider) => (
        <div key={slider.key} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-20 text-right shrink-0">{slider.label}</span>
          <input
            type="range"
            min={slider.min}
            max={slider.max}
            value={colorCorrection[slider.key]}
            onChange={(e) => setColorCorrection({ [slider.key]: +e.target.value })}
            className="flex-1 accent-purple-500"
          />
          <span className="text-xs text-white w-8 text-left">{colorCorrection[slider.key]}</span>
        </div>
      ))}

      <button
        onClick={() => setShowOriginal(!showOriginal)}
        className="text-purple-400 text-sm hover:text-purple-300 transition-colors"
      >
        {showOriginal ? 'הצג עם תיקונים' : 'הצג מקור'}
      </button>

      <button
        onClick={resetColorCorrection}
        className="text-red-400 text-sm hover:text-red-300 transition-colors"
      >
        אפס תיקוני צבע
      </button>
    </div>
  )
}
