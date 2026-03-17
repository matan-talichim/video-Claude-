import { useAutoEditorStore, type AutoEditorInput, type VideoResult, type QualityReport } from './store/autoEditorStore'
import { useUserProfileStore } from '../../stores/userProfileStore'
import { usePromptEvolutionStore } from '../../stores/promptEvolutionStore'
import { transcribeVideos } from './services/whisperService'
import { planWithChatGPT } from './services/chatgptService'
import { generateBackground } from './services/nanoBananaService'
import { generateBrollSeedance } from './services/seedanceService'
import { generateBrollVeo } from './services/veoService'
import { findMusic } from './services/pixabayService'
import { BASE_VISUAL_PROMPT, BASE_ENRICH_PROMPT } from './constants/basePrompts'
import type { EditJob, TranscriptSegment, SubtitleSegment } from './types/EditJob'
import { createEmptyEditJob } from './types/EditJob'

const API_BASE = 'http://localhost:3001/api'

// Client-side speaker matching (mirrors server's matchesSpeaker for consistency)
function matchesSpeakerClient(segmentSpeaker: any, targetPresenter: string): boolean {
  if (!segmentSpeaker || !targetPresenter) return false
  const a = String(segmentSpeaker).trim().replace(/\s+/g, ' ').toLowerCase()
  const b = String(targetPresenter).trim().replace(/\s+/g, ' ').toLowerCase()
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const numA = a.match(/\d+/)?.[0]
  const numB = b.match(/\d+/)?.[0]
  if (numA && numB && numA === numB) return true
  return false
}

// === Module-level job storage: persists across Phase 1 → Phase 2 ===
let currentJobA: EditJob | null = null

/** Call this to clear stale module-level state between sessions */
export function resetAutoEditorSession(): void {
  currentJobA = null
}

interface ValidationResult {
  valid: boolean
  message?: string
}

function validateAvailableContent(
  totalDuration: number,
  targetDuration: number,
  numberOfVideos: number,
  segments?: Array<{ end?: number }>
): ValidationResult {
  let duration = totalDuration

  if (duration === 0 && segments && segments.length > 0) {
    duration = Math.max(...segments.map(s => s.end || 0))
    if (duration === 0) {
      duration = segments.length * 3
    }
    console.log('[VALIDATE] Duration was 0, estimated:', duration)
  }

  const available = duration * 0.7
  const required = targetDuration * numberOfVideos

  if (available < required) {
    const maxPossible = Math.floor(available / targetDuration)
    return {
      valid: false,
      message: `החומר מספיק ל-${maxPossible} סרטונים בלבד. הפחת את הכמות או קצר את האורך.`,
    }
  }
  return { valid: true }
}

async function checkApiAvailability(): Promise<{
  gemini: boolean
  seedance: boolean
  pixabay: boolean
}> {
  try {
    const res = await fetch(`${API_BASE}/status`)
    if (!res.ok) return { gemini: false, seedance: false, pixabay: false }
    const data = await res.json()
    return {
      gemini: data.gemini?.connected || false,
      seedance: data.seedance?.connected || false,
      pixabay: data.pixabay?.connected || false,
    }
  } catch {
    return { gemini: false, seedance: false, pixabay: false }
  }
}

async function generateAllBroll(
  prompts: Array<{ prompt: string; videoIndex: number; momentIndex: number }>,
  generator: 'seedance' | 'veo',
  apis: { gemini: boolean; seedance: boolean }
): Promise<string[]> {
  const addLog = useAutoEditorStore.getState().addLog

  if (generator === 'seedance' && !apis.seedance) {
    addLog('Seedance לא מוגדר. מדלג על B-Roll.')
    return []
  }
  if (generator === 'veo' && !apis.gemini) {
    addLog('Gemini לא מוגדר. מדלג על B-Roll.')
    return []
  }

  const generateFn = generator === 'seedance' ? generateBrollSeedance : generateBrollVeo

  const results: string[] = []
  for (let i = 0; i < prompts.length; i++) {
    addLog(`מייצר קטע B-Roll ${i + 1} מתוך ${prompts.length}`)
    try {
      const url = await generateFn(prompts[i].prompt, 4)
      results.push(url)
    } catch (err: any) {
      addLog(`שגיאה ביצירת B-Roll ${i + 1}: ${err.message}. מדלג.`)
      results.push('')
    }
  }
  return results.filter(Boolean)
}

async function generateBackgroundSafe(
  prompt: string,
  hasGemini: boolean
): Promise<string> {
  const addLog = useAutoEditorStore.getState().addLog

  if (!hasGemini) {
    addLog('Gemini לא מוגדר. מדלג על תמונת רקע.')
    return ''
  }

  try {
    return await generateBackground(prompt)
  } catch (err: any) {
    addLog(`שגיאה ביצירת רקע: ${err.message}. ממשיך ללא רקע.`)
    return ''
  }
}

async function findMusicSafe(
  searchTerm: string,
  hasPixabay: boolean
): Promise<string> {
  const addLog = useAutoEditorStore.getState().addLog

  if (!hasPixabay) {
    addLog('Pixabay לא מוגדר. ממשיך ללא מוזיקה.')
    return ''
  }

  try {
    return await findMusic(searchTerm)
  } catch (err: any) {
    addLog(`שגיאה בחיפוש מוזיקה: ${err.message}. ממשיך ללא מוזיקה.`)
    return ''
  }
}

// === Speech pace and energy analysis ===
interface EnergyAnalysis {
  totalWords: number
  totalSpeechDuration: number
  wordsPerMinute: number
  pace: 'slow' | 'medium' | 'fast'
  energyMap: Array<{ time: number; energy: number; wordCount: number; avgGap: number }>
  silences: Array<{ start: number; end: number; duration: number }>
  peaks: Array<{ time: number; reason: string }>
  valleys: Array<{ time: number; reason: string }>
  speakerChanges: Array<{ time: number; from: string; to: string }>
}

function analyzeTranscriptEnergy(transcript: any): EnergyAnalysis {
  const segments = transcript.segments || []
  if (segments.length === 0) {
    return { totalWords: 0, totalSpeechDuration: 0, wordsPerMinute: 0, pace: 'medium', energyMap: [], silences: [], peaks: [], valleys: [], speakerChanges: [] }
  }

  const totalWords = segments.reduce((sum: number, s: any) => sum + (s.text?.split(' ').length || 0), 0)
  const totalSpeechDuration = segments.reduce((sum: number, s: any) => sum + ((s.end || 0) - (s.start || 0)), 0)
  const wordsPerMinute = totalSpeechDuration > 0 ? Math.round(totalWords / (totalSpeechDuration / 60)) : 0
  const pace: 'slow' | 'medium' | 'fast' = wordsPerMinute > 160 ? 'fast' : wordsPerMinute < 120 ? 'slow' : 'medium'

  const totalDuration = transcript.totalDuration || transcript.total_duration || 0
  const energyMap: EnergyAnalysis['energyMap'] = []
  const peaks: EnergyAnalysis['peaks'] = []
  const valleys: EnergyAnalysis['valleys'] = []
  const silences: EnergyAnalysis['silences'] = []
  const speakerChanges: EnergyAnalysis['speakerChanges'] = []

  const windowSize = 10
  for (let t = 0; t < totalDuration; t += windowSize) {
    const windowSegs = segments.filter((s: any) => s.start >= t && s.start < t + windowSize)
    const wordCount = windowSegs.reduce((sum: number, s: any) => sum + (s.text?.split(' ').length || 0), 0)

    let totalGap = 0
    for (let i = 1; i < windowSegs.length; i++) {
      totalGap += windowSegs[i].start - windowSegs[i - 1].end
    }
    const avgGap = windowSegs.length > 1 ? totalGap / (windowSegs.length - 1) : 0
    const energy = Math.min(10, Math.max(0, Math.round((wordCount / 20) * 10 - avgGap * 2)))

    energyMap.push({ time: t, energy, wordCount, avgGap })
  }

  energyMap.forEach(e => {
    if (e.energy >= 7) peaks.push({ time: e.time, reason: `אנרגיה גבוהה (${e.wordCount} מילים, קצב מהיר)` })
    if (e.energy <= 3 && e.wordCount > 0) valleys.push({ time: e.time, reason: `אנרגיה נמוכה (קצב איטי, הפסקות)` })
  })

  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end
    if (gap > 0.5) {
      silences.push({ start: segments[i - 1].end, end: segments[i].start, duration: gap })
    }
  }

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].speaker !== segments[i - 1].speaker) {
      speakerChanges.push({ time: segments[i].start, from: segments[i - 1].speaker, to: segments[i].speaker })
    }
  }

  return { totalWords, totalSpeechDuration, wordsPerMinute, pace, energyMap, silences, peaks, valleys, speakerChanges }
}

// === Quality metrics ===
function evaluateEditQuality(job: EditJob, plan: any, outputDuration: number, targetDuration: number): QualityReport {
  const report: QualityReport = {
    score: 100,
    issues: [],
    passed: [],
  }

  const hasTranscript = (job.transcript?.segments?.length || 0) > 0
  const hasPresenter = !!job.transcript?.mainPresenter
  const hasBrollAssets = (job.assets.brollClips.length) > 0
  const hasMusicAsset = !!job.assets.musicTrack

  const durationDiff = Math.abs(outputDuration - targetDuration)
  if (durationDiff > 5) {
    report.score -= 20
    report.issues.push({ severity: 'error', message: `אורך הסרטון ${outputDuration.toFixed(1)}שנ במקום ${targetDuration}שנ (הפרש ${durationDiff.toFixed(1)}שנ)` })
  } else if (durationDiff > 2) {
    report.score -= 5
    report.issues.push({ severity: 'warning', message: `אורך הסרטון ${outputDuration.toFixed(1)}שנ (הפרש קטן מהיעד)` })
  } else {
    report.passed.push(`אורך תואם ליעד (${outputDuration.toFixed(1)}שנ)`)
  }

  const brollCount = hasBrollAssets ? job.assets.brollClips.length : 0
  const planBrollCount = plan?.brollMoments?.length || plan?.broll?.length || 0
  const expectedBRoll = Math.floor(targetDuration / 15)
  if (brollCount >= expectedBRoll) {
    report.passed.push(`B-Roll: ${brollCount} קטעים (הוכנסו לסרטון)`)
  } else if (brollCount > 0) {
    report.score -= 5
    report.issues.push({ severity: 'info', message: `B-Roll: ${brollCount} קטעים מוכנסים (מומלץ ${expectedBRoll}+)` })
  } else if (planBrollCount > 0) {
    report.score -= 10
    report.issues.push({ severity: 'warning', message: `B-Roll: ${planBrollCount} תוכננו אך לא הוכנסו` })
  } else {
    report.score -= 15
    report.issues.push({ severity: 'warning', message: 'אין B-Roll כלל' })
  }

  const subtitleCount = job.subtitles.segments.length
  if (subtitleCount > 0) {
    report.passed.push(`כתוביות: ${subtitleCount} שורות (מתמלול${hasPresenter ? ' - דובר ראשי בלבד' : ''})`)
  } else if (hasTranscript) {
    report.score -= 10
    report.issues.push({ severity: 'warning', message: 'אין כתוביות - חסר תמלול' })
  }

  if (plan?.transitions?.length > 0) {
    report.passed.push(`מעברים: ${plan?.transitions?.length}`)
  } else {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'אין מעברים - חיתוכים ישירים בלבד' })
  }

  if (plan?.outro) {
    report.passed.push('CTA בסיום')
  } else {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'אין קריאה לפעולה בסוף' })
  }

  if (plan?.colorGrade && plan?.colorGrade !== 'none') {
    report.passed.push(`Color grade: ${plan?.colorGrade}`)
  }

  if (job.plan?.zooms && job.plan.zooms.length > 0) {
    report.passed.push(`זומים: ${job.plan.zooms.length}`)
  } else {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'אין זומים' })
  }

  if (hasMusicAsset) {
    report.passed.push('מוזיקת רקע')
  } else if (plan?.musicMoments?.length > 0 || plan?.music_moments?.length > 0) {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'מוזיקת רקע תוכננה אך לא נמצאה' })
  }

  if (hasPresenter) {
    report.passed.push(`בידוד דובר ראשי: ${job.transcript?.mainPresenter}`)
  } else if (hasTranscript && job.transcript!.segments.some(s => s.speaker)) {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'זוהו מספר דוברים אך לא בוצע בידוד' })
  }

  report.score = Math.max(0, Math.min(100, report.score))
  return report
}

// === Build EditJob from editing plan + assets for server processing ===
function buildEditJobForProcessing(
  job: EditJob,
  editingPlan: any,
  enrichment: any,
  finalInput: AutoEditorInput,
  musicUrl: string,
  backgroundImage: string,
  brollClips: string[],
  versionLabel: 'A' | 'B',
  skipPlatformExport: boolean,
  videoIndex: number = 0,
): EditJob {
  const videoPlan = editingPlan?.videos?.[videoIndex] || editingPlan?.videos?.[0] || {}

  // Build cuts
  const cuts = (videoPlan?.cuts || []).map((c: any) => ({
    sourceStart: parseFloat(String(c.keepStart ?? c.keep_start ?? 0)),
    sourceEnd: parseFloat(String(c.keepEnd ?? c.keep_end ?? 0)),
    outputStart: 0, // Will be calculated
    type: 'presenter' as const,
  }))

  // Calculate outputStart for each cut
  let outputOffset = 0
  for (const cut of cuts) {
    cut.outputStart = outputOffset
    outputOffset += cut.sourceEnd - cut.sourceStart
  }

  // Build zooms
  const rawZooms = videoPlan?.zooms || videoPlan?.zoom_effects || videoPlan?.zoomEffects || []
  const zooms = rawZooms.map((z: any) => ({
    timestamp: z.at_time ?? z.atTime ?? z.relative_time ?? z.relativeTime ?? z.time ?? z.start ?? 0,
    duration: z.duration || 3,
    intensity: Math.min(z.scale || z.intensity || 1.2, 1.5),
    direction: (z.direction || 'in') as 'in' | 'out',
    reason: z.reason || '',
  }))

  // Build camera angles
  const rawAngles = videoPlan?.cameraAngles || videoPlan?.camera_angles || videoPlan?.angles || []
  const cameraAngles = rawAngles.map((ca: any) => ({
    timestamp: ca.start || 0,
    duration: (ca.end || ca.start || 0) - (ca.start || 0),
    type: (ca.camera || ca.type || 'wide') as 'wide' | 'medium' | 'closeup' | 'left' | 'right',
    cropX: 0, cropY: 0, cropW: 0, cropH: 0,
  }))

  // Build B-Roll placements
  const planBroll = videoPlan?.brollMoments || videoPlan?.broll || editingPlan?.prompts?.broll || []
  const brollPlacements = brollClips.map((_url: string, idx: number) => ({
    outputTimestamp: planBroll[idx]?.time || planBroll[idx]?.insert_at || planBroll[idx]?.atTime || (idx * 15),
    duration: planBroll[idx]?.duration || 4,
    assetIndex: idx,
    keepAudio: true,
  })).filter((_: any, idx: number) => brollClips[idx])

  // Build B-Roll assets
  const brollAssets = brollClips.filter(Boolean).map(url => ({
    localPath: '',
    url,
    type: 'video' as const,
    duration: 4,
    width: 0,
    height: 0,
  }))

  // Build speakers (lower thirds)
  const rawSpeakers = videoPlan?.speakers || videoPlan?.lower_thirds || videoPlan?.lowerThirds || []
  const speakers = rawSpeakers.map((s: any) => ({
    name: s.name || 'דובר',
    firstAppearance: s.firstAppearance ?? s.first_appearance ?? 0,
    displayDuration: s.displayDuration ?? s.display_duration ?? 4,
  }))

  // Build graphics
  const rawGraphics = videoPlan?.graphics || videoPlan?.overlays || videoPlan?.text_overlays || []
  const graphics = rawGraphics.map((g: any) => ({
    type: g.type || 'text',
    text: g.text || '',
    atTime: g.atTime ?? g.at_time ?? 0,
    duration: g.duration ?? 3,
    label: g.label,
  }))

  // Build transitions
  const rawTransitions = videoPlan?.transitions || ['fade']
  const transitions = rawTransitions.map((t: any) => ({
    type: (typeof t === 'string' ? t : t.type || 'fade') as 'fade' | 'cut' | 'dissolve',
    duration: typeof t === 'object' ? (t.duration || 0.5) : 0.5,
    atTime: typeof t === 'object' ? (t.atTime || 0) : 0,
  }))

  // Build subtitle segments from transcript
  const subtitleSegments: SubtitleSegment[] = []
  if (job.subtitles.enabled && job.transcript?.segments) {
    const presenterSegments = job.transcript.segments.filter(s => s.isPresenter)
    const segsToUse = presenterSegments.length > 0 ? presenterSegments : job.transcript.segments
    for (const seg of segsToUse) {
      subtitleSegments.push({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })
    }
  }

  // Also add plan subtitles if they exist
  const planSubs = videoPlan?.subtitles || []
  if (planSubs.length > 0 && subtitleSegments.length === 0) {
    for (const s of planSubs) {
      subtitleSegments.push({
        start: s.start ?? s.keepStart ?? 0,
        end: s.end ?? s.keepEnd ?? 0,
        text: s.text || '',
      })
    }
  }

  const processJob: EditJob = {
    ...job,
    plan: {
      contentType: enrichment?.detected_type || 'corporate',
      targetDuration: finalInput.targetDuration === -1 ? 'auto' : finalInput.targetDuration,
      mainMessage: enrichment?.enhanced_prompt || finalInput.userPrompt,
      hookStrategy: videoPlan?.hookStrategy || '',
      cuts,
      cameraAngles,
      zooms,
      transitions,
      colorGrade: enrichment?.style?.color || videoPlan?.colorGrade || videoPlan?.color_grade || 'clean',
      backgroundBlur: videoPlan?.backgroundBlur !== false,
      speakers,
      graphics,
      brollPlacements,
    },
    assets: {
      brollClips: brollAssets,
      backgroundImage: backgroundImage || null,
      musicTrack: musicUrl || null,
      musicVolume: 0.15,
    },
    subtitles: {
      ...job.subtitles,
      segments: subtitleSegments,
      animated: finalInput.animatedSubtitles !== false,
      style: (finalInput.animationStyle as any) || job.subtitles.style,
    },
    output: {
      platforms: (finalInput.platforms || ['tiktok']).map(p => ({ name: p, ratio: getPlatformRatio(p) })),
      skipPlatformExport,
      version: versionLabel,
    },
  }

  console.log('=== ORCHESTRATOR SENDING EditJob TO PROCESS ===')
  console.log(`Job ID: ${processJob.id}`)
  console.log(`Version: ${versionLabel}`)
  console.log(`Transcript segments: ${processJob.transcript?.segments?.length || 0}`)
  console.log(`Main presenter: ${processJob.transcript?.mainPresenter || 'MISSING'}`)
  console.log(`Cuts: ${processJob.plan?.cuts?.length || 0}`)
  console.log(`Zooms: ${processJob.plan?.zooms?.length || 0}`)
  console.log(`Camera angles: ${processJob.plan?.cameraAngles?.length || 0}`)
  console.log(`B-Roll placements: ${processJob.plan?.brollPlacements?.length || 0}`)
  console.log(`B-Roll clips: ${processJob.assets.brollClips.length}`)
  console.log(`Subtitle segments: ${processJob.subtitles.segments.length}`)
  console.log(`Music: ${!!processJob.assets.musicTrack}`)
  console.log(`Background: ${!!processJob.assets.backgroundImage}`)
  console.log(`Color grade: ${processJob.plan?.colorGrade}`)
  console.log(`Skip platform export: ${processJob.output.skipPlatformExport}`)
  console.log(`Logo: ${processJob.logo?.serverUrl ? 'YES (' + processJob.logo.position + ')' : 'NO'}`)

  return processJob
}

function getPlatformRatio(platform: string): string {
  const ratios: Record<string, string> = {
    tiktok: '9:16', reels: '9:16', shorts: '9:16', story: '9:16',
    youtube: '16:9', facebook: '16:9', twitter: '16:9',
    linkedin: '1:1',
  }
  return ratios[platform] || '9:16'
}

// === Process videos through the server ===
async function processVideosWithPlan(
  job: EditJob,
  editingPlan: any,
  enrichment: any,
  finalInput: AutoEditorInput,
  musicUrl: string,
  backgroundImage: string,
  versionLabel: 'A' | 'B',
  skipPlatformExport: boolean,
  brollClips: string[],
): Promise<VideoResult[]> {
  const addLog = useAutoEditorStore.getState().addLog
  const processedVideos: VideoResult[] = []

  const videos = editingPlan?.videos || []
  for (let i = 0; i < videos.length; i++) {
    const videoPlan = videos[i]

    addLog(`[${versionLabel}] מעבד סרטון ${i + 1}: שולח EditJob לשרת...`)

    // Build a complete EditJob for this specific video
    const processJob = buildEditJobForProcessing(
      job, editingPlan, enrichment, finalInput,
      musicUrl, backgroundImage, brollClips,
      versionLabel, skipPlatformExport, i,
    )

    // Attach logo data if available
    if (finalInput.logo?.serverUrl) {
      processJob.logo = {
        serverUrl: finalInput.logo.serverUrl,
        position: finalInput.logo.position,
        size: finalInput.logo.size,
        opacity: finalInput.logo.opacity,
      }
    }

    addLog(`[${versionLabel}] Sending EditJob: transcript=${processJob.transcript?.segments?.length || 0} presenter=${processJob.transcript?.mainPresenter || 'none'} broll=${processJob.assets.brollClips.length} zooms=${processJob.plan?.zooms?.length || 0} music=${musicUrl ? 'YES' : 'NO'} bg=${backgroundImage ? 'YES' : 'NO'} logo=${finalInput.logo?.serverUrl ? 'YES' : 'NO'}`)

    const processRes = await fetch(`${API_BASE}/auto-editor/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(processJob),
    })

    if (!processRes.ok) {
      const err = await processRes.json().catch(() => ({}))
      throw new Error(`שגיאה בעיבוד סרטון ${i + 1} [${versionLabel}]: ${err.message || err.error || processRes.statusText}`)
    }

    const result = await processRes.json()
    addLog(`[${versionLabel}] סרטון ${i + 1} עובד בהצלחה: ${result.files?.length || 0} קבצים`)

    processedVideos.push({
      videoIndex: i + 1,
      files: result.files || [],
      optimalDuration: videoPlan.optimalDuration,
      durationReasoning: videoPlan.durationReasoning,
      recommendedPlatform: videoPlan.recommendedPlatform,
    })
  }

  return processedVideos
}

// === A/B version style helpers ===
function getVersionAStyle(type: string): string {
  switch (type) {
    case 'marketing_product': return 'פתיחה עם הבעיה, קצב מהיר, הרבה B-Roll'
    case 'podcast_interview': return 'פתיחה עם ציטוט חזק, מולטי-קאם, מעט B-Roll'
    case 'tutorial': return 'פתיחה עם "מה תלמדו", שלבים ממוספרים'
    case 'ad_short': return 'פתיחה עם הבעיה, קצב מהיר מאוד, הרבה אפקטים'
    case 'social_reels': return 'פתיחה עם Hook טקסט, קצב מהיר, קריוקי'
    case 'testimonial': return 'פתיחה עם התוצאה הטובה, קצב בינוני'
    default: return 'סגנון קלאסי עם Hook בהתחלה'
  }
}

function getVersionBStyle(type: string): string {
  switch (type) {
    case 'marketing_product': return 'פתיחה עם התוצאה (לפני/אחרי), קצב בינוני, B-Roll ממוקד'
    case 'podcast_interview': return 'פתיחה כרונולוגית, יותר B-Roll, קצב מעט מהיר'
    case 'tutorial': return 'פתיחה עם התוצאה הסופית, אז חזרה לשלבים'
    case 'ad_short': return 'פתיחה עם התוצאה המפתיעה, קצב מגוון, מעברים יצירתיים'
    case 'social_reels': return 'פתיחה עם רגע מפתיע מהאמצע, סטוריטלינג'
    case 'testimonial': return 'פתיחה עם הבעיה שהייתה, מסע רגשי'
    default: return 'סגנון דינמי עם Hook מאמצע הסרטון'
  }
}

/**
 * Phase 1: Transcribe → Visual Analysis → Energy Analysis → Enrich prompt → Pause for user review
 * Creates EditJob and stores it in module-level variable for Phase 2
 */
export async function runAutoEditor(input: AutoEditorInput): Promise<void> {
  const store = useAutoEditorStore.getState()
  const { setStep, setProgress, setError, setInput, addLog,
    setCachedTranscript, setEnrichment, setTranscript, setVisualAnalysis, setEnergyAnalysis } = store

  const profile = useUserProfileStore.getState()
  const enrichedInput: AutoEditorInput = {
    ...input,
    brollGenerator: input.brollGenerator || (profile.preferredBrollProvider as 'seedance' | 'veo') || 'seedance',
    platforms: input.platforms?.length ? input.platforms : ['tiktok', 'reels', 'shorts'],
  }

  const sessionProjectId = `auto-editor-${Date.now()}`
  profile.recordAutoEditResult(sessionProjectId, ['auto_edit'], {
    userPrompt: input.userPrompt,
    targetDuration: input.targetDuration,
    numberOfVideos: input.numberOfVideos,
    brollGenerator: enrichedInput.brollGenerator,
    platforms: enrichedInput.platforms,
  })

  setInput(enrichedInput)

  // === Create the EditJob - SINGLE source of truth ===
  const job = createEmptyEditJob(
    enrichedInput.videoUrls[0],
    enrichedInput.videoUrls[0],
  )
  job.subtitles.enabled = enrichedInput.includeSubtitles !== false
  job.subtitles.animated = enrichedInput.animatedSubtitles !== false
  job.subtitles.style = (enrichedInput.animationStyle as any) || 'auto'

  try {
    const apis = await checkApiAvailability()
    addLog(`APIs: Gemini=${apis.gemini ? 'V' : 'X'} Seedance=${apis.seedance ? 'V' : 'X'} Pixabay=${apis.pixabay ? 'V' : 'X'}`)

    // Step 1 — Transcription
    let transcript = useAutoEditorStore.getState().cachedTranscript
    if (!transcript) {
      if (useAutoEditorStore.getState().step !== 'transcribing') {
        setStep('transcribing')
      }
      transcript = await transcribeVideos(enrichedInput.videoUrls)
      setCachedTranscript(transcript)
    } else {
      addLog('משתמש בתמלול קיים מהמטמון')
    }

    // Store in EditJob
    const segments: TranscriptSegment[] = (transcript.segments || []).map((s: any) => ({
      start: s.start || 0,
      end: s.end || 0,
      text: s.text || '',
      speaker: s.speaker || '',
      isPresenter: false,
    }))

    const speakerTimes: Record<string, number> = {}
    for (const seg of segments) {
      speakerTimes[seg.speaker] = (speakerTimes[seg.speaker] || 0) + (seg.end - seg.start)
    }

    job.transcript = {
      segments,
      speakers: Object.entries(speakerTimes).map(([name, totalTime]) => ({
        name,
        totalTime,
        isPresenter: false,
      })),
      mainPresenter: '',
      presenterConfidence: 'low',
      totalDuration: transcript.totalDuration || transcript.total_duration || 0,
    }
    job.sourceDuration = job.transcript.totalDuration

    // Also keep store updated for UI
    setTranscript(transcript)

    // Step 2 — Validation
    setStep('validating')
    if (enrichedInput.targetDuration !== -1) {
      const validation = validateAvailableContent(
        job.transcript.totalDuration,
        enrichedInput.targetDuration,
        enrichedInput.numberOfVideos,
        transcript.segments
      )
      if (!validation.valid) {
        setError(validation.message!)
        return
      }
    }
    addLog('ולידציה עברה בהצלחה')

    // Step 3 — Visual Analysis
    setStep('analyzing_visuals')
    setProgress({ current: 0, total: 1, label: 'AI מנתח את התמונה בסרטון...' })

    let visualAnalysis = null
    try {
      const evolvedVisualPrompt = usePromptEvolutionStore.getState().getEvolvedPrompt('visual_analysis', BASE_VISUAL_PROMPT)

      const visualRes = await fetch(`${API_BASE}/auto-editor/analyze-visuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: enrichedInput.videoUrls[0],
          duration: job.transcript.totalDuration,
          promptEvolution: evolvedVisualPrompt !== BASE_VISUAL_PROMPT ? evolvedVisualPrompt : undefined,
        }),
      })
      if (visualRes.ok) {
        visualAnalysis = await visualRes.json()

        if (visualAnalysis._promptImprovements?.length > 0) {
          usePromptEvolutionStore.getState().recordEvolution('visual_analysis', visualAnalysis._promptImprovements)
          addLog(`[למידה] ניתוח ויזואלי למד ${visualAnalysis._promptImprovements.length} תובנות חדשות`)
        }

        // Store in EditJob
        job.visualAnalysis = {
          frames: visualAnalysis.scene_analysis || [],
          presenterDescription: visualAnalysis.overall?.presenter_description || '',
          presenterFrames: [],
          sceneChanges: (visualAnalysis.scene_analysis || []).map((s: any) => s.timestamp || 0),
        }

        setVisualAnalysis(visualAnalysis)
        addLog(`ניתוח ויזואלי: ${visualAnalysis.scene_analysis?.length || 0} סצנות, מיקום: ${visualAnalysis.overall?.location || 'לא ידוע'}`)
      }
    } catch (e: any) {
      console.warn('[AUTO-EDIT] Visual analysis failed, continuing without:', e.message)
      addLog('ניתוח ויזואלי נכשל, ממשיך ללא')
    }

    // === Identify presenter ===
    if (visualAnalysis && transcript.sortedSpeakers?.length > 1) {
      try {
        addLog('מזהה פרזנטור ראשי לפי ניתוח ויזואלי + דיאריזציה...')
        const presenterRes = await fetch(`${API_BASE}/auto-editor/identify-presenter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: { segments: transcript.segments },
            visualAnalysis,
            speakerTimes: transcript.speakerTimes,
            framesDir: visualAnalysis?.framesDir || '',
          }),
        })
        if (presenterRes.ok) {
          const presenterData = await presenterRes.json()
          let { mainPresenter: detectedPresenter, confidence, presenterDescription, method } = presenterData

          if (!detectedPresenter || detectedPresenter === 'undefined' || detectedPresenter === 'null' || detectedPresenter === 'unknown') {
            const speakers = transcript.sortedSpeakers || []
            const validSpeaker = speakers.find((s: any) => s.speaker && s.speaker !== 'undefined')
            detectedPresenter = validSpeaker?.speaker || 'דובר 1'
            confidence = 'low'
            addLog(`[פרזנטור] שם לא תקין מהשרת, נופל לברירת מחדל: ${detectedPresenter}`)
          }

          // Update EditJob
          job.transcript!.mainPresenter = detectedPresenter
          job.transcript!.presenterConfidence = confidence || 'medium'
          job.transcript!.segments.forEach(seg => {
            seg.isPresenter = matchesSpeakerClient(seg.speaker, detectedPresenter)
          })
          job.transcript!.speakers.forEach(s => {
            s.isPresenter = matchesSpeakerClient(s.name, detectedPresenter)
          })

          // Also update store for UI
          store.setDetectedPresenter(detectedPresenter, confidence, presenterDescription)
          store.setMainPresenter(detectedPresenter)

          transcript.mainSpeaker = detectedPresenter
          transcript.autoDetected = true
          transcript.segments.forEach((seg: any) => {
            seg.isPresenter = matchesSpeakerClient(seg.speaker, detectedPresenter)
          })
          setTranscript({ ...transcript })

          addLog(`פרזנטור זוהה: ${detectedPresenter} (שיטה: ${method}, ביטחון: ${confidence})`)
        }
      } catch (e: any) {
        console.warn('[AUTO-EDIT] Presenter identification failed, using default:', e.message)
        addLog('זיהוי פרזנטור נכשל, משתמש בברירת מחדל')
      }
    }

    // === Energy Analysis ===
    const energyAnalysis = analyzeTranscriptEnergy(transcript)
    setEnergyAnalysis(energyAnalysis)
    addLog(`ניתוח אנרגיה: ${energyAnalysis.wordsPerMinute} מילים/דקה (${energyAnalysis.pace}), ${energyAnalysis.peaks.length} שיאים, ${energyAnalysis.valleys.length} שפלים`)

    // === Step: Clean transcript (remove stutters, fillers, retakes) ===
    setStep('cleaning')
    setProgress({ current: 0, total: 1, label: 'מנקה טעויות וגמגומים...' })

    try {
      const cleanResponse = await fetch(`${API_BASE}/auto-editor/clean-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: { segments: job.transcript!.segments },
          mainPresenter: job.transcript!.mainPresenter,
        }),
      })

      if (cleanResponse.ok) {
        const cleanResult = await cleanResponse.json()
        job.transcript!.cleanedSegments = cleanResult.cleanedSegments
        job.transcript!.cleaningSummary = cleanResult.summary

        const removed = cleanResult.originalCount - cleanResult.cleanedCount
        addLog(`ניקוי תמלול: ${cleanResult.originalCount} → ${cleanResult.cleanedCount} קטעים (הוסרו ${removed} קטעים פגומים)`)
        console.log(`[AUTO-EDIT] Cleaned: ${cleanResult.originalCount} → ${cleanResult.cleanedCount} segments`)
      } else {
        addLog('ניקוי תמלול נכשל, ממשיך עם התמלול המקורי')
      }
    } catch (e: any) {
      console.warn('[AUTO-EDIT] Transcript cleaning failed:', e.message)
      addLog('ניקוי תמלול נכשל, ממשיך עם התמלול המקורי')
    }

    store.markStepCompleted('cleaning')

    // Step 4 — Enrich prompt
    setStep('enriching')
    setProgress({ current: 0, total: 1, label: 'AI מנתח את התוכן ומשפר את הפרומפט...' })

    const evolvedEnrichPrompt = usePromptEvolutionStore.getState().getEvolvedPrompt('enrichment', BASE_ENRICH_PROMPT)

    let socialRules = ''
    try {
      const rulesRes = await fetch('http://localhost:3001/api/learning/rules')
      if (rulesRes.ok) {
        const data = await rulesRes.json()
        socialRules = data.rules || ''
      }
    } catch {}

    const enrichRes = await fetch(`${API_BASE}/auto-editor/enrich-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: {
          segments: transcript.segments,
          total_duration: job.transcript!.totalDuration,
          totalDuration: job.transcript!.totalDuration,
        },
        userPrompt: enrichedInput.userPrompt,
        targetDuration: enrichedInput.targetDuration,
        numberOfVideos: enrichedInput.numberOfVideos,
        visualAnalysis,
        energyAnalysis,
        userProfile: profile.getProfileForPrompt(),
        promptEvolution: evolvedEnrichPrompt !== BASE_ENRICH_PROMPT ? evolvedEnrichPrompt : undefined,
        socialLearningRules: socialRules,
      }),
    })

    if (!enrichRes.ok) {
      const err = await enrichRes.json().catch(() => ({}))
      throw new Error(err.message || 'שגיאה בשיפור הפרומפט')
    }

    const enrichment = await enrichRes.json()

    if (enrichment._promptImprovements?.length > 0) {
      usePromptEvolutionStore.getState().recordEvolution('enrichment', enrichment._promptImprovements)
      addLog(`[למידה] שיפור פרומפט למד ${enrichment._promptImprovements.length} תובנות חדשות`)
    }

    console.log('[AUTO-EDIT] Enhanced prompt:', enrichment.enhanced_prompt?.substring(0, 100))
    console.log('[AUTO-EDIT] B-Roll suggestions:', enrichment.broll_suggestions?.length)
    addLog(`AI שיפר את הפרומפט: ${enrichment.broll_suggestions?.length || 0} הצעות B-Roll`)

    // Store enrichment and pause for user review
    setEnrichment(enrichment)

    // Save job to module-level variable for Phase 2
    currentJobA = job

    setStep('review_enrichment')
    // PAUSE HERE - UI will show EnrichmentReview component

  } catch (err: any) {
    setError(err.message || 'שגיאה לא צפויה')
  }
}

/**
 * Phase 2: Called after user approves the enriched prompt
 * Planning (A+B) → Asset Generation → FFmpeg Processing (2 versions) → Compare → Done
 */
export async function continueAfterEnrichment(
  overrides?: { userPrompt?: string; selectedBRoll?: any[] }
): Promise<void> {
  const store = useAutoEditorStore.getState()
  const { setStep, setProgress, setError, setResults, setProcessedVideos, addLog,
    setCachedEditingPlan, setCachedAssets, setVersionA, setVersionB, setQualityReport } = store

  const enrichedInput = store.input
  if (!enrichedInput) {
    setError('חסר קלט - נסה שוב')
    return
  }

  // Retrieve the EditJob from Phase 1
  const job = currentJobA
  if (!job || !job.transcript) {
    setError('חסר תמלול - נסה שוב')
    return
  }

  // Check if user changed the presenter in Phase 1 review
  const storePresenter = store.mainPresenter || store.detectedPresenter
  if (storePresenter && storePresenter !== job.transcript.mainPresenter) {
    job.transcript.mainPresenter = storePresenter
    job.transcript.segments.forEach(seg => {
      seg.isPresenter = matchesSpeakerClient(seg.speaker, storePresenter)
    })
    job.transcript.speakers.forEach(s => {
      s.isPresenter = matchesSpeakerClient(s.name, storePresenter)
    })
    console.log(`[EditJob] Presenter updated from store: ${storePresenter}`)
  }

  const transcript = store.transcript || store.cachedTranscript
  const enrichment = store.enrichment
  const visualAnalysis = store.visualAnalysis
  const energyAnalysis = store.energyAnalysis
  const detectedType = enrichment?.detected_type || 'corporate'

  const finalInput: AutoEditorInput = {
    ...enrichedInput,
    userPrompt: overrides?.userPrompt || enrichment?.enhanced_prompt || enrichedInput.userPrompt,
  }

  // If animated subtitles enabled with 'auto' style, use learned recommendation
  if (finalInput.animatedSubtitles && finalInput.animationStyle === 'auto') {
    try {
      const rulesRes = await fetch('http://localhost:3001/api/learning/rules')
      if (rulesRes.ok) {
        const data = await rulesRes.json()
        if (data.subtitleRecommendation?.style) {
          finalInput.animationStyle = data.subtitleRecommendation.style
          addLog(`[למידה] סגנון כתוביות מונפשות נלמד: ${finalInput.animationStyle}`)
        } else {
          finalInput.animationStyle = 'karaoke'
        }
      } else {
        finalInput.animationStyle = 'karaoke'
      }
    } catch {
      finalInput.animationStyle = 'karaoke'
    }
  }

  try {
    const apis = await checkApiAvailability()

    // Step 4 — Two-step AI planning: 2 versions (A and B)
    const cachedPlan = useAutoEditorStore.getState().cachedEditingPlan
    let editingPlanA = cachedPlan?.planA || cachedPlan
    let editingPlanB: any = cachedPlan?.planB || null

    // If cached plan is the new format with planA/planB, extract planA
    if (cachedPlan?.planA) editingPlanA = cachedPlan.planA

    if (!editingPlanA) {
      setStep('planning')

      const versionAStyle = getVersionAStyle(detectedType)
      setProgress({ current: 0, total: 4, label: `גרסה A: ${versionAStyle}` })
      addLog(`תכנון גרסה A: ${versionAStyle}`)

      const inputA: AutoEditorInput = {
        ...finalInput,
        userPrompt: `${finalInput.userPrompt}\n\nגישת עריכה: ${versionAStyle}`,
      }
      editingPlanA = await planWithChatGPT(transcript, inputA, detectedType, visualAnalysis, energyAnalysis)
      setCachedEditingPlan(editingPlanA)

      const versionBStyle = getVersionBStyle(detectedType)
      setProgress({ current: 2, total: 4, label: `גרסה B: ${versionBStyle}` })
      addLog(`תכנון גרסה B: ${versionBStyle}`)

      const inputB: AutoEditorInput = {
        ...finalInput,
        userPrompt: `${finalInput.userPrompt}\n\nגישת עריכה: ${versionBStyle}`,
      }
      editingPlanB = await planWithChatGPT(transcript, inputB, detectedType, visualAnalysis, energyAnalysis)
      // Cache both plans so B is available on retry
      setCachedEditingPlan({ planA: editingPlanA, planB: editingPlanB })

      setProgress({ current: 4, total: 4, label: 'שני התכנונים הושלמו!' })
    } else {
      // Restore planB from cache if available
      if (cachedPlan?.planB) editingPlanB = cachedPlan.planB
      addLog('משתמש בתכנון קיים מהמטמון')
    }

    if (finalInput.targetDuration === -1 && editingPlanA?.videos) {
      const durationSummary = (editingPlanA?.videos || [])
        .map((v: any) => `סרטון ${v.videoIndex} = ${v.optimalDuration || '?'}שנ`)
        .join(', ')
      addLog(`AI בחר אורך (A): ${durationSummary}`)
    }

    for (const video of (editingPlanA?.videos || [])) {
      const cutsDuration = video.cuts.reduce((sum: number, c: any) => sum + (parseFloat(String(c.keepEnd ?? 0)) - parseFloat(String(c.keepStart ?? 0))), 0)
      const videoTarget = finalInput.targetDuration === -1 ? (video.optimalDuration || '?') : finalInput.targetDuration
      addLog(`[אימות A] סרטון ${video.videoIndex}: ${cutsDuration.toFixed(1)}s (יעד: ${videoTarget}s)`)
    }

    // Step 5 — Generate assets
    let backgroundImage: string, brollClips: string[], musicUrl: string
    const cachedAssets = useAutoEditorStore.getState().cachedAssets
    if (cachedAssets) {
      addLog('משתמש בנכסים קיימים מהמטמון')
      backgroundImage = cachedAssets.backgroundImage
      brollClips = cachedAssets.brollClips
      musicUrl = cachedAssets.music
    } else {
      setStep('generating_assets')

      const shouldGenerateBackground = finalInput.includeBackground !== false
      if (!shouldGenerateBackground) {
        addLog('מדלג על תמונת רקע (כובה בהגדרות)')
      }

      const assetResults = await Promise.allSettled([
        shouldGenerateBackground
          ? generateBackgroundSafe(editingPlanA.prompts.backgroundImage, apis.gemini)
          : Promise.resolve(''),
        generateAllBroll(editingPlanA.prompts.broll, finalInput.brollGenerator, apis),
        findMusicSafe(
          enrichment?.style?.music_search || editingPlanA.prompts.musicSearch,
          apis.pixabay
        ),
      ])
      backgroundImage = assetResults[0].status === 'fulfilled' ? assetResults[0].value : ''
      brollClips = assetResults[1].status === 'fulfilled' ? assetResults[1].value : []
      musicUrl = assetResults[2].status === 'fulfilled' ? assetResults[2].value : ''
      setCachedAssets({ backgroundImage, brollClips, music: musicUrl })
    }

    // Upload logo if provided
    if (finalInput.logo?.file && !finalInput.logo?.serverUrl) {
      try {
        addLog('מעלה לוגו לשרת...')
        const formData = new FormData()
        formData.append('file', finalInput.logo.file)
        const uploadRes = await fetch(`${API_BASE}/upload-temp`, {
          method: 'POST',
          body: formData,
        })
        if (uploadRes.ok) {
          const { url } = await uploadRes.json()
          finalInput.logo = { ...finalInput.logo, serverUrl: url }
          addLog(`לוגו הועלה: ${url}`)
        }
      } catch (e: any) {
        addLog(`העלאת לוגו נכשלה: ${e.message}`)
      }
    }

    // Step 6 — Process videos with FFmpeg (2 versions if B plan exists)
    setStep('editing')

    const hasVersionB = !!editingPlanB

    // Process Version A
    setProgress({ current: 0, total: 2, label: 'עורך גרסה A...' })
    const processedA = await processVideosWithPlan(
      job, editingPlanA, enrichment, finalInput,
      musicUrl, backgroundImage, 'A', hasVersionB, brollClips,
    )

    // Process Version B
    let processedB: VideoResult[] | null = null
    if (editingPlanB) {
      setProgress({ current: 1, total: 2, label: 'עורך גרסה B...' })
      try {
        processedB = await processVideosWithPlan(
          job, editingPlanB, enrichment, finalInput,
          musicUrl, backgroundImage, 'B', true, brollClips,
        )
      } catch (err: any) {
        addLog(`גרסה B נכשלה: ${err.message}. ממשיך עם גרסה A בלבד.`)
      }
    }

    // === Quality metrics ===
    const videoPlanA = editingPlanA?.videos?.[0]
    const videoTargetDur = finalInput.targetDuration === -1 ? (videoPlanA?.optimalDuration || 60) : finalInput.targetDuration
    const cutsDurA = videoPlanA?.cuts?.reduce((sum: number, c: any) => sum + (parseFloat(String(c.keepEnd ?? 0)) - parseFloat(String(c.keepStart ?? 0))), 0) || 0
    const qualityReport = evaluateEditQuality(job, videoPlanA, cutsDurA, videoTargetDur)
    setQualityReport(qualityReport)
    addLog(`דוח איכות: ${qualityReport.score}/100 (${qualityReport.passed.length} עברו, ${qualityReport.issues.length} בעיות)`)

    // Record quality for prompt evolution
    const evolutionModels = ['visual_analysis', 'enrichment', 'creative_brief', 'technical_plan']
    const evoStore = usePromptEvolutionStore.getState()
    evolutionModels.forEach(modelId => {
      const evo = evoStore.evolutions[modelId]
      if (evo && evo.successRate > 0 && qualityReport.score < evo.successRate * 100 * 0.6) {
        console.warn(`[EVOLUTION] ${modelId}: quality dropped! Rolling back last addition.`)
        addLog(`[למידה] ${modelId}: איכות ירדה, מבטל שיפור אחרון`)
        const trimmed = evo.additions.slice(0, -1)
        usePromptEvolutionStore.setState(state => ({
          evolutions: {
            ...state.evolutions,
            [modelId]: { ...evo, additions: trimmed, version: evo.version + 1 },
          },
        }))
      }
      evoStore.recordSuccess(modelId, qualityReport.score)
    })

    if (processedB && processedB.length > 0) {
      const versionAStyle = getVersionAStyle(detectedType)
      const versionBStyle = getVersionBStyle(detectedType)

      setVersionA(
        processedA.map(v => ({ approach: versionAStyle, files: v.files, videoIndex: v.videoIndex, optimalDuration: v.optimalDuration, durationReasoning: v.durationReasoning, recommendedPlatform: v.recommendedPlatform })),
        versionAStyle
      )
      setVersionB(
        processedB.map(v => ({ approach: versionBStyle, files: v.files, videoIndex: v.videoIndex, optimalDuration: v.optimalDuration, durationReasoning: v.durationReasoning, recommendedPlatform: v.recommendedPlatform })),
        versionBStyle
      )

      setStep('comparing')
      addLog('שתי הגרסאות מוכנות להשוואה!')
    } else {
      setStep('done')
      setProcessedVideos(processedA)

      const legacyResults = processedA.flatMap(v =>
        v.files.map(f => ({
          videoIndex: v.videoIndex,
          platform: f.platform,
          url: f.url,
          fileName: f.filename || f.url.split('/').pop() || '',
          width: parseInt(f.resolution?.split('x')[0] || '') || 1080,
          height: parseInt(f.resolution?.split('x')[1] || '') || 1920,
        }))
      )
      setResults(legacyResults)
      addLog('העיבוד הושלם בהצלחה!')
    }
  } catch (err: any) {
    setError(err.message || 'שגיאה לא צפויה')
  }
}

/**
 * Phase 3: Called after user selects version(s) - A, B, or both
 * Now exports to platforms ONLY after selection
 */
export async function selectABVersion(
  choices: Array<'A' | 'B'>,
  preferredForDesign?: 'A' | 'B' | null
): Promise<void> {
  const store = useAutoEditorStore.getState()
  const { setStep, setProcessedVideos, setResults, setSelectedVersion, addLog, setProgress } = store
  const enrichment = store.enrichment
  const finalInput = store.input

  if (!finalInput) {
    addLog('שגיאה: חסר קלט')
    return
  }

  const choice = choices.length === 1 ? choices[0] : (preferredForDesign || choices[0])
  setSelectedVersion(choice)

  const profile = useUserProfileStore.getState()
  profile.recordABChoice({
    contentType: enrichment?.detected_type || 'corporate',
    chosenVersion: choice,
    versionAApproach: store.versionAApproach,
    versionBApproach: store.versionBApproach,
    timestamp: Date.now(),
  })

  setStep('exporting')
  const allResults: VideoResult[] = []

  for (const ver of choices) {
    const chosen = ver === 'A' ? store.versionA : store.versionB
    const approach = ver === 'A' ? store.versionAApproach : store.versionBApproach

    if (!chosen || chosen.length === 0) {
      addLog(`שגיאה: גרסה ${ver} ריקה`)
      continue
    }

    addLog(`מייצא גרסה ${ver} לפלטפורמות: ${approach}`)
    setProgress({ current: choices.indexOf(ver), total: choices.length, label: `מייצא גרסה ${ver} לפלטפורמות...` })

    for (const v of chosen) {
      const mainFile = v.files[0]
      if (!mainFile) continue

      try {
        // Build a minimal EditJob for platform export only
        const exportJob = createEmptyEditJob(mainFile.url, mainFile.url)
        exportJob.transcript = currentJobA?.transcript || null
        exportJob.plan = {
          contentType: 'corporate',
          targetDuration: v.optimalDuration || finalInput.targetDuration || 60,
          mainMessage: '',
          hookStrategy: '',
          cuts: [{ sourceStart: 0, sourceEnd: 9999, outputStart: 0, type: 'presenter' }],
          cameraAngles: [],
          zooms: [],
          transitions: [],
          colorGrade: 'clean', // Already graded
          speakers: [],
          graphics: [],
          brollPlacements: [],
        }
        exportJob.subtitles = {
          enabled: false, // Already has subtitles burned in
          style: 'auto',
          animated: false,
          segments: [],
        }
        exportJob.output = {
          platforms: finalInput.platforms.map(p => ({ name: p, ratio: getPlatformRatio(p) })),
          skipPlatformExport: false,
          version: ver,
        }

        const processRes = await fetch(`${API_BASE}/auto-editor/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exportJob),
        })

        if (processRes.ok) {
          const result = await processRes.json()
          allResults.push({
            videoIndex: v.videoIndex,
            files: result.files || [],
            optimalDuration: v.optimalDuration,
            durationReasoning: v.durationReasoning,
            recommendedPlatform: v.recommendedPlatform,
          })
          addLog(`גרסה ${ver} סרטון ${v.videoIndex}: ${result.files?.length || 0} קבצי פלטפורמה`)
        } else {
          addLog(`ייצוא גרסה ${ver} נכשל, משתמש בקובץ המקורי`)
          allResults.push(v)
        }
      } catch (err: any) {
        addLog(`שגיאה בייצוא גרסה ${ver}: ${err.message}`)
        allResults.push(v)
      }
    }
  }

  setProcessedVideos(allResults)

  const legacyResults = allResults.flatMap(v =>
    v.files.map(f => ({
      videoIndex: v.videoIndex,
      platform: f.platform,
      url: f.url,
      fileName: f.filename,
      width: parseInt(f.resolution?.split('x')[0]) || 1080,
      height: parseInt(f.resolution?.split('x')[1]) || 1920,
    }))
  )
  setResults(legacyResults)

  addLog(`ייצוא הושלם: ${allResults.length} סרטונים`)
  setStep('done')
}
