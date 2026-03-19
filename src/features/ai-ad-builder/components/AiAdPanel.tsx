import { useState, useRef, useEffect } from 'react'
import { X, Clapperboard, Play, RotateCcw, Download, CheckCircle, Loader2, AlertCircle, Film } from 'lucide-react'
import { useAiAdStore } from '../store/aiAdStore'
import { runAiAdPipeline } from '../services/aiAdService'

interface AiAdPanelProps {
  isOpen: boolean
  onClose: () => void
}

const EXAMPLE_SCRIPT = `מתן מציג את האפליקציה החדשה
המסך מציג את ממשק העריכה
לקוחות מרוצים משתמשים בטאבלט
לוגו החברה עם סלוגן`

export default function AiAdPanel({ isOpen, onClose }: AiAdPanelProps) {
  const {
    step, script, scenes, progress, logs, error, finalVideoUrl,
    setScript, reset,
  } = useAiAdStore()

  const [localScript, setLocalScript] = useState(script || '')
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  if (!isOpen) return null

  const isProcessing = step !== 'idle' && step !== 'done' && step !== 'error'

  const handleStart = () => {
    if (!localScript.trim()) return
    setScript(localScript.trim())
    runAiAdPipeline(localScript.trim())
  }

  const handleReset = () => {
    reset()
    setLocalScript('')
  }

  const handleClose = () => {
    if (isProcessing) {
      if (!confirm('הייצור עדיין בתהליך. בטוח שרוצה לסגור?')) return
    }
    onClose()
  }

  const stepLabels: Record<string, string> = {
    idle: 'ממתין להתחלה',
    splitting: 'מפצל תסריט לסצנות...',
    generating_prompts: 'יוצר פרומפטים באנגלית...',
    generating_videos: 'מייצר סרטונים עם AI...',
    uploading: 'מעלה לענן...',
    merging: 'ממזג עם טקסט עברי...',
    done: 'הסרטון מוכן!',
    error: 'שגיאה',
  }

  const sceneStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle size={14} className="text-success" />
      case 'generating_prompt':
      case 'generating_video':
      case 'fallback':
      case 'uploading':
        return <Loader2 size={14} className="text-accent-blue animate-spin" />
      case 'error':
        return <AlertCircle size={14} className="text-error" />
      default:
        return <div className="w-3.5 h-3.5 rounded-full border border-white/20" />
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-bg-panel border border-white/[0.08] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-pink/20 to-accent-purple/20 flex items-center justify-center">
              <Clapperboard size={20} className="text-accent-pink" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">צור סרטון פרסומת AI</h2>
              <p className="text-xs text-text-muted">תסריט עברי → סרטון מלא אוטומטית</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors">
            <X size={20} className="text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Script Input */}
          {step === 'idle' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  תסריט (כל שורה = סצנה אחת)
                </label>
                <textarea
                  value={localScript}
                  onChange={(e) => setLocalScript(e.target.value)}
                  placeholder={EXAMPLE_SCRIPT}
                  className="w-full h-48 bg-bg-card border border-white/[0.08] rounded-xl p-4 text-text-primary text-sm resize-none focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/30 placeholder:text-text-muted/50"
                  dir="rtl"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-text-muted">
                    {localScript.split('\n').filter((l) => l.trim()).length} סצנות
                  </span>
                  <button
                    onClick={() => setLocalScript(EXAMPLE_SCRIPT)}
                    className="text-xs text-accent-purple hover:text-accent-blue transition-colors"
                  >
                    טען דוגמה
                  </button>
                </div>
              </div>

              <div className="bg-bg-card/50 rounded-xl p-4 border border-white/[0.04] space-y-2">
                <h3 className="text-sm font-medium text-text-secondary">מה קורה?</h3>
                <ul className="text-xs text-text-muted space-y-1 list-disc list-inside">
                  <li>כל שורה הופכת לסצנה נפרדת עם וידאו AI</li>
                  <li>פרומפט באנגלית נוצר אוטומטית לכל סצנה</li>
                  <li>Veo 3.1 מייצר וידאו, עם fallback ל-Seedance</li>
                  <li>כל הסצנות ממוזגות עם טקסט עברי מעל</li>
                  <li>סגנון: Cinematic AI animation, 9:16 אנכי</li>
                </ul>
              </div>
            </>
          )}

          {/* Processing / Done / Error */}
          {step !== 'idle' && (
            <>
              {/* Status bar */}
              <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06]">
                <div className="flex items-center gap-3 mb-3">
                  {step === 'done' ? (
                    <CheckCircle size={20} className="text-success" />
                  ) : step === 'error' ? (
                    <AlertCircle size={20} className="text-error" />
                  ) : (
                    <Loader2 size={20} className="text-accent-purple animate-spin" />
                  )}
                  <span className="text-sm font-medium text-text-primary">
                    {stepLabels[step] || step}
                  </span>
                </div>
                {progress.total > 0 && step !== 'done' && step !== 'error' && (
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-l from-accent-purple to-accent-blue rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-text-muted">{progress.label}</div>
                  </div>
                )}
                {error && (
                  <p className="text-sm text-error mt-2">{error}</p>
                )}
              </div>

              {/* Scene list */}
              {scenes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-text-secondary">סצנות</h3>
                  {scenes.map((scene) => (
                    <div
                      key={scene.index}
                      className="flex items-start gap-3 bg-bg-card/50 rounded-lg p-3 border border-white/[0.04]"
                    >
                      <div className="mt-0.5">{sceneStatusIcon(scene.status)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary truncate">
                          {scene.index + 1}. {scene.hebrewText}
                        </div>
                        {scene.englishPrompt && (
                          <div className="text-xs text-text-muted mt-1 truncate" dir="ltr">
                            {scene.englishPrompt}
                          </div>
                        )}
                        {scene.videoProvider && (
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple">
                            {scene.videoProvider === 'veo' ? 'Veo 3.1' : 'Seedance 1.5'}
                          </span>
                        )}
                        {scene.error && (
                          <div className="text-xs text-error mt-1">{scene.error}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Logs */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-text-secondary">לוג</h3>
                <div className="bg-bg-deepest rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-text-muted space-y-0.5">
                  {logs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* Final video */}
              {step === 'done' && finalVideoUrl && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <Film size={16} className="text-success" />
                    הסרטון מוכן!
                  </h3>
                  <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black">
                    <video
                      src={finalVideoUrl}
                      controls
                      className="w-full max-h-[400px]"
                      style={{ aspectRatio: '9/16', maxHeight: '400px', margin: '0 auto', display: 'block' }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center gap-3">
          {step === 'idle' && (
            <button
              onClick={handleStart}
              disabled={!localScript.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-l from-accent-pink to-accent-purple hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
            >
              <Play size={16} />
              התחל ייצור
            </button>
          )}
          {(step === 'done' || step === 'error') && (
            <>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-xl text-sm text-text-secondary transition-colors"
              >
                <RotateCcw size={14} />
                התחל מחדש
              </button>
              {finalVideoUrl && (
                <a
                  href={finalVideoUrl}
                  download="ai-ad-video.mp4"
                  className="flex items-center gap-2 px-5 py-2.5 bg-success/20 hover:bg-success/30 text-success rounded-xl text-sm font-medium transition-colors"
                >
                  <Download size={14} />
                  הורד סרטון
                </a>
              )}
            </>
          )}
          {isProcessing && (
            <span className="text-xs text-text-muted flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              אנא המתן, התהליך עשוי להימשך מספר דקות...
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
