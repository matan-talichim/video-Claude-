import { useAutoEditorStore } from '../store/autoEditorStore'

const API_BASE = 'http://localhost:3001/api'

export async function findMusic(searchTerm: string): Promise<string> {
  const log = useAutoEditorStore.getState().addLog

  log(`מחפש מוזיקה: "${searchTerm}"`)

  const response = await fetch(`${API_BASE}/find-music`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchTerm }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת חיפוש מוזיקה: ${err.message || response.statusText}`)
  }

  const data = await response.json()
  log(`מוזיקה נבחרה: ${data.tags || 'ללא תגיות'}`)

  return data.url
}
