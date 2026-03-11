import { useAutoEditorStore, type AutoEditorInput, type VideoResult, type QualityReport, type ABVersionResult } from './store/autoEditorStore'
import { useUserProfileStore } from '../../stores/userProfileStore'
import { usePromptEvolutionStore } from '../../stores/promptEvolutionStore'
import { transcribeVideos } from './services/whisperService'
import { planWithChatGPT } from './services/chatgptService'
import { generateBackground } from './services/nanoBananaService'
import { generateBrollSeedance } from './services/seedanceService'
import { generateBrollVeo } from './services/veoService'
import { findMusic } from './services/pixabayService'
import { BASE_VISUAL_PROMPT, BASE_ENRICH_PROMPT } from './constants/basePrompts'

const API_BASE = 'http://localhost:3001/api'

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

  // Safety: if duration is 0 but we have segments, estimate from them
  if (duration === 0 && segments && segments.length > 0) {
    duration = Math.max(...segments.map(s => s.end || 0))
    if (duration === 0) {
      duration = segments.length * 3 // ~3 sec per segment fallback
    }
    console.log('[VALIDATE] Duration was 0, estimated:', duration)
  }

  const available = duration * 0.7 // ~70% after cuts
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

// === IMPROVEMENT 3: Speech pace and energy analysis ===
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

  // Energy map per 10 seconds
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

  // Find peaks and valleys
  energyMap.forEach(e => {
    if (e.energy >= 7) peaks.push({ time: e.time, reason: `אנרגיה גבוהה (${e.wordCount} מילים, קצב מהיר)` })
    if (e.energy <= 3 && e.wordCount > 0) valleys.push({ time: e.time, reason: `אנרגיה נמוכה (קצב איטי, הפסקות)` })
  })

  // Silence detection
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end
    if (gap > 0.5) {
      silences.push({ start: segments[i - 1].end, end: segments[i].start, duration: gap })
    }
  }

  // Speaker changes
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].speaker !== segments[i - 1].speaker) {
      speakerChanges.push({ time: segments[i].start, from: segments[i - 1].speaker, to: segments[i].speaker })
    }
  }

  return { totalWords, totalSpeechDuration, wordsPerMinute, pace, energyMap, silences, peaks, valleys, speakerChanges }
}

// === IMPROVEMENT 5: Quality metrics ===
function evaluateEditQuality(plan: any, outputDuration: number, targetDuration: number): QualityReport {
  const report: QualityReport = {
    score: 100,
    issues: [],
    passed: [],
  }

  // Check 1: Duration matches target
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

  // Check 2: Has B-Roll
  const brollCount = plan.brollMoments?.length || plan.broll?.length || 0
  const expectedBRoll = Math.floor(targetDuration / 15)
  if (brollCount >= expectedBRoll) {
    report.passed.push(`B-Roll: ${brollCount} קטעים`)
  } else if (brollCount > 0) {
    report.score -= 5
    report.issues.push({ severity: 'info', message: `B-Roll: ${brollCount} קטעים (מומלץ ${expectedBRoll}+)` })
  } else {
    report.score -= 15
    report.issues.push({ severity: 'warning', message: 'אין B-Roll כלל' })
  }

  // Check 3: Has subtitles
  if (plan.subtitles?.length > 0) {
    report.passed.push(`כתוביות: ${plan.subtitles.length} שורות`)
  } else {
    report.score -= 10
    report.issues.push({ severity: 'warning', message: 'אין כתוביות' })
  }

  // Check 4: Has transitions
  if (plan.transitions?.length > 0) {
    report.passed.push(`מעברים: ${plan.transitions.length}`)
  } else {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'אין מעברים - חיתוכים ישירים בלבד' })
  }

  // Check 5: Has CTA at end
  if (plan.outro) {
    report.passed.push('CTA בסיום')
  } else {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'אין קריאה לפעולה בסוף' })
  }

  // Check 6: Color grade applied
  if (plan.colorGrade && plan.colorGrade !== 'none') {
    report.passed.push(`Color grade: ${plan.colorGrade}`)
  }

  // Check 7: Has zooms
  if (plan.zooms?.length > 0) {
    report.passed.push(`זומים: ${plan.zooms.length}`)
  } else {
    report.score -= 5
    report.issues.push({ severity: 'info', message: 'אין זומים' })
  }

  // Check 8: Music
  if (plan.musicMoments?.length > 0 || plan.music_moments?.length > 0) {
    report.passed.push('מוזיקת רקע')
  }

  report.score = Math.max(0, Math.min(100, report.score))
  return report
}

// === Helper: Process videos through FFmpeg pipeline ===
async function processVideosWithPlan(
  editingPlan: any,
  enrichment: any,
  finalInput: AutoEditorInput,
  musicUrl: string,
  backgroundImage: string,
  versionLabel: string
): Promise<VideoResult[]> {
  const addLog = useAutoEditorStore.getState().addLog
  const processedVideos: VideoResult[] = []

  for (let i = 0; i < editingPlan.videos.length; i++) {
    const videoPlan = editingPlan.videos[i]
    const sourceIndex = videoPlan.sourceSegments?.[0]?.sourceFile || 0
    const sourceUrl = finalInput.videoUrls[sourceIndex] || finalInput.videoUrls[0]

    addLog(`[${versionLabel}] מעבד סרטון ${i + 1}: שולח לשרת...`)

    const fullPlan = {
      cuts: videoPlan.cuts.map((c: any) => ({ keepStart: c.keepStart, keepEnd: c.keepEnd })),
      transitions: videoPlan.transitions || ['fade'],
      zooms: videoPlan.zooms || [],
      camera_angles: (videoPlan.cameraAngles || []).map((ca: any) => ({
        start: ca.start, end: ca.end, camera: ca.camera,
      })),
      color_grade: enrichment?.style?.color || videoPlan.colorGrade || 'clean',
      framing_strategy: videoPlan.framingStrategy || 'blur_background',
      subtitles: videoPlan.subtitles || [],
      graphics: (videoPlan.graphics || []).map((g: any) => ({
        type: g.type, text: g.text, at_time: g.atTime, duration: g.duration, label: g.label,
      })),
      speakers: (videoPlan.speakers || []).map((s: any) => ({
        name: s.name, first_appearance: s.firstAppearance, display_duration: s.displayDuration,
      })),
      segments_intensity: (videoPlan.segmentsIntensity || []).map((si: any) => ({
        start: si.start, end: si.end, intensity: si.intensity, type: si.type,
      })),
      intro: videoPlan.intro || null,
      outro: videoPlan.outro || null,
      music_moments: (videoPlan.musicMoments || []).map((mm: any) => ({
        at_time: mm.atTime, volume: mm.volume,
      })),
    }

    const processRes = await fetch(`${API_BASE}/auto-editor/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: sourceUrl,
        videoPlan: fullPlan,
        targetDuration: finalInput.targetDuration === -1
          ? (videoPlan.optimalDuration || 60)
          : finalInput.targetDuration,
        platforms: finalInput.platforms,
        musicUrl: musicUrl || null,
        backgroundImage: backgroundImage || null,
        captionStyle: 'modern',
      }),
    })

    if (!processRes.ok) {
      const err = await processRes.json().catch(() => ({}))
      throw new Error(`שגיאה בעיבוד סרטון ${i + 1} [${versionLabel}]: ${err.message || processRes.statusText}`)
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

// === IMPROVEMENT 4: A/B version style helpers ===
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
 */
export async function runAutoEditor(input: AutoEditorInput): Promise<void> {
  const store = useAutoEditorStore.getState()
  const { setStep, setProgress, setError, setInput, addLog,
    setCachedTranscript, setEnrichment, setTranscript, setVisualAnalysis, setEnergyAnalysis } = store

  // Apply learned preferences as defaults from user profile
  const profile = useUserProfileStore.getState()
  const enrichedInput: AutoEditorInput = {
    ...input,
    brollGenerator: input.brollGenerator || (profile.preferredBrollProvider as 'seedance' | 'veo') || 'seedance',
    platforms: input.platforms?.length ? input.platforms : ['tiktok', 'reels', 'shorts'],
  }

  // Record that auto-edit started for this session
  const sessionProjectId = `auto-editor-${Date.now()}`
  profile.recordAutoEditResult(sessionProjectId, ['auto_edit'], {
    userPrompt: input.userPrompt,
    targetDuration: input.targetDuration,
    numberOfVideos: input.numberOfVideos,
    brollGenerator: enrichedInput.brollGenerator,
    platforms: enrichedInput.platforms,
  })

  // Save input for reference
  setInput(enrichedInput)

  try {
    // Check available APIs
    const apis = await checkApiAvailability()
    addLog(`APIs: Gemini=${apis.gemini ? 'V' : 'X'} Seedance=${apis.seedance ? 'V' : 'X'} Pixabay=${apis.pixabay ? 'V' : 'X'}`)

    // Step 1 — Transcription (use cached if available from previous run)
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

    // Store transcript for enrichment review
    setTranscript(transcript)

    // Step 2 — Validation (skip duration validation when AI chooses)
    setStep('validating')
    if (enrichedInput.targetDuration !== -1) {
      const validation = validateAvailableContent(
        transcript.totalDuration,
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

    // === IMPROVEMENT 1: Visual Analysis ===
    setStep('analyzing_visuals')
    setProgress({ current: 0, total: 1, label: 'AI מנתח את התמונה בסרטון...' })

    let visualAnalysis = null
    try {
      // Get evolved prompt for visual analysis
      const evolvedVisualPrompt = usePromptEvolutionStore.getState().getEvolvedPrompt('visual_analysis', BASE_VISUAL_PROMPT)

      const visualRes = await fetch(`${API_BASE}/auto-editor/analyze-visuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: enrichedInput.videoUrls[0],
          duration: transcript.totalDuration,
          promptEvolution: evolvedVisualPrompt !== BASE_VISUAL_PROMPT ? evolvedVisualPrompt : undefined,
        }),
      })
      if (visualRes.ok) {
        visualAnalysis = await visualRes.json()

        // Collect prompt improvements from visual analysis
        if (visualAnalysis._promptImprovements?.length > 0) {
          usePromptEvolutionStore.getState().recordEvolution('visual_analysis', visualAnalysis._promptImprovements)
          addLog(`[למידה] ניתוח ויזואלי למד ${visualAnalysis._promptImprovements.length} תובנות חדשות`)
        }

        setVisualAnalysis(visualAnalysis)
        addLog(`ניתוח ויזואלי: ${visualAnalysis.scene_analysis?.length || 0} סצנות, מיקום: ${visualAnalysis.overall?.location || 'לא ידוע'}`)
      }
    } catch (e: any) {
      console.warn('[AUTO-EDIT] Visual analysis failed, continuing without:', e.message)
      addLog('ניתוח ויזואלי נכשל, ממשיך ללא')
    }

    // === IMPROVEMENT 3: Energy Analysis ===
    const energyAnalysis = analyzeTranscriptEnergy(transcript)
    setEnergyAnalysis(energyAnalysis)
    addLog(`ניתוח אנרגיה: ${energyAnalysis.wordsPerMinute} מילים/דקה (${energyAnalysis.pace}), ${energyAnalysis.peaks.length} שיאים, ${energyAnalysis.valleys.length} שפלים`)

    // Step 3 — Enrich prompt with AI (includes visual + energy data)
    setStep('enriching')
    setProgress({ current: 0, total: 1, label: 'AI מנתח את התוכן ומשפר את הפרומפט...' })

    // Get evolved prompt for enrichment
    const evolvedEnrichPrompt = usePromptEvolutionStore.getState().getEvolvedPrompt('enrichment', BASE_ENRICH_PROMPT)

    const enrichRes = await fetch(`${API_BASE}/auto-editor/enrich-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: {
          segments: transcript.segments,
          total_duration: transcript.totalDuration,
          totalDuration: transcript.totalDuration,
        },
        userPrompt: enrichedInput.userPrompt,
        targetDuration: enrichedInput.targetDuration,
        numberOfVideos: enrichedInput.numberOfVideos,
        visualAnalysis,
        energyAnalysis,
        userProfile: profile.getProfileForPrompt(),
        promptEvolution: evolvedEnrichPrompt !== BASE_ENRICH_PROMPT ? evolvedEnrichPrompt : undefined,
      }),
    })

    if (!enrichRes.ok) {
      const err = await enrichRes.json().catch(() => ({}))
      throw new Error(err.message || 'שגיאה בשיפור הפרומפט')
    }

    const enrichment = await enrichRes.json()

    // Collect prompt improvements from enrichment
    if (enrichment._promptImprovements?.length > 0) {
      usePromptEvolutionStore.getState().recordEvolution('enrichment', enrichment._promptImprovements)
      addLog(`[למידה] שיפור פרומפט למד ${enrichment._promptImprovements.length} תובנות חדשות`)
    }

    console.log('[AUTO-EDIT] Enhanced prompt:', enrichment.enhanced_prompt?.substring(0, 100))
    console.log('[AUTO-EDIT] B-Roll suggestions:', enrichment.broll_suggestions?.length)
    addLog(`AI שיפר את הפרומפט: ${enrichment.broll_suggestions?.length || 0} הצעות B-Roll`)

    // Store enrichment and pause for user review
    setEnrichment(enrichment)
    setStep('review_enrichment')

    // PAUSE HERE - UI will show EnrichmentReview component
    // User clicks "אשר והתחל עריכה" to call continueAfterEnrichment()

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

  const transcript = store.transcript || store.cachedTranscript
  if (!transcript) {
    setError('חסר תמלול - נסה שוב')
    return
  }

  const enrichment = store.enrichment
  const visualAnalysis = store.visualAnalysis
  const energyAnalysis = store.energyAnalysis
  const detectedType = enrichment?.detected_type || 'corporate'

  // Apply overrides from user review
  const finalInput: AutoEditorInput = {
    ...enrichedInput,
    userPrompt: overrides?.userPrompt || enrichment?.enhanced_prompt || enrichedInput.userPrompt,
  }

  try {
    const apis = await checkApiAvailability()

    // Step 4 — Two-step AI planning: Creative Director + Technical Editor
    // Now creates 2 versions (A and B) with different approaches
    let editingPlanA = useAutoEditorStore.getState().cachedEditingPlan
    let editingPlanB: any = null

    if (!editingPlanA) {
      setStep('planning')

      // === Version A ===
      const versionAStyle = getVersionAStyle(detectedType)
      setProgress({ current: 0, total: 4, label: `גרסה A: ${versionAStyle}` })
      addLog(`תכנון גרסה A: ${versionAStyle}`)

      const inputA: AutoEditorInput = {
        ...finalInput,
        userPrompt: `${finalInput.userPrompt}\n\nגישת עריכה: ${versionAStyle}`,
      }
      editingPlanA = await planWithChatGPT(transcript, inputA, detectedType, visualAnalysis, energyAnalysis)
      setCachedEditingPlan(editingPlanA)

      // === Version B ===
      const versionBStyle = getVersionBStyle(detectedType)
      setProgress({ current: 2, total: 4, label: `גרסה B: ${versionBStyle}` })
      addLog(`תכנון גרסה B: ${versionBStyle}`)

      const inputB: AutoEditorInput = {
        ...finalInput,
        userPrompt: `${finalInput.userPrompt}\n\nגישת עריכה: ${versionBStyle}`,
      }
      editingPlanB = await planWithChatGPT(transcript, inputB, detectedType, visualAnalysis, energyAnalysis)

      setProgress({ current: 4, total: 4, label: 'שני התכנונים הושלמו!' })
    } else {
      addLog('משתמש בתכנון קיים מהמטמון (גרסה A בלבד)')
    }

    // If AI chooses duration, log it
    if (finalInput.targetDuration === -1 && editingPlanA.videos) {
      const durationSummary = editingPlanA.videos
        .map((v: any) => `סרטון ${v.videoIndex} = ${v.optimalDuration || '?'}שנ`)
        .join(', ')
      addLog(`AI בחר אורך (A): ${durationSummary}`)
    }

    // Verify plan quality for both
    for (const video of editingPlanA.videos) {
      const cutsDuration = video.cuts.reduce((sum: number, c: any) => sum + (c.keepEnd - c.keepStart), 0)
      const videoTarget = finalInput.targetDuration === -1 ? (video.optimalDuration || '?') : finalInput.targetDuration
      addLog(`[אימות A] סרטון ${video.videoIndex}: ${cutsDuration.toFixed(1)}s (יעד: ${videoTarget}s)`)
    }

    // Step 5 — Generate assets with graceful fallbacks
    let backgroundImage: string, brollClips: string[], musicUrl: string
    const cachedAssets = useAutoEditorStore.getState().cachedAssets
    if (cachedAssets) {
      addLog('משתמש בנכסים קיימים מהמטמון')
      backgroundImage = cachedAssets.backgroundImage
      brollClips = cachedAssets.brollClips
      musicUrl = cachedAssets.music
    } else {
      setStep('generating_assets')
      const assetResults = await Promise.allSettled([
        generateBackgroundSafe(editingPlanA.prompts.backgroundImage, apis.gemini),
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

    // Step 6 — Process videos with FFmpeg (2 versions if B plan exists)
    setStep('editing')

    // Process Version A
    setProgress({ current: 0, total: 2, label: 'עורך גרסה A...' })
    const processedA = await processVideosWithPlan(editingPlanA, enrichment, finalInput, musicUrl, backgroundImage, 'A')

    // Process Version B (if available)
    let processedB: VideoResult[] | null = null
    if (editingPlanB) {
      setProgress({ current: 1, total: 2, label: 'עורך גרסה B...' })
      try {
        processedB = await processVideosWithPlan(editingPlanB, enrichment, finalInput, musicUrl, backgroundImage, 'B')
      } catch (err: any) {
        addLog(`גרסה B נכשלה: ${err.message}. ממשיך עם גרסה A בלבד.`)
      }
    }

    // === IMPROVEMENT 5: Quality metrics ===
    const videoPlanA = editingPlanA.videos[0]
    const videoTargetDur = finalInput.targetDuration === -1 ? (videoPlanA?.optimalDuration || 60) : finalInput.targetDuration
    const cutsDurA = videoPlanA?.cuts?.reduce((sum: number, c: any) => sum + (c.keepEnd - c.keepStart), 0) || 0
    const qualityReport = evaluateEditQuality(videoPlanA, cutsDurA, videoTargetDur)
    setQualityReport(qualityReport)
    addLog(`דוח איכות: ${qualityReport.score}/100 (${qualityReport.passed.length} עברו, ${qualityReport.issues.length} בעיות)`)

    // Record quality for prompt evolution and check for degradation
    const evolutionModels = ['visual_analysis', 'enrichment', 'creative_brief', 'technical_plan']
    const evoStore = usePromptEvolutionStore.getState()
    evolutionModels.forEach(modelId => {
      const evo = evoStore.evolutions[modelId]
      if (evo && evo.successRate > 0 && qualityReport.score < evo.successRate * 100 * 0.6) {
        // Quality dropped by more than 40% - remove last addition
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

    // If we have both versions, show comparison screen
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

      // Go to comparison step
      setStep('comparing')
      addLog('שתי הגרסאות מוכנות להשוואה!')
    } else {
      // Only version A available, go straight to done
      setStep('done')
      setProcessedVideos(processedA)

      const legacyResults = processedA.flatMap(v =>
        v.files.map(f => ({
          videoIndex: v.videoIndex,
          platform: f.platform,
          url: f.url,
          fileName: f.filename,
          width: parseInt(f.resolution.split('x')[0]) || 1080,
          height: parseInt(f.resolution.split('x')[1]) || 1920,
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
 * Phase 3: Called after user selects A or B version
 */
export function selectABVersion(choice: 'A' | 'B'): void {
  const store = useAutoEditorStore.getState()
  const { setStep, setProcessedVideos, setResults, setSelectedVersion, addLog } = store

  const chosen = choice === 'A' ? store.versionA : store.versionB
  const approach = choice === 'A' ? store.versionAApproach : store.versionBApproach
  const enrichment = store.enrichment

  if (!chosen || chosen.length === 0) {
    addLog('שגיאה: הגרסה שנבחרה ריקה')
    return
  }

  setSelectedVersion(choice)

  // Record the A/B choice for learning
  const profile = useUserProfileStore.getState()
  profile.recordABChoice({
    contentType: enrichment?.detected_type || 'corporate',
    chosenVersion: choice,
    versionAApproach: store.versionAApproach,
    versionBApproach: store.versionBApproach,
    timestamp: Date.now(),
  })

  // Convert to VideoResult format
  const processedVideos: VideoResult[] = chosen.map(v => ({
    videoIndex: v.videoIndex,
    files: v.files,
    optimalDuration: v.optimalDuration,
    durationReasoning: v.durationReasoning,
    recommendedPlatform: v.recommendedPlatform,
  }))

  setProcessedVideos(processedVideos)

  const legacyResults = processedVideos.flatMap(v =>
    v.files.map(f => ({
      videoIndex: v.videoIndex,
      platform: f.platform,
      url: f.url,
      fileName: f.filename,
      width: parseInt(f.resolution.split('x')[0]) || 1080,
      height: parseInt(f.resolution.split('x')[1]) || 1920,
    }))
  )
  setResults(legacyResults)

  addLog(`נבחרה גרסה ${choice}: ${approach}`)
  setStep('done')
}
