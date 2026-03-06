import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Monitor, Camera, Mic, Pause, Square, Loader2 } from 'lucide-react'
import Modal from '../Modal'
import { useUploadsStore } from '../../stores/uploadsStore'
import { useUIStore } from '../../stores/uiStore'

type Phase = 'setup' | 'countdown' | 'recording' | 'processing'
type CameraPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
type CameraShape = 'circle' | 'square'

const micDevices = ['מיקרופון מובנה', 'מיקרופון חיצוני', 'אוזניות Bluetooth']

interface RecordingModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function RecordingModal({ isOpen, onClose }: RecordingModalProps) {
  const navigate = useNavigate()
  const addFile = useUploadsStore((s) => s.addFile)
  const simulateUpload = useUploadsStore((s) => s.simulateUpload)
  const addToast = useUIStore((s) => s.addToast)

  const [phase, setPhase] = useState<Phase>('setup')
  const [screenEnabled, setScreenEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('bottom-left')
  const [cameraShape, setCameraShape] = useState<CameraShape>('circle')
  const [selectedMic, setSelectedMic] = useState(micDevices[0])
  const [countdown, setCountdown] = useState(3)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setPhase('setup')
      setCountdown(3)
      setRecordingTime(0)
      setIsPaused(false)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isOpen])

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('recording')
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [phase, countdown])

  // Recording timer
  useEffect(() => {
    if (phase !== 'recording') return
    if (!isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase, isPaused])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const handleStartRecording = () => {
    setCountdown(3)
    setPhase('countdown')
  }

  const handleStop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('processing')

    setTimeout(() => {
      const id = addFile({
        name: `הקלטת מסך - ${new Date().toLocaleDateString('he-IL')}`,
        size: '120MB',
        sizeBytes: 120 * 1024 * 1024,
        type: 'video',
        source: 'recording',
        status: 'waiting',
        progress: 0,
        thumbnailGradient: 'from-green-600/30 to-teal-600/30',
        duration: formatTime(recordingTime),
      })
      simulateUpload(id)
      addToast('ההקלטה נשמרה ומועלית ברקע', 'success')
      onClose()
      navigate('/editor/new')
    }, 2000)
  }, [addFile, simulateUpload, addToast, onClose, navigate, recordingTime])

  const handlePause = () => {
    setIsPaused(!isPaused)
  }

  const positionCorners: { key: CameraPosition; label: string; className: string }[] = [
    { key: 'top-right', label: 'למעלה ימין', className: 'top-0 right-0 rounded-tl-none rounded-tr-lg' },
    { key: 'top-left', label: 'למעלה שמאל', className: 'top-0 left-0 rounded-tr-none rounded-tl-lg' },
    { key: 'bottom-right', label: 'למטה ימין', className: 'bottom-0 right-0 rounded-bl-none rounded-br-lg' },
    { key: 'bottom-left', label: 'למטה שמאל', className: 'bottom-0 left-0 rounded-br-none rounded-bl-lg' },
  ]

  return (
    <Modal isOpen={isOpen} onClose={phase === 'recording' ? () => {} : onClose} title="הקלטת מסך" size="lg">
      {/* Setup phase */}
      {phase === 'setup' && (
        <div className="space-y-6">
          {/* Source toggles */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'screen', icon: Monitor, label: 'מסך', enabled: screenEnabled, toggle: () => setScreenEnabled(!screenEnabled) },
              { key: 'camera', icon: Camera, label: 'מצלמה', enabled: cameraEnabled, toggle: () => setCameraEnabled(!cameraEnabled) },
              { key: 'mic', icon: Mic, label: 'מיקרופון', enabled: micEnabled, toggle: () => setMicEnabled(!micEnabled) },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  onClick={item.toggle}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    item.enabled
                      ? 'border-accent-purple bg-accent-purple/5'
                      : 'border-white/[0.08] hover:border-white/[0.16]'
                  }`}
                >
                  <Icon size={24} className={`mx-auto mb-2 ${item.enabled ? 'text-accent-purple' : 'text-text-muted'}`} />
                  <div className={`text-sm font-medium ${item.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
                    {item.label}
                  </div>
                  <div className={`text-[10px] mt-1 ${item.enabled ? 'text-accent-purple' : 'text-text-muted'}`}>
                    {item.enabled ? 'פעיל' : 'כבוי'}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Camera options */}
          {cameraEnabled && (
            <div className="bg-bg-card rounded-xl p-4 border border-white/[0.06] space-y-4">
              <h4 className="text-sm font-medium text-text-primary">הגדרות מצלמה</h4>

              {/* Position */}
              <div>
                <label className="text-xs text-text-muted mb-2 block">מיקום</label>
                <div className="grid grid-cols-2 gap-2 w-32">
                  {positionCorners.map((pos) => (
                    <button
                      key={pos.key}
                      onClick={() => setCameraPosition(pos.key)}
                      className={`w-14 h-10 rounded-lg border-2 transition-all ${
                        cameraPosition === pos.key
                          ? 'border-accent-purple bg-accent-purple/10'
                          : 'border-white/[0.08] hover:border-white/[0.16]'
                      }`}
                      title={pos.label}
                    >
                      <div className={`w-3 h-3 rounded-full ${cameraPosition === pos.key ? 'bg-accent-purple' : 'bg-white/20'} ${
                        pos.key === 'top-right' ? 'mr-auto mt-1 ml-1' :
                        pos.key === 'top-left' ? 'ml-auto mt-1 mr-1' :
                        pos.key === 'bottom-right' ? 'mr-auto mb-1 ml-1 mt-auto' :
                        'ml-auto mb-1 mr-1 mt-auto'
                      }`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Shape */}
              <div>
                <label className="text-xs text-text-muted mb-2 block">צורה</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCameraShape('circle')}
                    className={`px-4 py-2 rounded-lg text-xs transition-all ${
                      cameraShape === 'circle'
                        ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20'
                        : 'bg-bg-card text-text-muted border border-white/[0.06]'
                    }`}
                  >
                    עיגול
                  </button>
                  <button
                    onClick={() => setCameraShape('square')}
                    className={`px-4 py-2 rounded-lg text-xs transition-all ${
                      cameraShape === 'square'
                        ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20'
                        : 'bg-bg-card text-text-muted border border-white/[0.06]'
                    }`}
                  >
                    ריבוע
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mic device */}
          {micEnabled && (
            <div>
              <label className="text-xs text-text-muted mb-2 block">מכשיר מיקרופון</label>
              <select
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
                className="w-full px-4 py-2.5 bg-bg-card rounded-xl border border-white/[0.06] text-sm text-text-primary focus:outline-none cursor-pointer"
              >
                {micDevices.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Preview placeholder */}
          <div className="aspect-video rounded-xl bg-bg-elevated border border-white/[0.06] flex items-center justify-center relative overflow-hidden">
            <div className="text-text-muted text-sm">תצוגה מקדימה</div>
            {cameraEnabled && (
              <div className={`absolute ${
                cameraPosition === 'bottom-left' ? 'bottom-3 left-3' :
                cameraPosition === 'bottom-right' ? 'bottom-3 right-3' :
                cameraPosition === 'top-left' ? 'top-3 left-3' : 'top-3 right-3'
              } w-16 h-16 ${cameraShape === 'circle' ? 'rounded-full' : 'rounded-lg'} bg-accent-purple/20 border-2 border-accent-purple/40 flex items-center justify-center`}>
                <Camera size={16} className="text-accent-purple" />
              </div>
            )}
          </div>

          {/* Start button */}
          <button
            onClick={handleStartRecording}
            disabled={!screenEnabled && !cameraEnabled}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-error hover:bg-error/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-error/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-3 h-3 rounded-full bg-white" />
            התחל הקלטה
          </button>
        </div>
      )}

      {/* Countdown phase */}
      {phase === 'countdown' && (
        <div className="flex items-center justify-center py-20">
          <div
            key={countdown}
            className="text-8xl font-bold text-accent-purple animate-scale-in"
          >
            {countdown}
          </div>
        </div>
      )}

      {/* Recording phase */}
      {phase === 'recording' && (
        <div className="text-center py-12 space-y-8">
          {/* Recording indicator */}
          <div className="flex items-center justify-center gap-3">
            <div className="w-4 h-4 rounded-full bg-error animate-pulse" />
            <span className="text-lg font-medium text-text-primary">
              {isPaused ? 'מושהה' : 'מקליט...'}
            </span>
          </div>

          {/* Timer */}
          <div className="text-5xl font-mono font-bold text-text-primary">
            {formatTime(recordingTime)}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-6 py-3 bg-white/[0.08] hover:bg-white/[0.12] rounded-xl text-sm transition-colors"
            >
              <Pause size={18} />
              {isPaused ? 'המשך' : 'השהה'}
            </button>
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-6 py-3 bg-error hover:bg-error/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-error/20"
            >
              <Square size={18} />
              עצור
            </button>
          </div>
        </div>
      )}

      {/* Processing phase */}
      {phase === 'processing' && (
        <div className="text-center py-20">
          <Loader2 size={48} className="mx-auto text-accent-purple animate-spin mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-1">מעבד...</h3>
          <p className="text-sm text-text-muted">ההקלטה מעובדת ותהיה מוכנה בקרוב</p>
        </div>
      )}
    </Modal>
  )
}
