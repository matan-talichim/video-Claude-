import { useAutoEditorStore } from '../store/autoEditorStore'

export async function generateBackground(prompt: string): Promise<string> {
  const log = useAutoEditorStore.getState().addLog

  log('מייצר תמונת רקע עם Nano Banana...')

  const apiKey = import.meta.env.VITE_NANO_BANANA_API_KEY
  if (!apiKey) {
    throw new Error('VITE_NANO_BANANA_API_KEY לא מוגדר')
  }

  const response = await fetch('https://api.nanobanana.ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '9:16',
      style: 'cinematic',
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
