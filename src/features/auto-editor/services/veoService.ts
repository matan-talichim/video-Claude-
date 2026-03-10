import { useAutoEditorStore } from '../store/autoEditorStore'

const API_BASE = 'http://localhost:3001/api'

export async function generateBrollVeo(prompt: string, duration: number = 5): Promise<string> {
  const log = useAutoEditorStore.getState().addLog

  log(`מייצר B-Roll עם VEO: "${prompt.substring(0, 50)}..."`)

  const response = await fetch(`${API_BASE}/generate-broll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      provider: 'veo',
      duration: String(duration),
      aspectRatio: '9:16',
      resolution: '720p',
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת VEO: ${err.message || response.statusText}`)
  }

  const data = await response.json()
  log('B-Roll (VEO) נוצר בהצלחה')

  return data.url
}
