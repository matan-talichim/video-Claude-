import { useAutoEditorStore, type AutoEditorInput, type VideoResult } from './store/autoEditorStore'
import { useUserProfileStore } from '../../stores/userProfileStore'
import { transcribeVideos } from './services/whisperService'
import { planWithChatGPT } from './services/chatgptService'
import { generateBackground } from './services/nanoBananaService'
import { generateBrollSeedance } from './services/seedanceService'
import { generateBrollVeo } from './services/veoService'
import { findMusic } from './services/pixabayService'

const API_BASE = 'http://localhost:3001/api'

interface ValidationResult {
  valid: boolean
  message?: string
}

function validateAvailableContent(
  totalDuration: number,
  targetDuration: number,
  numberOfVideos: number
): ValidationResult {
  const available = totalDuration * 0.7 // ~70% after cuts
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

export async function runAutoEditor(input: AutoEditorInput): Promise<void> {
  const store = useAutoEditorStore.getState()
  const { setStep, setProgress, setError, setResults, setProcessedVideos, setInput, addLog,
    setCachedTranscript, setCachedEditingPlan, setCachedAssets } = store

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

    // Step 2 — Validation
    setStep('validating')
    const validation = validateAvailableContent(
      transcript.totalDuration,
      enrichedInput.targetDuration,
      enrichedInput.numberOfVideos
    )
    if (!validation.valid) {
      setError(validation.message!)
      return
    }
    addLog('ולידציה עברה בהצלחה')

    // Step 3 — ChatGPT plans everything (use cached if prompt unchanged)
    let editingPlan = useAutoEditorStore.getState().cachedEditingPlan
    if (!editingPlan) {
      setStep('planning')
      editingPlan = await planWithChatGPT(transcript, enrichedInput)
      setCachedEditingPlan(editingPlan)
    } else {
      addLog('משתמש בתכנון קיים מהמטמון')
    }

    // Step 4 — Generate assets with graceful fallbacks
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
        generateBackgroundSafe(editingPlan.prompts.backgroundImage, apis.gemini),
        generateAllBroll(editingPlan.prompts.broll, enrichedInput.brollGenerator, apis),
        findMusicSafe(editingPlan.prompts.musicSearch, apis.pixabay),
      ])
      backgroundImage = assetResults[0].status === 'fulfilled' ? assetResults[0].value : ''
      brollClips = assetResults[1].status === 'fulfilled' ? assetResults[1].value : []
      musicUrl = assetResults[2].status === 'fulfilled' ? assetResults[2].value : ''
      setCachedAssets({ backgroundImage, brollClips, music: musicUrl })
    }

    // Step 5 — Process each video with FFmpeg on server
    setStep('editing')
    const processedVideos: VideoResult[] = []

    for (let i = 0; i < editingPlan.videos.length; i++) {
      setProgress({
        current: i + 1,
        total: editingPlan.videos.length,
        label: `עורך סרטון ${i + 1} מתוך ${editingPlan.videos.length}...`,
      })

      const videoPlan = editingPlan.videos[i]

      // Determine source file
      const sourceIndex = videoPlan.sourceSegments?.[0]?.sourceFile || 0
      const sourceUrl = enrichedInput.videoUrls[sourceIndex] || enrichedInput.videoUrls[0]

      addLog(`מעבד סרטון ${i + 1}: שולח לשרת לעיבוד FFmpeg מקצועי...`)

      // Build the full plan payload with all professional features
      const fullPlan = {
        cuts: videoPlan.cuts.map((c: any) => ({ keepStart: c.keepStart, keepEnd: c.keepEnd })),
        transitions: videoPlan.transitions || ['fade'],
        zooms: videoPlan.zooms || [],
        camera_angles: (videoPlan.cameraAngles || []).map((ca: any) => ({
          start: ca.start, end: ca.end, camera: ca.camera,
        })),
        color_grade: videoPlan.colorGrade || 'clean',
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
          targetDuration: enrichedInput.targetDuration,
          platforms: enrichedInput.platforms,
          musicUrl: musicUrl || null,
          backgroundImage: backgroundImage || null,
          captionStyle: 'modern',
        }),
      })

      if (!processRes.ok) {
        const err = await processRes.json().catch(() => ({}))
        throw new Error(`שגיאה בעיבוד סרטון ${i + 1}: ${err.message || processRes.statusText}`)
      }

      const result = await processRes.json()
      addLog(`סרטון ${i + 1} עובד בהצלחה: ${result.files?.length || 0} קבצים`)

      processedVideos.push({
        videoIndex: i + 1,
        files: result.files || [],
      })
    }

    // Step 6 — Done
    setStep('done')
    setProcessedVideos(processedVideos)

    // Also set legacy results format for backward compat
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

    addLog('העיבוד הושלם בהצלחה!')
  } catch (err: any) {
    setError(err.message || 'שגיאה לא צפויה')
  }
}
