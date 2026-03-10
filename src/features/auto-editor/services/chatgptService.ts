import { useAutoEditorStore, type AutoEditorInput } from '../store/autoEditorStore'
import type { FullTranscript } from './whisperService'

export interface VideoPlan {
  videoIndex: number
  sourceSegments: Array<{ start: number; end: number; sourceFile: number }>
  cuts: Array<{ keepStart: number; keepEnd: number }>
  zooms: Array<{ atTime: number; scale: number; duration: number }>
  brollMoments: Array<{ atTime: number; duration: number }>
  musicStyle: string
  overallVibe: string
}

export interface EditingPlan {
  videos: VideoPlan[]
  prompts: {
    backgroundImage: string
    broll: Array<{ videoIndex: number; momentIndex: number; prompt: string }>
    musicSearch: string
  }
}

const SYSTEM_PROMPT = `אתה עורך וידאו מקצועי לרשתות חברתיות.

SOP:
- הסר שתיקות מעל 0.3 שניות
- הסר גמגומים ותיקונים עצמיים
- זום עדין כל 5-7 משפטים
- B-Roll כשיש תיאור ויזואלי (3-5 שניות לקטע)
- מוזיקה שקטה מהדיבור תמיד

חוקי חלוקה:
- כל סרטון מתחיל ומסיים בנקודה טבעית
- כל סרטון עצמאי ומובן לבד
- אם יש עודף חומר — בחר הקטעים הטובים

החזר JSON בלבד. ללא טקסט נוסף. ללא markdown.`

export async function planWithChatGPT(
  transcript: FullTranscript,
  input: AutoEditorInput
): Promise<EditingPlan> {
  const log = useAutoEditorStore.getState().addLog

  log('שולח ל-ChatGPT לתכנון עריכה...')

  const userMessage = `transcript: ${JSON.stringify({
    total_duration: transcript.totalDuration,
    segments: transcript.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
      source_file: s.sourceFile,
    })),
    silences: transcript.silences,
  })}
בקשה: ${input.userPrompt}
אורך יעד: ${input.targetDuration} שניות
מספר סרטונים: ${input.numberOfVideos}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת ChatGPT: ${err.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('ChatGPT לא החזיר תוכן')
  }

  const parsed = JSON.parse(content)
  log(`ChatGPT תיכנן ${parsed.videos?.length || 0} סרטונים`)

  // Normalize response keys from snake_case to camelCase
  const plan: EditingPlan = {
    videos: (parsed.videos || []).map((v: any) => ({
      videoIndex: v.video_index ?? v.videoIndex,
      sourceSegments: (v.source_segments ?? v.sourceSegments ?? []).map((s: any) => ({
        start: s.start,
        end: s.end,
        sourceFile: s.source_file ?? s.sourceFile ?? 0,
      })),
      cuts: (v.cuts || []).map((c: any) => ({
        keepStart: c.keep_start ?? c.keepStart,
        keepEnd: c.keep_end ?? c.keepEnd,
      })),
      zooms: (v.zooms || []).map((z: any) => ({
        atTime: z.at_time ?? z.atTime,
        scale: z.scale,
        duration: z.duration,
      })),
      brollMoments: (v.broll_moments ?? v.brollMoments ?? []).map((b: any) => ({
        atTime: b.at_time ?? b.atTime,
        duration: b.duration,
      })),
      musicStyle: v.music_style ?? v.musicStyle ?? '',
      overallVibe: v.overall_vibe ?? v.overallVibe ?? '',
    })),
    prompts: {
      backgroundImage: parsed.prompts?.background_image ?? parsed.prompts?.backgroundImage ?? '',
      broll: (parsed.prompts?.broll || []).map((b: any) => ({
        videoIndex: b.video_index ?? b.videoIndex,
        momentIndex: b.moment_index ?? b.momentIndex,
        prompt: b.prompt,
      })),
      musicSearch: parsed.prompts?.music_search ?? parsed.prompts?.musicSearch ?? '',
    },
  }

  return plan
}
