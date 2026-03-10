import { useAutoEditorStore } from '../store/autoEditorStore'
import type { VideoPlan } from './chatgptService'

// FFmpeg.wasm will be loaded dynamically in a Web Worker
// This module builds the FFmpeg command chains for each processing step

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
  const { videoPlan, backgroundImage, brollClips, music, sourceUrls } = input

  log(`מעבד סרטון ${videoPlan.videoIndex}...`)

  // Step 1: Cut segments according to ChatGPT plan
  log(`חותך ${videoPlan.cuts.length} קטעים...`)
  const cutCommands = videoPlan.cuts.map((c, i) => ({
    input: sourceUrls[videoPlan.sourceSegments[0]?.sourceFile || 0],
    startTime: c.keepStart,
    endTime: c.keepEnd,
    outputKey: `cut_${i}`,
  }))

  // Step 2: Color grade
  log('מחיל Color Grade...')
  const colorGradeFilter = 'eq=brightness=0.05:contrast=1.1:saturation=1.2'

  // Step 3: Apply zooms
  log(`מחיל ${videoPlan.zooms.length} זומים...`)
  const zoomFilters = videoPlan.zooms.map(
    (z) =>
      `zoompan=z='if(between(t,${z.atTime},${z.atTime + z.duration}),${z.scale},1)':d=1`
  )

  // Step 4: Insert B-Roll
  log(`מכניס ${videoPlan.brollMoments.length} קטעי B-Roll...`)

  // Step 5: Generate subtitles
  log('מייצר כתוביות...')
  const srt = generateSRT(
    videoPlan.sourceSegments.map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text || '',
    }))
  )

  // Step 6: Mix music at 20% + audio cleanup
  log('מערבב מוזיקה ומנקה אודיו...')
  const audioFilter = '[1:a]volume=0.2[m];[0:a][m]amix=inputs=2[a]'
  const audioCleanup = 'highpass=f=80,lowpass=f=8000,afftdn=nf=-25'

  // In production, these FFmpeg commands would run in a Web Worker
  // For now, we send the processing plan to the backend
  const response = await fetch('http://localhost:3001/api/auto-editor/process-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoPlan,
      backgroundImage,
      brollClips,
      music,
      sourceUrls,
      filters: {
        cuts: cutCommands,
        colorGrade: colorGradeFilter,
        zooms: zoomFilters,
        srt,
        audioFilter,
        audioCleanup,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת עיבוד FFmpeg: ${err.message || response.statusText}`)
  }

  const result = await response.json()
  log(`סרטון ${videoPlan.videoIndex} עובד בהצלחה`)

  return result.url || result.outputUrl
}
