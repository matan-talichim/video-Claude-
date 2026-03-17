import { useAutoEditorStore } from '../store/autoEditorStore'

const API_BASE = 'http://localhost:3001/api'

export async function generateBackground(prompt: string, transcript?: any, creativeBrief?: any): Promise<string> {
  const log = useAutoEditorStore.getState().addLog

  log('מייצר תמונת רקע עם Nano Banana...')

  const response = await fetch(`${API_BASE}/generate-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      aspectRatio: '9:16',
      style: 'cinematic',
      transcript,
      creativeBrief,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת Nano Banana: ${err.message || response.statusText}`)
  }

  const data = await response.json()
  log('תמונת רקע נוצרה בהצלחה')

  return data.imageUrl || data.image_url || data.url
}
