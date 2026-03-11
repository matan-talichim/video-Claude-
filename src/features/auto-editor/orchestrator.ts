import { useAutoEditorStore, type AutoEditorInput } from './store/autoEditorStore'
import { transcribeVideos } from './services/whisperService'
import { planWithChatGPT } from './services/chatgptService'
import { generateBackground } from './services/nanoBananaService'
import { generateBrollSeedance } from './services/seedanceService'
import { generateBrollVeo } from './services/veoService'
import { findMusic } from './services/pixabayService'
import { processVideo } from './services/ffmpegPipeline'
import { exportAllPlatforms } from './services/exportService'

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

  // Check if the selected generator is available
  if (generator === 'seedance' && !apis.seedance) {
    addLog('Seedance לא מוגדר. מדלג על B-Roll.')
    return []
  }
  if (generator === 'veo' && !apis.gemini) {
    addLog('Gemini לא מוגדר. מדלג על B-Roll.')
    return []
  }

  const generateFn = generator === 'seedance' ? generateBrollSeedance : generateBrollVeo

  // Generate B-Roll sequentially to avoid rate limits
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
  const { setStep, setProgress, setError, setResults, setInput, addLog,
    setCachedTranscript, setCachedEditingPlan, setCachedAssets } = store

  // Save input for reference
  setInput(input)

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
      transcript = await transcribeVideos(input.videoUrls)
      setCachedTranscript(transcript)
    } else {
      addLog('משתמש בתמלול קיים מהמטמון')
    }

    // Step 2 — Validation
    setStep('validating')
    const validation = validateAvailableContent(
      transcript.totalDuration,
      input.targetDuration,
      input.numberOfVideos
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
      editingPlan = await planWithChatGPT(transcript, input)
      setCachedEditingPlan(editingPlan)
    } else {
      addLog('משתמש בתכנון קיים מהמטמון')
    }

    // Step 4 — Generate assets with graceful fallbacks (allSettled = one failure doesn't block others)
    let backgroundImage: string, brollClips: string[], music: string
    const cachedAssets = useAutoEditorStore.getState().cachedAssets
    if (cachedAssets) {
      addLog('משתמש בנכסים קיימים מהמטמון')
      backgroundImage = cachedAssets.backgroundImage
      brollClips = cachedAssets.brollClips
      music = cachedAssets.music
    } else {
      setStep('generating_assets')
      const assetResults = await Promise.allSettled([
        generateBackgroundSafe(editingPlan.prompts.backgroundImage, apis.gemini),
        generateAllBroll(editingPlan.prompts.broll, input.brollGenerator, apis),
        findMusicSafe(editingPlan.prompts.musicSearch, apis.pixabay),
      ])
      backgroundImage = assetResults[0].status === 'fulfilled' ? assetResults[0].value : ''
      brollClips = assetResults[1].status === 'fulfilled' ? assetResults[1].value : []
      music = assetResults[2].status === 'fulfilled' ? assetResults[2].value : ''
      setCachedAssets({ backgroundImage, brollClips, music })
    }

    // Step 5 — Process each video (sequential — FFmpeg is heavy)
    setStep('editing')
    const editedVideos: string[] = []
    for (const [index, videoPlan] of editingPlan.videos.entries()) {
      setProgress({ current: index + 1, total: editingPlan.videos.length })
      const edited = await processVideo({
        videoPlan,
        backgroundImage,
        brollClips,
        music,
        sourceUrls: input.videoUrls,
      })
      editedVideos.push(edited)
    }

    // Step 6 — Export to all platforms
    setStep('exporting')
    const exports = await exportAllPlatforms(editedVideos)

    setStep('done')
    setResults(exports)
    addLog('העיבוד הושלם בהצלחה!')
  } catch (err: any) {
    setError(err.message || 'שגיאה לא צפויה')
  }
}
