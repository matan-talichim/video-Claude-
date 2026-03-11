import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { createRequire } from 'module'
import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'

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

// Google Gemini AI
function getGemini() {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  return new GoogleGenAI({ apiKey: key })
}

const app = express()
const PORT = 3001

// CORS - allow any localhost port
app.use(cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) cb(null, true)
    else cb(null, true)
  }
}))

// JSON & URL-encoded body parsers
app.use(express.json({ limit: '5gb' }))
app.use(express.urlencoded({ limit: '5gb', extended: true }))

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
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 } }) // 5GB max

// Serve audio/video files from uploads
app.use('/api/audio', express.static(uploadsDir))

// Serve uploaded files statically (for auto-editor local mode)
app.use('/uploads', express.static(uploadsDir))

// ==================== API STATUS ====================

app.get('/api/status', async (_req, res) => {
  const status = {
    openai: { connected: !!process.env.OPENAI_API_KEY, model: 'gpt-4o' },
    elevenlabs: { connected: !!process.env.ELEVENLABS_API_KEY },
    deepl: { connected: !!process.env.DEEPL_API_KEY },
    gemini: { connected: !!process.env.GEMINI_API_KEY, features: ['Nano Banana', 'Veo 3.1'] },
    seedance: { connected: !!process.env.KIE_API_KEY, provider: 'kie.ai', model: 'seedance-1.5-pro' },
    pixabay: { connected: !!process.env.PIXABAY_API_KEY },
  }
  res.json(status)
})

// ==================== TRANSCRIPTION (OpenAI Whisper) ====================

// ESM-compatible require for ffmpeg-static
const esmRequire = createRequire(import.meta.url)

// Get ffmpeg path: prefer system ffmpeg, fall back to ffmpeg-static
function getFFmpeg(): string {
  // Try homebrew path first (macOS)
  if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg'
  // Try system path
  try { execSync('which ffmpeg', { stdio: 'pipe' }); return 'ffmpeg' } catch {}
  // Try ffmpeg-static as last resort
  try { return esmRequire('ffmpeg-static') as string } catch {}
  throw new Error('FFmpeg not found')
}

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  console.log('=== TRANSCRIBE HANDLER V2 ===')
  let inputPath = ''
  let mp3Path = ''

  try {
    const ai = await getOpenAI()
    if (!ai) {
      if (req.file) fs.unlinkSync(req.file.path)
      return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר. הגדר אותו בקובץ .env' })
    }

    if (!req.file) return res.status(400).json({ message: 'לא נבחר קובץ' })

    inputPath = req.file.path
    mp3Path = inputPath.replace(/\.[^.]+$/, '') + '_audio.mp3'

    console.log('[TRANSCRIBE 1] Received:', req.file.originalname, req.file.mimetype, (req.file.size / 1024 / 1024).toFixed(1) + 'MB')

    // ALWAYS extract audio as compressed MP3
    const ffmpeg = getFFmpeg()
    console.log('[TRANSCRIBE 2] Extracting audio using:', ffmpeg)

    try {
      execSync(`"${ffmpeg}" -i "${inputPath}" -vn -acodec libmp3lame -ab 64k -ar 16000 -ac 1 "${mp3Path}" -y`, {
        timeout: 300000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (ffErr: any) {
      console.error('[TRANSCRIBE 2] FFmpeg error:', ffErr.stderr?.toString() || ffErr.message)
      return res.status(500).json({ message: 'שגיאה בעיבוד הקובץ. נסה קובץ אחר.' })
    }

    const mp3Size = fs.statSync(mp3Path).size
    console.log('[TRANSCRIBE 3] Audio extracted:', (mp3Size / 1024 / 1024).toFixed(1) + 'MB')

    const WHISPER_MAX = 24 * 1024 * 1024 // 24MB to be safe

    // Delete original input file
    try { fs.unlinkSync(inputPath); inputPath = '' } catch {}

    if (mp3Size > WHISPER_MAX) {
      // ===== CHUNKED TRANSCRIPTION for large files =====
      console.log('[SPLIT] File is', (mp3Size / 1024 / 1024).toFixed(1) + 'MB. Splitting into chunks...')

      // Get audio duration using ffprobe
      const ffprobePath = ffmpeg === 'ffmpeg' ? 'ffprobe' : ffmpeg.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
      const durationStr = execSync(
        `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp3Path}"`,
        { stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString().trim()
      const totalDuration = parseFloat(durationStr)
      console.log('[SPLIT] Total duration:', totalDuration, 'seconds')

      const chunkDuration = 600 // 10 minutes per chunk
      const numChunks = Math.ceil(totalDuration / chunkDuration)
      console.log('[SPLIT] Splitting into', numChunks, 'chunks of', chunkDuration, 'seconds')

      let allSegments: any[] = []
      let fullText = ''

      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkDuration
        const chunkPath = mp3Path.replace('.mp3', `_chunk${i}.mp3`)

        console.log(`[SPLIT] Chunk ${i + 1}/${numChunks}: ${startTime}s - ${startTime + chunkDuration}s`)

        // Extract chunk
        execSync(
          `"${ffmpeg}" -i "${mp3Path}" -ss ${startTime} -t ${chunkDuration} -acodec libmp3lame -ab 64k -ar 16000 -ac 1 "${chunkPath}" -y`,
          { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] }
        )

        // Transcribe chunk
        const chunkTranscription = await ai.audio.transcriptions.create({
          model: 'whisper-1',
          file: fs.createReadStream(chunkPath),
          language: 'he',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        })

        console.log(`[SPLIT] Chunk ${i + 1} transcribed:`, (chunkTranscription.text || '').length, 'chars')

        // Adjust timestamps by adding offset
        const chunkSegments = ((chunkTranscription as any).segments || []).map((seg: any, idx: number) => ({
          id: allSegments.length + idx,
          speaker: 'דובר 1',
          speakerId: 1,
          text: (seg.text || '').trim(),
          start: (seg.start || 0) + startTime,
          end: (seg.end || 0) + startTime,
          words: (seg.words || []).map((w: any) => ({
            word: (w.word || '').trim(),
            start: (w.start || 0) + startTime,
            end: (w.end || 0) + startTime,
          })),
        }))

        allSegments = [...allSegments, ...chunkSegments]
        fullText += (chunkTranscription.text || '') + ' '

        // Cleanup chunk
        try { fs.unlinkSync(chunkPath) } catch {}
      }

      // Cleanup original mp3
      try { fs.unlinkSync(mp3Path); mp3Path = '' } catch {}

      console.log('[SPLIT] All chunks transcribed! Total segments:', allSegments.length)

      // Try GPT-4o speaker detection for chunked transcription too
      let chunkSpeakers: any[] = [{ id: 1, name: 'דובר 1', color: '#5C8AFF' }]
      try {
        if (allSegments.length > 1) {
          const fullTextForSpeakers = allSegments.map((s: any) => `[${s.id}] ${s.text}`).join('\n')
          // Truncate if too long
          const truncated = fullTextForSpeakers.length > 8000 ? fullTextForSpeakers.slice(0, 8000) : fullTextForSpeakers
          const speakerRes = await ai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: 'Analyze this Hebrew transcript and detect speakers. Return JSON: {"speakers":[{"id":1,"name":"דובר 1","description":"..."}],"segments":[{"id":0,"speakerId":1}]}. Return ONLY valid JSON.' },
              { role: 'user', content: truncated },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          })
          const parsed = JSON.parse(speakerRes.choices[0]?.message?.content || '{}')
          if (parsed.speakers && parsed.segments) {
            chunkSpeakers = parsed.speakers.map((s: any, i: number) => ({ id: s.id || i + 1, name: s.name || `דובר ${i + 1}`, description: s.description || '', color: ['#5C8AFF', '#4ADE80', '#FBBF24', '#F472B6'][(s.id || i + 1 - 1) % 4] }))
            const segMap = new Map(parsed.segments.map((s: any) => [s.id, s.speakerId]))
            allSegments.forEach((seg: any) => {
              const spId = segMap.get(seg.id) || 1
              const sp = chunkSpeakers.find((s: any) => s.id === spId)
              seg.speakerId = spId
              seg.speaker = sp?.name || `דובר ${spId}`
            })
          }
        }
      } catch (e: any) { console.warn('[SPLIT] Speaker detection failed:', e.message) }

      return res.json({
        text: fullText.trim(),
        duration: totalDuration,
        language: 'he',
        segments: allSegments,
        speakers: chunkSpeakers,
        words: [],
        chunked: true,
        totalChunks: numChunks,
      })
    }

    // ===== SINGLE FILE transcription (under 24MB) =====
    console.log('[TRANSCRIBE 4] Sending to Whisper...')
    const transcription = await ai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(mp3Path),
      language: 'he',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    console.log('[TRANSCRIBE 5] SUCCESS! Text length:', (transcription.text || '').length)
    console.log('[TRANSCRIBE 5] Preview:', (transcription.text || '').substring(0, 100))

    // Cleanup
    try { fs.unlinkSync(mp3Path); mp3Path = '' } catch {}

    // Format segments with initial speaker assignment
    const segments = ((transcription as any).segments || []).map((seg: any, i: number) => ({
      id: i,
      speaker: 'דובר 1',
      speakerId: 1,
      text: seg.text.trim(),
      start: seg.start,
      end: seg.end,
      words: seg.words || [],
    }))

    if (segments.length === 0 && transcription.text) {
      segments.push({ id: 0, speaker: 'דובר 1', speakerId: 1, text: transcription.text, start: 0, end: 0, words: [] })
    }

    // Try GPT-4o speaker detection
    let speakers: any[] = [{ id: 1, name: 'דובר 1', color: '#5C8AFF' }]
    try {
      if (segments.length > 1) {
        const fullText = segments.map((s: any) => `[${s.id}] ${s.text}`).join('\n')
        const speakerResponse = await ai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `Analyze this Hebrew transcript and detect different speakers based on context, topic changes, question/answer patterns, and speaking style. Return JSON with:
- "speakers": array of { "id": number, "name": "דובר N", "description": "short description" }
- "segments": array of { "id": number, "speakerId": number }
If it seems like one speaker only, return a single speaker. Return ONLY valid JSON.`,
            },
            { role: 'user', content: fullText },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        })

        const parsed = JSON.parse(speakerResponse.choices[0]?.message?.content || '{}')
        if (parsed.speakers && parsed.segments) {
          speakers = parsed.speakers.map((s: any, i: number) => ({
            id: s.id || i + 1,
            name: s.name || `דובר ${i + 1}`,
            description: s.description || '',
            color: ['#5C8AFF', '#4ADE80', '#FBBF24', '#F472B6'][(s.id || i + 1 - 1) % 4],
          }))
          const segmentMap = new Map(parsed.segments.map((s: any) => [s.id, s.speakerId]))
          segments.forEach((seg: any) => {
            const speakerId = segmentMap.get(seg.id) || 1
            const speaker = speakers.find((s: any) => s.id === speakerId)
            seg.speakerId = speakerId
            seg.speaker = speaker?.name || `דובר ${speakerId}`
          })
        }
        console.log('[TRANSCRIBE] Speaker detection: found', speakers.length, 'speakers')
      }
    } catch (speakerErr: any) {
      console.warn('[TRANSCRIBE] Speaker detection failed, using single speaker:', speakerErr.message)
    }

    res.json({
      text: transcription.text || '',
      duration: (transcription as any).duration || 0,
      language: 'he',
      segments,
      speakers,
    })
  } catch (error: any) {
    console.error('[TRANSCRIBE ERROR]', error.message, error.status)
    // Cleanup
    try { if (inputPath) fs.unlinkSync(inputPath) } catch {}
    try { if (mp3Path) fs.unlinkSync(mp3Path) } catch {}

    const status = error.status || 500
    const message = error.status === 413
      ? 'הקובץ גדול מדי. מגבלה: 25MB.'
      : 'שגיאה בתמלול: ' + (error.message || 'שגיאה לא ידועה')
    res.status(status).json({ message })
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

    const { message, transcript, projectName, duration, userProfile } = req.body
    if (!message) {
      return res.status(400).json({ message: 'לא התקבלה הודעה' })
    }

    const systemPrompt = `You are an AI video editor assistant called סטודיו AI. You speak Hebrew only.
You have access to the user's video project with transcript and editing tools.
${userProfile ? '\n' + userProfile + '\nחשוב: התאם את ההמלצות להעדפות המשתמש אם קיימות.\n' : ''}
Project: ${projectName || 'ללא שם'}
Duration: ${duration || 0} seconds

IMPORTANT: You must ALWAYS respond with valid JSON in this exact format:
{
  "message": "Your Hebrew response explaining what you did or recommend",
  "actions": [],
  "suggestions": [],
  "showAsChecklist": false
}

Available action types for the "actions" array (use when user gives a direct command):
- {"type": "remove_filler_words"}
- {"type": "add_captions", "params": {"style": "modern"}} (styles: classic, modern, karaoke, minimal, typewriter, bounce)
- {"type": "shorten_silences", "params": {"threshold": 1.0}}
- {"type": "add_broll", "params": {"prompt": "description for DALL-E", "startTime": 5, "endTime": 10}}
- {"type": "add_broll_auto"}
- {"type": "generate_content", "params": {"contentType": "youtube_description"}} (types: youtube_description, social_post, summary, titles, blog)
- {"type": "enhance_audio"}
- {"type": "eye_contact", "params": {"enabled": true}}
- {"type": "green_screen", "params": {"background": "office"}}
- {"type": "center_speaker", "params": {"enabled": true}}
- {"type": "reframe", "params": {"ratio": "9:16"}}
- {"type": "generate_chapters"}
- {"type": "delete_range", "params": {"startTime": 30, "endTime": 35}}
- {"type": "mute_range", "params": {"startTime": 5, "endTime": 8}}
- {"type": "suggest_clips", "params": {"count": 3}}

When user asks for recommendations (מה אתה ממליץ, מה כדאי לעשות, תנתח את הסרטון, ערוך מקצועי):
- Set "showAsChecklist": true
- Return suggestions with priority (high/medium/low) and executable action
- Each suggestion must have real numbers from the context
- Sort by priority: high first, then medium, then low
- Include 5-8 suggestions
- Format: {"text": "description", "priority": "high", "action": {"type": "action_type", "params": {}}}

When user gives a direct command (הסר מילות מילוי, הוסף כתוביות):
- Set "showAsChecklist": false
- Put the action directly in "actions" array for immediate execution
- Explain what you did in "message"

NEVER just describe what you would do. ALWAYS include the action in the JSON so it actually happens.
Always respond with valid JSON only. No markdown, no code blocks, just JSON.`

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message + (transcript ? `\n\nTranscript:\n${transcript}` : '') },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const responseText = response.choices[0]?.message?.content || '{}'
    const usage = response.usage

    // Parse JSON response
    let parsed: any
    try {
      parsed = JSON.parse(responseText)
    } catch {
      // If GPT didn't return valid JSON, wrap it
      parsed = {
        message: responseText,
        actions: [],
        suggestions: [],
      }
    }

    // Ensure structure
    res.json({
      message: parsed.message || responseText,
      actions: parsed.actions || [],
      suggestions: parsed.suggestions || [],
      showAsChecklist: parsed.showAsChecklist || false,
      rawContent: responseText,
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

// ==================== MERGE VIDEOS (FFmpeg) ====================

app.post('/api/merge', upload.array('files', 20), async (req, res) => {
  const filePaths: string[] = []
  try {
    const files = req.files as Express.Multer.File[]
    const transition = req.body.transition || 'none'
    const transitionDuration = parseFloat(req.body.transitionDuration) || 1

    if (!files || files.length < 2) {
      if (files) files.forEach(f => fs.unlinkSync(f.path))
      return res.status(400).json({ message: 'נדרשים לפחות 2 קבצים למיזוג.' })
    }

    console.log(`[MERGE] Merging ${files.length} files with transition: ${transition}, duration: ${transitionDuration}s`)

    const ffmpeg = getFFmpeg()
    const ffprobePath = ffmpeg === 'ffmpeg' ? 'ffprobe' : ffmpeg.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
    const outputPath = path.join(uploadsDir, `merged-${Date.now()}.mp4`)

    // xfade transition mapping
    const xfadeMap: Record<string, string> = {
      'fade': 'fade',
      'dissolve': 'dissolve',
      'wipe-left': 'wipeleft',
      'wipe-right': 'wiperight',
      'wipe-up': 'wipeup',
      'wipe-down': 'wipedown',
      'slide-left': 'slideleft',
      'slide-right': 'slideright',
      'zoom-in': 'zoomin',
      'zoom-out': 'squeezev',
      'blur': 'fadeblack',
      'flash': 'fadewhite',
      'black': 'fadeblack',
      'spin': 'circleopen',
    }

    // Step 1: Normalize all files to same format (1920x1080, same codecs)
    for (let i = 0; i < files.length; i++) {
      const normalizedPath = path.join(uploadsDir, `norm-${Date.now()}-${i}.mp4`)
      console.log(`[MERGE] Normalizing file ${i + 1}/${files.length}: ${files[i].originalname}`)
      execSync(
        `"${ffmpeg}" -i "${files[i].path}" -c:v libx264 -c:a aac -ar 44100 -ac 2 -r 30 -preset fast -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" "${normalizedPath}" -y`,
        { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      filePaths.push(normalizedPath)
      // Remove original upload
      try { fs.unlinkSync(files[i].path) } catch {}
    }

    const xfade = xfadeMap[transition]

    if (transition === 'none' || !xfade) {
      // Simple concat without transitions
      const listPath = path.join(uploadsDir, `concat-${Date.now()}.txt`)
      const listContent = filePaths.map(p => `file '${p}'`).join('\n')
      fs.writeFileSync(listPath, listContent)

      console.log('[MERGE] Concatenating without transitions...')
      execSync(
        `"${ffmpeg}" -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}" -y`,
        { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      try { fs.unlinkSync(listPath) } catch {}
    } else if (filePaths.length === 2) {
      // 2 files: use xfade directly
      const probe = execSync(
        `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePaths[0]}"`,
        { timeout: 30000 }
      ).toString().trim()
      const firstDuration = parseFloat(probe)
      const offset = Math.max(0, firstDuration - transitionDuration)

      console.log(`[MERGE] Applying xfade=${xfade}, offset=${offset}, duration=${transitionDuration}`)
      execSync(
        `"${ffmpeg}" -i "${filePaths[0]}" -i "${filePaths[1]}" -filter_complex "[0:v][1:v]xfade=transition=${xfade}:duration=${transitionDuration}:offset=${offset}[outv];[0:a][1:a]acrossfade=d=${transitionDuration}[outa]" -map "[outv]" -map "[outa]" "${outputPath}" -y`,
        { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
    } else {
      // 3+ files: chain xfade filters
      // Get durations of all files
      const durations: number[] = []
      for (const fp of filePaths) {
        const probe = execSync(
          `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fp}"`,
          { timeout: 30000 }
        ).toString().trim()
        durations.push(parseFloat(probe))
      }

      // Build chained xfade filter
      const inputs = filePaths.map((_, i) => `-i "${filePaths[i]}"`).join(' ')
      let videoFilter = ''
      let audioFilter = ''
      let cumulativeOffset = 0

      for (let i = 0; i < filePaths.length - 1; i++) {
        const prevLabel = i === 0 ? '[0:v]' : `[vout${i}]`
        const nextLabel = `[${i + 1}:v]`
        const outLabel = i === filePaths.length - 2 ? '[outv]' : `[vout${i + 1}]`

        if (i === 0) {
          cumulativeOffset = durations[0] - transitionDuration
        } else {
          cumulativeOffset = cumulativeOffset + durations[i] - transitionDuration
        }
        const offset = Math.max(0, cumulativeOffset)

        videoFilter += `${prevLabel}${nextLabel}xfade=transition=${xfade}:duration=${transitionDuration}:offset=${offset}${outLabel}`
        if (i < filePaths.length - 2) videoFilter += ';'
      }

      // Chain audio crossfades
      for (let i = 0; i < filePaths.length - 1; i++) {
        const prevLabel = i === 0 ? '[0:a]' : `[aout${i}]`
        const nextLabel = `[${i + 1}:a]`
        const outLabel = i === filePaths.length - 2 ? '[outa]' : `[aout${i + 1}]`

        audioFilter += `${prevLabel}${nextLabel}acrossfade=d=${transitionDuration}${outLabel}`
        if (i < filePaths.length - 2) audioFilter += ';'
      }

      const fullFilter = `${videoFilter};${audioFilter}`
      console.log(`[MERGE] Chained xfade for ${filePaths.length} files: ${fullFilter}`)

      execSync(
        `"${ffmpeg}" ${inputs} -filter_complex "${fullFilter}" -map "[outv]" -map "[outa]" "${outputPath}" -y`,
        { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
    }

    // Cleanup temp files
    filePaths.forEach(p => { try { fs.unlinkSync(p) } catch {} })

    const outputFilename = path.basename(outputPath)
    const outputSize = fs.statSync(outputPath).size
    console.log(`[MERGE] Success! Output: ${outputFilename}, Size: ${(outputSize / 1024 / 1024).toFixed(1)}MB`)

    res.json({
      url: `/api/audio/${outputFilename}`,
      filename: outputFilename,
      size: outputSize,
    })
  } catch (error: any) {
    // Cleanup on error
    filePaths.forEach(p => { try { fs.unlinkSync(p) } catch {} })
    console.error('[MERGE ERROR]', error.message)
    return res.status(500).json({ message: 'שגיאה באיחוד הסרטונים: ' + error.message })
  }
})

// ==================== VIDEO GENERATION (Veo / Seedance placeholder) ====================

app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, provider, duration, style, motion, camera } = req.body
    if (!prompt) return res.status(400).json({ message: 'לא התקבל תיאור לסרטון.' })

    // Check for provider-specific API keys
    if (provider === 'veo' && !process.env.GEMINI_API_KEY) {
      // Fallback to DALL-E image generation with a toast message
      const ai = await getOpenAI()
      if (!ai) return res.status(400).json({ message: 'חבר API של Google Veo בהגדרות, או הגדר OpenAI כחלופה.' })

      const image = await ai.images.generate({
        model: 'dall-e-3',
        prompt: `Cinematic ${style || 'realistic'} scene: ${prompt}`,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
      })

      return res.json({
        url: image.data[0]?.url,
        revisedPrompt: image.data[0]?.revised_prompt,
        type: 'image_fallback',
        message: 'יצירת סרטון Veo תהיה זמינה בקרוב. בינתיים נוצרה תמונה.',
      })
    }

    if (provider === 'seedance' && !process.env.KIE_API_KEY) {
      const ai = await getOpenAI()
      if (!ai) return res.status(400).json({ message: 'חבר API של Seedance בהגדרות, או הגדר OpenAI כחלופה.' })

      const image = await ai.images.generate({
        model: 'dall-e-3',
        prompt: `Dynamic animated scene: ${prompt}`,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
      })

      return res.json({
        url: image.data[0]?.url,
        revisedPrompt: image.data[0]?.revised_prompt,
        type: 'image_fallback',
        message: 'יצירת סרטון Seedance תהיה זמינה בקרוב. בינתיים נוצרה תמונה.',
      })
    }

    // If API keys exist, placeholder for future real implementation
    return res.status(400).json({ message: `חבר API של ${provider} בהגדרות` })
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש.' })
    console.error('Video generation error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת סרטון. נסה שוב.' })
  }
})

// ==================== GENERATE VIDEO PROJECT (Full Wizard) ====================

app.post('/api/generate-video-project', async (req, res) => {
  try {
    const {
      prompt, videoType, platform, style, format, duration,
      voiceType, voiceLanguage, voiceTone,
      captionsEnabled, captionLanguages,
      musicType, musicMood,
      brandName, brandSlogan,
    } = req.body

    if (!prompt) return res.status(400).json({ message: 'לא התקבל תיאור לסרטון.' })

    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר. הגדר אותו בקובץ .env' })

    const sceneSeconds = platform === 'images' ? 5 : 4
    const sceneCount = Math.ceil(duration / sceneSeconds)

    // Step 1: Generate script with GPT-4o
    const scriptPrompt = `אתה כותב סקריפטים מקצועיים לסרטונים.

צור סקריפט ל${videoType} בסגנון ${style}.
משך: ${duration} שניות.
כל סצנה: ${sceneSeconds} שניות.
מספר סצנות: ${sceneCount}.

הפרומפט: ${prompt}
${brandName ? `מותג: ${brandName}${brandSlogan ? `, סלוגן: ${brandSlogan}` : ''}` : ''}

החזר JSON בלבד:
{
  "title": "שם הסרטון",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": ${sceneSeconds},
      "visualPrompt": "תיאור מפורט באנגלית למנוע AI - what the viewer sees",
      "narration": "מה הקריין אומר בעברית (או ריק אם אין דיבור בסצנה זו)",
      "captionText": "טקסט הכתובית",
      "cameraMovement": "static/pan-left/pan-right/zoom-in/zoom-out/tracking",
      "mood": "dramatic/happy/calm/energetic",
      "transition": "fade/cut/dissolve/wipe"
    }
  ],
  "musicMood": "energetic/calm/dramatic/happy/corporate",
  "overallNarration": "הטקסט המלא של הקריינות"
}`

    const scriptResult = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: scriptPrompt }],
      response_format: { type: 'json_object' },
    })

    let script: any
    try {
      script = JSON.parse(scriptResult.choices[0]?.message?.content || '{}')
    } catch {
      return res.status(500).json({ message: 'שגיאה בניתוח הסקריפט.' })
    }

    // Step 2: Generate scene images with DALL-E 3 (fallback for Veo/Seedance)
    const sizeMap: Record<string, string> = {
      '16:9': '1792x1024',
      '9:16': '1024x1792',
      '1:1': '1024x1024',
      '4:5': '1024x1024',
    }
    const imageSize = sizeMap[format] || '1792x1024'

    const sceneUrls: string[] = []
    for (const scene of (script.scenes || [])) {
      try {
        const stylePrefix = style === 'animation' ? 'Animated illustration style' :
                           style === 'cinematic' ? 'Cinematic film shot' :
                           style === 'realistic' ? 'Photorealistic' :
                           style === 'minimal' ? 'Clean minimal design' :
                           style === 'dramatic' ? 'High contrast dramatic' :
                           style === 'neon' ? 'Neon-lit futuristic' :
                           style === 'retro' ? 'Vintage retro style' :
                           style === 'organic' ? 'Natural organic style' :
                           'Professional'

        const image = await ai.images.generate({
          model: 'dall-e-3',
          prompt: `${stylePrefix}: ${scene.visualPrompt}. Camera: ${scene.cameraMovement}. Mood: ${scene.mood}.`,
          n: 1,
          size: imageSize,
          quality: 'standard',
        })
        sceneUrls.push(image.data[0]?.url || '')
      } catch (err: any) {
        console.error(`Scene ${scene.sceneNumber} generation error:`, err.message)
        sceneUrls.push('')
      }
    }

    // Step 3: Generate voiceover with ElevenLabs (if configured and requested)
    let audioUrl: string | undefined
    if (voiceType === 'ai' && script.overallNarration && process.env.ELEVENLABS_API_KEY) {
      try {
        const voiceId = 'EXAVITQu4vr4xnSDxMaL' // Default voice
        const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: script.overallNarration,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        })
        if (ttsRes.ok) {
          const audioBuffer = Buffer.from(await ttsRes.arrayBuffer())
          const audioFileName = `tts-${Date.now()}.mp3`
          const audioPath = path.join(uploadsDir, audioFileName)
          fs.writeFileSync(audioPath, audioBuffer)
          audioUrl = `/api/audio/${audioFileName}`
        }
      } catch (err: any) {
        console.error('TTS error:', err.message)
      }
    }

    // Step 4: Generate caption segments
    const captionSegments = (script.scenes || []).map((scene: any, i: number) => ({
      sceneNumber: scene.sceneNumber || i + 1,
      startTime: i * sceneSeconds,
      endTime: (i + 1) * sceneSeconds,
      text: scene.captionText || scene.narration || '',
    }))

    return res.json({
      script,
      sceneUrls,
      audioUrl,
      captionSegments,
      fallback: !process.env.GEMINI_API_KEY && !process.env.KIE_API_KEY,
      message: !process.env.GEMINI_API_KEY && !process.env.KIE_API_KEY
        ? 'שירות Veo/Seedance לא מוגדר. נוצרו תמונות AI במקום.'
        : undefined,
    })
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש.' })
    console.error('Video project generation error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת פרויקט הסרטון. נסה שוב.' })
  }
})

// ==================== STOCK MEDIA SEARCH ====================

app.get('/api/stock/search', async (req, res) => {
  try {
    const { q, source, page } = req.query
    if (!q) return res.status(400).json({ message: 'חסרה שאילתת חיפוש.' })

    const query = String(q)
    const pageNum = Number(page) || 1
    const src = String(source || 'unsplash')

    if (src === 'unsplash') {
      const apiKey = process.env.UNSPLASH_API_KEY
      if (!apiKey) {
        // Return placeholder results
        return res.json({ results: generatePlaceholderResults(query, 'unsplash'), source: 'unsplash', placeholder: true })
      }
      const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${pageNum}&per_page=12`, {
        headers: { Authorization: `Client-ID ${apiKey}` },
      })
      if (!response.ok) return res.json({ results: generatePlaceholderResults(query, 'unsplash'), source: 'unsplash', placeholder: true })
      const data = await response.json()
      const results = data.results.map((img: any) => ({
        id: img.id,
        url: img.urls.regular,
        thumbUrl: img.urls.small,
        photographer: img.user.name,
        resolution: `${img.width}x${img.height}`,
        type: 'image',
        source: 'unsplash',
      }))
      return res.json({ results, source: 'unsplash', total: data.total })
    }

    if (src === 'pexels') {
      const apiKey = process.env.PEXELS_API_KEY
      if (!apiKey) return res.json({ results: generatePlaceholderResults(query, 'pexels'), source: 'pexels', placeholder: true })
      const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${pageNum}&per_page=12`, {
        headers: { Authorization: apiKey },
      })
      if (!response.ok) return res.json({ results: generatePlaceholderResults(query, 'pexels'), source: 'pexels', placeholder: true })
      const data = await response.json()
      const results = data.photos.map((img: any) => ({
        id: img.id.toString(),
        url: img.src.large2x,
        thumbUrl: img.src.medium,
        photographer: img.photographer,
        resolution: `${img.width}x${img.height}`,
        type: 'image',
        source: 'pexels',
      }))
      return res.json({ results, source: 'pexels', total: data.total_results })
    }

    if (src === 'pixabay') {
      const apiKey = process.env.PIXABAY_API_KEY
      if (!apiKey) return res.json({ results: generatePlaceholderResults(query, 'pixabay'), source: 'pixabay', placeholder: true })
      const response = await fetch(`https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&page=${pageNum}&per_page=12&lang=he`)
      if (!response.ok) return res.json({ results: generatePlaceholderResults(query, 'pixabay'), source: 'pixabay', placeholder: true })
      const data = await response.json()
      const results = data.hits.map((img: any) => ({
        id: img.id.toString(),
        url: img.largeImageURL,
        thumbUrl: img.previewURL,
        photographer: img.user,
        resolution: `${img.imageWidth}x${img.imageHeight}`,
        type: img.type === 'photo' ? 'image' : img.type,
        source: 'pixabay',
      }))
      return res.json({ results, source: 'pixabay', total: data.totalHits })
    }

    return res.status(400).json({ message: 'מקור לא תקין.' })
  } catch (error: any) {
    console.error('Stock search error:', error.message)
    return res.status(500).json({ message: 'שגיאה בחיפוש. נסה שוב.' })
  }
})

function generatePlaceholderResults(query: string, source: string) {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `placeholder-${source}-${i}`,
    url: `https://placehold.co/800x450/1A1A2E/E94560?text=${encodeURIComponent(query)}+${i + 1}`,
    thumbUrl: `https://placehold.co/400x225/1A1A2E/E94560?text=${encodeURIComponent(query)}+${i + 1}`,
    photographer: 'Stock Photo',
    resolution: '800x450',
    type: 'image',
    source,
    placeholder: true,
  }))
}

// ==================== B-ROLL SUGGESTIONS (AI) ====================

app.post('/api/suggest-broll', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })

    const { transcript, segments } = req.body
    if (!transcript) return res.status(400).json({ message: 'לא התקבל תמלול.' })

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a professional video editor. Analyze this Hebrew transcript and suggest 5-8 B-Roll images that would enhance the video. For each suggestion provide:
- timestamp: when to show the B-Roll (in seconds)
- prompt: DALL-E prompt in English for generating the image
- duration: how long to show (3-8 seconds)
- position: "fullscreen" or "pip"
- reason: explanation in Hebrew why this B-Roll is needed

Return ONLY valid JSON: {"suggestions": [{"timestamp": 5, "prompt": "...", "duration": 5, "position": "fullscreen", "reason": "..."}]}`,
        },
        { role: 'user', content: `Transcript:\n${transcript}\n\nSegments:\n${JSON.stringify(segments || [])}` },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    res.json({ suggestions: parsed.suggestions || [] })
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש.' })
    console.error('B-Roll suggestion error:', error.message)
    return res.status(500).json({ message: 'שגיאה ביצירת הצעות B-Roll. נסה שוב.' })
  }
})

// ==================== ENHANCED AI CHAT (with full context) ====================

app.post('/api/chat/enhanced', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר.' })

    const { message, context, userProfile } = req.body
    if (!message) return res.status(400).json({ message: 'לא התקבלה הודעה' })

    const systemPrompt = `You are a professional AI video editor assistant. You speak Hebrew only.
You have full control over video editing tools.
${userProfile ? '\n' + userProfile + '\nחשוב: אם יש פרופיל משתמש למעלה, התאם את ההמלצות להעדפות שלו.\n' : ''}
Current project state:
- Name: ${context?.projectName || 'ללא שם'}
- Duration: ${context?.duration || 0} seconds
- Speakers: ${context?.speakers?.join(', ') || 'לא זוהו'} (${context?.speakerCount || 0})
- B-Roll items: ${context?.brollCount || 0}
- Captions: ${context?.hasCaptions ? 'enabled (' + (context?.captionStyle || 'modern') + ')' : 'disabled'}
- Deleted regions: ${context?.deletedRegionsCount || 0} (${context?.deletedDuration?.toFixed(1) || 0}s)
- Filler words: ${context?.fillerWordCount || 0}
- Silences > 1s: ${context?.silenceCount || 0} (total: ${context?.silenceDuration?.toFixed(1) || 0}s)
- Eye contact: ${context?.hasEyeContact ? 'on' : 'off'}
- Green screen: ${context?.hasGreenScreen ? 'on' : 'off'}
- Audio enhanced: ${context?.isAudioEnhanced ? 'yes' : 'no'}

IMPORTANT: You must ALWAYS respond with valid JSON in this exact format:
{
  "message": "Hebrew explanation of what you did or recommend",
  "actions": [],
  "suggestions": [],
  "showAsChecklist": false
}

Available action types for the "actions" array:
- {"action": "remove_filler_words", "params": {}}
- {"action": "add_captions", "params": {"style": "modern"}}
- {"action": "shorten_silences", "params": {"threshold": 1.0}}
- {"action": "add_broll", "params": {"prompt": "description", "start": 5, "end": 10, "position": "fullscreen"}}
- {"action": "auto_broll", "params": {}}
- {"action": "generate_content", "params": {"type": "youtube_description"}}
- {"action": "enhance_audio", "params": {}}
- {"action": "eye_contact", "params": {"enabled": true}}
- {"action": "green_screen", "params": {"background": "office"}}
- {"action": "center_speaker", "params": {"enabled": true}}
- {"action": "reframe", "params": {"ratio": "9:16"}}
- {"action": "generate_chapters", "params": {}}
- {"action": "delete_range", "params": {"start": 30, "end": 35}}
- {"action": "mute_range", "params": {"start": 5, "end": 8}}
- {"action": "suggest_clips", "params": {"count": 3}}
- {"action": "change_caption_style", "params": {"style": "karaoke"}}
- {"action": "translate", "params": {"targetLang": "en"}}
- {"action": "delete_all_broll", "params": {}}
- {"action": "add_animation", "params": {"type": "fadeIn"}}

When user asks for recommendations (מה אתה ממליץ, מה כדאי לעשות, תנתח את הסרטון):
- Set "showAsChecklist": true
- Return suggestions with priority (high/medium/low) and executable action
- Each suggestion must reference real numbers from the project state above
- Sort by priority: high first, then medium, then low
- Include 5-8 suggestions
- Format: {"text": "description with real numbers", "priority": "high", "action": {"action": "action_type", "params": {}}}

When user asks to professionally edit (ערוך מקצועי, ערוך את הסרטון):
- Set "showAsChecklist": true
- Return all recommended editing actions as suggestions

When user gives a direct command (הסר מילות מילוי, הוסף כתוביות):
- Set "showAsChecklist": false
- Put actions in "actions" array for immediate execution
- Explain in "message" what was done

You can return multiple actions - they execute in order.
NEVER just describe what you would do. ALWAYS include actions in the JSON.
Always respond with valid JSON only. No markdown, no code blocks.`

    const transcriptText = context?.transcript || ''

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message + (transcriptText ? `\n\nTranscript:\n${transcriptText}` : '') },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const rawContent = response.choices[0]?.message?.content || '{}'
    const usage = response.usage
    let parsed: any
    try {
      parsed = JSON.parse(rawContent)
    } catch {
      parsed = { message: rawContent, actions: [], suggestions: [] }
    }

    // Normalize: support both old format (type/actions with "action" key) and new format
    const normalizedActions = (parsed.actions || []).map((a: any) => {
      // If action uses {action: "name"} format, keep it for backward compat with executor
      // If action uses {type: "name"} format, convert to {action: "name"} for executor
      if (a.type && !a.action) {
        return { action: a.type, params: a.params || {} }
      }
      return { action: a.action, params: a.params || {} }
    })

    // Normalize suggestions: ensure action field uses executor format
    const normalizedSuggestions = (parsed.suggestions || []).map((s: any) => {
      if (s.action) {
        const act = typeof s.action === 'string'
          ? { action: s.action, params: {} }
          : { action: s.action.action || s.action.type || s.action, params: s.action.params || {} }
        return { ...s, action: act }
      }
      return s
    })

    res.json({
      response: {
        type: parsed.type || (normalizedActions.length > 0 ? 'action' : parsed.showAsChecklist ? 'suggestions' : 'text'),
        actions: normalizedActions,
        suggestions: normalizedSuggestions,
        showAsChecklist: parsed.showAsChecklist || false,
        message: parsed.message || parsed.summary || rawContent,
        summary: parsed.summary || parsed.message || '',
        content: parsed.content || '',
        steps: parsed.steps || [],
      },
      rawContent,
      usage: usage ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens } : null,
    })
  } catch (error: any) {
    if (error.status === 401) return res.status(401).json({ message: 'מפתח ה-API לא תקין.' })
    if (error.status === 429) return res.status(429).json({ message: 'הגעת למגבלת השימוש.' })
    console.error('Enhanced chat error:', error.message)
    return res.status(500).json({ message: 'שגיאה בשרת. נסה שוב.' })
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

// ==================== GEMINI: NANO BANANA IMAGE GENERATION ====================

app.post('/api/generate-image-gemini', async (req, res) => {
  try {
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API key לא מוגדר.' })

    const { prompt, aspectRatio = '16:9', model = 'nano-banana-2' } = req.body

    const modelMap: Record<string, string> = {
      'nano-banana': 'gemini-2.5-flash-image',
      'nano-banana-2': 'gemini-3.1-flash-image-preview',
      'nano-banana-pro': 'gemini-3-pro-image-preview',
    }

    const modelId = modelMap[model] || 'gemini-2.5-flash-image'

    console.log('[NANO BANANA] Generating image with', modelId)
    console.log('[NANO BANANA] Prompt:', prompt)
    console.log('[NANO BANANA] Aspect ratio:', aspectRatio)

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageGenerationConfig: {
          aspectRatio: aspectRatio,
        },
      },
    })

    const imagePart = response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith('image/')
    )

    if (!imagePart?.inlineData) {
      return res.status(500).json({ message: 'לא נוצרה תמונה. נסה פרומפט אחר.' })
    }

    const base64 = imagePart.inlineData.data
    const mimeType = imagePart.inlineData.mimeType

    console.log('[NANO BANANA] Image generated successfully')

    res.json({
      imageUrl: `data:${mimeType};base64,${base64}`,
      mimeType,
      model: modelId,
    })

  } catch (error: any) {
    console.error('[NANO BANANA ERROR]', error.message)
    res.status(500).json({ message: 'שגיאה ביצירת תמונה: ' + error.message })
  }
})

// ==================== GEMINI: VEO VIDEO GENERATION ====================

app.post('/api/generate-video-veo', async (req, res) => {
  try {
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API key לא מוגדר.' })

    const {
      prompt,
      aspectRatio = '16:9',
      resolution = '720p',
      model = 'veo-3.1'
    } = req.body

    const modelMap: Record<string, string> = {
      'veo-3': 'veo-3.0-generate-preview',
      'veo-3-fast': 'veo-3.0-fast-generate-preview',
      'veo-3.1': 'veo-3.1-generate-preview',
      'veo-3.1-fast': 'veo-3.1-fast-generate-preview',
    }

    const modelId = modelMap[model] || 'veo-3.1-generate-preview'

    console.log('[VEO] Generating video with', modelId)
    console.log('[VEO] Prompt:', prompt)

    const operation = await ai.models.generateVideos({
      model: modelId,
      prompt: prompt,
      config: {
        aspectRatio: aspectRatio,
        resolution: resolution,
      },
    })

    let result = operation
    let attempts = 0
    const maxAttempts = 60

    while (!result.done && attempts < maxAttempts) {
      console.log('[VEO] Waiting for video... attempt', attempts + 1)
      await new Promise(r => setTimeout(r, 5000))
      result = await ai.operations.getVideosOperation(result)
      attempts++
    }

    if (!result.done) {
      return res.status(408).json({ message: 'יצירת הסרטון לקחה יותר מדי זמן. נסה שוב.' })
    }

    const video = result.response?.generatedVideos?.[0]
    if (!video?.video) {
      return res.status(500).json({ message: 'לא נוצר סרטון. נסה פרומפט אחר.' })
    }

    const videoPath = path.join(__dirname, 'uploads', `veo_${Date.now()}.mp4`)

    const videoData = await ai.files.download(video.video)
    fs.writeFileSync(videoPath, Buffer.from(videoData))

    console.log('[VEO] Video generated:', videoPath)

    res.setHeader('Content-Type', 'video/mp4')
    const readStream = fs.createReadStream(videoPath)
    readStream.pipe(res)
    readStream.on('end', () => {
      try { fs.unlinkSync(videoPath) } catch {}
    })

  } catch (error: any) {
    console.error('[VEO ERROR]', error.message)

    if (error.message?.includes('PERMISSION_DENIED') || error.message?.includes('billing')) {
      return res.status(403).json({
        message: 'Veo דורש חשבון Gemini API בתשלום (Paid Tier). שדרג בהגדרות Google AI Studio.'
      })
    }

    res.status(500).json({ message: 'שגיאה ביצירת סרטון: ' + error.message })
  }
})

// ==================== GEMINI: IMAGE-TO-VIDEO (NANO BANANA + VEO) ====================

app.post('/api/generate-image-to-video', async (req, res) => {
  try {
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API key לא מוגדר.' })

    const { prompt, aspectRatio = '16:9' } = req.body

    console.log('[IMAGE-TO-VIDEO] Step 1: Generating image with Nano Banana...')

    const imageResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
      config: { responseModalities: ['IMAGE'] },
    })

    const imagePart = imageResponse.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith('image/')
    )

    if (!imagePart) {
      return res.status(500).json({ message: 'שלב 1 נכשל: לא נוצרה תמונה.' })
    }

    console.log('[IMAGE-TO-VIDEO] Step 2: Generating video from image with Veo...')

    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt: prompt,
      image: imagePart,
    })

    let result = operation
    while (!result.done) {
      await new Promise(r => setTimeout(r, 5000))
      result = await ai.operations.getVideosOperation(result)
    }

    const video = result.response?.generatedVideos?.[0]
    if (!video?.video) {
      return res.status(500).json({ message: 'שלב 2 נכשל: לא נוצר סרטון.' })
    }

    const videoPath = path.join(__dirname, 'uploads', `i2v_${Date.now()}.mp4`)
    const videoData = await ai.files.download(video.video)
    fs.writeFileSync(videoPath, Buffer.from(videoData))

    console.log('[IMAGE-TO-VIDEO] Success!')

    res.setHeader('Content-Type', 'video/mp4')
    const readStream = fs.createReadStream(videoPath)
    readStream.pipe(res)
    readStream.on('end', () => { try { fs.unlinkSync(videoPath) } catch {} })

  } catch (error: any) {
    console.error('[IMAGE-TO-VIDEO ERROR]', error.message)
    res.status(500).json({ message: 'שגיאה: ' + error.message })
  }
})

// ==================== AUTO-EDITOR PROXY ENDPOINTS ====================
// These endpoints proxy external API calls from the frontend auto-editor
// to avoid CORS issues (browsers block direct calls to external APIs)

// POST /api/chatgpt-plan — ChatGPT editing plan generation
app.post('/api/chatgpt-plan', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { systemPrompt, userMessage, temperature = 0.7 } = req.body
    if (!userMessage) return res.status(400).json({ message: 'חסר userMessage' })

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: userMessage },
      ],
      temperature,
      response_format: { type: 'json_object' as const },
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) return res.status(500).json({ message: 'ChatGPT לא החזיר תוכן' })

    res.json({ content })
  } catch (err: any) {
    console.error('ChatGPT plan error:', err.message)
    res.status(500).json({ message: err.message || 'שגיאת ChatGPT' })
  }
})

// POST /api/generate-background — Nano Banana (Gemini) image generation
app.post('/api/generate-background', async (req, res) => {
  try {
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API Key לא מוגדר. הוסף GEMINI_API_KEY ב-.env' })

    const { prompt, aspectRatio = '9:16' } = req.body
    if (!prompt) return res.status(400).json({ message: 'חסר prompt' })

    console.log('[NANO BANANA] Generating image with Gemini...')

    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt,
      config: { numberOfImages: 1, aspectRatio },
    })

    const imageData = response.generatedImages?.[0]?.image
    if (!imageData) {
      return res.status(500).json({ message: 'Nano Banana לא החזיר תמונה' })
    }

    // Save image to uploads and return URL
    const filename = `bg_${Date.now()}.png`
    const filePath = path.join(uploadsDir, filename)

    if (imageData.imageBytes) {
      fs.writeFileSync(filePath, Buffer.from(imageData.imageBytes, 'base64'))
    } else if (imageData.uri) {
      return res.json({ url: imageData.uri, imageUrl: imageData.uri })
    } else {
      return res.status(500).json({ message: 'פורמט תשובה לא צפוי מ-Gemini' })
    }

    const imageUrl = `http://localhost:${PORT}/uploads/${filename}`
    console.log('[NANO BANANA] Image saved:', imageUrl)

    res.json({ url: imageUrl, imageUrl })
  } catch (err: any) {
    console.error('Generate background error:', err.message)
    res.status(500).json({ message: err.message || 'שגיאת יצירת רקע' })
  }
})

// POST /api/generate-broll — B-Roll video generation proxy (Seedance via kie.ai or VEO)
app.post('/api/generate-broll', async (req, res) => {
  const { prompt, provider, duration = '5', aspectRatio = '9:16', resolution = '720p', generateAudio = false } = req.body
  if (!prompt) return res.status(400).json({ message: 'חסר prompt' })

  if (provider === 'seedance') {
    const kieKey = process.env.KIE_API_KEY
    if (!kieKey) {
      return res.status(400).json({ message: 'KIE API Key לא מוגדר. הוסף KIE_API_KEY ב-.env (מ-kie.ai)' })
    }

    try {
      console.log('[SEEDANCE] Creating task via kie.ai...')
      console.log('[SEEDANCE] Prompt:', prompt)
      console.log('[SEEDANCE] Duration:', duration, 'Aspect:', aspectRatio)

      // Step 1: Create generation task
      const createRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kieKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'bytedance/seedance-1.5-pro',
          input: {
            prompt: prompt,
            aspect_ratio: aspectRatio,
            resolution: resolution,
            duration: String(duration),
            fixed_lens: false,
            generate_audio: generateAudio,
          }
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        console.error('[SEEDANCE] Create task failed:', err)
        return res.status(createRes.status).json({
          message: 'שגיאה ביצירת סרטון Seedance: ' + (err.message || err.error || 'Unknown error')
        })
      }

      const taskData = await createRes.json()
      const taskId = taskData.data?.task_id || taskData.task_id
      console.log('[SEEDANCE] Task created:', taskId)

      if (!taskId) {
        return res.status(500).json({ message: 'לא התקבל task_id מ-kie.ai' })
      }

      // Step 2: Poll for result
      let videoUrl = null
      let attempts = 0
      const maxAttempts = 120 // 10 minutes max (5 sec intervals)

      while (!videoUrl && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000))
        attempts++

        const statusRes = await fetch(`https://api.kie.ai/api/v1/jobs/getTaskDetails?task_id=${taskId}`, {
          headers: { 'Authorization': `Bearer ${kieKey}` },
        })

        const statusData = await statusRes.json()
        const status = statusData.data?.status || statusData.status

        console.log(`[SEEDANCE] Poll ${attempts}: status=${status}`)

        if (status === 'completed' || status === 'success') {
          videoUrl = statusData.data?.output?.video_url ||
                     statusData.data?.result?.video_url ||
                     statusData.data?.video_url
          break
        }

        if (status === 'failed' || status === 'error') {
          const errorMsg = statusData.data?.error || statusData.error || 'Generation failed'
          return res.status(500).json({ message: 'Seedance נכשל: ' + errorMsg })
        }
      }

      if (!videoUrl) {
        return res.status(408).json({ message: 'יצירת הסרטון לקחה יותר מדי זמן. נסה שוב.' })
      }

      console.log('[SEEDANCE] Video ready:', videoUrl)

      // Step 3: Download video and send to client
      const videoRes = await fetch(videoUrl)
      if (!videoRes.ok) {
        return res.status(500).json({ message: 'שגיאה בהורדת הסרטון מ-Seedance' })
      }

      const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
      const videoPath = path.join(__dirname, 'uploads', `seedance_${Date.now()}.mp4`)
      fs.writeFileSync(videoPath, videoBuffer)

      console.log('[SEEDANCE] Saved:', videoPath, (videoBuffer.length / 1024 / 1024).toFixed(1) + 'MB')

      // Send file to client
      res.setHeader('Content-Type', 'video/mp4')
      const readStream = fs.createReadStream(videoPath)
      readStream.pipe(res)
      readStream.on('end', () => { try { fs.unlinkSync(videoPath) } catch {} })

    } catch (error: any) {
      console.error('[SEEDANCE ERROR]', error.message)
      res.status(500).json({ message: 'שגיאה ב-Seedance: ' + error.message })
    }
    return
  }

  if (provider === 'veo') {
    // VEO provider — uses GEMINI_API_KEY (same key as Nano Banana)
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API Key לא מוגדר. הוסף GEMINI_API_KEY ב-.env' })

    try {
      console.log('[VEO] Starting video generation with Gemini SDK...')

      // Use GoogleGenAI SDK for Veo
      const operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt,
        config: { aspectRatio: aspectRatio as any },
      })

      // Poll until done
      let result = operation
      for (let i = 0; i < 60; i++) {
        if (result.done) break
        await new Promise((r) => setTimeout(r, 5000))
        result = await ai.operations.get({ operation: result })
      }

      if (!result.done) {
        return res.status(504).json({ message: 'VEO: זמן המתנה חרג' })
      }

      // Extract video URL from result
      const veoVideoUrl = result.response?.generatedVideos?.[0]?.video?.uri
      if (!veoVideoUrl) {
        return res.status(500).json({ message: 'VEO לא החזיר סרטון' })
      }

      return res.json({ url: veoVideoUrl })
    } catch (err: any) {
      console.error('[VEO ERROR]', err.message)
      res.status(500).json({ message: err.message || 'שגיאת יצירת VEO' })
    }
    return
  }

  res.status(400).json({ message: 'Provider לא מוכר: ' + provider })
})

// POST /api/find-music — Pixabay music search proxy
app.post('/api/find-music', async (req, res) => {
  try {
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) return res.status(400).json({ message: 'PIXABAY_API_KEY לא מוגדר בשרת' })

    const { searchTerm } = req.body
    if (!searchTerm) return res.status(400).json({ message: 'חסר searchTerm' })

    const encodedQuery = encodeURIComponent(searchTerm)
    const response = await fetch(
      `https://pixabay.com/api/videos/music/?key=${apiKey}&q=${encodedQuery}&per_page=5`
    )

    if (!response.ok) {
      return res.status(response.status).json({ message: `שגיאת Pixabay: ${response.statusText}` })
    }

    let data = await response.json()

    // Fallback to generic search if no results
    if (!data.hits || data.hits.length === 0) {
      const fallbackResponse = await fetch(
        `https://pixabay.com/api/videos/music/?key=${apiKey}&q=background+music&per_page=5`
      )
      data = await fallbackResponse.json()
    }

    if (!data.hits || data.hits.length === 0) {
      return res.status(404).json({ message: 'לא נמצאה מוזיקה מתאימה' })
    }

    const audioUrl = data.hits[0].audio || data.hits[0].audioUrl
    res.json({ url: audioUrl, tags: data.hits[0].tags })
  } catch (err: any) {
    console.error('Find music error:', err.message)
    res.status(500).json({ message: err.message || 'שגיאת חיפוש מוזיקה' })
  }
})

// POST /api/upload-temp — Upload file to server temp storage (for auto-editor local mode)
app.post('/api/upload-temp', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'לא התקבל קובץ' })

  const fileUrl = `http://localhost:${PORT}/uploads/${path.basename(req.file.path)}`
  console.log('[TEMP UPLOAD]', req.file.originalname, '->', fileUrl)

  res.json({ url: fileUrl, filename: req.file.filename })
})

// POST /api/auto-editor/transcribe — Proxy transcription for auto-editor
// Supports: local server URLs (http://localhost:3001/uploads/...) and remote URLs (R2, etc.)
app.post('/api/auto-editor/transcribe', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { fileUrl } = req.body
    if (!fileUrl) return res.status(400).json({ message: 'חסר fileUrl' })

    console.log('[AUTO-TRANSCRIBE] Processing:', fileUrl)

    let filePath: string
    let isTemp = false

    if (fileUrl.startsWith(`http://localhost:${PORT}/uploads/`) || fileUrl.startsWith('/uploads/')) {
      // LOCAL FILE — already on server, resolve to disk path
      const filename = path.basename(new URL(fileUrl, `http://localhost:${PORT}`).pathname)
      filePath = path.join(uploadsDir, filename)
      console.log('[AUTO-TRANSCRIBE] Local file:', filePath)
    } else if (fileUrl.startsWith('http')) {
      // REMOTE URL (R2 or other) — download first
      console.log('[AUTO-TRANSCRIBE] Downloading from remote URL...')
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        return res.status(400).json({ message: `שגיאה בהורדת הקובץ: ${fileResponse.statusText}` })
      }
      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())
      filePath = path.join(uploadsDir, `temp-${Date.now()}-download.mp4`)
      fs.writeFileSync(filePath, fileBuffer)
      isTemp = true
    } else {
      return res.status(400).json({ message: 'פורמט URL לא תקין: ' + fileUrl })
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'הקובץ לא נמצא בשרת' })
    }

    console.log('[AUTO-TRANSCRIBE] File path:', filePath, '| Size:', (fs.statSync(filePath).size / 1024 / 1024).toFixed(1), 'MB')

    // Extract audio as compressed MP3
    const mp3Path = filePath.replace(/\.[^.]+$/, '') + '_audio.mp3'
    const ffmpeg = getFFmpeg()
    try {
      execSync(`"${ffmpeg}" -i "${filePath}" -vn -acodec libmp3lame -ab 64k -ar 16000 -ac 1 "${mp3Path}" -y`, {
        timeout: 300000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path)
    }

    const audioPath = fs.existsSync(mp3Path) ? mp3Path : filePath

    console.log('[AUTO-TRANSCRIBE] Sending to Whisper...')

    // Transcribe with Whisper
    const transcription = await ai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
      language: 'he',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    // Clean up temp files
    if (fs.existsSync(mp3Path)) try { fs.unlinkSync(mp3Path) } catch {}
    if (isTemp && fs.existsSync(filePath)) try { fs.unlinkSync(filePath) } catch {}

    console.log('[AUTO-TRANSCRIBE] Done:', (transcription.segments || []).length, 'segments,', transcription.duration?.toFixed(1), 'sec')

    res.json({
      segments: transcription.segments || [],
      duration: transcription.duration || 0,
      text: transcription.text || '',
    })
  } catch (err: any) {
    console.error('[AUTO-TRANSCRIBE ERROR]', err.message)
    res.status(500).json({ message: 'שגיאה בתמלול: ' + err.message })
  }
})

// ==================== AUTO-EDITOR: VIDEO PROCESSING ====================

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

// Legacy endpoint kept for backward compat
app.post('/api/auto-editor/process-video', async (req, res) => {
  // Redirect to new process endpoint
  req.url = '/api/auto-editor/process'
  req.body = {
    videoUrl: req.body.sourceUrls?.[0] || '',
    videoPlan: req.body.videoPlan || {},
    targetDuration: 60,
    platforms: ['tiktok'],
    musicUrl: req.body.music || null,
    backgroundImage: req.body.backgroundImage || null,
  }
  // Forward to main handler
  return (app as any).handle(req, res)
})

// Main processing endpoint: cuts, color grades, cleans audio, adds music, subtitles, exports per platform
app.post('/api/auto-editor/process', async (req, res) => {
  try {
    const {
      videoUrl,
      videoPlan,
      targetDuration,
      platforms,
      musicUrl,
      backgroundImage,
    } = req.body

    const ffmpegPath = getFFmpeg()
    const timestamp = Date.now()

    // Resolve source file path
    let sourceFile: string
    if (videoUrl && videoUrl.includes('localhost')) {
      const urlPath = new URL(videoUrl, `http://localhost:${PORT}`).pathname
      const filename = path.basename(urlPath)
      sourceFile = path.join(uploadsDir, filename)
    } else if (videoUrl && videoUrl.startsWith('/uploads/')) {
      sourceFile = path.join(uploadsDir, path.basename(videoUrl))
    } else if (videoUrl) {
      // Download remote file
      const response = await fetch(videoUrl)
      const buffer = Buffer.from(await response.arrayBuffer())
      sourceFile = path.join(uploadsDir, `source_${timestamp}.mp4`)
      fs.writeFileSync(sourceFile, buffer)
    } else {
      return res.status(400).json({ message: 'חסר videoUrl' })
    }

    if (!fs.existsSync(sourceFile)) {
      return res.status(400).json({ message: 'קובץ המקור לא נמצא: ' + sourceFile })
    }

    console.log('[PROCESS] Source file:', sourceFile)

    const outputFiles: any[] = []

    // ============================================
    // STEP 1: CUT VIDEO ACCORDING TO PLAN
    // ============================================

    // Normalize cuts from camelCase or snake_case
    let cuts = (videoPlan?.cuts || []).map((c: any) => ({
      keep_start: c.keep_start ?? c.keepStart ?? 0,
      keep_end: c.keep_end ?? c.keepEnd ?? targetDuration,
    }))

    if (cuts.length === 0) {
      // If no cuts specified, just trim to target duration
      cuts.push({ keep_start: 0, keep_end: targetDuration || 60 })
    }

    // Build FFmpeg filter for concatenating kept segments using trim+concat
    const cutFilters: string[] = []
    const concatInputs: string[] = []

    cuts.forEach((cut: any, i: number) => {
      cutFilters.push(
        `[0:v]trim=start=${cut.keep_start}:end=${cut.keep_end},setpts=PTS-STARTPTS[v${i}]`
      )
      cutFilters.push(
        `[0:a]atrim=start=${cut.keep_start}:end=${cut.keep_end},asetpts=PTS-STARTPTS[a${i}]`
      )
      concatInputs.push(`[v${i}][a${i}]`)
    })

    const concatFilter = `${concatInputs.join('')}concat=n=${cuts.length}:v=1:a=1[outv][outa]`
    const fullFilter = [...cutFilters, concatFilter].join(';')

    const cutFile = path.join(uploadsDir, `cut_${timestamp}.mp4`)

    console.log('[PROCESS] Step 1: Cutting video with', cuts.length, 'segments...')
    execSync(
      `"${ffmpegPath}" -i "${sourceFile}" -filter_complex "${fullFilter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${cutFile}" -y`,
      { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    console.log('[PROCESS] Step 1 done: Cut video created')

    // ============================================
    // STEP 2: COLOR GRADE
    // ============================================

    const gradedFile = path.join(uploadsDir, `graded_${timestamp}.mp4`)
    console.log('[PROCESS] Step 2: Color grading...')
    execSync(
      `"${ffmpegPath}" -i "${cutFile}" -vf "eq=brightness=0.03:contrast=1.05:saturation=1.15" -c:v libx264 -preset fast -crf 23 -c:a copy "${gradedFile}" -y`,
      { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    console.log('[PROCESS] Step 2 done')

    // ============================================
    // STEP 3: CLEAN AUDIO
    // ============================================

    const cleanedFile = path.join(uploadsDir, `cleaned_${timestamp}.mp4`)
    console.log('[PROCESS] Step 3: Cleaning audio...')
    execSync(
      `"${ffmpegPath}" -i "${gradedFile}" -af "highpass=f=80,lowpass=f=8000,afftdn=nf=-25,loudnorm=I=-16:LRA=11:TP=-1.5" -c:v copy "${cleanedFile}" -y`,
      { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    console.log('[PROCESS] Step 3 done')

    // ============================================
    // STEP 4: ADD MUSIC (if provided)
    // ============================================

    let currentFile = cleanedFile

    if (musicUrl) {
      try {
        let musicFile = ''
        if (musicUrl.includes('localhost')) {
          const musicFilename = path.basename(new URL(musicUrl, `http://localhost:${PORT}`).pathname)
          musicFile = path.join(uploadsDir, musicFilename)
        }

        if (!musicFile || !fs.existsSync(musicFile)) {
          // Download music file
          musicFile = path.join(uploadsDir, `music_${timestamp}.mp3`)
          const musicResponse = await fetch(musicUrl)
          if (musicResponse.ok) {
            const musicBuffer = Buffer.from(await musicResponse.arrayBuffer())
            fs.writeFileSync(musicFile, musicBuffer)
          }
        }

        if (fs.existsSync(musicFile)) {
          const musicMixFile = path.join(uploadsDir, `musicmix_${timestamp}.mp4`)
          console.log('[PROCESS] Step 4: Adding music...')
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -i "${musicFile}" -filter_complex "[1:a]volume=0.15,aloop=-1:2e+09[music];[0:a][music]amix=inputs=2:duration=first[outa]" -map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 128k -shortest "${musicMixFile}" -y`,
            { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
          currentFile = musicMixFile
          console.log('[PROCESS] Step 4 done')

          // Clean up downloaded music
          if (musicFile.includes(`music_${timestamp}`)) {
            try { fs.unlinkSync(musicFile) } catch {}
          }
        }
      } catch (e: any) {
        console.log('[PROCESS] Music failed, continuing without:', e.message)
      }
    }

    // ============================================
    // STEP 5: GENERATE SUBTITLES SRT
    // ============================================

    let srtFile: string | null = null
    const segments = videoPlan?.subtitles || videoPlan?.source_segments || videoPlan?.sourceSegments || []
    if (segments.length > 0) {
      srtFile = path.join(uploadsDir, `subs_${timestamp}.srt`)
      let srtContent = ''
      let index = 1

      // Recalculate timestamps relative to cut video
      let currentOffset = 0
      for (const cut of cuts) {
        const cutDuration = cut.keep_end - cut.keep_start
        for (const seg of segments) {
          const segStart = seg.start ?? seg.keepStart
          const segEnd = seg.end ?? seg.keepEnd
          if (segStart >= cut.keep_start && segEnd <= cut.keep_end) {
            const relStart = currentOffset + (segStart - cut.keep_start)
            const relEnd = currentOffset + (segEnd - cut.keep_start)
            srtContent += `${index}\n`
            srtContent += `${formatSrtTime(relStart)} --> ${formatSrtTime(relEnd)}\n`
            srtContent += `${seg.text}\n\n`
            index++
          }
        }
        currentOffset += cutDuration
      }

      if (srtContent.trim()) {
        fs.writeFileSync(srtFile, srtContent, 'utf8')
        console.log('[PROCESS] SRT file created with', index - 1, 'subtitles')
      } else {
        srtFile = null
      }
    }

    // ============================================
    // STEP 6: EXPORT FOR EACH PLATFORM
    // ============================================

    const platformSpecs: Record<string, { w: number; h: number; ratio: string }> = {
      tiktok: { w: 1080, h: 1920, ratio: '9:16' },
      reels: { w: 1080, h: 1920, ratio: '9:16' },
      shorts: { w: 1080, h: 1920, ratio: '9:16' },
      story: { w: 1080, h: 1920, ratio: '9:16' },
      youtube: { w: 1920, h: 1080, ratio: '16:9' },
      facebook: { w: 1920, h: 1080, ratio: '16:9' },
      twitter: { w: 1920, h: 1080, ratio: '16:9' },
      linkedin: { w: 1080, h: 1080, ratio: '1:1' },
    }

    const targetPlatforms = platforms || ['tiktok']

    // Group platforms by aspect ratio to avoid re-encoding same ratio
    const ratioGroups: Record<string, string[]> = {}
    for (const platform of targetPlatforms) {
      const spec = platformSpecs[platform]
      if (!spec) continue
      if (!ratioGroups[spec.ratio]) ratioGroups[spec.ratio] = []
      ratioGroups[spec.ratio].push(platform)
    }

    for (const [ratio, platformList] of Object.entries(ratioGroups)) {
      const spec = platformSpecs[platformList[0]]
      const ratioFile = path.join(uploadsDir, `export_${ratio.replace(':', 'x')}_${timestamp}.mp4`)

      console.log(`[PROCESS] Step 6: Exporting ${ratio} for ${platformList.join(', ')}...`)

      // Build scale + pad filter for target aspect ratio
      let vf = `scale=${spec.w}:${spec.h}:force_original_aspect_ratio=decrease,pad=${spec.w}:${spec.h}:(ow-iw)/2:(oh-ih)/2:black`

      // Add subtitles if available
      if (srtFile && fs.existsSync(srtFile)) {
        const escapedSrt = srtFile.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")
        vf += `,subtitles='${escapedSrt}':force_style='FontSize=18,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2'`
      }

      execSync(
        `"${ffmpegPath}" -i "${currentFile}" -vf "${vf}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${ratioFile}" -y`,
        { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
      )

      // Copy the same file for each platform with same ratio (don't re-encode)
      for (const platform of platformList) {
        const platformFile = path.join(uploadsDir, `final_${platform}_${timestamp}.mp4`)
        fs.copyFileSync(ratioFile, platformFile)

        // Get file info
        const stats = fs.statSync(platformFile)
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(1)

        outputFiles.push({
          platform,
          ratio,
          resolution: `${spec.w}x${spec.h}`,
          filename: path.basename(platformFile),
          url: `http://localhost:${PORT}/uploads/${path.basename(platformFile)}`,
          sizeMB: parseFloat(fileSizeMB),
        })

        console.log(`[PROCESS] Created: ${platform} (${ratio}) - ${fileSizeMB}MB`)
      }

      // Clean up ratio file
      try { fs.unlinkSync(ratioFile) } catch {}
    }

    // Cleanup intermediate files
    try { fs.unlinkSync(cutFile) } catch {}
    try { fs.unlinkSync(gradedFile) } catch {}
    try { fs.unlinkSync(cleanedFile) } catch {}
    if (currentFile !== cleanedFile) try { fs.unlinkSync(currentFile) } catch {}
    if (srtFile) try { fs.unlinkSync(srtFile) } catch {}

    console.log('[PROCESS] Done! Created', outputFiles.length, 'files')

    res.json({
      success: true,
      files: outputFiles,
      message: `נוצרו ${outputFiles.length} קבצים`,
    })
  } catch (error: any) {
    console.error('[PROCESS ERROR]', error.message)
    res.status(500).json({ message: 'שגיאה בעיבוד: ' + error.message })
  }
})

// Legacy export endpoint
app.post('/api/auto-editor/export', async (req, res) => {
  try {
    const { videoUrl, platform, width, height, fps, videoIndex } = req.body

    if (!videoUrl) {
      return res.status(400).json({ message: 'חסר URL של הסרטון' })
    }

    const ffmpeg = getFFmpeg()

    // Resolve input path
    const inputFile = videoUrl.replace(`http://localhost:${PORT}/uploads/`, '').replace('/uploads/', '')
    const inputPath = path.join(uploadsDir, inputFile.split('/').pop() || inputFile)

    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ message: 'קובץ המקור לא נמצא' })
    }

    const outputPath = path.join(uploadsDir, `export-${platform}-v${videoIndex}-${Date.now()}.mp4`)

    console.log(`[EXPORT] Video ${videoIndex} -> ${platform} (${width}x${height})`)

    execSync(
      `"${ffmpeg}" -i "${inputPath}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" -r ${fps || 30} -c:v libx264 -preset fast -c:a aac "${outputPath}" -y`,
      { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    const outputFilename = path.basename(outputPath)
    console.log(`[EXPORT] Done: ${outputFilename}`)

    res.json({
      url: `http://localhost:${PORT}/uploads/${outputFilename}`,
      outputUrl: `/uploads/${outputFilename}`,
    })
  } catch (err: any) {
    console.error('[EXPORT ERROR]', err.message)
    res.status(500).json({ message: 'שגיאת ייצוא: ' + err.message })
  }
})

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 סטודיו AI Server running on port ${PORT}`)
  console.log(`   OpenAI:      ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   ElevenLabs:  ${process.env.ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   DeepL:       ${process.env.DEEPL_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Gemini (Nano Banana + Veo): ${process.env.GEMINI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Seedance (kie.ai): ${process.env.KIE_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Pixabay:     ${process.env.PIXABAY_API_KEY ? '✅ Connected' : '❌ Not configured'}`)

  // Check FFmpeg availability
  console.log('Checking FFmpeg...')
  try {
    const ff = getFFmpeg()
    const ver = execSync(`"${ff}" -version`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().split('\n')[0]
    console.log('FFmpeg OK:', ver)
  } catch {
    console.error('FFmpeg NOT FOUND - transcription will fail!')
  }
})
