import { useAutoEditorStore } from '../store/autoEditorStore'

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  sourceFile: number
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
}

async function urlToFile(url: string): Promise<File> {
  const response = await fetch(url)
  const blob = await response.blob()
  const fileName = url.split('/').pop() || 'audio.mp4'
  return new File([blob], fileName, { type: blob.type })
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

      const file = await urlToFile(url)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('model', 'whisper-1')
      formData.append('response_format', 'verbose_json')
      formData.append('timestamp_granularities[]', 'word')
      formData.append('timestamp_granularities[]', 'segment')

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(`שגיאת תמלול: ${err.error?.message || response.statusText}`)
      }

      const data = await response.json()
      log(`תמלול קובץ ${index + 1} הושלם: ${data.segments?.length || 0} קטעים`)

      return {
        segments: (data.segments || []).map((seg: any) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
          sourceFile: index,
        })),
        duration: data.duration || 0,
      }
    })
  )

  const merged = mergeTranscripts(transcripts)
  log(`תמלול הושלם: ${merged.totalDuration.toFixed(1)} שניות, ${merged.segments.length} קטעים`)

  return merged
}
