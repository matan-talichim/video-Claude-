import { useAiAdStore, type SceneStatus } from '../store/aiAdStore'

const API_BASE = 'http://localhost:3001/api'

/**
 * Split Hebrew script into scenes — each non-empty line becomes a scene
 */
export function splitScriptToScenes(script: string): SceneStatus[] {
  return script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      index,
      hebrewText: line,
      englishPrompt: '',
      videoProvider: null,
      videoUrl: null,
      r2Url: null,
      status: 'pending' as const,
      error: null,
    }))
}

/**
 * Generate an English video prompt for a Hebrew scene line via backend
 */
async function generatePromptForScene(
  hebrewText: string,
  sceneIndex: number,
  totalScenes: number,
  fullScript: string
): Promise<string> {
  const res = await fetch(`${API_BASE}/ai-ad/generate-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hebrewText,
      sceneIndex,
      totalScenes,
      fullScript,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Failed to generate prompt')
  }
  const data = await res.json()
  return data.prompt
}

/**
 * Generate video for a scene — tries Veo 3.1 first, falls back to Seedance
 */
async function generateVideoForScene(prompt: string): Promise<{ url: string; provider: 'veo' | 'seedance' }> {
  // Try Veo 3.1 first
  try {
    const res = await fetch(`${API_BASE}/ai-ad/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider: 'veo' }),
    })
    if (res.ok) {
      const data = await res.json()
      return { url: data.url, provider: 'veo' }
    }
  } catch {
    // Veo failed, try Seedance
  }

  // Fallback to Seedance 1.5 Pro
  const res = await fetch(`${API_BASE}/ai-ad/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider: 'seedance' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Both Veo and Seedance failed')
  }
  const data = await res.json()
  return { url: data.url, provider: 'seedance' }
}

/**
 * Upload a video clip to R2 via backend
 */
async function uploadToR2(videoUrl: string, sceneIndex: number): Promise<string> {
  const res = await fetch(`${API_BASE}/ai-ad/upload-r2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, sceneIndex }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'R2 upload failed')
  }
  const data = await res.json()
  return data.r2Url
}

/**
 * Merge all clips with FFmpeg + Hebrew text overlays via backend
 */
async function mergeClips(
  scenes: Array<{ r2Url: string; hebrewText: string }>
): Promise<string> {
  const res = await fetch(`${API_BASE}/ai-ad/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Merge failed')
  }
  const data = await res.json()
  return data.url
}

/**
 * Run the full AI Ad pipeline
 */
export async function runAiAdPipeline(script: string) {
  const store = useAiAdStore.getState()
  const { setStep, setScenes, updateScene, setProgress, setError, setFinalVideoUrl, addLog } = store

  try {
    // Step 1: Split script to scenes
    setStep('splitting')
    addLog('מפצל תסריט לסצנות...')
    const scenes = splitScriptToScenes(script)
    if (scenes.length === 0) {
      setError('התסריט ריק — הזן לפחות שורה אחת')
      return
    }
    setScenes(scenes)
    addLog(`נמצאו ${scenes.length} סצנות`)

    // Step 2: Generate English prompts
    setStep('generating_prompts')
    for (let i = 0; i < scenes.length; i++) {
      setProgress({ current: i + 1, total: scenes.length, label: `יוצר פרומפט לסצנה ${i + 1}` })
      updateScene(i, { status: 'generating_prompt' })
      addLog(`יוצר פרומפט לסצנה ${i + 1}: "${scenes[i].hebrewText.substring(0, 40)}..."`)

      try {
        const prompt = await generatePromptForScene(
          scenes[i].hebrewText,
          i,
          scenes.length,
          script
        )
        updateScene(i, { englishPrompt: prompt, status: 'pending' })
        addLog(`פרומפט לסצנה ${i + 1}: "${prompt.substring(0, 60)}..."`)
      } catch (err: any) {
        updateScene(i, { status: 'error', error: err.message })
        setError(`נכשל ביצירת פרומפט לסצנה ${i + 1}: ${err.message}`)
        return
      }
    }

    // Step 3: Generate videos (Veo → Seedance fallback)
    setStep('generating_videos')
    const currentScenes = useAiAdStore.getState().scenes
    for (let i = 0; i < currentScenes.length; i++) {
      const scene = currentScenes[i]
      setProgress({ current: i + 1, total: currentScenes.length, label: `מייצר וידאו לסצנה ${i + 1}` })
      updateScene(i, { status: 'generating_video' })
      addLog(`מייצר וידאו לסצנה ${i + 1}...`)

      try {
        const { url, provider } = await generateVideoForScene(scene.englishPrompt)
        updateScene(i, { videoUrl: url, videoProvider: provider, status: 'pending' })
        addLog(`סצנה ${i + 1} נוצרה בהצלחה (${provider})`)
      } catch (err: any) {
        updateScene(i, { status: 'error', error: err.message })
        setError(`נכשל ביצירת וידאו לסצנה ${i + 1}: ${err.message}`)
        return
      }
    }

    // Step 4: Upload to R2
    setStep('uploading')
    const videosReady = useAiAdStore.getState().scenes
    for (let i = 0; i < videosReady.length; i++) {
      const scene = videosReady[i]
      if (!scene.videoUrl) continue
      setProgress({ current: i + 1, total: videosReady.length, label: `מעלה סצנה ${i + 1} ל-R2` })
      updateScene(i, { status: 'uploading' })
      addLog(`מעלה סצנה ${i + 1} ל-R2...`)

      try {
        const r2Url = await uploadToR2(scene.videoUrl, i)
        updateScene(i, { r2Url, status: 'done' })
        addLog(`סצנה ${i + 1} הועלתה ל-R2`)
      } catch (err: any) {
        // If R2 upload fails, use the local URL as fallback
        addLog(`העלאה ל-R2 נכשלה לסצנה ${i + 1}, משתמש בקובץ מקומי`)
        updateScene(i, { r2Url: scene.videoUrl, status: 'done' })
      }
    }

    // Step 5: Merge with FFmpeg + Hebrew text overlay
    setStep('merging')
    setProgress({ current: 0, total: 1, label: 'ממזג קטעים עם טקסט עברי...' })
    addLog('ממזג את כל הסצנות לסרטון אחד עם טקסט עברי...')

    const finalScenes = useAiAdStore.getState().scenes
    const mergeInput = finalScenes
      .filter((s) => s.r2Url)
      .map((s) => ({ r2Url: s.r2Url!, hebrewText: s.hebrewText }))

    const finalUrl = await mergeClips(mergeInput)
    setFinalVideoUrl(finalUrl)
    setStep('done')
    setProgress({ current: 1, total: 1, label: 'הסרטון מוכן!' })
    addLog('סרטון הפרסומת מוכן!')
  } catch (err: any) {
    setError(err.message || 'שגיאה לא צפויה')
  }
}
