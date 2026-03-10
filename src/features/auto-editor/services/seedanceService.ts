import { useAutoEditorStore } from '../store/autoEditorStore'

async function pollForResult(jobId: string, apiKey: string): Promise<string> {
  const log = useAutoEditorStore.getState().addLog
  const maxAttempts = 60
  const pollInterval = 5000

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`https://api.seedance.ai/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      throw new Error(`שגיאה בבדיקת סטטוס Seedance: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.status === 'completed' && data.output_url) {
      return data.output_url
    }

    if (data.status === 'failed') {
      throw new Error(`Seedance נכשל: ${data.error || 'שגיאה לא ידועה'}`)
    }

    log(`Seedance: ממתין... (${i + 1}/${maxAttempts})`)
    await new Promise((r) => setTimeout(r, pollInterval))
  }

  throw new Error('Seedance: זמן המתנה חרג')
}

export async function generateBrollSeedance(prompt: string, duration: number): Promise<string> {
  const log = useAutoEditorStore.getState().addLog
  const apiKey = import.meta.env.VITE_SEEDANCE_API_KEY

  if (!apiKey) {
    throw new Error('VITE_SEEDANCE_API_KEY לא מוגדר')
  }

  log(`מייצר B-Roll עם Seedance: "${prompt.substring(0, 50)}..."`)

  const response = await fetch('https://api.seedance.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      duration,
      model: 'seedance-1-5-pro',
      aspect_ratio: '9:16',
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת Seedance: ${err.message || response.statusText}`)
  }

  const data = await response.json()
  const result = await pollForResult(data.job_id || data.jobId, apiKey)

  log('B-Roll (Seedance) נוצר בהצלחה')
  return result
}
