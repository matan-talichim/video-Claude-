import { useAutoEditorStore, type AutoEditorInput } from './store/autoEditorStore'
import { transcribeVideos } from './services/whisperService'
import { planWithChatGPT } from './services/chatgptService'
import { generateBackground } from './services/nanoBananaService'
import { generateBrollSeedance } from './services/seedanceService'
import { generateBrollVeo } from './services/veoService'
import { findMusic } from './services/pixabayService'
import { processVideo } from './services/ffmpegPipeline'
import { exportAllPlatforms } from './services/exportService'

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

async function generateAllBroll(
  prompts: Array<{ prompt: string; videoIndex: number; momentIndex: number }>,
  generator: 'seedance' | 'veo'
): Promise<string[]> {
  const generateFn = generator === 'seedance' ? generateBrollSeedance : generateBrollVeo

  const results = await Promise.all(
    prompts.map((p) => generateFn(p.prompt, 4)) // 4 seconds per B-Roll clip
  )

  return results
}

export async function runAutoEditor(input: AutoEditorInput): Promise<void> {
  const { setStep, setProgress, setError, setResults, setInput, addLog } =
    useAutoEditorStore.getState()

  // Save input for reference
  setInput(input)

  try {
    // Step 1 — Transcription
    setStep('transcribing')
    const transcript = await transcribeVideos(input.videoUrls)

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

    // Step 3 — ChatGPT plans everything
    setStep('planning')
    const editingPlan = await planWithChatGPT(transcript, input)

    // Step 4 — Generate assets in parallel
    setStep('generating_assets')
    const [backgroundImage, brollClips, music] = await Promise.all([
      generateBackground(editingPlan.prompts.backgroundImage),
      generateAllBroll(editingPlan.prompts.broll, input.brollGenerator),
      findMusic(editingPlan.prompts.musicSearch),
    ])

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
