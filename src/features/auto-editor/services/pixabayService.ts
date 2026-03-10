import { useAutoEditorStore } from '../store/autoEditorStore'

export async function findMusic(searchTerm: string): Promise<string> {
  const log = useAutoEditorStore.getState().addLog
  const apiKey = import.meta.env.VITE_PIXABAY_API_KEY

  if (!apiKey) {
    throw new Error('VITE_PIXABAY_API_KEY לא מוגדר')
  }

  log(`מחפש מוזיקה: "${searchTerm}"`)

  const encodedQuery = encodeURIComponent(searchTerm)
  const response = await fetch(
    `https://pixabay.com/api/videos/music/?key=${apiKey}&q=${encodedQuery}&per_page=5`
  )

  if (!response.ok) {
    throw new Error(`שגיאת Pixabay: ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.hits || data.hits.length === 0) {
    log('לא נמצאה מוזיקה, מנסה חיפוש כללי...')
    const fallbackResponse = await fetch(
      `https://pixabay.com/api/videos/music/?key=${apiKey}&q=background+music&per_page=5`
    )
    const fallbackData = await fallbackResponse.json()
    if (!fallbackData.hits || fallbackData.hits.length === 0) {
      throw new Error('לא נמצאה מוזיקה מתאימה')
    }
    log('מוזיקה נמצאה (חיפוש כללי)')
    return fallbackData.hits[0].audio || fallbackData.hits[0].audioUrl
  }

  log(`מוזיקה נבחרה: ${data.hits[0].tags || 'ללא תגיות'}`)
  return data.hits[0].audio || data.hits[0].audioUrl
}
