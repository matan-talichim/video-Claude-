const API_BASE = 'http://localhost:3001/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function apiCall(endpoint: string, options?: RequestInit) {
  try {
    const res = await fetch(API_BASE + endpoint, options)
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new ApiError(res.status, error.message || 'שגיאה לא ידועה')
    }
    return res.json()
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(0, 'אין חיבור לשרת. וודא שהשרת רץ.')
  }
}

export const api = {
  transcribe: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiCall('/transcribe', { method: 'POST', body: formData })
  },

  detectSpeakers: async (transcript: string, segments: any[]) => {
    return apiCall('/transcribe/speakers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, segments }),
    })
  },

  chat: async (message: string, transcript: string, projectName: string, duration?: number) => {
    return apiCall('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, transcript, projectName, duration }),
    })
  },

  generateContent: async (transcript: string, type: string) => {
    return apiCall('/generate-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, type }),
    })
  },

  chapters: async (transcript: string, segments: any[]) => {
    return apiCall('/chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, segments }),
    })
  },

  suggestClips: async (transcript: string, segments: any[], duration: number) => {
    return apiCall('/suggest-clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, segments, targetDuration: duration }),
    })
  },

  generateImage: async (prompt: string, size = '1024x1024') => {
    return apiCall('/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size }),
    })
  },

  cloneVoice: async (file: File, name: string, description: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    formData.append('description', description)
    return apiCall('/voices/clone', { method: 'POST', body: formData })
  },

  listVoices: async () => {
    return apiCall('/voices/list', { method: 'GET' })
  },

  textToSpeech: async (text: string, voiceId: string, speed = 1.0) => {
    return apiCall('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, speed }),
    })
  },

  regenerateSpeech: async (text: string, voiceId: string, contextBefore?: string, contextAfter?: string) => {
    return apiCall('/tts/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, contextBefore, contextAfter }),
    })
  },

  dub: async (sourceText: string, targetLang: string, voiceId: string) => {
    return apiCall('/dub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText, targetLang, voiceId }),
    })
  },

  translate: async (text: string, sourceLang: string, targetLang: string) => {
    return apiCall('/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLang, targetLang }),
    })
  },

  translateBatch: async (segments: any[], sourceLang: string, targetLang: string) => {
    return apiCall('/translate/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments, sourceLang, targetLang }),
    })
  },

  checkApiStatus: async () => {
    return apiCall('/status', { method: 'GET' })
  },
}
