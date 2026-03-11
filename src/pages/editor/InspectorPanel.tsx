import { useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import type { SelectedCanvasItem } from '../../stores/editorStore'

interface InspectorPanelProps {
  selectedItem: SelectedCanvasItem | null
}

export default function InspectorPanel({ selectedItem }: InspectorPanelProps) {
  if (!selectedItem) {
    return <ProjectInspector />
  }

  switch (selectedItem.type) {
    case 'video':
      return <VideoInspector itemId={selectedItem.id} />
    case 'audio':
      return <AudioInspector itemId={selectedItem.id} />
    case 'text':
      return <TextInspector itemId={selectedItem.id} />
    case 'caption':
      return <CaptionInspector itemId={selectedItem.id} />
    case 'shape':
      return <ShapeInspector itemId={selectedItem.id} />
    default:
      return <ProjectInspector />
  }
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-gray-300 w-full hover:text-white">
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        {title}
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  )
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ============ PROJECT INSPECTOR ============
function ProjectInspector() {
  const projectSize = useEditorStore((s) => s.projectSize)
  const setProjectSize = useEditorStore((s) => s.setProjectSize)
  const showSafeZones = useEditorStore((s) => s.showSafeZones)
  const setShowSafeZones = useEditorStore((s) => s.setShowSafeZones)
  const bgColor = useEditorStore((s) => s.bgColor)
  const setBgColor = useEditorStore((s) => s.setBgColor)
  const versions = useEditorStore((s) => s.versions)
  const saveVersion = useEditorStore((s) => s.saveVersion)
  const restoreVersion = useEditorStore((s) => s.restoreVersion)

  const [customW, setCustomW] = useState(projectSize.width)
  const [customH, setCustomH] = useState(projectSize.height)

  const ratios = [
    { label: '16:9', desc: 'YouTube', w: 1920, h: 1080 },
    { label: '9:16', desc: 'TikTok', w: 1080, h: 1920 },
    { label: '1:1', desc: 'Instagram', w: 1080, h: 1080 },
    { label: '4:5', desc: 'Feed', w: 1080, h: 1350 },
    { label: '4:3', desc: 'מסורתי', w: 1440, h: 1080 },
    { label: '21:9', desc: 'קולנועי', w: 2560, h: 1080 },
  ]

  const matchRatio = ratios.find((r) => r.w === projectSize.width && r.h === projectSize.height)?.label || 'מותאם'

  return (
    <div className="w-72 bg-[#111118] border-r border-white/5 overflow-y-auto p-4 space-y-6" dir="rtl">
      <h3 className="text-white font-medium">⚙️ הגדרות פרויקט</h3>

      {/* Resize / Aspect Ratio */}
      <div>
        <h4 className="text-xs text-gray-400 mb-2">📐 גודל פרויקט</h4>
        <div className="grid grid-cols-3 gap-2">
          {ratios.map((ratio) => (
            <button
              key={ratio.label}
              onClick={() => { setProjectSize(ratio.w, ratio.h); setCustomW(ratio.w); setCustomH(ratio.h); }}
              className={`p-2 rounded-lg text-center border ${
                matchRatio === ratio.label ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="text-white text-xs font-medium">{ratio.label}</div>
              <div className="text-gray-500 text-[10px]">{ratio.desc}</div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          <input
            type="number"
            value={customW}
            onChange={(e) => { setCustomW(+e.target.value); setProjectSize(+e.target.value, customH); }}
            className="flex-1 bg-black/30 text-white text-xs rounded px-2 py-1"
            placeholder="רוחב"
          />
          <span className="text-gray-500 self-center">×</span>
          <input
            type="number"
            value={customH}
            onChange={(e) => { setCustomH(+e.target.value); setProjectSize(customW, +e.target.value); }}
            className="flex-1 bg-black/30 text-white text-xs rounded px-2 py-1"
            placeholder="גובה"
          />
        </div>
      </div>

      {/* Background */}
      <div>
        <h4 className="text-xs text-gray-400 mb-2">🎨 רקע</h4>
        <div className="flex gap-2 items-center">
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
          <button onClick={() => setBgColor('transparent')} className="text-xs text-gray-400 hover:text-white">שקוף</button>
        </div>
      </div>

      {/* Safe Zones */}
      <div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showSafeZones} onChange={(e) => setShowSafeZones(e.target.checked)} />
          <span className="text-xs text-gray-300">📱 הצג Safe Zones (TikTok/Reels)</span>
        </label>
      </div>

      {/* Version History */}
      <div>
        <h4 className="text-xs text-gray-400 mb-2">📋 גרסאות</h4>
        <button onClick={() => saveVersion()} className="w-full bg-white/5 hover:bg-white/10 text-white text-sm py-2 rounded-lg mb-2">
          💾 שמור גרסה
        </button>
        {versions.map((v) => (
          <div key={v.id} className="flex justify-between items-center py-1 text-xs">
            <span className="text-gray-300">{v.name}</span>
            <button onClick={() => restoreVersion(v.id)} className="text-purple-400 hover:text-purple-300">שחזר</button>
          </div>
        ))}
        {versions.length === 0 && <p className="text-gray-600 text-[10px] text-center">אין גרסאות שמורות</p>}
      </div>

      {/* Brand Templates */}
      <div>
        <h4 className="text-xs text-gray-400 mb-2">🎨 תבניות</h4>
        <button onClick={saveAsTemplate} className="w-full bg-white/5 hover:bg-white/10 text-white text-xs py-2 rounded-lg mb-1">
          💾 שמור כתבנית
        </button>
        <button onClick={loadTemplatesList} className="w-full bg-white/5 hover:bg-white/10 text-white text-xs py-2 rounded-lg">
          📂 טען תבנית
        </button>
      </div>
    </div>
  )
}

function saveAsTemplate() {
  const state = useEditorStore.getState()
  const template = {
    id: crypto.randomUUID(),
    name: state.projectName || 'תבנית חדשה',
    projectSize: state.projectSize,
    captionStyle: state.captionStyle,
    effects: state.editorEffects,
    createdAt: Date.now(),
  }
  const templates = JSON.parse(localStorage.getItem('brand_templates') || '[]')
  templates.push(template)
  localStorage.setItem('brand_templates', JSON.stringify(templates))
  useUIStore.getState().addToast('תבנית נשמרה', 'success')
}

function loadTemplatesList() {
  const templates = JSON.parse(localStorage.getItem('brand_templates') || '[]')
  if (templates.length === 0) {
    useUIStore.getState().addToast('אין תבניות שמורות', 'info')
    return
  }
  // Load the latest template
  const template = templates[templates.length - 1]
  if (template.projectSize) {
    useEditorStore.getState().setProjectSize(template.projectSize.width, template.projectSize.height)
  }
  if (template.captionStyle) {
    useEditorStore.getState().setCaptionStyle(template.captionStyle)
  }
  useUIStore.getState().addToast('תבנית הוחלה', 'success')
}

// ============ VIDEO INSPECTOR ============
function VideoInspector({ itemId: _itemId }: { itemId: string }) {
  const [activeTab, setActiveTab] = useState('עריכה')
  const colorCorrection = useEditorStore((s) => s.colorCorrection)
  const setColorCorrection = useEditorStore((s) => s.setColorCorrection)
  const resetColorCorrection = useEditorStore((s) => s.resetColorCorrection)
  const clipSpeed = useEditorStore((s) => s.clipSpeed)
  const clipReversed = useEditorStore((s) => s.clipReversed)
  const setClipSpeed = useEditorStore((s) => s.setClipSpeed)
  const setClipReversed = useEditorStore((s) => s.setClipReversed)
  const volume = useEditorStore((s) => s.volume)
  const setVolume = useEditorStore((s) => s.setVolume)
  const openModal = useUIStore((s) => s.openModal)

  const filters = [
    { name: 'ללא', filter: 'none' },
    { name: 'חם', filter: 'sepia(0.3) saturate(1.3) brightness(1.05)' },
    { name: 'קר', filter: 'saturate(0.8) hue-rotate(10deg) brightness(1.05)' },
    { name: "וינטג'", filter: 'sepia(0.5) contrast(0.9) brightness(1.1)' },
    { name: 'דרמטי', filter: 'contrast(1.3) saturate(0.8) brightness(0.95)' },
    { name: 'שחור-לבן', filter: 'grayscale(1)' },
    { name: 'חי', filter: 'saturate(1.5) contrast(1.1)' },
    { name: 'רך', filter: 'contrast(0.9) brightness(1.1) saturate(0.9)' },
    { name: 'סינמטי', filter: 'contrast(1.15) saturate(0.9) brightness(1.02)' },
  ]

  const [selectedFilter, setSelectedFilter] = useState('none')

  return (
    <div className="w-72 bg-[#111118] border-r border-white/5 overflow-y-auto" dir="rtl">
      {/* Tabs */}
      <div className="flex border-b border-white/5 px-1">
        {['עריכה', 'אפקטים', 'AI'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs ${activeTab === tab ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-5">
        {activeTab === 'עריכה' && (
          <>
            {/* Speed */}
            <InspectorSection title="⚡ מהירות">
              <div className="flex gap-1 flex-wrap">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((s) => (
                  <button
                    key={s}
                    onClick={() => setClipSpeed(s)}
                    className={`text-xs px-2 py-1 rounded ${clipSpeed === s ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-300'}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={clipReversed} onChange={(e) => setClipReversed(e.target.checked)} />
                <span className="text-xs text-gray-300">↺ הפוך</span>
              </label>
            </InspectorSection>

            {/* Volume */}
            <InspectorSection title="🔊 אודיו">
              <div className="flex items-center gap-2">
                <span className="text-sm">{volume === 0 ? '🔇' : '🔊'}</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={volume}
                  onChange={(e) => setVolume(+e.target.value)}
                  className="flex-1"
                />
                <span className="text-xs text-white w-8">{volume}%</span>
              </div>
              <button onClick={() => openModal('detachAudio')} className="text-purple-400 text-xs mt-1">
                🔊 נתק אודיו
              </button>
              <button onClick={() => openModal('noiseRemoval')} className="text-purple-400 text-xs">
                ✨ נקה אודיו
              </button>
            </InspectorSection>

            {/* Crop shortcuts */}
            <InspectorSection title="🔲 Crop">
              <div className="grid grid-cols-4 gap-1 text-xs">
                {['חופשי', '16:9', '9:16', '1:1'].map((r) => (
                  <button key={r} className="bg-white/5 hover:bg-white/10 rounded py-1 text-gray-300">
                    {r}
                  </button>
                ))}
              </div>
            </InspectorSection>

            {/* Opacity */}
            <InspectorSection title="👁 שקיפות">
              <input type="range" min="0" max="100" defaultValue={100} className="w-full" />
            </InspectorSection>
          </>
        )}

        {activeTab === 'אפקטים' && (
          <>
            {/* Filters */}
            <InspectorSection title="🎨 פילטרים">
              <div className="grid grid-cols-3 gap-1">
                {filters.map((f) => (
                  <button
                    key={f.name}
                    onClick={() => {
                      setSelectedFilter(f.filter)
                      useEditorStore.getState().setEditorEffect('videoFilter', f.filter)
                    }}
                    className={`p-1 rounded text-[10px] ${selectedFilter === f.filter ? 'ring-2 ring-purple-500' : 'hover:bg-white/10'}`}
                  >
                    <div
                      className="w-full aspect-video bg-gray-700 rounded mb-0.5"
                      style={{ filter: f.filter !== 'none' ? f.filter : undefined }}
                    />
                    <span className="text-gray-300">{f.name}</span>
                  </button>
                ))}
              </div>
            </InspectorSection>

            {/* Adjust */}
            <InspectorSection title="🎚 התאמות">
              {([
                { key: 'brightness' as const, label: 'בהירות', min: -100, max: 100 },
                { key: 'contrast' as const, label: 'ניגודיות', min: -100, max: 100 },
                { key: 'saturation' as const, label: 'רוויה', min: -100, max: 100 },
                { key: 'warmth' as const, label: 'חום', min: -100, max: 100 },
                { key: 'sharpness' as const, label: 'חדות', min: 0, max: 100 },
              ]).map((adj) => (
                <div key={adj.key} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-12">{adj.label}</span>
                  <input
                    type="range"
                    min={adj.min}
                    max={adj.max}
                    value={colorCorrection[adj.key]}
                    onChange={(e) => setColorCorrection({ [adj.key]: +e.target.value })}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-white w-6">{colorCorrection[adj.key]}</span>
                </div>
              ))}
              <button onClick={resetColorCorrection} className="text-xs text-red-400 mt-2">
                ↩ אפס הכל
              </button>
            </InspectorSection>

            {/* Animate entrance/exit */}
            <InspectorSection title="✨ אנימציה">
              <div className="space-y-2">
                <div>
                  <span className="text-[10px] text-gray-400">כניסה:</span>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {['ללא', 'עמעום', 'החלקה', 'הגדלה', 'סיבוב', 'קפיצה'].map((a) => (
                      <button key={a} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-300 hover:bg-white/10">
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400">יציאה:</span>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {['ללא', 'עמעום', 'החלקה', 'הקטנה', 'סיבוב'].map((a) => (
                      <button key={a} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-300 hover:bg-white/10">
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </InspectorSection>
          </>
        )}

        {activeTab === 'AI' && (
          <InspectorSection title="🤖 כלי AI">
            <div className="space-y-2">
              {[
                { label: '✂️ Smart Cut (הסר שתיקות)', modal: 'silence' },
                { label: '🧹 הסר מילות מילוי', modal: 'fillerWords' },
                { label: '👁 קשר עין', modal: 'eyeContact' },
                { label: '🎯 מרכז דובר', modal: 'speakerCenter' },
                { label: '🔊 נקה אודיו', modal: 'noiseRemoval' },
                { label: '💬 כתוביות אוטומטיות', modal: 'captions' },
                { label: '🎬 זהה סצנות', modal: 'sceneDetection' },
                { label: '📱 צור קליפים לרשתות', modal: 'socialClips' },
              ].map((tool) => (
                <button
                  key={tool.modal}
                  onClick={() => openModal(tool.modal)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white text-xs py-2 rounded-lg"
                >
                  {tool.label}
                </button>
              ))}
            </div>
          </InspectorSection>
        )}
      </div>
    </div>
  )
}

// ============ AUDIO INSPECTOR ============
function AudioInspector({ itemId: _itemId }: { itemId: string }) {
  const volume = useEditorStore((s) => s.volume)
  const setVolume = useEditorStore((s) => s.setVolume)
  const noiseReduction = useEditorStore((s) => s.noiseReduction)
  const setNoiseReduction = useEditorStore((s) => s.setNoiseReduction)
  const noiseReductionIntensity = useEditorStore((s) => s.noiseReductionIntensity)
  const setNoiseReductionIntensity = useEditorStore((s) => s.setNoiseReductionIntensity)
  const eq = useEditorStore((s) => s.eq)
  const setEq = useEditorStore((s) => s.setEq)

  return (
    <div className="w-72 bg-[#111118] border-r border-white/5 overflow-y-auto p-4 space-y-5" dir="rtl">
      <h3 className="text-white font-medium text-sm">🎵 מאפייני אודיו</h3>

      <InspectorSection title="🔊 עוצמה">
        <div className="flex items-center gap-2">
          <input type="range" min="0" max="200" value={volume} onChange={(e) => setVolume(+e.target.value)} className="flex-1" />
          <span className="text-xs text-white w-8">{volume}%</span>
        </div>
      </InspectorSection>

      <InspectorSection title="🎚 אקולייזר">
        {([
          { key: 'bass', label: 'בס' },
          { key: 'mid', label: 'אמצע' },
          { key: 'treble', label: 'טרבל' },
        ] as const).map((band) => (
          <div key={band.key} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-10">{band.label}</span>
            <input
              type="range"
              min="-12"
              max="12"
              value={eq[band.key]}
              onChange={(e) => setEq({ ...eq, [band.key]: +e.target.value })}
              className="flex-1"
            />
            <span className="text-[10px] text-white w-6">{eq[band.key]}</span>
          </div>
        ))}
      </InspectorSection>

      <InspectorSection title="🔇 הסרת רעשים">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={noiseReduction} onChange={(e) => setNoiseReduction(e.target.checked)} />
          <span className="text-xs text-gray-300">הפעל הסרת רעשים</span>
        </label>
        {noiseReduction && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-400">עוצמה</span>
            <input
              type="range"
              min="0"
              max="100"
              value={noiseReductionIntensity}
              onChange={(e) => setNoiseReductionIntensity(+e.target.value)}
              className="flex-1"
            />
            <span className="text-[10px] text-white">{noiseReductionIntensity}%</span>
          </div>
        )}
      </InspectorSection>
    </div>
  )
}

// ============ TEXT INSPECTOR ============
function TextInspector({ itemId }: { itemId: string }) {
  const text = useEditorStore((s) => s.textOverlays.find((t) => t.id === itemId))
  const updateTextOverlay = useEditorStore((s) => s.updateTextOverlay)
  const removeTextOverlay = useEditorStore((s) => s.removeTextOverlay)

  if (!text) return <ProjectInspector />

  return (
    <div className="w-72 bg-[#111118] border-r border-white/5 overflow-y-auto p-4 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium text-sm">T מאפייני טקסט</h3>
        <button onClick={() => removeTextOverlay(itemId)} className="text-red-400 text-xs">🗑 מחק</button>
      </div>

      {/* Text content */}
      <InspectorSection title="📝 תוכן">
        <textarea
          value={text.text}
          onChange={(e) => updateTextOverlay(itemId, { text: e.target.value })}
          className="w-full bg-black/30 text-white text-sm rounded px-2 py-2 resize-none h-16"
          dir="rtl"
        />
      </InspectorSection>

      {/* Font */}
      <InspectorSection title="🔤 גופן">
        <select
          value={text.fontFamily}
          onChange={(e) => updateTextOverlay(itemId, { fontFamily: e.target.value })}
          className="w-full bg-black/30 text-white text-xs rounded px-2 py-1"
        >
          <option value="Heebo">Heebo</option>
          <option value="Assistant">Assistant</option>
          <option value="Rubik">Rubik</option>
          <option value="Arial">Arial</option>
          <option value="Impact">Impact</option>
        </select>

        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <label className="text-[10px] text-gray-500">גודל:</label>
            <input
              type="number"
              value={text.fontSize}
              onChange={(e) => updateTextOverlay(itemId, { fontSize: +e.target.value })}
              className="w-full bg-black/30 text-white text-xs rounded px-2 py-1"
            />
          </div>
          <div className="flex gap-1 self-end">
            <button
              onClick={() => updateTextOverlay(itemId, { fontWeight: text.fontWeight === 'bold' ? 'normal' : 'bold' })}
              className={`px-2 py-1 rounded text-xs ${text.fontWeight === 'bold' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'}`}
            >
              <b>B</b>
            </button>
            <button
              onClick={() => updateTextOverlay(itemId, { fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic' })}
              className={`px-2 py-1 rounded text-xs ${text.fontStyle === 'italic' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'}`}
            >
              <i>I</i>
            </button>
          </div>
        </div>
      </InspectorSection>

      {/* Colors */}
      <InspectorSection title="🎨 צבעים">
        <div className="flex gap-3">
          <div>
            <label className="text-[10px] text-gray-500">צבע:</label>
            <input type="color" value={text.color} onChange={(e) => updateTextOverlay(itemId, { color: e.target.value })} className="w-8 h-8 rounded cursor-pointer block" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">רקע:</label>
            <input type="color" value={text.backgroundColor === 'transparent' ? '#000000' : text.backgroundColor} onChange={(e) => updateTextOverlay(itemId, { backgroundColor: e.target.value, backgroundOpacity: 0.7 })} className="w-8 h-8 rounded cursor-pointer block" />
          </div>
        </div>
      </InspectorSection>

      {/* Position */}
      <InspectorSection title="📍 מיקום">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-gray-500">X:</label>
            <input
              type="number"
              value={Math.round(text.x)}
              onChange={(e) => updateTextOverlay(itemId, { x: +e.target.value })}
              className="bg-black/30 text-white rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="text-gray-500">Y:</label>
            <input
              type="number"
              value={Math.round(text.y)}
              onChange={(e) => updateTextOverlay(itemId, { y: +e.target.value })}
              className="bg-black/30 text-white rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="text-gray-500">רוחב:</label>
            <input
              type="number"
              value={Math.round(text.width)}
              onChange={(e) => updateTextOverlay(itemId, { width: +e.target.value })}
              className="bg-black/30 text-white rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="text-gray-500">סיבוב:</label>
            <input
              type="number"
              value={text.rotation}
              onChange={(e) => updateTextOverlay(itemId, { rotation: +e.target.value })}
              className="bg-black/30 text-white rounded px-2 py-1 w-full"
            />
          </div>
        </div>
      </InspectorSection>

      {/* Animation */}
      <InspectorSection title="✨ אנימציה">
        <div className="space-y-2">
          <div>
            <span className="text-[10px] text-gray-400">כניסה:</span>
            <div className="flex gap-1 flex-wrap mt-1">
              {['none', 'fade', 'slide', 'zoom', 'rotate', 'bounce'].map((a) => {
                const labels: Record<string, string> = { none: 'ללא', fade: 'עמעום', slide: 'החלקה', zoom: 'הגדלה', rotate: 'סיבוב', bounce: 'קפיצה' }
                return (
                  <button
                    key={a}
                    onClick={() => updateTextOverlay(itemId, { animation: { ...text.animation, entrance: a } })}
                    className={`text-[10px] px-2 py-0.5 rounded ${text.animation.entrance === a ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-300'}`}
                  >
                    {labels[a]}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <span className="text-[10px] text-gray-400">יציאה:</span>
            <div className="flex gap-1 flex-wrap mt-1">
              {['none', 'fade', 'slide', 'shrink', 'rotate'].map((a) => {
                const labels: Record<string, string> = { none: 'ללא', fade: 'עמעום', slide: 'החלקה', shrink: 'הקטנה', rotate: 'סיבוב' }
                return (
                  <button
                    key={a}
                    onClick={() => updateTextOverlay(itemId, { animation: { ...text.animation, exit: a } })}
                    className={`text-[10px] px-2 py-0.5 rounded ${text.animation.exit === a ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-300'}`}
                  >
                    {labels[a]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </InspectorSection>

      {/* Timing */}
      <InspectorSection title="⏱ תזמון">
        <div className="flex gap-2 text-xs">
          <div>
            <label className="text-gray-500">התחלה:</label>
            <input
              type="text"
              value={formatTime(text.startTime)}
              readOnly
              className="bg-black/30 text-white rounded px-2 py-1 w-20"
            />
          </div>
          <div>
            <label className="text-gray-500">סוף:</label>
            <input
              type="text"
              value={formatTime(text.endTime)}
              readOnly
              className="bg-black/30 text-white rounded px-2 py-1 w-20"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}

// ============ CAPTION INSPECTOR ============
function CaptionInspector({ itemId }: { itemId: string }) {
  const captionStyle = useEditorStore((s) => s.captionStyle)
  const setCaptionStyle = useEditorStore((s) => s.setCaptionStyle)
  const captions = useEditorStore((s) => s.captions)
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null)
  const [charsPerSubtitle, setCharsPerSubtitle] = useState(40)

  const caption = captions.find((c) => c.id === itemId)

  return (
    <div className="w-72 bg-[#111118] border-r border-white/5 overflow-y-auto p-4 space-y-5" dir="rtl">
      <h3 className="text-white font-medium text-sm">💬 מאפייני כתובית</h3>

      {caption && (
        <>
          {/* Caption text with selectable words */}
          <div className="bg-black/30 rounded-lg p-3">
            {caption.text.split(' ').map((word, i) => (
              <span
                key={i}
                onClick={() => setSelectedWordIndex(selectedWordIndex === i ? null : i)}
                className={`inline-block px-0.5 cursor-pointer hover:bg-purple-500/20 rounded ${
                  selectedWordIndex === i ? 'bg-purple-500/30 ring-1 ring-purple-500' : ''
                }`}
              >
                {word}{' '}
              </span>
            ))}
          </div>

          {/* Word-level styling */}
          {selectedWordIndex !== null && (
            <div className="bg-purple-500/10 rounded-lg p-3 space-y-2">
              <span className="text-xs text-purple-400">עיצוב מילה: &quot;{caption.text.split(' ')[selectedWordIndex]}&quot;</span>
              <div className="flex gap-2">
                <button className="px-2 py-1 bg-white/10 rounded text-xs"><b>B</b></button>
                <button className="px-2 py-1 bg-white/10 rounded text-xs"><i>I</i></button>
                <button className="px-2 py-1 bg-white/10 rounded text-xs"><u>U</u></button>
                <input type="color" defaultValue="#FFFFFF" className="w-6 h-6 rounded" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Caption style */}
      <InspectorSection title="🎨 סגנון">
        <div className="grid grid-cols-2 gap-1">
          {(['classic', 'modern', 'karaoke', 'minimal'] as const).map((preset) => {
            const labels: Record<string, string> = { classic: 'קלאסי', modern: 'מודרני', karaoke: 'קריוקי', minimal: 'מינימלי' }
            return (
              <button
                key={preset}
                onClick={() => setCaptionStyle({ preset })}
                className={`text-xs p-2 rounded-lg ${captionStyle.preset === preset ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-300'}`}
              >
                {labels[preset]}
              </button>
            )
          })}
        </div>
      </InspectorSection>

      {/* Font size */}
      <InspectorSection title="🔤 גופן">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">גודל:</span>
          <input
            type="range"
            min="12"
            max="64"
            value={captionStyle.fontSize}
            onChange={(e) => setCaptionStyle({ fontSize: +e.target.value })}
            className="flex-1"
          />
          <span className="text-[10px] text-white">{captionStyle.fontSize}</span>
        </div>
      </InspectorSection>

      {/* Colors */}
      <InspectorSection title="🎨 צבעים">
        <div className="flex gap-3">
          <div>
            <label className="text-[10px] text-gray-500">טקסט:</label>
            <input type="color" value={captionStyle.textColor} onChange={(e) => setCaptionStyle({ textColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer block" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">רקע:</label>
            <input type="color" value={captionStyle.bgColor} onChange={(e) => setCaptionStyle({ bgColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer block" />
          </div>
        </div>
      </InspectorSection>

      {/* Characters per subtitle */}
      <div>
        <label className="text-xs text-gray-400">תווים לכתובית:</label>
        <input
          type="range"
          min="10"
          max="80"
          value={charsPerSubtitle}
          onChange={(e) => setCharsPerSubtitle(+e.target.value)}
          className="w-full"
        />
        <span className="text-xs text-white">{charsPerSubtitle} תווים</span>
      </div>

      {/* Manual subtitle */}
      <button className="w-full bg-white/5 text-purple-400 text-xs py-2 rounded-lg">
        + הוסף כתובית ידנית
      </button>
    </div>
  )
}

// ============ SHAPE INSPECTOR ============
function ShapeInspector({ itemId }: { itemId: string }) {
  const shape = useEditorStore((s) => s.shapes.find((sh) => sh.id === itemId))
  const updateShape = useEditorStore((s) => s.updateShape)
  const removeShape = useEditorStore((s) => s.removeShape)

  if (!shape) return <ProjectInspector />

  return (
    <div className="w-72 bg-[#111118] border-r border-white/5 overflow-y-auto p-4 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium text-sm">🔷 מאפייני צורה</h3>
        <button onClick={() => removeShape(itemId)} className="text-red-400 text-xs">🗑 מחק</button>
      </div>

      <InspectorSection title="🎨 מילוי">
        <div className="flex items-center gap-2">
          <input type="color" value={shape.fill} onChange={(e) => updateShape(itemId, { fill: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
          <div className="flex-1">
            <label className="text-[10px] text-gray-500">שקיפות:</label>
            <input
              type="range"
              min="0"
              max="100"
              value={shape.fillOpacity * 100}
              onChange={(e) => updateShape(itemId, { fillOpacity: +e.target.value / 100 })}
              className="w-full"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="🖊 קו מתאר">
        <div className="flex items-center gap-2">
          <input type="color" value={shape.stroke} onChange={(e) => updateShape(itemId, { stroke: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
          <div className="flex-1">
            <label className="text-[10px] text-gray-500">עובי:</label>
            <input
              type="range"
              min="0"
              max="20"
              value={shape.strokeWidth}
              onChange={(e) => updateShape(itemId, { strokeWidth: +e.target.value })}
              className="w-full"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="📍 מיקום">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-gray-500">X:</label>
            <input type="number" value={Math.round(shape.x)} onChange={(e) => updateShape(itemId, { x: +e.target.value })} className="bg-black/30 text-white rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="text-gray-500">Y:</label>
            <input type="number" value={Math.round(shape.y)} onChange={(e) => updateShape(itemId, { y: +e.target.value })} className="bg-black/30 text-white rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="text-gray-500">רוחב:</label>
            <input type="number" value={Math.round(shape.width)} onChange={(e) => updateShape(itemId, { width: +e.target.value })} className="bg-black/30 text-white rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="text-gray-500">גובה:</label>
            <input type="number" value={Math.round(shape.height)} onChange={(e) => updateShape(itemId, { height: +e.target.value })} className="bg-black/30 text-white rounded px-2 py-1 w-full" />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
