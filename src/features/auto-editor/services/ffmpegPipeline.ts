import { useAutoEditorStore } from '../store/autoEditorStore'
import type { VideoPlan } from './chatgptService'

// The actual FFmpeg processing now happens server-side via /api/auto-editor/process
// This module is kept for backward compatibility but the orchestrator calls the server directly

interface ProcessVideoInput {
  videoPlan: VideoPlan
  backgroundImage: string
  brollClips: string[]
  music: string
  sourceUrls: string[]
}

function generateSRT(
  segments: Array<{ start: number; end: number; text: string }>
): string {
  return segments
    .map((seg, i) => {
      const formatTime = (t: number) => {
        const h = Math.floor(t / 3600)
        const m = Math.floor((t % 3600) / 60)
        const s = Math.floor(t % 60)
        const ms = Math.round((t % 1) * 1000)
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
      }
      return `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text}\n`
    })
    .join('\n')
}

export async function processVideo(input: ProcessVideoInput): Promise<string> {
  const log = useAutoEditorStore.getState().addLog
  const { videoPlan, backgroundImage, brollClips: _brollClips, music, sourceUrls } = input
  void _brollClips

  log(`מעבד סרטון ${videoPlan.videoIndex}...`)

  // Generate SRT for subtitles
  const _srt = generateSRT(
    (videoPlan.subtitles || videoPlan.sourceSegments || []).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text || '',
    }))
  )
  void _srt

  // Send to server for actual FFmpeg processing
  const response = await fetch('http://localhost:3001/api/auto-editor/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: sourceUrls[videoPlan.sourceSegments?.[0]?.sourceFile || 0] || sourceUrls[0],
      videoPlan,
      targetDuration: 60,
      platforms: ['tiktok'],
      musicUrl: music || null,
      backgroundImage: backgroundImage || null,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת עיבוד FFmpeg: ${err.message || response.statusText}`)
  }

  const result = await response.json()
  log(`סרטון ${videoPlan.videoIndex} עובד בהצלחה`)

  // Return the first file URL for backward compat
  return result.files?.[0]?.url || result.url || result.outputUrl
}
