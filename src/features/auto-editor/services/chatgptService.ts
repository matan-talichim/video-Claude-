import { useAutoEditorStore, type AutoEditorInput } from '../store/autoEditorStore'
import { useUserProfileStore } from '../../../stores/userProfileStore'
import type { FullTranscript } from './whisperService'

const API_BASE = 'http://localhost:3001/api'

export interface VideoPlan {
  videoIndex: number
  sourceSegments: Array<{ start: number; end: number; sourceFile: number; text: string }>
  cuts: Array<{ keepStart: number; keepEnd: number }>
  zooms: Array<{ atTime: number; scale: number; duration: number }>
  brollMoments: Array<{ atTime: number; duration: number }>
  subtitles: Array<{ start: number; end: number; text: string }>
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

function buildSystemPrompt(targetDuration: number): string {
  const userProfile = useUserProfileStore.getState().getProfileForPrompt()

  return `אתה עורך וידאו מקצועי. אתה מקבל תמלול של סרטון ומחזיר תוכנית עריכה מדויקת.

חוקים:
1. כל סרטון חייב להיות באורך היעד (${targetDuration} שניות ± 3 שניות)
2. בחר את הקטעים הכי טובים מהתמלול
3. הסר שתיקות מעל 0.5 שניות
4. הסר גמגומים ותיקונים עצמיים
5. כל סרטון צריך להתחיל ולהסתיים בנקודה טבעית
6. כל סרטון עצמאי ומובן בפני עצמו

חוקי חלוקה:
- כל סרטון מתחיל ומסיים בנקודה טבעית
- כל סרטון עצמאי ומובן לבד
- אם יש עודף חומר — בחר הקטעים הטובים
- זום עדין כל 5-7 משפטים
- B-Roll כשיש תיאור ויזואלי (3-5 שניות לקטע)

חשוב מאוד: ה-cuts חייבים להיות מדויקים!
- keep_start: הזמן שבו מתחילים לשמור (בשניות מתחילת הסרטון המקורי)
- keep_end: הזמן שבו מפסיקים לשמור
- סכום כל ה-(keep_end - keep_start) חייב להיות בדיוק ${targetDuration} שניות
- cuts הם הקטעים שנשמרים (לא הקטעים שנמחקים)

${userProfile ? '\n' + userProfile + '\nחשוב: אם יש פרופיל משתמש למעלה, התאם את העריכה להעדפות שלו.\nאם הוא לא אוהב הסרת מילות מילוי - אל תסיר.\nאם הוא אוהב הרבה B-Roll - הוסף יותר.\nאם הוא מעדיף פורמט מסוים - השתמש בו.\n' : ''}
החזר JSON בלבד:
{
  "videos": [
    {
      "video_index": 1,
      "source_file": 0,
      "title": "כותרת קצרה לסרטון",
      "cuts": [
        { "keep_start": 0.0, "keep_end": 8.5 },
        { "keep_start": 12.3, "keep_end": 25.7 },
        { "keep_start": 30.0, "keep_end": 36.0 }
      ],
      "subtitles": [
        { "start": 0.0, "end": 2.5, "text": "טקסט כתובית" }
      ],
      "zooms": [
        { "at_time": 5.0, "scale": 1.05, "duration": 0.5 }
      ],
      "broll_moments": [
        { "at_time": 12.0, "duration": 3, "prompt": "תיאור לB-Roll" }
      ]
    }
  ],
  "prompts": {
    "background_image": "prompt for background",
    "broll": [{ "prompt": "scene description", "duration": 3 }],
    "music_search": "search term for music"
  }
}

חשוב:
- cuts הם הקטעים שנשמרים (לא הקטעים שנמחקים)
- הסכום של כל ה-cuts חייב להיות ${targetDuration} שניות
- subtitles הם הכתוביות שיוצגו בסרטון הסופי (עם timestamps יחסיים לסרטון המקורי)
- ללא טקסט נוסף. ללא markdown.`
}

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

  const response = await fetch(`${API_BASE}/chatgpt-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt: buildSystemPrompt(input.targetDuration),
      userMessage,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת ChatGPT: ${err.message || response.statusText}`)
  }

  const data = await response.json()
  const content = data.content

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
        text: s.text ?? transcript.segments.find((ts: any) => Math.abs(ts.start - s.start) < 0.5)?.text ?? '',
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
      subtitles: (v.subtitles || []).map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
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

  // Validate cuts sum to approximately target duration
  for (const video of plan.videos) {
    const totalCutDuration = video.cuts.reduce((sum, c) => sum + (c.keepEnd - c.keepStart), 0)
    log(`סרטון ${video.videoIndex}: סך חיתוכים = ${totalCutDuration.toFixed(1)}s (יעד: ${input.targetDuration}s)`)

    // If no cuts, create a default cut to target duration
    if (video.cuts.length === 0) {
      video.cuts.push({
        keepStart: 0,
        keepEnd: Math.min(input.targetDuration, transcript.totalDuration),
      })
      log(`סרטון ${video.videoIndex}: נוצר חיתוך ברירת מחדל`)
    }
  }

  return plan
}
