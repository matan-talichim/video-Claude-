import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import dotenv from 'dotenv'

// Load .env from project root
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

// Dynamic import for OpenAI
let openai: any = null
async function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openai) {
    const { default: OpenAI } = await import('openai')
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

const app = express()
const PORT = 3001

// CORS
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))

// JSON body parser
app.use(express.json({ limit: '50mb' }))

// Multer for file uploads
const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  },
})
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }) // 500MB max

// Serve audio/video files from uploads
app.use('/api/audio', express.static(uploadsDir))

// ==================== API STATUS ====================

app.get('/api/status', async (_req, res) => {
  const status = {
    openai: { connected: !!process.env.OPENAI_API_KEY, model: 'gpt-4o' },
    elevenlabs: { connected: !!process.env.ELEVENLABS_API_KEY },
    deepl: { connected: !!process.env.DEEPL_API_KEY },
  }
  res.json(status)
})

// ==================== TRANSCRIPTION (OpenAI Whisper) ====================

// Whisper supported formats
const WHISPER_SUPPORTED_FORMATS = ['.flac', '.m4a', '.mp3', '.mp4', '.mpeg', '.mpga', '.oga', '.ogg', '.wav', '.webm']

// Get ffmpeg path: prefer ffmpeg-static, fall back to system ffmpeg
function getFfmpegPath(): string {
  try {
    const ffmpegStatic = require('ffmpeg-static') as string
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic
  } catch { /* ffmpeg-static not available */ }
  return 'ffmpeg' // fall back to system ffmpeg
}

// Helper to safely delete a file if it exists
function safeUnlink(filePath: string) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore */ }
}

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  const tempFiles: string[] = [] // Track all temp files for cleanup

  try {
    const ai = await getOpenAI()
    if (!ai) {
      if (req.file) fs.unlinkSync(req.file.path)
      return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר. הגדר אותו בקובץ .env' })
    }

    if (!req.file) {
      return res.status(400).json({ message: 'לא הועלה קובץ' })
    }

    let filePath = req.file.path
    const originalPath = filePath
    tempFiles.push(originalPath)
    const fileSize = req.file.size
    const ext = path.extname(req.file.originalname).toLowerCase()

    // Logging
    console.log('Received file:', req.file.originalname, req.file.mimetype, fileSize)
    console.log('Original format:', ext)
    console.log('File size:', (fileSize / 1024 / 1024).toFixed(1) + 'MB')
    console.log('Needs conversion:', !WHISPER_SUPPORTED_FORMATS.includes(ext))

    const ffmpegPath = getFfmpegPath()

    // Step 1: Convert unsupported formats (like .mov, .avi, .mkv) to MP3
    if (!WHISPER_SUPPORTED_FORMATS.includes(ext)) {
      console.log('Format not supported by Whisper. Converting to MP3...')
      const mp3Path = filePath.replace(/\.[^.]+$/, '.mp3')
      tempFiles.push(mp3Path)
      try {
        execSync(`"${ffmpegPath}" -i "${filePath}" -vn -acodec libmp3lame -q:a 4 "${mp3Path}" -y`, {
          timeout: 120000,
          stdio: 'pipe',
        })
        console.log('Conversion done:', mp3Path)
        filePath = mp3Path
        // Delete original
        safeUnlink(originalPath)
      } catch (convError: any) {
        console.error('FFmpeg conversion failed:', convError.message)
        // Try alternative: rename to .mp4 (MOV is often compatible)
        const mp4Path = originalPath.replace(/\.[^.]+$/, '.mp4')
        try {
          fs.renameSync(originalPath, mp4Path)
          filePath = mp4Path
          tempFiles.push(mp4Path)
          console.log('Renamed to mp4:', mp4Path)
        } catch (renameError: any) {
          console.error('Rename also failed:', renameError.message)
          tempFiles.forEach(safeUnlink)
          return res.status(500).json({
            message: 'שגיאה בהמרת הקובץ. וודא שהפורמט תקין ו-ffmpeg מותקן.',
          })
        }
      }
    }

    // Step 2: Check file size - if > 25MB, extract audio only as MP3
    const WHISPER_MAX = 25 * 1024 * 1024
    const currentSize = fs.statSync(filePath).size

    if (currentSize > WHISPER_MAX) {
      console.log('File too large (' + (currentSize / 1024 / 1024).toFixed(1) + 'MB). Extracting audio...')
      const smallPath = filePath.replace(/\.[^.]+$/, '_small.mp3')
      tempFiles.push(smallPath)
      try {
        execSync(`"${ffmpegPath}" -i "${filePath}" -vn -acodec libmp3lame -ab 64k -ar 16000 -ac 1 "${smallPath}" -y`, {
          timeout: 120000,
          stdio: 'pipe',
        })
        safeUnlink(filePath)
        filePath = smallPath
        const audioSize = fs.statSync(filePath).size
        console.log('Audio extracted:', smallPath, (audioSize / 1024 / 1024).toFixed(1) + 'MB')

        if (audioSize > WHISPER_MAX) {
          tempFiles.forEach(safeUnlink)
          return res.status(413).json({
            message: 'הקובץ גדול מדי גם אחרי חילוץ אודיו. מגבלה: 25MB. נסה לקצר את הקובץ.',
          })
        }
      } catch (audioError: any) {
        console.error('Audio extraction failed:', audioError.message)
        tempFiles.forEach(safeUnlink)
        return res.status(500).json({
          message: 'שגיאה בחילוץ אודיו מהקובץ. וודא ש-ffmpeg מותקן.',
        })
      }
    }

    console.log('Sending to Whisper:', filePath)

    const transcription = await ai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(filePath),
      language: 'he',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    // Parse response into structured format
    const segments = (transcription.segments || []).map((seg: any, idx: number) => ({
      id: idx,
      speaker: `דובר ${(idx % 2) + 1}`,
      text: seg.text?.trim() || '',
      start: seg.start || 0,
      end: seg.end || 0,
      words: (seg.words || []).map((w: any) => ({
        word: w.word?.trim() || '',
        start: w.start || 0,
        end: w.end || 0,
      })),
    }))

    // Also use top-level words if available
    const allWords = transcription.words || []

    console.log('Transcription success! Length:', (transcription.text || '').length)

    // Clean up ALL temp files
    tempFiles.forEach(safeUnlink)

    res.json({
      text: transcription.text || '',
      duration: transcription.duration || 0,
      language: transcription.language || 'he',
      segments,
      words: allWords,
    })
  } catch (error: any) {
    // Clean up all temp files on error
    tempFiles.forEach(safeUnlink)
    if (req.file && !tempFiles.includes(req.file.path)) safeUnlink(req.file.path)

    if (error.status === 401) {
      return res.status(401).json({ message: 'מפתח ה-API לא תקין. בדוק בהגדרות.' })
    }
    if (error.status === 429) {
      return res.status(429).json({ message: 'הגעת למגבלת השימוש. נסה שוב בעוד כמה דקות.' })
    }
    if (error.status === 413) {
      return res.status(413).json({ message: 'הקובץ גדול מדי. הגבלה: 25MB לתמלול.' })
    }
    console.error('Transcription error:', error.message, error.status, error.code)
    return res.status(500).json({ message: `שגיאה בתמלול: ${error.message || 'שגיאה לא ידועה'}` })
  }
})

// ==================== SPEAKER DETECTION ====================

app.post('/api/transcribe/speakers', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) {
      return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })
    }

    const { transcript, segments } = req.body
    if (!transcript) {
      return res.status(400).json({ message: 'לא התקבל תמלול' })
    }

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Analyze this Hebrew transcript and identify different speakers. Label them with Hebrew names (דובר 1, דובר 2, etc). Return a JSON object with key "segments" containing an array where each item has "id" (segment index) and "speaker" (speaker label). Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Transcript:\n${transcript}\n\nSegments:\n${JSON.stringify(segments)}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    res.json(parsed)
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש. נסה שוב בעוד כמה דקות.' })
    console.error('Speaker detection error:', error.message)
    return res.status(500).json({ message: 'שגיאה בזיהוי דוברים. נסה שוב.' })
  }
})

// ==================== AI CHAT (GPT-4o) ====================

app.post('/api/chat', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) {
      return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })
    }

    const { message, transcript, projectName, duration } = req.body
    if (!message) {
      return res.status(400).json({ message: 'לא התקבלה הודעה' })
    }

    const systemPrompt = `אתה עוזר AI לעריכת וידאו בשם סטודיו AI. אתה מדבר עברית בלבד.
יש לך גישה לתמלול הסרטון. כשמבקשים ממך לעשות פעולת עריכה, החזר JSON.
כשמבקשים תוכן, החזר את התוכן בעברית.

שם הפרויקט: ${projectName || 'ללא שם'}
משך: ${duration || 0} שניות

For edit actions respond ONLY with JSON:
{"type":"action","action":"remove_filler_words|add_captions|delete_segment|replace_word|add_title|shorten_silences|enhance_audio|generate_clips","params":{},"summary":"תיאור בעברית של מה שנעשה","stats":{"removed":5,"saved_time":"0:45"}}

For content generation respond ONLY with JSON:
{"type":"content","contentType":"youtube_description|social_post|summary|titles|blog","content":"התוכן","summary":"תיאור"}

For analysis respond ONLY with JSON:
{"type":"analysis","suggestions":["הצעה 1","הצעה 2"],"summary":"ניתוח"}`

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message + (transcript ? `\n\nTranscript:\n${transcript}` : '') },
      ],
      temperature: 0.7,
    })

    const content = response.choices[0]?.message?.content || ''
    const usage = response.usage

    // Try to parse as JSON
    let parsed: any = null
    try {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Not JSON, treat as plain text
    }

    res.json({
      response: parsed || { type: 'text', content, summary: content },
      rawContent: content,
      usage: usage ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens } : null,
    })
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש. נסה שוב בעוד כמה דקות.' })
    console.error('Chat error:', error.message)
    return res.status(500).json({ message: 'שגיאה בשרת. נסה שוב.' })
  }
})

// ==================== CONTENT GENERATION ====================

app.post('/api/generate-content', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) {
      return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })
    }

    const { transcript, type } = req.body
    if (!transcript || !type) {
      return res.status(400).json({ message: 'חסרים נתונים: תמלול וסוג תוכן נדרשים.' })
    }

    const prompts: Record<string, string> = {
      youtube_description: 'צור תיאור ליוטיוב בעברית עם timestamps מהתמלול. כלול: כותרת, 2 פסקאות תיאור, timestamps לנושאים עיקריים, 5 hashtags.',
      social_post: 'צור פוסט מושך לרשתות חברתיות בעברית. כלול אימוג\'ים ו-5 hashtags רלוונטיים. 2-3 משפטים.',
      summary: 'סכם את התוכן ב-5 נקודות עיקריות בעברית.',
      titles: 'הצע 5 כותרות יצירתיות בעברית לתוכן הזה.',
      blog: 'כתוב פוסט בלוג של 3 פסקאות בעברית על הנושא הזה.',
    }

    const prompt = prompts[type]
    if (!prompt) {
      return res.status(400).json({ message: 'סוג תוכן לא תקין.' })
    }

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'אתה כותב תוכן מקצועי בעברית. החזר את התוכן בלבד, ללא JSON.' },
        { role: 'user', content: `${prompt}\n\nתמלול:\n${transcript}` },
      ],
      temperature: 0.7,
    })

    const content = response.choices[0]?.message?.content || ''
    res.json({ content, type })
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש. נסה שוב בעוד כמה דקות.' })
    console.error('Content generation error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת תוכן. נסה שוב.' })
  }
})

// ==================== CHAPTERS ====================

app.post('/api/chapters', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })

    const { transcript, segments } = req.body

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'חלק את התמלול הבא לפרקים לוגיים. לכל פרק תן כותרת בעברית ו-timestamp התחלה. החזר JSON array בלבד עם key "chapters": [{ "title": "...", "startTime": 0, "endTime": 45 }]',
        },
        { role: 'user', content: `Transcript: ${transcript}\nSegments: ${JSON.stringify(segments)}` },
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    res.json(parsed.chapters || [])
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש.' })
    console.error('Chapters error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת פרקים. נסה שוב.' })
  }
})

// ==================== SUGGEST CLIPS ====================

app.post('/api/suggest-clips', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })

    const { transcript, segments, targetDuration } = req.body

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `מצא 3-5 קטעים מעניינים/ויראליים בתמלול. לכל קטע תן כותרת, זמן התחלה וסיום, ודירוג עניין 1-5. משך יעד: ${targetDuration || 30} שניות. החזר JSON עם key "clips": [{ "title": "...", "startTime": 0, "endTime": 30, "viralScore": 4, "reason": "..." }]`,
        },
        { role: 'user', content: `Transcript: ${transcript}\nSegments: ${JSON.stringify(segments)}` },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    res.json(parsed.clips || [])
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש.' })
    console.error('Clips error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת קליפים. נסה שוב.' })
  }
})

// ==================== IMAGE GENERATION (DALL-E 3) ====================

app.post('/api/generate-image', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })

    const { prompt, size } = req.body
    if (!prompt) return res.status(400).json({ message: 'לא התקבל תיאור לתמונה.' })

    const image = await ai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: size || '1024x1024',
      quality: 'standard',
    })

    res.json({
      url: image.data[0]?.url,
      revisedPrompt: image.data[0]?.revised_prompt,
    })
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש.' })
    console.error('Image generation error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת תמונה. נסה שוב.' })
  }
})

// ==================== ELEVENLABS - VOICE CLONING & TTS ====================

app.post('/api/voices/clone', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      if (req.file) fs.unlinkSync(req.file.path)
      return res.status(400).json({ message: 'מפתח ElevenLabs API לא מוגדר.' })
    }

    if (!req.file) return res.status(400).json({ message: 'לא הועלה קובץ אודיו.' })

    const { name, description } = req.body
    const formData = new FormData()
    formData.append('name', name || 'My Voice')
    formData.append('description', description || '')

    const fileBuffer = fs.readFileSync(req.file.path)
    const blob = new Blob([fileBuffer], { type: req.file.mimetype })
    formData.append('files', blob, req.file.originalname)

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: formData,
    })

    // Clean up temp file
    fs.unlinkSync(req.file.path)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return res.status(response.status).json({ message: error.detail || 'שגיאה בשיבוט הקול.' })
    }

    const data = await response.json()
    res.json({ voice_id: data.voice_id, name: data.name || name })
  } catch (error: any) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    console.error('Voice clone error:', error.message)
    return res.status(500).json({ message: 'שגיאה בשיבוט הקול. נסה שוב.' })
  }
})

app.get('/api/voices/list', async (_req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(400).json({ message: 'מפתח ElevenLabs API לא מוגדר.' })
    }

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    })

    if (!response.ok) {
      return res.status(response.status).json({ message: 'שגיאה בטעינת קולות.' })
    }

    const data = await response.json()
    const voices = (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      preview_url: v.preview_url,
      labels: v.labels || {},
      category: v.category,
    }))

    res.json(voices)
  } catch (error: any) {
    console.error('Voices list error:', error.message)
    return res.status(500).json({ message: 'שגיאה בטעינת קולות. נסה שוב.' })
  }
})

app.post('/api/tts', async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(400).json({ message: 'מפתח ElevenLabs API לא מוגדר.' })
    }

    const { text, voiceId, speed } = req.body
    if (!text || !voiceId) {
      return res.status(400).json({ message: 'חסרים נתונים: טקסט וזיהוי קול נדרשים.' })
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: speed || 1.0 },
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return res.status(response.status).json({ message: error.detail || 'שגיאה ביצירת דיבור.' })
    }

    const audioBuffer = await response.arrayBuffer()
    const filename = `tts-${Date.now()}.mp3`
    const filePath = path.join(uploadsDir, filename)
    fs.writeFileSync(filePath, Buffer.from(audioBuffer))

    res.json({ audioUrl: `/api/audio/${filename}` })
  } catch (error: any) {
    console.error('TTS error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת דיבור. נסה שוב.' })
  }
})

app.post('/api/tts/regenerate', async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(400).json({ message: 'מפתח ElevenLabs API לא מוגדר.' })
    }

    const { text, voiceId, contextBefore, contextAfter } = req.body
    if (!text || !voiceId) {
      return res.status(400).json({ message: 'חסרים נתונים.' })
    }

    // Use context for better prosody
    const fullText = [contextBefore, text, contextAfter].filter(Boolean).join(' ')

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: fullText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return res.status(response.status).json({ message: error.detail || 'שגיאה ביצירת דיבור.' })
    }

    const audioBuffer = await response.arrayBuffer()
    const filename = `regen-${Date.now()}.mp3`
    const filePath = path.join(uploadsDir, filename)
    fs.writeFileSync(filePath, Buffer.from(audioBuffer))

    res.json({ audioUrl: `/api/audio/${filename}` })
  } catch (error: any) {
    console.error('TTS regenerate error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת דיבור. נסה שוב.' })
  }
})

// ==================== DUBBING (translate + TTS) ====================

app.post('/api/dub', async (req, res) => {
  try {
    const { sourceText, targetLang, voiceId } = req.body

    if (!process.env.DEEPL_API_KEY) {
      return res.status(400).json({ message: 'מפתח DeepL API לא מוגדר.' })
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(400).json({ message: 'מפתח ElevenLabs API לא מוגדר.' })
    }
    if (!sourceText || !targetLang || !voiceId) {
      return res.status(400).json({ message: 'חסרים נתונים.' })
    }

    // Step 1: Translate
    const translateRes = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [sourceText],
        target_lang: targetLang.toUpperCase(),
      }),
    })

    if (!translateRes.ok) {
      return res.status(translateRes.status).json({ message: 'שגיאה בתרגום.' })
    }

    const translateData = await translateRes.json()
    const translatedText = translateData.translations?.[0]?.text || ''

    // Step 2: TTS
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: translatedText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!ttsRes.ok) {
      return res.status(ttsRes.status).json({ message: 'שגיאה ביצירת דיבור לדאבינג.' })
    }

    const audioBuffer = await ttsRes.arrayBuffer()
    const filename = `dub-${Date.now()}.mp3`
    const filePath = path.join(uploadsDir, filename)
    fs.writeFileSync(filePath, Buffer.from(audioBuffer))

    res.json({ translatedText, audioUrl: `/api/audio/${filename}` })
  } catch (error: any) {
    console.error('Dub error:', error.message)
    return res.status(500).json({ message: 'שגיאה בדאבינג. נסה שוב.' })
  }
})

// ==================== DEEPL - TRANSLATION ====================

app.post('/api/translate', async (req, res) => {
  try {
    if (!process.env.DEEPL_API_KEY) {
      return res.status(400).json({ message: 'מפתח DeepL API לא מוגדר.' })
    }

    const { text, sourceLang, targetLang } = req.body
    if (!text || !targetLang) {
      return res.status(400).json({ message: 'חסרים נתונים: טקסט ושפת יעד נדרשים.' })
    }

    const body: any = {
      text: [text],
      target_lang: targetLang.toUpperCase(),
    }
    if (sourceLang) body.source_lang = sourceLang.toUpperCase()

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      if (response.status === 403) return res.status(403).json({ message: 'מפתח DeepL לא תקין.' })
      if (response.status === 456) return res.status(456).json({ message: 'חרגת ממכסת התרגום של DeepL.' })
      return res.status(response.status).json({ message: 'שגיאה בתרגום.' })
    }

    const data = await response.json()
    const translation = data.translations?.[0]

    res.json({
      translatedText: translation?.text || '',
      detectedSourceLang: translation?.detected_source_language || sourceLang || '',
    })
  } catch (error: any) {
    console.error('Translation error:', error.message)
    return res.status(500).json({ message: 'שגיאה בתרגום. נסה שוב.' })
  }
})

app.post('/api/translate/batch', async (req, res) => {
  try {
    if (!process.env.DEEPL_API_KEY) {
      return res.status(400).json({ message: 'מפתח DeepL API לא מוגדר.' })
    }

    const { segments, sourceLang, targetLang } = req.body
    if (!segments || !targetLang) {
      return res.status(400).json({ message: 'חסרים נתונים.' })
    }

    const texts = segments.map((s: any) => s.text)

    const body: any = {
      text: texts,
      target_lang: targetLang.toUpperCase(),
    }
    if (sourceLang) body.source_lang = sourceLang.toUpperCase()

    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      if (response.status === 403) return res.status(403).json({ message: 'מפתח DeepL לא תקין.' })
      return res.status(response.status).json({ message: 'שגיאה בתרגום.' })
    }

    const data = await response.json()
    const translations = data.translations || []

    const translatedSegments = segments.map((seg: any, i: number) => ({
      originalText: seg.text,
      translatedText: translations[i]?.text || '',
      startTime: seg.startTime,
      endTime: seg.endTime,
    }))

    res.json({ translatedSegments })
  } catch (error: any) {
    console.error('Batch translation error:', error.message)
    return res.status(500).json({ message: 'שגיאה בתרגום. נסה שוב.' })
  }
})

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 סטודיו AI Server running on port ${PORT}`)
  console.log(`   OpenAI:     ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   DeepL:      ${process.env.DEEPL_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
})
