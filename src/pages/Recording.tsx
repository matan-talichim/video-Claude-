import { useState } from 'react'
import { Monitor, Users, Mic, Copy, Circle, Square, UserCircle, X } from 'lucide-react'

const recordingTypes = [
  { id: 'screen', label: 'הקלטת מסך', description: 'הקלט את המסך שלך עם או בלי מצלמה', icon: Monitor, gradient: 'from-blue-500 to-blue-700' },
  { id: 'remote', label: 'הקלטה מרחוק', description: 'הזמן אורחים להקלטה משותפת', icon: Users, gradient: 'from-green-500 to-green-700' },
  { id: 'audio', label: 'הקלטת אודיו', description: 'הקלט אודיו בלבד', icon: Mic, gradient: 'from-purple-500 to-purple-700' },
]

export default function Recording() {
  const [activeType, setActiveType] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [webcamShape, setWebcamShape] = useState<'circle' | 'square' | 'off'>('circle')

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startRecording = () => {
    setIsRecording(true)
    const interval = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">הקלטה</h1>

      {!activeType ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {recordingTypes.map((type) => {
            const Icon = type.icon
            return (
              <button
                key={type.id}
                onClick={() => setActiveType(type.id)}
                className={`bg-gradient-to-br ${type.gradient} p-8 rounded-2xl text-center hover:scale-105 hover:shadow-xl transition-all duration-200 group`}
              >
                <Icon size={48} className="mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-lg font-bold mb-2">{type.label}</h3>
                <p className="text-sm text-text-secondary">{type.description}</p>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="bg-bg-card rounded-xl p-6 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">{recordingTypes.find((t) => t.id === activeType)?.label}</h2>
            <button onClick={() => { setActiveType(null); setIsRecording(false); setRecordingTime(0) }} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>

          {activeType === 'screen' && (
            <div className="space-y-6">
              <div className="aspect-video bg-black/50 rounded-xl flex items-center justify-center border border-white/[0.06]">
                <p className="text-text-muted text-sm">תצוגה מקדימה של המסך</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-text-secondary">מצלמה:</span>
                <div className="flex gap-2">
                  {([['circle', Circle], ['square', Square], ['off', X]] as const).map(([shape, Icon]) => (
                    <button
                      key={shape}
                      onClick={() => setWebcamShape(shape as typeof webcamShape)}
                      className={`p-2 rounded-lg transition-colors ${webcamShape === shape ? 'bg-accent-blue/20' : 'bg-white/5 hover:bg-white/10'}`}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1">מיקרופון</label>
                <select className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none cursor-pointer">
                  <option>מיקרופון ברירת מחדל</option>
                  <option>מיקרופון חיצוני</option>
                </select>
              </div>
              <button
                onClick={startRecording}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {isRecording ? `⏹ עצור הקלטה ${formatTime(recordingTime)}` : '⏺ התחל הקלטה'}
              </button>
            </div>
          )}

          {activeType === 'remote' && (
            <div className="space-y-6">
              <div>
                <label className="text-sm text-text-secondary block mb-1">שם החדר</label>
                <input defaultValue="הקלטה משותפת" className="w-full px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm focus:outline-none focus:border-accent-purple/30" />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-1">קישור להזמנה</label>
                <div className="flex gap-2">
                  <input readOnly value="https://studio-ai.app/room/abc123" className="flex-1 px-4 py-2.5 bg-white/5 rounded-xl border border-white/[0.06] text-sm text-text-secondary" />
                  <button className="px-4 py-2.5 bg-accent-blue/20 hover:bg-accent-blue/20/80 rounded-xl transition-colors"><Copy size={16} /></button>
                </div>
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-2">משתתפים</label>
                <div className="grid grid-cols-2 gap-4">
                  {['מתן (מארח)', 'אורח 1', 'אורח 2', 'אורח 3'].map((name, i) => (
                    <div key={i} className="aspect-video bg-black/30 rounded-xl flex items-center justify-center border border-white/[0.06]">
                      <div className="text-center">
                        <UserCircle size={32} className="mx-auto text-text-muted mb-1" />
                        <span className="text-xs text-text-muted">{name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button className="w-full py-4 bg-green-500 hover:bg-green-600 rounded-xl font-bold text-lg transition-colors">פתח חדר</button>
            </div>
          )}

          {activeType === 'audio' && (
            <div className="space-y-6 text-center">
              <div className="h-24 bg-white/5 rounded-xl flex items-center justify-center">
                <div className="flex items-end gap-0.5 h-12">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full transition-all"
                      style={{ height: `${isRecording ? 10 + Math.random() * 90 : 10}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-4xl font-mono">{formatTime(recordingTime)}</div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden w-48 mx-auto">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: isRecording ? '75%' : '0%' }} />
              </div>
              <p className="text-xs text-text-muted">רמת מיקרופון</p>
              <button
                onClick={isRecording ? () => { setIsRecording(false); setRecordingTime(0) } : startRecording}
                className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center transition-all ${
                  isRecording ? 'bg-red-600 hover:bg-red-700 scale-90' : 'bg-red-500 hover:bg-red-600 hover:scale-110'
                }`}
              >
                {isRecording ? <Square size={28} fill="white" /> : <Circle size={28} fill="white" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
