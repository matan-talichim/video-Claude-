import { useAutoEditorStore } from '../store/autoEditorStore'

const API_BASE = 'http://localhost:3001/api'

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  sourceFile: number
  speaker?: string
  isPresenter?: boolean
}

export interface Silence {
  start: number
  end: number
  duration: number
}

export interface FullTranscript {
  totalDuration: number
  segments: TranscriptSegment[]
  silences: Silence[]
  mainSpeaker?: string
  speakerTimes?: Record<string, number>
}

function detectSilences(segments: TranscriptSegment[]): Silence[] {
  const silences: Silence[] = []
  for (let i = 0; i < segments.length - 1; i++) {
    const gap = segments[i + 1].start - segments[i].end
    if (gap > 0.3) {
      silences.push({
        start: segments[i].end,
        end: segments[i + 1].start,
        duration: gap,
      })
    }
  }
  return silences
}

function mergeTranscripts(
  transcripts: Array<{ segments: TranscriptSegment[]; duration: number }>,
): FullTranscript {
  let offset = 0
  const allSegments: TranscriptSegment[] = []

  for (let fileIdx = 0; fileIdx < transcripts.length; fileIdx++) {
    const t = transcripts[fileIdx]
    for (const seg of t.segments) {
      allSegments.push({
        start: seg.start + offset,
        end: seg.end + offset,
        text: seg.text,
        sourceFile: fileIdx,
      })
    }
    offset += t.duration
  }

  return {
    totalDuration: offset,
    segments: allSegments,
    silences: detectSilences(allSegments),
  }
}

export async function transcribeVideos(videoUrls: string[]): Promise<FullTranscript> {
  const log = useAutoEditorStore.getState().addLog

  log(`מתמלל ${videoUrls.length} קבצים...`)

  const transcripts = await Promise.all(
    videoUrls.map(async (url, index) => {
      log(`מתמלל קובץ ${index + 1}/${videoUrls.length}...`)

      const response = await fetch(`${API_BASE}/auto-editor/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: url }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(`שגיאת תמלול: ${err.message || response.statusText}`)
      }

      const data = await response.json()
      log(`תמלול קובץ ${index + 1} הושלם: ${data.segments?.length || 0} קטעים`)

      const segs = (data.segments || []).map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        sourceFile: index,
        speaker: seg.speaker,
        isPresenter: seg.isPresenter,
      }))

      // Calculate duration from segments if API returned 0
      let duration = data.duration || 0
      if (duration === 0 && segs.length > 0) {
        duration = Math.max(...segs.map((s: { end: number }) => s.end || 0))
        if (duration > 0) log(`קובץ ${index + 1}: משך חושב מקטעים: ${duration.toFixed(1)} שניות`)
      }
      if (duration === 0 && segs.length > 0) {
        duration = segs.length * 3
        log(`קובץ ${index + 1}: משך משוער: ${duration.toFixed(1)} שניות`)
      }

      return { segments: segs, duration, mainSpeaker: data.mainSpeaker, speakerTimes: data.speakerTimes }
    })
  )

  const merged = mergeTranscripts(transcripts)

  // Preserve mainSpeaker and speakerTimes from transcription results
  if (transcripts.length > 0 && transcripts[0].mainSpeaker) {
    merged.mainSpeaker = transcripts[0].mainSpeaker
    merged.speakerTimes = transcripts[0].speakerTimes
  }

  log(`תמלול הושלם: ${merged.totalDuration.toFixed(1)} שניות, ${merged.segments.length} קטעים${merged.mainSpeaker ? `, פרזנטור: ${merged.mainSpeaker}` : ''}`)

  return merged
}
