import { useAutoEditorStore } from '../store/autoEditorStore'

const API_BASE = 'http://localhost:3001/api'

export async function generateBrollSeedance(prompt: string, duration: number): Promise<string> {
  const log = useAutoEditorStore.getState().addLog

  log(`מייצר B-Roll עם Seedance: "${prompt.substring(0, 50)}..."`)

  const response = await fetch(`${API_BASE}/generate-broll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      duration,
      provider: 'seedance',
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת Seedance: ${err.message || response.statusText}`)
  }

  const data = await response.json()
  log('B-Roll (Seedance) נוצר בהצלחה')

  return data.url
}
