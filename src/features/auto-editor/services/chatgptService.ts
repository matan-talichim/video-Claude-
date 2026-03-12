import { useAutoEditorStore, type AutoEditorInput } from '../store/autoEditorStore'
import { useUserProfileStore } from '../../../stores/userProfileStore'
import { usePromptEvolutionStore } from '../../../stores/promptEvolutionStore'
import type { FullTranscript } from './whisperService'
import { BASE_CREATIVE_BRIEF_PROMPT, BASE_TECHNICAL_PLAN_PROMPT } from '../constants/basePrompts'

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
  optimalDuration?: number
  durationReasoning?: string
  recommendedPlatform?: string
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

export interface CreativeBrief {
  creative_brief: {
    main_message: string
    target_emotion: string
    hook: string
    cta: string
    pacing: string
    music_mood: string
    color_mood: string
    overall_vibe: string
  }
  content_analysis: {
    best_quotes: Array<{ text: string; start: number; end: number; why: string }>
    boring_parts: Array<{ start: number; end: number; why: string }>
    emotional_peaks: Array<{ time: number; emotion: string; intensity: number }>
    visual_moments: Array<{ time: number; description: string; broll_prompt: string }>
    filler_words: Array<{ word: string; count: number }>
    silences: Array<{ start: number; end: number; duration: number }>
  }
  video_plans: Array<{
    video_index: number
    title: string
    concept: string
    hook_segment: { start: number; end: number }
    story_arc: Array<{
      role: string
      segments: Array<{ start: number; end: number }>
      duration: number
    }>
    broll_placements: Array<{
      after_segment: number
      duration: number
      prompt: string
      type: string
    }>
    graphic_moments: Array<{
      at_time_relative: number
      type: string
      text: string
      label?: string
    }>
    zoom_points: Array<{
      at_time_relative: number
      type: string
      reason: string
    }>
    estimated_duration: number
    optimal_duration?: number
    duration_reasoning?: string
    recommended_platform?: string
    targetDuration?: number
  }>
}

// Step 1: Creative Director - analyzes content and creates creative brief
async function getCreativeBrief(
  transcript: FullTranscript,
  input: AutoEditorInput,
  detectedType?: string,
  visualAnalysis?: any,
  energyAnalysis?: any
): Promise<CreativeBrief> {
  const log = useAutoEditorStore.getState().addLog
  const userProfile = useUserProfileStore.getState().getProfileForPrompt()

  log('שלב 1: הבמאי מנתח את התוכן...')

  // Get evolved prompt for creative brief
  const evolvedBriefPrompt = usePromptEvolutionStore.getState().getEvolvedPrompt('creative_brief', BASE_CREATIVE_BRIEF_PROMPT)

  let socialRules = ''
  try {
    const rulesRes = await fetch('http://localhost:3001/api/learning/rules')
    if (rulesRes.ok) {
      const data = await rulesRes.json()
      socialRules = data.rules || ''
    }
  } catch {}

  // Build feature notes based on user settings
  const featureNotes: string[] = []
  if (input.includeSubtitles === false) featureNotes.push('בלי כתוביות - המשתמש ביקש ללא כתוביות')
  if (input.includeBackground === false) featureNotes.push('בלי תמונת רקע AI - השתמש בטשטוש רקע במקום')

  const response = await fetch(`${API_BASE}/auto-editor/creative-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: {
        segments: transcript.segments.map((s: any) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          speaker: s.speaker,
          isPresenter: s.isPresenter,
        })),
        total_duration: transcript.totalDuration,
        mainSpeaker: transcript.mainSpeaker,
        speakerTimes: transcript.speakerTimes,
      },
      userPrompt: input.userPrompt + (featureNotes.length > 0 ? `\n\nהערות: ${featureNotes.join('. ')}` : ''),
      targetDuration: input.targetDuration,
      numberOfVideos: input.numberOfVideos,
      platforms: input.platforms,
      userProfile: userProfile || '',
      detectedType: detectedType || '',
      visualAnalysis: visualAnalysis || null,
      energyAnalysis: energyAnalysis || null,
      promptEvolution: evolvedBriefPrompt !== BASE_CREATIVE_BRIEF_PROMPT ? evolvedBriefPrompt : undefined,
      socialLearningRules: socialRules,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת Creative Brief: ${err.message || response.statusText}`)
  }

  const brief = await response.json()

  // Collect prompt improvements from creative brief
  if (brief._promptImprovements?.length > 0) {
    usePromptEvolutionStore.getState().recordEvolution('creative_brief', brief._promptImprovements)
    log(`[למידה] תכנון קריאטיבי למד ${brief._promptImprovements.length} תובנות חדשות`)
  }

  log(`במאי: "${brief.creative_brief?.main_message || 'מנתח...'}"`)
  log(`רגש יעד: ${brief.creative_brief?.target_emotion || 'לא ידוע'}`)
  log(`קצב: ${brief.creative_brief?.pacing || 'לא ידוע'}`)
  log(`ציטוטים חזקים: ${brief.content_analysis?.best_quotes?.length || 0}`)
  log(`קטעים משעממים למחיקה: ${brief.content_analysis?.boring_parts?.length || 0}`)
  log(`רגעי B-Roll: ${brief.content_analysis?.visual_moments?.length || 0}`)

  return brief
}

// Step 2: Technical Editor - creates frame-accurate edit plan from brief
async function getTechnicalPlan(
  creativeBrief: CreativeBrief,
  transcript: FullTranscript,
  input: AutoEditorInput
): Promise<any> {
  const log = useAutoEditorStore.getState().addLog

  log('שלב 2: העורך מתכנן חיתוכים מדויקים...')

  // Get evolved prompt for technical plan
  const evolvedPlanPrompt = usePromptEvolutionStore.getState().getEvolvedPrompt('technical_plan', BASE_TECHNICAL_PLAN_PROMPT)

  let techSocialRules = ''
  try {
    const rulesRes = await fetch('http://localhost:3001/api/learning/rules')
    if (rulesRes.ok) {
      const data = await rulesRes.json()
      techSocialRules = data.rules || ''
    }
  } catch {}

  const response = await fetch(`${API_BASE}/auto-editor/technical-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creativeBrief,
      transcript: {
        segments: transcript.segments.map((s: any) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          source_file: s.sourceFile,
          speaker: s.speaker,
          isPresenter: s.isPresenter,
        })),
        total_duration: transcript.totalDuration,
        silences: transcript.silences,
        mainSpeaker: transcript.mainSpeaker,
        speakerTimes: transcript.speakerTimes,
      },
      targetDuration: input.targetDuration,
      platforms: input.platforms,
      promptEvolution: evolvedPlanPrompt !== BASE_TECHNICAL_PLAN_PROMPT ? evolvedPlanPrompt : undefined,
      socialLearningRules: techSocialRules,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת Technical Plan: ${err.message || response.statusText}`)
  }

  const result = await response.json()

  // Collect prompt improvements from technical plan
  if (result._promptImprovements?.length > 0) {
    usePromptEvolutionStore.getState().recordEvolution('technical_plan', result._promptImprovements)
    log(`[למידה] תכנון טכני למד ${result._promptImprovements.length} תובנות חדשות`)
  }

  return result
}

// Normalize technical plan response to EditingPlan format
function normalizeTechnicalPlan(
  raw: any,
  transcript: FullTranscript,
  input: AutoEditorInput,
  brief: CreativeBrief
): EditingPlan {
  const log = useAutoEditorStore.getState().addLog

  const plan: EditingPlan = {
    videos: (raw.videos || []).map((v: any) => {
      const video: VideoPlan = {
        videoIndex: v.video_index || v.videoIndex,
        title: v.title || '',
        sourceSegments: [],
        cuts: (v.cuts || []).map((c: any) => ({
          keepStart: parseFloat(c.keep_start ?? c.keepStart ?? c.start ?? 0),
          keepEnd: parseFloat(c.keep_end ?? c.keepEnd ?? c.end ?? 0),
        })),
        transitions: [],
        zooms: (v.zooms || []).map((z: any) => ({
          atTime: z.relative_time || z.at_time || z.atTime || 0,
          scale: z.scale || 1.05,
          duration: z.duration || 3,
          direction: z.direction || 'in',
        })),
        cameraAngles: (v.camera_angles || v.cameraAngles || []).map((ca: any) => ({
          start: ca.relative_start || ca.start || 0,
          end: ca.relative_end || ca.end || 0,
          camera: ca.camera || 'wide',
        })),
        colorGrade: v.color_grade || v.colorGrade || brief.creative_brief?.color_mood || 'cinematic',
        framingStrategy: v.framing || v.framing_strategy || v.framingStrategy || 'blur_background',
        brollMoments: (v.broll || v.broll_moments || v.brollMoments || []).map((b: any) => ({
          atTime: b.relative_start || b.at_time || b.atTime || 0,
          duration: b.relative_end && b.relative_start ? b.relative_end - b.relative_start : b.duration || 4,
          prompt: b.prompt || '',
        })),
        subtitles: (v.subtitles || []).map((s: any) => ({
          start: s.relative_start || s.start || 0,
          end: s.relative_end || s.end || 0,
          text: s.text || '',
        })),
        graphics: (v.graphics || []).map((g: any) => ({
          type: g.type || 'key_point',
          text: g.text || g.value || '',
          atTime: g.relative_time || g.at_time || g.atTime || 0,
          duration: g.duration || 3,
          label: g.label || g.subtitle,
        })),
        speakers: (v.speakers || []).map((s: any) => ({
          name: s.name || 'דובר',
          firstAppearance: s.first_appearance_relative || s.first_appearance || s.firstAppearance || 0,
          displayDuration: s.display_duration || s.displayDuration || 4,
        })),
        segmentsIntensity: [],
        intro: v.intro ? { title: v.intro.title || '', duration: v.intro.duration || 3 } : null,
        outro: v.outro ? { cta: v.outro.text || v.outro.cta || '', duration: v.outro.duration || 3 } : null,
        musicMoments: (v.music_dynamics || v.music_moments || v.musicMoments || []).map((mm: any) => ({
          atTime: mm.relative_time || mm.at_time || mm.atTime || 0,
          volume: typeof mm.volume === 'number' ? (mm.volume > 0.5 ? 'high' : mm.volume < 0.15 ? 'low' : 'normal') : mm.volume || 'normal',
        })),
        musicStyle: brief.creative_brief?.music_mood || '',
        overallVibe: brief.creative_brief?.overall_vibe || '',
      }

      // Normalize transitions from object array to string array
      if (v.transitions) {
        if (Array.isArray(v.transitions) && v.transitions.length > 0) {
          if (typeof v.transitions[0] === 'string') {
            video.transitions = v.transitions
          } else {
            video.transitions = v.transitions.map((t: any) => t.type || 'fade')
          }
        }
      }
      if (video.transitions.length === 0) {
        video.transitions = ['fade']
      }

      // Build sourceSegments from cuts + transcript
      for (const cut of video.cuts) {
        const cutStart = parseFloat(String(cut.keepStart ?? 0))
        const cutEnd = parseFloat(String(cut.keepEnd ?? 0))
        const matchingSegs = transcript.segments.filter(
          (s) => s.start >= cutStart && s.end <= cutEnd
        )
        for (const seg of matchingSegs) {
          video.sourceSegments.push({
            start: seg.start,
            end: seg.end,
            sourceFile: seg.sourceFile || 0,
            text: seg.text,
          })
        }
      }

      return video
    }),
    prompts: {
      backgroundImage: raw.prompts?.background_image || raw.prompts?.backgroundImage || `cinematic dark gradient background, ${brief.creative_brief?.color_mood || 'moody'} lighting`,
      introImage: raw.prompts?.intro_image || raw.prompts?.introImage || '',
      outroImage: raw.prompts?.outro_image || raw.prompts?.outroImage || '',
      broll: [],
      musicSearch: raw.prompts?.music_search || raw.prompts?.musicSearch || brief.creative_brief?.music_mood || 'upbeat corporate',
    },
  }

  // Build broll prompts array from video brollMoments
  for (const video of (plan?.videos || [])) {
    (video?.brollMoments || []).forEach((b, idx) => {
      if (b.prompt) {
        plan.prompts.broll.push({
          videoIndex: video.videoIndex,
          momentIndex: idx,
          prompt: b.prompt,
          duration: b.duration,
        })
      }
    })
  }

  // Filter out non-presenter cuts if presenter info is available
  const presenterSegments = transcript.segments.filter((s: any) => s.isPresenter !== false)
  if (transcript.mainSpeaker && presenterSegments.length < transcript.segments.length) {
    for (const video of (plan?.videos || [])) {
      const beforeCount = video.cuts.length
      video.cuts = video.cuts.filter(cut => {
        const cutStart = parseFloat(String(cut.keepStart ?? 0))
        const cutEnd = parseFloat(String(cut.keepEnd ?? 0))
        // Check if this cut timerange overlaps with presenter segments
        const isPresenterCut = presenterSegments.some(seg =>
          seg.start < cutEnd && seg.end > cutStart
        )
        if (!isPresenterCut) {
          log(`[תכנון] הסרת חיתוך לא-פרזנטור: ${cutStart.toFixed(1)}-${cutEnd.toFixed(1)}`)
        }
        return isPresenterCut
      })
      if (video.cuts.length < beforeCount) {
        log(`[תכנון] סרטון ${video.videoIndex}: ${beforeCount - video.cuts.length} חיתוכים של לא-פרזנטור הוסרו`)
      }
    }
  }

  // Validate cuts sum to approximately target duration
  for (const video of (plan?.videos || [])) {
    const videoTarget = input.targetDuration === -1 ? (video.optimalDuration || 60) : input.targetDuration
    const totalCutDuration = video.cuts.reduce((sum, c) => sum + (parseFloat(String(c.keepEnd ?? 0)) - parseFloat(String(c.keepStart ?? 0))), 0)
    log(`סרטון ${video.videoIndex}: סך חיתוכים = ${totalCutDuration.toFixed(1)}s (יעד: ${videoTarget}s), ${video.brollMoments.length} B-Roll, ${video.subtitles.length} כתוביות`)

    if (video.cuts.length === 0) {
      video.cuts.push({
        keepStart: 0,
        keepEnd: Math.min(videoTarget, transcript.totalDuration),
      })
      log(`סרטון ${video.videoIndex}: נוצר חיתוך ברירת מחדל`)
    }

    log(`  מעברים: ${video.transitions.length}, זומים: ${video.zooms.length}, מצלמות: ${video.cameraAngles.length}`)
    log(`  Color grade: ${video.colorGrade}, Framing: ${video.framingStrategy}`)
    if (video.speakers.length > 0) log(`  דוברים: ${video.speakers.map(s => s.name).join(', ')}`)
    if (video.intro) log(`  Intro: "${video.intro.title}"`)
    if (video.outro) log(`  Outro: "${video.outro.cta}"`)
  }

  return plan
}

export async function planWithChatGPT(
  transcript: FullTranscript,
  input: AutoEditorInput,
  detectedType?: string,
  visualAnalysis?: any,
  energyAnalysis?: any
): Promise<EditingPlan> {
  const log = useAutoEditorStore.getState().addLog

  log('מתחיל תכנון דו-שלבי: במאי + עורך טכני...')

  // Step 1: Creative Director
  const creativeBrief = await getCreativeBrief(transcript, input, detectedType, visualAnalysis, energyAnalysis)

  // Step 2: Technical Editor
  const technicalPlan = await getTechnicalPlan(creativeBrief, transcript, input)

  // Normalize to EditingPlan format
  const plan = normalizeTechnicalPlan(technicalPlan, transcript, input, creativeBrief)

  log(`תכנון דו-שלבי הושלם: ${plan?.videos?.length || 0} סרטונים עם אפקטים מקצועיים`)

  // Verify plan quality
  for (const video of (plan?.videos || [])) {
    const cutsDuration = video.cuts.reduce((sum, c) => sum + (parseFloat(String(c.keepEnd ?? 0)) - parseFloat(String(c.keepStart ?? 0))), 0)
    log(`[אימות] סרטון ${video.videoIndex}: ${cutsDuration.toFixed(1)}s (יעד: ${input.targetDuration}s), ${video.brollMoments.length} B-Roll, ${video.subtitles.length} כתוביות, ${video.zooms.length} זומים`)
  }

  return plan
}
