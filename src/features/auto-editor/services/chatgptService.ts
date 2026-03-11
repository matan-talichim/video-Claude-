import { useAutoEditorStore, type AutoEditorInput } from '../store/autoEditorStore'
import { useUserProfileStore } from '../../../stores/userProfileStore'
import type { FullTranscript } from './whisperService'

const API_BASE = 'http://localhost:3001/api'

export interface VideoPlan {
  videoIndex: number
  title: string
  sourceSegments: Array<{ start: number; end: number; sourceFile: number; text: string }>
  cuts: Array<{ keepStart: number; keepEnd: number }>
  transitions: string[]
  zooms: Array<{ atTime: number; scale: number; duration: number; direction: string }>
  cameraAngles: Array<{ start: number; end: number; camera: string }>
  colorGrade: string
  framingStrategy: string
  brollMoments: Array<{ atTime: number; duration: number; prompt: string }>
  subtitles: Array<{ start: number; end: number; text: string }>
  graphics: Array<{ type: string; text: string; atTime: number; duration: number; label?: string }>
  speakers: Array<{ name: string; firstAppearance: number; displayDuration: number }>
  segmentsIntensity: Array<{ start: number; end: number; intensity: number; type: string }>
  intro: { title: string; duration: number } | null
  outro: { cta: string; duration: number } | null
  musicMoments: Array<{ atTime: number; volume: string }>
  musicStyle: string
  overallVibe: string
}

export interface EditingPlan {
  videos: VideoPlan[]
  prompts: {
    backgroundImage: string
    introImage: string
    outroImage: string
    broll: Array<{ videoIndex: number; momentIndex: number; prompt: string; duration: number }>
    musicSearch: string
  }
}

function buildSystemPrompt(targetDuration: number): string {
  const userProfile = useUserProfileStore.getState().getProfileForPrompt()

  return `אתה עורך וידאו מקצועי ברמה הגבוהה ביותר.
אתה מקבל תמלול של סרטון ומחזיר תוכנית עריכה מפורטת ומקצועית.

${userProfile ? userProfile + '\nחשוב: אם יש פרופיל משתמש למעלה, התאם את העריכה להעדפות שלו.\nאם הוא לא אוהב הסרת מילות מילוי - אל תסיר.\nאם הוא אוהב הרבה B-Roll - הוסף יותר.\nאם הוא מעדיף פורמט מסוים - השתמש בו.\n' : ''}

SOP - כללי עריכה:
1. הסר שתיקות מעל 0.3 שניות
2. הסר גמגומים, תיקונים עצמיים, מילות מילוי
3. כל סרטון חייב להיות באורך היעד (${targetDuration} שניות ± 3 שניות)
4. כל סרטון מתחיל ומסתיים בנקודה טבעית
5. כל סרטון עצמאי ומובן בפני עצמו

חשוב מאוד: ה-cuts חייבים להיות מדויקים!
- keep_start: הזמן שבו מתחילים לשמור (בשניות מתחילת הסרטון המקורי)
- keep_end: הזמן שבו מפסיקים לשמור
- סכום כל ה-(keep_end - keep_start) חייב להיות בדיוק ${targetDuration} שניות
- cuts הם הקטעים שנשמרים (לא הקטעים שנמחקים)

כלים זמינים - השתמש בכולם:

מעברים (transitions):
- בחר transition מתאים בין כל 2 קטעים
- אפשרויות: fade, fadeblack, dissolve, smoothleft, smoothright, zoomin, wipeleft, wiperight, circleopen, circleclose, radial
- מקצועי/תאגידי: fade, dissolve
- אנרגטי/סושיאל: smoothleft, zoomin, wipeleft
- דרמטי: fadeblack, circleclose

זומים דינמיים:
- הוסף zoom כל 5-8 שניות
- scale: 1.03-1.08 (עדין!)
- החלף בין zoom-in ו-zoom-out
- zoom-in על נקודות חשובות

סימולציית מולטי-קאם:
- החלף בין wide/medium/closeup כל 3-8 שניות
- closeup על רגעים חשובים/רגשיים
- wide על פתיחות ומעברים
- medium כברירת מחדל

Color Grade:
- בחר color grade שמתאים למצב הרוח: cinematic/warm/cold/vintage/vibrant/moody/clean/film

B-Roll:
- הוסף B-Roll בזמנים שיש תיאור ויזואלי
- 3-5 שניות לכל קטע B-Roll
- כתוב prompt מפורט באנגלית ליצירת התמונה/סרטון

כתוביות:
- כלול כתוביות עם timestamps מדויקים
- התאם ל-cuts (timestamps יחסיים לסרטון המקורי)

גרפיקות:
- זהה רגעים שמתאימים לגרפיקה (מספרים, נקודות מפתח, ציטוטים)

דוברים:
- זהה מי מדבר ומתי
- סמן חילופי דוברים

Intro/Outro:
- הצע כותרת intro קצרה
- הצע CTA (call to action) ל-outro

מוזיקה:
- הצע סגנון מוזיקה
- סמן רגעים שהמוזיקה צריכה להיות חזקה/חלשה יותר

עוצמת קטעים:
- דרג כל קטע 1-5 לפי עוצמה
- intensity 5: tight zoom, faster cuts, music volume up
- intensity 4: medium zoom, normal cuts
- intensity 3: standard
- intensity 2: wider shot, slower pacing
- intensity 1: very wide, calm

החזר JSON בלבד:
{
  "videos": [
    {
      "video_index": 1,
      "source_file": 0,
      "title": "כותרת הסרטון",
      "cuts": [
        { "keep_start": 0.0, "keep_end": 8.5 },
        { "keep_start": 12.3, "keep_end": 25.7 }
      ],
      "transitions": ["fade", "dissolve"],
      "zooms": [
        { "at_time": 3, "scale": 1.05, "duration": 4, "direction": "in" },
        { "at_time": 10, "scale": 1.03, "duration": 3, "direction": "out" }
      ],
      "camera_angles": [
        { "start": 0, "end": 5, "camera": "wide" },
        { "start": 5, "end": 12, "camera": "medium" },
        { "start": 12, "end": 15, "camera": "closeup" }
      ],
      "color_grade": "cinematic",
      "framing_strategy": "blur_background",
      "broll_moments": [
        { "at_time": 12, "duration": 4, "prompt": "modern office team working together" }
      ],
      "subtitles": [
        { "start": 0, "end": 2.5, "text": "שלום לכולם" }
      ],
      "graphics": [
        { "type": "key_point", "text": "3 טיפים", "at_time": 5, "duration": 3 }
      ],
      "speakers": [
        { "name": "דובר 1", "first_appearance": 0, "display_duration": 4 }
      ],
      "segments_intensity": [
        { "start": 0, "end": 10, "intensity": 3, "type": "intro" },
        { "start": 10, "end": 20, "intensity": 5, "type": "key_point" }
      ],
      "intro": { "title": "3 טיפים לשיווק", "duration": 3 },
      "outro": { "cta": "עקבו לעוד תוכן", "duration": 3 },
      "music_moments": [
        { "at_time": 0, "volume": "normal" },
        { "at_time": 10, "volume": "high" },
        { "at_time": 20, "volume": "low" }
      ],
      "music_style": "upbeat corporate",
      "overall_vibe": "professional"
    }
  ],
  "prompts": {
    "background_image": "cinematic dark gradient background",
    "intro_image": "professional title card: 3 טיפים לשיווק",
    "outro_image": "call to action card: עקבו לעוד תוכן",
    "broll": [
      { "prompt": "modern office scene", "duration": 4 }
    ],
    "music_search": "upbeat corporate motivation"
  }
}

חשוב:
- cuts הם הקטעים שנשמרים (לא הקטעים שנמחקים)
- הסכום של כל ה-cuts חייב להיות ${targetDuration} שניות
- transitions: מערך של סוגי מעברים בין הקטעים (אחד פחות ממספר הקטעים)
- subtitles הם הכתוביות עם timestamps יחסיים לסרטון המקורי
- ללא טקסט נוסף. ללא markdown.`
}

export async function planWithChatGPT(
  transcript: FullTranscript,
  input: AutoEditorInput
): Promise<EditingPlan> {
  const log = useAutoEditorStore.getState().addLog

  log('שולח ל-ChatGPT לתכנון עריכה מקצועית...')

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
  log(`ChatGPT תיכנן ${parsed.videos?.length || 0} סרטונים עם אפקטים מקצועיים`)

  // Normalize response keys from snake_case to camelCase
  const plan: EditingPlan = {
    videos: (parsed.videos || []).map((v: any) => ({
      videoIndex: v.video_index ?? v.videoIndex,
      title: v.title ?? '',
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
      transitions: v.transitions || ['fade'],
      zooms: (v.zooms || []).map((z: any) => ({
        atTime: z.at_time ?? z.atTime,
        scale: z.scale ?? 1.05,
        duration: z.duration ?? 3,
        direction: z.direction ?? 'in',
      })),
      cameraAngles: (v.camera_angles ?? v.cameraAngles ?? []).map((ca: any) => ({
        start: ca.start,
        end: ca.end,
        camera: ca.camera ?? 'wide',
      })),
      colorGrade: v.color_grade ?? v.colorGrade ?? 'clean',
      framingStrategy: v.framing_strategy ?? v.framingStrategy ?? 'blur_background',
      brollMoments: (v.broll_moments ?? v.brollMoments ?? []).map((b: any) => ({
        atTime: b.at_time ?? b.atTime,
        duration: b.duration,
        prompt: b.prompt ?? '',
      })),
      subtitles: (v.subtitles || []).map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      graphics: (v.graphics || []).map((g: any) => ({
        type: g.type ?? 'key_point',
        text: g.text ?? '',
        atTime: g.at_time ?? g.atTime ?? 0,
        duration: g.duration ?? 3,
        label: g.label,
      })),
      speakers: (v.speakers || []).map((s: any) => ({
        name: s.name ?? 'דובר',
        firstAppearance: s.first_appearance ?? s.firstAppearance ?? 0,
        displayDuration: s.display_duration ?? s.displayDuration ?? 4,
      })),
      segmentsIntensity: (v.segments_intensity ?? v.segmentsIntensity ?? []).map((si: any) => ({
        start: si.start,
        end: si.end,
        intensity: si.intensity ?? 3,
        type: si.type ?? 'normal',
      })),
      intro: v.intro ? { title: v.intro.title ?? '', duration: v.intro.duration ?? 3 } : null,
      outro: v.outro ? { cta: v.outro.cta ?? '', duration: v.outro.duration ?? 3 } : null,
      musicMoments: (v.music_moments ?? v.musicMoments ?? []).map((mm: any) => ({
        atTime: mm.at_time ?? mm.atTime ?? 0,
        volume: mm.volume ?? 'normal',
      })),
      musicStyle: v.music_style ?? v.musicStyle ?? '',
      overallVibe: v.overall_vibe ?? v.overallVibe ?? '',
    })),
    prompts: {
      backgroundImage: parsed.prompts?.background_image ?? parsed.prompts?.backgroundImage ?? '',
      introImage: parsed.prompts?.intro_image ?? parsed.prompts?.introImage ?? '',
      outroImage: parsed.prompts?.outro_image ?? parsed.prompts?.outroImage ?? '',
      broll: (parsed.prompts?.broll || []).map((b: any) => ({
        videoIndex: b.video_index ?? b.videoIndex,
        momentIndex: b.moment_index ?? b.momentIndex,
        prompt: b.prompt,
        duration: b.duration ?? 4,
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

    // Log professional features
    log(`  מעברים: ${video.transitions.length}, זומים: ${video.zooms.length}, מצלמות: ${video.cameraAngles.length}`)
    log(`  Color grade: ${video.colorGrade}, Framing: ${video.framingStrategy}`)
    if (video.speakers.length > 0) log(`  דוברים: ${video.speakers.map(s => s.name).join(', ')}`)
    if (video.intro) log(`  Intro: "${video.intro.title}"`)
    if (video.outro) log(`  Outro: "${video.outro.cta}"`)
  }

  return plan
}
