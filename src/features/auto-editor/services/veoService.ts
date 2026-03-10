import { useAutoEditorStore } from '../store/autoEditorStore'

async function pollForResult(operationId: string, apiKey: string): Promise<string> {
  const log = useAutoEditorStore.getState().addLog
  const maxAttempts = 60
  const pollInterval = 5000

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/operations/${operationId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    )

    if (!response.ok) {
      throw new Error(`שגיאה בבדיקת סטטוס VEO: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.done && data.response?.videoUrl) {
      return data.response.videoUrl
    }

    if (data.error) {
      throw new Error(`VEO נכשל: ${data.error.message || 'שגיאה לא ידועה'}`)
    }

    log(`VEO: ממתין... (${i + 1}/${maxAttempts})`)
    await new Promise((r) => setTimeout(r, pollInterval))
  }

  throw new Error('VEO: זמן המתנה חרג')
}

export async function generateBrollVeo(prompt: string, duration: number): Promise<string> {
  const log = useAutoEditorStore.getState().addLog
  const apiKey = import.meta.env.VITE_VEO_API_KEY

  if (!apiKey) {
    throw new Error('VITE_VEO_API_KEY לא מוגדר')
  }

  log(`מייצר B-Roll עם VEO: "${prompt.substring(0, 50)}..."`)

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/videos:generate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        duration_seconds: duration,
        aspect_ratio: '9:16',
      }),
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת VEO: ${err.message || err.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const result = await pollForResult(data.operationId || data.name, apiKey)

  log('B-Roll (VEO) נוצר בהצלחה')
  return result
}
