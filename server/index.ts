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
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
    } else if (filePath.endsWith('.mov') || filePath.endsWith('.MOV')) {
      res.setHeader('Content-Type', 'video/quicktime');
    }
  }
}))

// ==================== API STATUS ====================

app.get('/api/status', async (_req, res) => {
  const status = {
    openai: { connected: !!process.env.OPENAI_API_KEY, chatModel: 'gpt-5.4', transcribeModel: 'gpt-4o-transcribe-diarize', features: ['Chat (GPT-5.4)', 'Transcribe (Diarize)', 'DALL-E', 'Whisper'] },
    elevenlabs: { connected: !!process.env.ELEVENLABS_API_KEY },
    deepl: { connected: !!process.env.DEEPL_API_KEY },
    gemini: { connected: !!process.env.GEMINI_API_KEY, features: ['Nano Banana', 'Veo 3.1'] },
    seedance: { connected: !!process.env.KIE_API_KEY, provider: 'kie.ai', model: 'seedance-1.5-pro' },
    pixabay: { connected: !!process.env.PIXABAY_API_KEY },
    youtube: { connected: !!process.env.YOUTUBE_API_KEY },
    telegram: { connected: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID },
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

        // Transcribe chunk with diarize model (fallback chain)
        let chunkTranscription: any
        try {
          chunkTranscription = await ai.audio.transcriptions.create({
            model: 'gpt-4o-transcribe-diarize',
            file: fs.createReadStream(chunkPath),
            language: 'he',
            response_format: 'diarized_json',
            chunking_strategy: 'auto',
          } as any)
        } catch (diarizeErr: any) {
          console.warn(`[SPLIT] Diarize failed for chunk ${i + 1}, falling back:`, diarizeErr.message)
          try {
            chunkTranscription = await ai.audio.transcriptions.create({
              model: 'gpt-4o-transcribe',
              file: fs.createReadStream(chunkPath),
              language: 'he',
              response_format: 'json',
            } as any)
          } catch {
            chunkTranscription = await ai.audio.transcriptions.create({
              model: 'whisper-1',
              file: fs.createReadStream(chunkPath),
              language: 'he',
              response_format: 'verbose_json',
              timestamp_granularities: ['segment'],
            })
          }
        }

        console.log(`[SPLIT] Chunk ${i + 1} transcribed:`, (chunkTranscription.text || '').length, 'chars')

        // Adjust timestamps by adding offset
        const chunkSegments = ((chunkTranscription as any).segments || []).map((seg: any, idx: number) => ({
          id: allSegments.length + idx,
          speaker: seg.speaker || 'דובר 1',
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

      // Map speaker IDs from diarization to Hebrew names with colors
      const speakerColors = ['#7C5CFF', '#E94560', '#00D2FF', '#FFD700', '#00FF88', '#FF6B35']
      const speakerMap: Record<string, string> = {}
      let speakerCount = 0
      allSegments.forEach((seg: any) => {
        const rawSpeaker = seg.speaker || 'speaker_0'
        if (!speakerMap[rawSpeaker]) {
          speakerCount++
          speakerMap[rawSpeaker] = `דובר ${speakerCount}`
        }
        seg.speaker = speakerMap[rawSpeaker]
        seg.speakerId = Object.keys(speakerMap).indexOf(rawSpeaker) + 1
      })
      const chunkSpeakers = Object.values(speakerMap).map((name, i) => ({
        id: i + 1, name, color: speakerColors[i % speakerColors.length],
      }))

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
    console.log('[TRANSCRIBE 4] Using gpt-4o-transcribe-diarize model')

    let transcription: any
    let usedModel = 'gpt-4o-transcribe-diarize'

    try {
      transcription = await ai.audio.transcriptions.create({
        model: 'gpt-4o-transcribe-diarize',
        file: fs.createReadStream(mp3Path),
        language: 'he',
        response_format: 'diarized_json',
        chunking_strategy: 'auto',
      } as any)
    } catch (diarizeErr: any) {
      console.warn('[TRANSCRIBE] Diarize failed, falling back:', diarizeErr.message)
      usedModel = 'gpt-4o-transcribe (fallback)'
      try {
        transcription = await ai.audio.transcriptions.create({
          model: 'gpt-4o-transcribe',
          file: fs.createReadStream(mp3Path),
          language: 'he',
          response_format: 'json',
        } as any)
      } catch (transcribeErr: any) {
        console.warn('[TRANSCRIBE] gpt-4o-transcribe failed, falling back to whisper-1:', transcribeErr.message)
        usedModel = 'whisper-1 (fallback)'
        transcription = await ai.audio.transcriptions.create({
          model: 'whisper-1',
          file: fs.createReadStream(mp3Path),
          language: 'he',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        })
      }
    }

    console.log('[TRANSCRIBE 5] SUCCESS! Model:', usedModel, 'Text length:', (transcription.text || '').length)
    console.log('[TRANSCRIBE 5] Preview:', (transcription.text || '').substring(0, 100))

    // Cleanup
    try { fs.unlinkSync(mp3Path); mp3Path = '' } catch {}

    // Format segments with speaker info from diarization
    const segments = ((transcription as any).segments || []).map((seg: any, i: number) => ({
      id: i,
      speaker: seg.speaker || 'דובר 1',
      speakerId: 1,
      text: (seg.text || '').trim(),
      start: seg.start || 0,
      end: seg.end || 0,
      words: seg.words || [],
    }))

    if (segments.length === 0 && transcription.text) {
      segments.push({ id: 0, speaker: 'דובר 1', speakerId: 1, text: transcription.text, start: 0, end: 0, words: [] })
    }

    // Map speaker IDs from diarization to Hebrew names with colors
    const speakerColors = ['#7C5CFF', '#E94560', '#00D2FF', '#FFD700', '#00FF88', '#FF6B35']
    const speakerMap: Record<string, string> = {}
    let speakerCount = 0
    segments.forEach((seg: any) => {
      const rawSpeaker = seg.speaker || 'speaker_0'
      if (!speakerMap[rawSpeaker]) {
        speakerCount++
        speakerMap[rawSpeaker] = `דובר ${speakerCount}`
      }
      seg.speaker = speakerMap[rawSpeaker]
      seg.speakerId = Object.keys(speakerMap).indexOf(rawSpeaker) + 1
    })

    const speakers = Object.values(speakerMap).map((name, i) => ({
      id: i + 1, name, color: speakerColors[i % speakerColors.length],
    }))

    console.log('[TRANSCRIBE] Done:', segments.length, 'segments,', speakerCount, 'speakers')

    // Calculate duration (gpt-4o-transcribe-diarize may not return top-level duration)
    let duration = (transcription as any).duration || 0
    if (duration === 0 && segments.length > 0) {
      duration = Math.max(...segments.map((s: any) => s.end || 0))
    }
    if (duration === 0 && mp3Path && fs.existsSync(mp3Path)) {
      try {
        const ffprobePath = getFFmpeg().replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
        const probeResult = execSync(
          `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${mp3Path}"`,
          { timeout: 30000 }
        ).toString().trim()
        duration = parseFloat(probeResult) || 0
      } catch {}
    }
    if (duration === 0 && segments.length > 0) {
      duration = segments.length * 3
    }

    res.json({
      text: transcription.text || '',
      duration,
      language: 'he',
      segments,
      speakers,
      model: usedModel,
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
      model: 'gpt-5.4',
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

    const systemPrompt = `You are a PROFESSIONAL AI video editor assistant called סטודיו AI. You speak Hebrew only.
You have access to the user's video project with transcript and professional editing tools.
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

Professional capabilities (mention when relevant):
- מעברים חלקים (transitions): fade, dissolve, smoothleft, zoomin, wipeleft, fadeblack, circleclose, radial
- זומים דינמיים (Ken Burns): subtle zoom in/out every 5-8 seconds
- סימולציית מולטי-קאם: auto-switch between wide/medium/closeup
- Color grading: cinematic, warm, cold, vintage, vibrant, moody, clean, film
- כתוביות מעוצבות (ASS): modern, karaoke, bold_white, minimal, colorful with animations
- Lower thirds: speaker name bars
- B-Roll עם אנימציות: fade in/out + slight zoom
- אודיו מקצועי: noise reduction, compression, loudnorm, sidechain ducking
- גרפיקות מונפשות: animated text overlays
- Smart framing: blur_background / crop_center for vertical exports
- Intro/Outro מונפשים

When user asks for recommendations (מה אתה ממליץ, מה כדאי לעשות, תנתח את הסרטון, ערוך מקצועי, שפר את הסרטון):
- Set "showAsChecklist": true
- Return suggestions with priority (high/medium/low) and executable action
- Each suggestion must have real numbers from the context
- Sort by priority: high first, then medium, then low
- Include 5-8 suggestions covering basic editing AND professional effects
- Format: {"text": "description", "priority": "high", "action": {"type": "action_type", "params": {}}}

When user gives a direct command (הסר מילות מילוי, הוסף כתוביות):
- Set "showAsChecklist": false
- Put the action directly in "actions" array for immediate execution
- Explain what you did in "message"

NEVER just describe what you would do. ALWAYS include the action in the JSON so it actually happens.
Always respond with valid JSON only. No markdown, no code blocks, just JSON.`

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
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
      model: 'gpt-5.4',
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
      model: 'gpt-5.4',
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
      model: 'gpt-5.4',
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
      model: 'gpt-5.4',
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
      model: 'gpt-5.4',
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

    const systemPrompt = `You are a PROFESSIONAL AI video editor assistant at the highest level. You speak Hebrew only.
You have full control over video editing tools including professional effects.
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

Professional capabilities available (mention when relevant):
- מעברים חלקים בין קטעים (transitions): fade, dissolve, smoothleft, zoomin, wipeleft, fadeblack, circleclose, radial
- זומים דינמיים (Ken Burns effect): subtle zoom in/out every 5-8 seconds
- סימולציית מולטי-קאם: auto-switch between wide/medium/closeup every 3-8 seconds
- Color grading סינמטי: cinematic, warm, cold, vintage, vibrant, moody, clean, film
- כתוביות מעוצבות (ASS format): modern, karaoke, bold_white, minimal, colorful styles with animations
- Lower thirds: speaker name bars with animated entrance
- B-Roll בנקודות מפתח: with fade in/out and slight zoom animations
- עיבוד אודיו מקצועי: noise reduction, compression, loudnorm, sidechain ducking with music
- גרפיקות מונפשות: animated text overlays for key points, numbers, quotes
- Smart framing: blur_background / crop_center / pad_black for vertical exports (9:16)
- Dynamic pacing: intensity-based visual adjustments per segment
- Intro/Outro מונפשים: AI-generated title cards and CTAs

When user asks for recommendations (מה אתה ממליץ, מה כדאי לעשות, תנתח את הסרטון, ערוך מקצועי, שפר את הסרטון):
- Set "showAsChecklist": true
- Return suggestions with priority (high/medium/low) and executable action
- Each suggestion must reference real numbers from the project state above
- Sort by priority: high first, then medium, then low
- Include 5-8 suggestions covering both basic editing AND professional effects
- Format: {"text": "description with real numbers", "priority": "high", "action": {"action": "action_type", "params": {}}}

When user gives a direct command (הסר מילות מילוי, הוסף כתוביות):
- Set "showAsChecklist": false
- Put actions in "actions" array for immediate execution
- Explain in "message" what was done

You can return multiple actions - they execute in order.
NEVER just describe what you would do. ALWAYS include actions in the JSON.
Always respond with valid JSON only. No markdown, no code blocks.`

    const transcriptText = context?.transcript || ''

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
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
      'nano-banana': 'gemini-3.1-flash-image',
      'nano-banana-2': 'gemini-3.1-flash-image',
      'nano-banana-pro': 'gemini-3-pro-image-preview',
    }

    const modelId = modelMap[model] || 'gemini-3.1-flash-image'

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
      'veo-3': 'veo-3.1-generate',
      'veo-3-fast': 'veo-3.1-generate',
      'veo-3.1': 'veo-3.1-generate',
      'veo-3.1-fast': 'veo-3.1-generate',
    }

    const modelId = modelMap[model] || 'veo-3.1-generate'

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
      model: 'gemini-3.1-flash-image',
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
      model: 'veo-3.1-generate',
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

// POST /api/chatgpt-plan — ChatGPT editing plan generation (legacy, still used as fallback)
app.post('/api/chatgpt-plan', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { systemPrompt, userMessage, temperature = 0.7 } = req.body
    if (!userMessage) return res.status(400).json({ message: 'חסר userMessage' })

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
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

// POST /api/auto-editor/expand-prompt — Expand a short prompt into a detailed professional one
app.post('/api/auto-editor/expand-prompt', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ message: 'חסר prompt' })

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system' as const,
          content: `אתה מומחה לעריכת וידאו. המשתמש כותב בקשה קצרה ואתה מרחיב אותה לפרומפט מפורט ומקצועי.

כללים:
1. שמור על הכוונה המקורית של המשתמש
2. הוסף פרטים טכניים שהמשתמש לא חשב עליהם
3. הוסף הנחיות ל-B-Roll ספציפי ומפורט
4. הוסף הנחיות לסגנון עריכה, קצב, מעברים
5. הוסף הנחיות לאודיו ומוזיקה
6. הוסף הנחיות לכתוביות
7. הכל בעברית
8. החזר רק את הפרומפט המורחב, בלי הסברים

דוגמה:
קלט: "סרטון מגניב לטיקטוק"
פלט: "צור סרטון TikTok מושך ואנרגטי: פתח עם Hook חזק שעוצר גלילה תוך השנייה הראשונה - תשתמש במשפט הכי מפתיע או מעניין מהתמלול. קצב עריכה מהיר עם חיתוכים כל 2-4 שניות, בלי רגע שקט. הוסף B-Roll ויזואלי ודינמי בכל פעם שהדובר מתאר משהו - תמונות סינמטיות של המוצר/שירות עם תאורה דרמטית, slow motion, ו-Ken Burns effect. כתוביות בסגנון קריוקי מילה-מילה עם הדגשה צבעונית של מילים חשובות. מוזיקה טרנדית ואנרגטית ברקע שיורדת אוטומטית בזמן דיבור. זומים דינמיים: zoom in על נקודות חשובות, zoom out על מעברים. דמה 3 זוויות מצלמה: closeup על הפנים ברגעים רגשיים, medium shot בדיבור רגיל, wide shot בפתיחות. Color grading חי וצבעוני עם ניגודיות גבוהה. הסר את כל הגמגומים, מילות המילוי, השתיקות, והחזרות. סיים עם CTA ברור וכרטיס סיום מונפש."

דוגמה 2:
קלט: "ערוך את הסרטון בצורה מקצועית"
פלט: "ערוך את הסרטון ברמה מקצועית גבוהה: נקה את האודיו מרעשי רקע, אזן עוצמה, הוסף highpass ו-lowpass. הסר את כל הגמגומים, מילות המילוי (אממ, כאילו, בעצם, נו), שתיקות מעל חצי שנייה, וחזרות. הוסף color grading סינמטי עם חמימות עדינה וניגודיות מוגברת. הוסף מעברים חלקים בין קטעים - dissolve למעברי נושא, fade to black לסצנות חדשות. הוסף זומים דינמיים עדינים כל 5-7 שניות - zoom in על נקודות מפתח, zoom out על מעברים. דמה מצלמות מרובות עם החלפה כל 4-6 שניות בין wide, medium, ו-closeup. הוסף B-Roll סינמטי ואיכותי בנקודות שמתארים משהו ויזואלי - לפחות 2 קטעי B-Roll לכל 30 שניות. הוסף כתוביות מודרניות ומעוצבות בעברית. הוסף מוזיקת רקע מתאימה שיורדת אוטומטית בזמן דיבור. הוסף שם הדובר בתחתית בהופעה הראשונה. פתח עם הציטוט הכי חזק מהתמלול כ-Hook, וסיים עם קריאה לפעולה ברורה."`
        },
        {
          role: 'user' as const,
          content: `הרחב את הפרומפט הזה:\n\n"${prompt}"`
        }
      ],
      temperature: 0.7,
    })

    const expandedPrompt = response.choices[0]?.message?.content?.trim() || prompt
    const cleaned = expandedPrompt.replace(/^["']|["']$/g, '')

    res.json({ expandedPrompt: cleaned })
  } catch (error: any) {
    console.error('[EXPAND PROMPT]', error.message)
    res.json({ expandedPrompt: req.body.prompt })
  }
})

// === SOP Library: Editing rules per content type ===
const EDITING_SOPS: Record<string, string> = {
  'marketing_product': `
SOP — סרטון שיווק למוצר:
- Hook: הצג את הבעיה שהמוצר פותר תוך 2 שניות. פתח עם המשפט הכי כואב.
- מבנה: בעיה (5 שניות) → פתרון (10 שניות) → הדגמה (10 שניות) → הוכחה חברתית (5 שניות) → CTA (3 שניות)
- קצב: מהיר. חיתוך כל 2-4 שניות. אין רגע שקט.
- B-Roll: צילומי מוצר close-up, שימוש במוצר, לפני/אחרי, פנים מרוצות
- כתוביות: גדולות, צבעוניות, מילת מפתח מודגשת
- מוזיקה: אנרגטית, 120+ BPM, עולה לקראת CTA
- זומים: zoom in על המוצר, zoom in על פנים ברגע רגשי
- Color: חי וצבעוני (vibrant)
- סיום: CTA ברור עם טקסט על המסך`,

  'corporate': `
SOP — סרטון תדמית / תאגידי:
- Hook: פתח עם הערך שהחברה נותנת, לא עם שם החברה
- מבנה: ערך (5 שניות) → סיפור (20 שניות) → הוכחות (10 שניות) → חזון (5 שניות)
- קצב: בינוני. חיתוך כל 4-6 שניות. אפשר נשימות קצרות.
- B-Roll: משרדים, צוות עובד, לקוחות, תהליכים, מוצרים
- כתוביות: מודרניות, נקיות, לבן על שחור שקוף
- מוזיקה: תאגידית, מעוררת אמון, 90-110 BPM
- Color: חם ומקצועי (warm)
- סיום: לוגו + tagline`,

  'podcast_interview': `
SOP — פודקאסט / ראיון:
- Hook: פתח עם הציטוט הכי חזק/מפתיע מהשיחה
- מבנה: Hook → הקשר → שיחה ערוכה → סיום
- קצב: בינוני-איטי. שמור על טבעיות. אל תחתוך יותר מדי.
- B-Roll: מינימלי! רק 1-2 קטעים בנקודות מפתח
- מולטי-קאם: חלף בין wide/medium/closeup כל 4-8 שניות
- שמות דוברים: Lower Third בהופעה הראשונה של כל דובר (4 שניות)
- כתוביות: קלאסיות, נקיות, קריאות
- מוזיקה: רקע שקט מאוד (10-15%), רק בפתיחה ובסיום חזק יותר
- הסר: שתיקות > 2 שניות, גמגומים ברורים, חזרות
- שמור: שתיקות טבעיות < 1 שנייה, הומור, רגעים אותנטיים
- Color: clean, ניטרלי
- סיום: "תודה" + קרדיטים + הנעה לפעולה`,

  'tutorial': `
SOP — סרטון הדרכה / טוטוריאל:
- Hook: "מה תלמדו היום" או "בסוף הסרטון תדעו..."
- מבנה: מבוא (5 שניות) → שלבים ממוספרים → סיכום → CTA
- קצב: איטי-בינוני. תנו לצופה לעקוב.
- B-Roll: screenshots, הדגמות, close-up על מסך/ידיים, תרשימים
- גרפיקות: מספרי שלבים ("שלב 1", "שלב 2"), חיצים, הדגשות
- כתוביות: גדולות וברורות, רקע כהה
- מוזיקה: שקטה ורגועה, 80-100 BPM, לא מסיחה
- הסר: גמגומים, שתיקות חשיבה, "אממ"
- שמור: הסברים חוזרים (לפעמים חשוב לחזור), ביטויים כמו "שימו לב"
- Color: נקי ובהיר (clean)
- סיום: סיכום + "אם עזר לכם - שתפו"`,

  'ad_short': `
SOP — פרסומת קצרה (15-30 שניות):
- Hook: עצור גלילה תוך שנייה אחת! הדבר הכי מפתיע/מצחיק/מבהיל
- מבנה: Hook (1-2 שניות) → בעיה (3 שניות) → פתרון (5 שניות) → הוכחה (3 שניות) → CTA (2 שניות)
- קצב: מהיר מאוד! חיתוך כל 1.5-3 שניות
- B-Roll: כל שנייה שנייה. אין רגע סטטי.
- כתוביות: ענקיות, מילה-מילה (קריוקי), צבעים חזקים
- מוזיקה: חזקה, טרנדית, 128+ BPM
- זומים: אגרסיביים, כל 2-3 שניות
- אפקטים: flash transitions, zoom cuts, whip pans
- Color: vibrant, contrast גבוה
- כל שנייה חשובה. אם רגע לא מוסיף ערך - תמחק.`,

  'social_reels': `
SOP — Reels / TikTok / Shorts:
- Hook: שנייה ראשונה = הכי חשובה. טקסט על המסך + פנים
- פורמט: 9:16 חובה
- מבנה: Hook → תוכן → CTA
- קצב: מהיר. חיתוך כל 2-4 שניות.
- B-Roll: דינמי, lifestyle, close-ups
- כתוביות: קריוקי מילה-מילה, גדולות, צבעוניות, מרכז מסך
- מוזיקה: טרנדית, 120+ BPM
- טקסט על מסך: כותרת בפתיחה, CTA בסיום
- Safe Zones: אל תשים טקסט ב-15% עליון (שם שם המשתמש) או 20% תחתון (שם כפתורים)
- Color: חי, contrast גבוה
- סיום: "עקבו" / "שתפו" / "תגיבו"`,

  'vlog': `
SOP — Vlog / יומן אישי:
- Hook: רגע מעניין מאמצע הסרטון, אז "בואו נחזור להתחלה"
- מבנה: Hook → סיפור כרונולוגי → סיום אישי
- קצב: בינוני, טבעי, לא מעובד מדי
- B-Roll: תמונות מהחיים, נופים, close-ups של אוכל/חפצים
- כתוביות: מודרניות, לא צועקות
- מוזיקה: מתאימה למצב רוח, משתנה בין חלקים
- שמור: רגעים אותנטיים, צחוקים, טעויות מצחיקות
- הסר: שתיקות ארוכות, חלקים משעממים
- Color: חם, מזמין`,

  'webinar_lecture': `
SOP — וובינר / הרצאה:
- Hook: "השאלה הכי חשובה היום היא..."
- מבנה: פתיחה → 3-5 נקודות מפתח → סיכום → שאלות
- קצב: איטי. תנו לתוכן לנשום.
- B-Roll: מצגת, גרפים, נתונים, screenshots
- גרפיקות: נקודות מפתח ממוספרות, ציטוטים, נתונים
- כתוביות: קלאסיות, קטנות, לא מפריעות
- מוזיקה: רק בפתיחה ובסיום, שקטה מאוד
- חלוקה לפרקים: חובה! כל נקודה מפתח = פרק
- שמות דוברים: Lower Third לכל דובר חדש
- Color: ניטרלי, מקצועי`,

  'testimonial': `
SOP — עדויות לקוחות:
- Hook: התוצאה הכי מרשימה שהלקוח מספר עליה
- מבנה: תוצאה → בעיה קודמת → מה עשו → תוצאה שוב
- קצב: בינוני, אותנטי
- B-Roll: הלקוח בפעולה, המוצר/שירות, תוצאות
- כתוביות: חובה! הרבה צופים בלי סאונד
- גרפיקות: שם הלקוח + תפקיד, מספרים/אחוזים, ציטוט מרכזי
- מוזיקה: מעוררת אמון, שקטה, 80-100 BPM
- Color: חם, מזמין`,

  'before_after': `
SOP — לפני / אחרי:
- Hook: התוצאה הסופית (אחרי) → "איך הגענו לזה?"
- מבנה: אחרי (2 שניות) → לפני (5 שניות) → תהליך (15 שניות) → אחרי שוב (5 שניות)
- B-Roll: split screen לפני/אחרי, close-ups, תהליך
- כתוביות: "לפני" / "אחרי" כטקסט גדול
- מוזיקה: דרמטית, build-up
- Color: "לפני" = קר/אפור, "אחרי" = חם/צבעוני`,

  'ecommerce': `
SOP — סרטון מוצר (E-Commerce):
- Hook: המוצר בפעולה, תוצאה מרשימה
- מבנה: Hook → פיצ'רים (3-4) → הדגמה → מחיר/CTA
- קצב: מהיר, כל פיצ'ר 3-5 שניות
- B-Roll: מוצר מכל זווית, unboxing, שימוש, close-ups
- כתוביות: קצרות, bullets, מספרים
- גרפיקות: מחיר, discount, "משלוח חינם", stars
- מוזיקה: קלילה, שמחה
- Color: נקי, המוצר בולט`,
}

// POST /api/auto-editor/analyze-visuals — Extract frames and analyze with GPT Vision
app.post('/api/auto-editor/analyze-visuals', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { videoUrl, duration, promptEvolution } = req.body
    const ffmpegPath = getFFmpeg()

    // Determine source file
    let sourceFile: string
    if (videoUrl.startsWith('http://localhost')) {
      const filename = path.basename(new URL(videoUrl, 'http://localhost').pathname)
      sourceFile = path.join(uploadsDir, filename)
    } else {
      sourceFile = videoUrl
    }

    if (!fs.existsSync(sourceFile)) {
      return res.status(400).json({ message: 'הקובץ לא נמצא' })
    }

    // Extract frames every 5 seconds
    const framesDir = path.join(uploadsDir, `frames_${Date.now()}`)
    fs.mkdirSync(framesDir, { recursive: true })

    console.log('[VISUAL] Extracting frames every 5 seconds...')
    execSync(
      `"${ffmpegPath}" -i "${sourceFile}" -vf "fps=1/5,scale=480:-1" "${framesDir}/frame_%04d.jpg" -y`,
      { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    // Read all extracted frames
    const frameFiles = fs.readdirSync(framesDir)
      .filter((f: string) => f.endsWith('.jpg'))
      .sort()

    console.log(`[VISUAL] Extracted ${frameFiles.length} frames`)

    // Convert frames to base64 for GPT Vision
    const frameImages = frameFiles.map((file: string, index: number) => {
      const data = fs.readFileSync(path.join(framesDir, file))
      return {
        time: index * 5,
        base64: data.toString('base64'),
      }
    })

    // Limit to max 20 frames to stay within token limits
    const selectedFrames = frameImages.length > 20
      ? frameImages.filter((_: any, i: number) => i % Math.ceil(frameImages.length / 20) === 0).slice(0, 20)
      : frameImages

    console.log(`[VISUAL] Sending ${selectedFrames.length} frames to GPT Vision...`)

    // Build system prompt (use evolved prompt if provided)
    const baseVisualSystemPrompt = `אתה מנתח וידאו מקצועי. אתה מקבל פריימים מסרטון (כל 5 שניות).

נתח את הפריימים וזהה:
1. מה נראה בכל פריים (אנשים, מקום, חפצים, טקסט על מסך)
2. האם הדובר מסתכל למצלמה או לצד
3. איכות התאורה (טובה/בינונית/גרועה, חמה/קרה/ניטרלית)
4. הרקע (משרד/בית/חוץ/סטודיו/אחר)
5. האם יש תנועה או סטטי
6. האם הפריימינג טוב (הדובר ממורכז? יש אוויר מיותר?)
7. רגעים בולטים (הבעות פנים, מחוות ידיים, שינוי סצנה)
8. בעיות טכניות (חושך, טשטוש, חיתוך לא טוב)`

    const visualSystemPrompt = promptEvolution || baseVisualSystemPrompt

    // Send all frames to GPT for visual analysis
    const messages: any[] = [
      {
        role: 'system',
        content: `${visualSystemPrompt}

החזר JSON:
{
  "scene_analysis": [
    {
      "time": 0,
      "description": "תיאור קצר של מה שנראה",
      "speaker_looking_at_camera": true,
      "lighting": "warm/cold/neutral/dark",
      "lighting_quality": "good/medium/poor",
      "background": "תיאור הרקע",
      "motion": "static/slight/active",
      "framing": "good/needs_crop_left/needs_crop_right/too_wide/too_tight",
      "notable": "משהו בולט - הבעה, מחווה, שינוי"
    }
  ],
  "overall": {
    "location": "היכן צולם הסרטון",
    "lighting_mood": "חם/קר/ניטרלי/מעורב",
    "recommended_color_grade": "warm/cold/cinematic/vibrant/clean",
    "recommended_crop": "תיאור אם צריך לחתוך",
    "eye_contact_percentage": 75,
    "scene_changes": [{"time": 30, "description": "שינוי מסצנה פנימית לחיצונית"}],
    "quality_issues": ["בעיה 1", "בעיה 2"],
    "best_looking_frames": [5, 25, 40],
    "worst_looking_frames": [15, 35],
    "broll_opportunities": [
      {
        "time": 20,
        "reason": "הדובר מסתכל למטה ומדבר על מוצר - הזדמנות לB-Roll של המוצר",
        "suggested_prompt_en": "Close-up of [specific product] on desk, warm lighting matching the video"
      }
    ]
  }
}`
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `נתח את ${selectedFrames.length} הפריימים הבאים מסרטון באורך ${duration} שניות. כל פריים מייצג 5 שניות.` },
          ...selectedFrames.map((frame: any) => ({
            type: 'image_url' as const,
            image_url: {
              url: `data:image/jpeg;base64,${frame.base64}`,
              detail: 'low' as const,
            }
          }))
        ]
      }
    ]

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages,
      response_format: { type: 'json_object' },
      max_completion_tokens: 4000,
    })

    const analysis = JSON.parse(response.choices[0]?.message?.content || '{}')

    console.log('[VISUAL] Analysis complete:', analysis.scene_analysis?.length, 'scenes,',
      analysis.overall?.scene_changes?.length, 'scene changes')

    // Cleanup frames
    try {
      frameFiles.forEach((f: string) => fs.unlinkSync(path.join(framesDir, f)))
      fs.rmdirSync(framesDir)
    } catch {}

    // Phase 2: Self-reflection - ask the model to improve its own prompt
    let promptImprovements: string[] = []
    try {
      const reflectionResponse = await ai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content: `אתה מומחה לשיפור פרומפטים. קיבלת את הפרומפט שבו השתמשת לניתוח ויזואלי של סרטון, ואת התוצאה שיצרת.

תפקידך: לזהות מה אפשר לשפר בפרומפט כדי שבפעם הבאה הניתוח יהיה מדויק יותר ושימושי יותר לעריכת וידאו.

חשוב על:
- שאלות שלא שאלת אבל היו נותנות מידע חשוב
- פרטים ויזואליים שפספסת
- מידע שהיה עוזר לעורך וידאו לקבל החלטות
- דברים ספציפיים לסוג התוכן הזה שכדאי לבדוק בפעם הבאה

חוקים:
- מקסימום 3 שיפורים חדשים
- כל שיפור = משפט אחד קצר וברור
- רק דברים שבאמת יעזרו לעריכה
- אל תחזור על דברים שכבר קיימים בפרומפט
- אם הפרומפט כבר מושלם, החזר רשימה ריקה

החזר JSON:
{
  "improvements": ["שיפור 1", "שיפור 2"],
  "reasoning": "הסבר קצר למה השיפורים האלה חשובים"
}`
          },
          {
            role: 'user',
            content: `הפרומפט שהשתמשתי:\n${visualSystemPrompt.substring(0, 2000)}\n\nהתוצאה:\n${JSON.stringify(analysis, null, 2).substring(0, 3000)}\n\nמה אפשר לשפר בפרומפט לפעם הבאה?`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 500,
      })
      const reflection = JSON.parse(reflectionResponse.choices[0]?.message?.content || '{}')
      promptImprovements = reflection.improvements || []
      if (promptImprovements.length > 0) {
        console.log('[VISUAL] Self-improvement suggestions:', promptImprovements)
      }
    } catch (reflErr: any) {
      console.warn('[VISUAL] Self-reflection failed (non-critical):', reflErr.message)
    }

    res.json({ ...analysis, _promptImprovements: promptImprovements })

  } catch (error: any) {
    console.error('[VISUAL ERROR]', error.message)
    res.status(500).json({ message: 'שגיאה בניתוח ויזואלי: ' + error.message })
  }
})

// POST /api/auto-editor/enrich-prompt — AI analyzes transcript and enriches user prompt
app.post('/api/auto-editor/enrich-prompt', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { transcript, userPrompt, targetDuration, numberOfVideos, userProfile, visualAnalysis, energyAnalysis, promptEvolution, socialLearningRules } = req.body

    const fullText = (transcript.segments || []).map((s: any) => s.text).join(' ')
    const speakers = [...new Set((transcript.segments || []).map((s: any) => s.speaker))]
    const duration = transcript.total_duration || transcript.totalDuration || 0

    // Build speaker analysis context
    const speakerTimesData: Record<string, number> = {}
    ;(transcript.segments || []).forEach((seg: any) => {
      const sp = seg.speaker || 'unknown'
      if (!speakerTimesData[sp]) speakerTimesData[sp] = 0
      speakerTimesData[sp] += ((seg.end || 0) - (seg.start || 0))
    })
    const sortedSpeakersForPrompt = Object.entries(speakerTimesData)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([sp, t]) => `${sp}: ${Math.round(t as number)}s`)

    const speakerContext = speakers.length > 1 ? `
זיהוי דוברים:
הסרטון מכיל ${speakers.length} דוברים: ${sortedSpeakersForPrompt.join(', ')}

חשוב מאוד: הפרזנטור הראשי הוא לא בהכרח מי שמדבר הכי הרבה!
הפרזנטור הוא מי ש:
1. מופיע במצלמה (פנים נראות)
2. מדבר ישירות למצלמה
3. הוא ה"טאלנט" / מנחה / מומחה

דוברים אחרים יכולים להיות מראיינים, עוזרים, או קולות מחוץ למסך.
אם אדם אחד מופיע במצלמה ואחר שואל שאלות מחוץ למסך - האדם במצלמה הוא הפרזנטור.
השתמש רק בסגמנטים של הפרזנטור לסרטון הראשי.
קולות מחוץ למצלמה (מראיינים/עוזרים) צריכים להיחתך אלא אם הם מוסיפים הקשר.
` : ''

    // Build visual analysis context if available
    const visualContext = visualAnalysis ? `
ניתוח ויזואלי של הסרטון:
מיקום צילום: ${visualAnalysis.overall?.location || 'לא ידוע'}
תאורה: ${visualAnalysis.overall?.lighting_mood || 'לא ידוע'}
Color grade מומלץ: ${visualAnalysis.overall?.recommended_color_grade || 'clean'}
אחוז קשר עין: ${visualAnalysis.overall?.eye_contact_percentage || 'לא ידוע'}%
שינויי סצנה: ${JSON.stringify(visualAnalysis.overall?.scene_changes || [])}
בעיות איכות: ${JSON.stringify(visualAnalysis.overall?.quality_issues || [])}
הזדמנויות B-Roll מהניתוח הויזואלי: ${JSON.stringify(visualAnalysis.overall?.broll_opportunities || [])}

פריימים:
${(visualAnalysis.scene_analysis || []).map((s: any) =>
  `[${s.time}s] ${s.description} | תאורה: ${s.lighting} | מבט למצלמה: ${s.speaker_looking_at_camera ? 'כן' : 'לא'} | ${s.notable || ''}`
).join('\n')}

השתמש במידע הויזואלי הזה כדי:
1. להתאים color grade לתאורה בפועל (אל תשים grade חם על תאורה קרה)
2. להציע B-Roll שמתאים ויזואלית לסצנה (אותו סגנון תאורה ומקום)
3. לדעת מתי הדובר לא מסתכל למצלמה (שם לשים B-Roll!)
4. לזהות שינויי סצנה כנקודות חיתוך טבעיות
5. להציע crop אם הפריימינג לא טוב
` : ''

    // Build energy analysis context if available
    const energyContext = energyAnalysis ? `
ניתוח אנרגיה ודיבור:
קצב דיבור: ${energyAnalysis.wordsPerMinute} מילים/דקה (${energyAnalysis.pace})
נקודות שיא (אנרגיה גבוהה): ${(energyAnalysis.peaks || []).map((p: any) => `${p.time}s: ${p.reason}`).join(', ')}
נקודות שפל (אנרגיה נמוכה): ${(energyAnalysis.valleys || []).map((v: any) => `${v.time}s: ${v.reason}`).join(', ')}
שתיקות: ${(energyAnalysis.silences || []).length} (סה"כ ${(energyAnalysis.silences || []).reduce((s: number, x: any) => s + x.duration, 0).toFixed(1)} שניות)
חילופי דוברים: ${(energyAnalysis.speakerChanges || []).length}

השתמש בזה כדי:
- בנקודות שיא → זום, מוזיקה חזקה יותר, keep
- בנקודות שפל → חתוך או הוסף B-Roll
- שתיקות ארוכות → חתוך (אלא אם זה דרמטי)
- חילופי דוברים → שנה זווית מצלמה
` : ''

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system' as const,
          content: `אתה הבמאי הראשי של סטודיו עריכת וידאו מקצועי. אתה מומחה לכל סוגי הסרטונים בכל תעשייה.

קיבלת תמלול של סרטון גולמי. התפקיד שלך:
1. להבין מה הנושא, מי קהל היעד, ומה המטרה של הסרטון
2. לבנות פרומפט עריכה מדויק שמתאים לתוכן בפועל
3. להציע B-Roll שמתאים ספציפית למה שנאמר

כללים קריטיים:
- הפרומפט חייב להיות פרקטי ומדויק, לא גנרי
- B-Roll חייב להתאים למה שהדובר מדבר עליו ברגע ספציפי
- אל תציע דברים מיותרים. רק מה שישפר את הסרטון בפועל
- התאם את הסגנון לסוג התוכן:

סרטון שיווק למוצר:
  - B-Roll: צילומי מוצר, שימוש במוצר, לפני/אחרי, לקוחות מרוצים
  - סגנון: מהיר, אנרגטי, CTA ברור
  - Hook: הבעיה שהמוצר פותר

סרטון תדמית לחברה:
  - B-Roll: משרדים, צוות, תהליכי עבודה, לקוחות
  - סגנון: מקצועי, חם, אמין
  - Hook: הערך שהחברה נותנת

פודקאסט / ראיון:
  - B-Roll: מינימלי, רק בנקודות מפתח
  - סגנון: נקי, מולטי-קאם, שמות דוברים
  - Hook: הציטוט הכי חזק

הדרכה / טוטוריאל:
  - B-Roll: screenshots, הדגמות, תרשימים
  - סגנון: ברור, מסודר, שלבי
  - Hook: "מה תלמדו היום"

פרסומת / קמפיין:
  - B-Roll: lifestyle, אנשים משתמשים, אמוציות
  - סגנון: קצר, קצבי, כל שנייה חשובה
  - Hook: בעיה → פתרון תוך 3 שניות

${visualContext}
${energyContext}
${speakerContext}
${userProfile || ''}
${socialLearningRules || ''}

בהתבסס על התמלול, זהה:
1. מה סוג הסרטון (שיווק/תדמית/פודקאסט/הדרכה/פרסומת/אחר)
2. מה הנושא המדויק
3. מי קהל היעד המשוער
4. מה הרגעים הכי חזקים (לשמש כ-Hook)
5. איפה בדיוק צריך B-Roll ומה צריך לראות שם
6. מה סגנון העריכה המתאים

חשוב:
- אל תציע יותר מ-5 B-Roll לכל 60 שניות
- B-Roll prompts חייבים להיות מפורטים (לא "אנשים" אלא "close-up of hands typing on laptop keyboard, soft warm lighting, shallow depth of field")
- ה-enhanced_prompt לא צריך להיות ארוך. 2-3 משפטים ממוקדים.

החזר JSON:
{
  "detected_type": "marketing_product / corporate / podcast / tutorial / ad / vlog / other",
  "detected_topic": "תיאור קצר של הנושא",
  "target_audience": "קהל יעד משוער",
  "enhanced_prompt": "פרומפט מפורט ומדויק לעריכה",
  "video_summary": "במשפט אחד - על מה הסרטון",
  "best_hook": {
    "text": "המשפט הכי חזק",
    "start": 15.2,
    "end": 18.5,
    "why": "למה זה Hook טוב"
  },
  "key_topics": ["נושא 1", "נושא 2", "נושא 3"],
  "broll_suggestions": [
    {
      "at_text": "הטקסט שמצדיק B-Roll",
      "at_time": 12.0,
      "duration": 4,
      "prompt_en": "Specific, detailed English prompt for AI generation",
      "description_he": "מה הצופה יראה",
      "why": "למה B-Roll כאן חשוב"
    }
  ],
  "editing_notes": [
    "הערה ספציפית 1",
    "הערה ספציפית 2"
  ],
  "style": {
    "pacing": "fast/medium/slow",
    "color": "warm/cold/cinematic/vibrant/clean",
    "music_mood": "energetic/calm/corporate/dramatic",
    "music_search": "specific pixabay search term"
  }
}${promptEvolution ? `\n\n${promptEvolution}` : ''}`
        },
        {
          role: 'user' as const,
          content: `פרומפט המשתמש: "${userPrompt}"

תמלול מלא (${duration.toFixed(0)} שניות, ${speakers.length} דוברים):
${(transcript.segments || []).map((s: any) => `[${(s.start || 0).toFixed(1)}s] ${s.speaker || ''}: ${s.text}`).join('\n')}

אורך יעד לכל סרטון: ${targetDuration} שניות
מספר סרטונים: ${numberOfVideos}

שפר את הפרומפט, הצע B-Roll ספציפי לתוכן, וזהה את הרגעים הטובים.`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const result = JSON.parse(response.choices[0]?.message?.content || '{}')
    console.log('[ENRICH PROMPT] Done:', result.detected_type, '|', result.broll_suggestions?.length, 'B-Roll suggestions')

    // Phase 2: Self-reflection
    let promptImprovements: string[] = []
    try {
      const reflectionResponse = await ai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content: `אתה מומחה לשיפור פרומפטים לניתוח תוכן וידאו.

קיבלת את הפרומפט שבו השתמשת לניתוח תוכן ואת התוצאה.

מה אפשר לשפר? חשוב על:
- שאלות על הקהל שלא שאלת
- ניתוח רגשי שחסר
- B-Roll ספציפי יותר
- הבנה טובה יותר של מטרת הסרטון
- דברים שעורך וידאו מקצועי היה שואל

מקסימום 3 שיפורים. כל אחד = משפט אחד.

החזר JSON:
{
  "improvements": ["...", "..."],
  "reasoning": "..."
}`
          },
          {
            role: 'user',
            content: `תוצאה: ${JSON.stringify(result, null, 2).substring(0, 2000)}\n\nשפר.`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 500,
      })
      promptImprovements = JSON.parse(reflectionResponse.choices[0]?.message?.content || '{}').improvements || []
      if (promptImprovements.length > 0) {
        console.log('[ENRICH] Self-improvement suggestions:', promptImprovements)
      }
    } catch (reflErr: any) {
      console.warn('[ENRICH] Self-reflection failed (non-critical):', reflErr.message)
    }

    res.json({ ...result, _promptImprovements: promptImprovements })
  } catch (error: any) {
    console.error('[ENRICH PROMPT]', error.message)
    res.status(500).json({ message: 'שגיאה בשיפור הפרומפט: ' + error.message })
  }
})

// POST /api/auto-editor/creative-brief — Step 1: Creative Director analyzes content
app.post('/api/auto-editor/creative-brief', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { transcript, userPrompt, targetDuration, numberOfVideos, userProfile, platforms, detectedType, visualAnalysis, energyAnalysis, promptEvolution, socialLearningRules } = req.body
    if (!transcript) return res.status(400).json({ message: 'חסר transcript' })

    const aiChoosesDuration = targetDuration === -1

    // Select SOP based on detected content type
    const contentType = detectedType || 'corporate'
    const sop = EDITING_SOPS[contentType] || EDITING_SOPS['corporate']

    const durationInstructions = aiChoosesDuration ? `
אורך הסרטון: אתה מחליט!
נתח את התמלול וקבע את האורך האופטימלי לכל סרטון.
שיקולים לקביעת אורך:
- צפיפות תוכן: אם יש הרבה מידע חשוב בזמן קצר → סרטון ארוך יותר
- קצב דיבור: דיבור מהיר → אפשר סרטון קצר. דיבור איטי → צריך יותר זמן
- פלטפורמה: TikTok/Reels: 15-60שנ (אופטימלי: 30-45), YouTube Shorts: 30-60שנ, YouTube: 60-180שנ, LinkedIn: 30-90שנ
- סוג תוכן: טיפ מהיר: 15-30שנ, הסבר מוצר: 30-60שנ, סיפור/ראיון: 60-180שנ, הדרכה: 60-300שנ
- נקודות טבעיות: חפש סיום טבעי (משפט סיכום, CTA, סיום רעיון)
- כלל הזהב: עדיף סרטון קצר ומדויק מסרטון ארוך ומשעמם
הפלטפורמות שנבחרו: ${(platforms || ['tiktok', 'reels', 'shorts']).join(', ')}

לכל סרטון, החזר בתוך video_plans:
"optimal_duration": <מספר שניות>,
"duration_reasoning": "<הסבר קצר למה בחרת את האורך הזה>"
` : `אורך יעד: ${targetDuration} שניות לכל סרטון.`

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system' as const,
          content: `אתה במאי תוכן מקצועי עם 20 שנות ניסיון בעריכת סרטונים לרשתות חברתיות.

התפקיד שלך: לנתח תמלול של סרטון גולמי ולהחליט מה הסיפור, מה הקטעים הכי טובים, ואיך לבנות סרטון שיווקי מנצח.

אתה חושב כמו יוצר תוכן מצליח:
- מה יעצור גלילה?
- מה יגרום לצופה להישאר?
- מה המסר המרכזי?
- איפה הרגעים הכי חזקים?

=== SOP לסוג התוכן שזוהה (${contentType}): ===
${sop}
=== סוף SOP ===

${durationInstructions}

כללי ברזל:
1. הפתיחה חייבת להיות HOOK - משפט חזק שעוצר גלילה תוך 2 שניות
2. כל 3-5 שניות חייב לקרות משהו חדש (חיתוך, זום, B-Roll, גרפיקה)
3. קצב מהיר = מצליח ברשתות. אל תפחד לחתוך
4. B-Roll הוא חובה בכל נקודה שמתארים משהו ויזואלי
5. הסוף חייב להיות CTA ברור (קריאה לפעולה)
6. מוזיקה חייבת להתאים למצב הרוח
7. שתיקות מעל 0.3 שניות = מחיקה
8. גמגומים, חזרות, תיקונים עצמיים = מחיקה
9. "אממ", "כאילו", "בעצם", "נו" = מחיקה

כשאתה מנתח, חשוב על:
- מה הצופה מרגיש בכל רגע?
- האם יש "עמק" (רגע משעמם)? אם כן - תחתוך אותו
- האם יש "פסגה" (רגע מרגש)? אם כן - תדגיש עם זום/גרפיקה
- האם הקצב אחיד? אם כן - תגוון עם B-Roll והחלפות זווית

${userProfile || ''}
${socialLearningRules || ''}

החזר JSON:
{
  "creative_brief": {
    "main_message": "המסר המרכזי של הסרטון",
    "target_emotion": "מה הצופה צריך להרגיש (השראה/סקרנות/דחיפות/אמון)",
    "hook": "המשפט הפותח שיעצור גלילה",
    "cta": "קריאה לפעולה בסוף",
    "pacing": "fast/medium/slow",
    "music_mood": "אנרגטי/רגוע/דרמטי/משעשע/מעורר השראה",
    "color_mood": "cinematic/warm/cold/vibrant/moody",
    "overall_vibe": "תיאור קצר של האווירה"
  },
  "content_analysis": {
    "best_quotes": [
      { "text": "ציטוט חזק מהתמלול", "start": 5.2, "end": 8.1, "why": "למה זה טוב" }
    ],
    "boring_parts": [
      { "start": 20.0, "end": 35.0, "why": "חזרה על אותו רעיון" }
    ],
    "emotional_peaks": [
      { "time": 15.0, "emotion": "התלהבות", "intensity": 5 }
    ],
    "visual_moments": [
      { "time": 12.0, "description": "מדבר על המוצר - צריך B-Roll של המוצר", "broll_prompt": "close up of modern tech product on clean desk, cinematic lighting" }
    ],
    "filler_words": [
      { "word": "אממ", "count": 12 },
      { "word": "כאילו", "count": 8 }
    ],
    "silences": [
      { "start": 10.5, "end": 11.2, "duration": 0.7 }
    ]
  },
  "video_plans": [
    {
      "video_index": 1,
      "title": "כותרת מושכת לסרטון",
      "concept": "תיאור קצר של הקונספט",
      "hook_segment": { "start": 5.2, "end": 7.0 },
      "story_arc": [
        { "role": "hook", "segments": [{ "start": 5.2, "end": 7.0 }], "duration": 1.8 },
        { "role": "problem", "segments": [{ "start": 0, "end": 4.5 }], "duration": 4.5 },
        { "role": "solution", "segments": [{ "start": 15, "end": 28 }], "duration": 13 },
        { "role": "proof", "segments": [{ "start": 40, "end": 48 }], "duration": 8 },
        { "role": "cta", "segments": [{ "start": 55, "end": 58 }], "duration": 3 }
      ],
      "broll_placements": [
        { "after_segment": 1, "duration": 3, "prompt": "detailed English prompt for AI image/video generation", "type": "product_shot" },
        { "after_segment": 3, "duration": 4, "prompt": "happy customers using product in modern office", "type": "lifestyle" }
      ],
      "graphic_moments": [
        { "at_time_relative": 12, "type": "number", "text": "85%", "label": "שביעות רצון לקוחות" },
        { "at_time_relative": 20, "type": "key_point", "text": "פיצ'ר מספר 1" }
      ],
      "zoom_points": [
        { "at_time_relative": 5, "type": "in", "reason": "נקודה חשובה" },
        { "at_time_relative": 15, "type": "out", "reason": "מעבר נושא" }
      ],
      "estimated_duration": 30.3,
      "optimal_duration": 30,
      "duration_reasoning": "הסבר למה נבחר האורך הזה",
      "recommended_platform": "TikTok / Reels"
    }
  ]
}

חשוב מאוד:
- story_arc: סדר הקטעים לא חייב להיות כרונולוגי! אפשר לפתוח עם ציטוט מהאמצע
- hook: תמיד תפתח עם המשפט הכי חזק, לא עם ההתחלה
${aiChoosesDuration ? '- optimal_duration: חובה! קבע אורך אופטימלי לכל סרטון בנפרד. כל סרטון יכול להיות באורך שונה.\n- duration_reasoning: חובה! הסבר קצר בעברית למה בחרת את האורך הזה' : `- estimated_duration: חייב להיות קרוב ל-${targetDuration} שניות (± 3 שניות)`}
- broll_placements: MUST include at least 2 B-Roll moments per 30 seconds
- B-Roll prompts: כתוב באנגלית, מפורט, סינמטי, עם תיאור תאורה וזווית${promptEvolution ? `\n\n${promptEvolution}` : ''}`
        },
        {
          role: 'user' as const,
          content: (() => {
            // Separate presenter segments from non-presenter
            const presenterSegments = transcript.segments.filter((s: any) => s.isPresenter !== false)
            const nonPresenterSegments = transcript.segments.filter((s: any) => s.isPresenter === false)
            const mainSpeakerName = transcript.mainSpeaker || 'unknown'
            const speakerTimesData = transcript.speakerTimes || {}

            let presenterInfo = ''
            if (nonPresenterSegments.length > 0) {
              presenterInfo = `
הדובר הראשי (פרזנטור): ${mainSpeakerName}
זמן דיבור פרזנטור: ${(speakerTimesData[mainSpeakerName] || 0).toFixed?.(1) || '?'} שניות
דוברים אחרים (עוזרי הפקה/רקע): ${Object.keys(speakerTimesData).filter((s: string) => s !== mainSpeakerName).join(', ')}

חוקים קריטיים:
- השתמש רק בקטעים של הפרזנטור (isPresenter=true)
- התעלם לחלוטין מדיבורים של עוזרי הפקה
- אם עוזר הפקה מדבר - חתוך את הקטע הזה
- ה-hook חייב להיות מהפרזנטור, לא מאף אחד אחר

קטעים להתעלם מהם (לא הפרזנטור):
${nonPresenterSegments.map((s: any) => `[${(s.start || 0).toFixed(1)}s-${(s.end || 0).toFixed(1)}s] ${s.speaker}: ${s.text}`).join('\n')}
`
            }

            return `${presenterInfo}
תמלול הסרטון (פרזנטור בלבד):
${JSON.stringify(presenterSegments.map((s: any) => ({ start: s.start, end: s.end, text: s.text, speaker: s.speaker })))}

משך כולל: ${transcript.total_duration || transcript.totalDuration} שניות
בקשת המשתמש: ${userPrompt}
${aiChoosesDuration ? 'אורך יעד: AI בוחר - קבע אורך אופטימלי לכל סרטון בנפרד!' : `אורך יעד לכל סרטון: ${targetDuration} שניות`}
מספר סרטונים: ${numberOfVideos}
פלטפורמות: ${(platforms || ['tiktok', 'reels', 'shorts']).join(', ')}

נתח את התמלול וצור brief יצירתי מפורט.${aiChoosesDuration ? ' חובה לכלול optimal_duration ו-duration_reasoning לכל סרטון!' : ''}`
          })()
        }
      ],
      response_format: { type: 'json_object' as const },
      temperature: 0.7,
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) return res.status(500).json({ message: 'ChatGPT לא החזיר creative brief' })

    const parsed = JSON.parse(content)
    console.log('[CREATIVE BRIEF] Main message:', parsed.creative_brief?.main_message)
    console.log('[CREATIVE BRIEF] Videos planned:', parsed.video_plans?.length)

    // Phase 2: Self-reflection
    let promptImprovements: string[] = []
    try {
      const reflectionResponse = await ai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content: `אתה מומחה לשיפור פרומפטים לתכנון קריאטיבי של סרטונים.

קיבלת את התוצאה של brief יצירתי. מה אפשר לשפר בפרומפט כדי שבפעם הבאה ה-brief יהיה טוב יותר?

חשוב על:
- שאלות על קהל היעד שלא נשאלו
- ניתוח רגשי עמוק יותר
- hook טוב יותר
- story arc מורכב יותר
- התאמה טובה יותר לפלטפורמה

מקסימום 3 שיפורים. כל אחד = משפט אחד.

החזר JSON:
{
  "improvements": ["...", "..."],
  "reasoning": "..."
}`
          },
          {
            role: 'user',
            content: `תוצאה: ${JSON.stringify(parsed, null, 2).substring(0, 2000)}\n\nשפר.`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 500,
      })
      promptImprovements = JSON.parse(reflectionResponse.choices[0]?.message?.content || '{}').improvements || []
      if (promptImprovements.length > 0) {
        console.log('[CREATIVE BRIEF] Self-improvement suggestions:', promptImprovements)
      }
    } catch (reflErr: any) {
      console.warn('[CREATIVE BRIEF] Self-reflection failed (non-critical):', reflErr.message)
    }

    res.json({ ...parsed, _promptImprovements: promptImprovements })
  } catch (err: any) {
    console.error('Creative brief error:', err.message)
    res.status(500).json({ message: err.message || 'שגיאת Creative Brief' })
  }
})

// POST /api/auto-editor/technical-plan — Step 2: Technical Editor creates frame-accurate plan
app.post('/api/auto-editor/technical-plan', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { creativeBrief, transcript, targetDuration, platforms, promptEvolution, socialLearningRules } = req.body
    if (!creativeBrief || !transcript) return res.status(400).json({ message: 'חסר creativeBrief או transcript' })

    const aiChoosesDuration = targetDuration === -1

    // Build per-video duration instructions
    const perVideoDurationInfo = aiChoosesDuration && creativeBrief?.video_plans
      ? `כל סרטון יכול להיות באורך שונה (ה-AI בחר):\n${creativeBrief.video_plans.map((v: any) =>
          `סרטון ${v.video_index}: ${v.optimal_duration || v.estimated_duration || 60} שניות`
        ).join('\n')}`
      : `אורך יעד לכל סרטון: ${targetDuration} שניות`

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system' as const,
          content: `אתה עורך וידאו טכני מדויק. אתה מקבל brief יצירתי ותמלול, ומייצר תוכנית עריכה טכנית מדויקת לפריים.

התפקיד שלך: להפוך את ה-brief היצירתי לפקודות עריכה מדויקות.

${perVideoDurationInfo}
${socialLearningRules || ''}

כללי דיוק:
1. cuts: זמנים מדויקים עד 0.1 שנייה
2. סכום כל ה-cuts חייב להיות בדיוק כמו אורך היעד לכל סרטון (± 2 שניות)
3. כל cut מתחיל ומסתיים על גבול מילה (לא באמצע מילה)
4. אם ה-brief אומר להתחיל עם hook מהאמצע - החלף סדר ב-cuts
5. B-Roll: זמנים מדויקים, כולל fade in/out של 0.5 שניות
6. כתוביות: timestamps מדויקים יחסיים לסרטון החתוך (לא לסרטון המקור!)
7. מעברים: בחר transition שמתאים בין כל 2 קטעים
8. זומים: at_time יחסי לסרטון החתוך

חישוב חשוב - כתוביות:
אחרי שחתכת, הזמנים משתנים!
אם cuts = [{keep_start:5, keep_end:10}, {keep_start:20, keep_end:35}]
אז בסרטון החתוך:
- קטע 1: 0-5 שניות (מקור: 5-10)
- קטע 2: 5-20 שניות (מקור: 20-35)
הכתוביות חייבות להתייחס לזמנים של הסרטון החתוך!

מעברים מומלצים:
- בין קטעים עם אותו נושא: dissolve (0.3s)
- בין קטעים עם נושא שונה: fadeblack (0.5s)
- לפני B-Roll: fade (0.3s)
- אחרי B-Roll: fade (0.3s)
- נקודה דרמטית: zoomin (0.5s)
- פתיחה: fadeblack (1s)
- סגירה: fadeblack (1.5s)

זומים:
- נקודה חשובה: zoom in 1.05-1.08
- מעבר נושא: zoom out 1.05
- רגע רגשי: slow zoom in 1.03 over 3 seconds
- כל 5-7 שניות חייב zoom כלשהו (מונע תחושת "סטטי")

Camera angles (multi-cam simulation):
- wide: ללא crop (ברירת מחדל)
- medium: crop 70% center
- closeup: crop 50% center
- החלף כל 3-8 שניות
- closeup על רגעים חשובים
- wide על מעברים

Color grade:
- cinematic: contrast+15%, saturation-10%, warmth+5
- warm: saturation+20%, warmth+15
- cold: saturation-15%, warmth-15
- vibrant: contrast+20%, saturation+40%
- moody: brightness-2%, contrast+20%, saturation-10%

החזר JSON מדויק:
{
  "videos": [
    {
      "video_index": 1,
      "source_file": 0,
      "title": "כותרת",
      "total_duration": "אורך היעד לסרטון זה",
      "cuts": [
        { "keep_start": 5.2, "keep_end": 7.0, "reason": "hook - משפט פתיחה חזק" },
        { "keep_start": 0.0, "keep_end": 4.5, "reason": "הצגת הבעיה" },
        { "keep_start": 15.0, "keep_end": 28.0, "reason": "הצגת הפתרון" },
        { "keep_start": 40.0, "keep_end": 48.0, "reason": "הוכחה חברתית" },
        { "keep_start": 55.0, "keep_end": 58.0, "reason": "קריאה לפעולה" }
      ],
      "transitions": [
        { "between": [0, 1], "type": "fadeblack", "duration": 0.5 },
        { "between": [1, 2], "type": "dissolve", "duration": 0.3 },
        { "between": [2, 3], "type": "fade", "duration": 0.3 },
        { "between": [3, 4], "type": "fadeblack", "duration": 0.5 }
      ],
      "camera_angles": [
        { "relative_start": 0, "relative_end": 1.8, "camera": "closeup", "reason": "hook" },
        { "relative_start": 1.8, "relative_end": 6.3, "camera": "wide", "reason": "context" },
        { "relative_start": 6.3, "relative_end": 10, "camera": "medium", "reason": "talking" },
        { "relative_start": 10, "relative_end": 13, "camera": "closeup", "reason": "key point" }
      ],
      "zooms": [
        { "relative_time": 0, "scale": 1.06, "duration": 1.8, "direction": "in", "reason": "hook emphasis" },
        { "relative_time": 5, "scale": 1.04, "duration": 3, "direction": "out", "reason": "breathe" },
        { "relative_time": 10, "scale": 1.07, "duration": 2, "direction": "in", "reason": "key point" },
        { "relative_time": 15, "scale": 1.03, "duration": 4, "direction": "in", "reason": "slow build" },
        { "relative_time": 22, "scale": 1.05, "duration": 2, "direction": "out", "reason": "transition" }
      ],
      "broll": [
        {
          "relative_start": 6.5,
          "relative_end": 10.0,
          "prompt": "Close up of modern SaaS dashboard on laptop screen, clean UI, soft natural lighting, shallow depth of field, 4K cinematic",
          "transition_in": "fade",
          "transition_out": "fade",
          "animation": "slow_zoom_in"
        },
        {
          "relative_start": 18.0,
          "relative_end": 22.0,
          "prompt": "Happy diverse team celebrating in modern office, high fiving, warm lighting, cinematic slow motion",
          "transition_in": "dissolve",
          "transition_out": "dissolve",
          "animation": "pan_right"
        }
      ],
      "subtitles": [
        { "relative_start": 0.0, "relative_end": 1.8, "text": "המשפט הפותח כאן" },
        { "relative_start": 1.8, "relative_end": 4.0, "text": "המשך טקסט" }
      ],
      "graphics": [
        { "relative_time": 12, "duration": 3, "type": "number_counter", "value": "85%", "label": "שביעות רצון" },
        { "relative_time": 20, "duration": 2.5, "type": "lower_third", "text": "שם הדובר", "subtitle": "תפקיד" }
      ],
      "speakers": [
        { "name": "דובר ראשי", "first_appearance_relative": 0, "display_duration": 4 }
      ],
      "color_grade": "cinematic",
      "framing": "blur_background",
      "music_dynamics": [
        { "relative_time": 0, "volume": 0.3, "reason": "intro - music prominent" },
        { "relative_time": 1.8, "volume": 0.12, "reason": "speech starts - duck music" },
        { "relative_time": 6.5, "volume": 0.25, "reason": "B-Roll - music up" },
        { "relative_time": 10, "volume": 0.12, "reason": "speech resumes" },
        { "relative_time": 27, "volume": 0.3, "reason": "outro - music up" }
      ],
      "intro": {
        "type": "text_card",
        "title": "כותרת הסרטון",
        "duration": 2,
        "animation": "fade_zoom"
      },
      "outro": {
        "type": "cta_card",
        "text": "עקבו לעוד תוכן",
        "duration": 3,
        "animation": "fade"
      }
    }
  ],
  "prompts": {
    "intro_image": "Professional dark gradient title card with golden text, minimalist, 9:16",
    "outro_image": "Call to action card with subscribe button, modern design, 9:16",
    "music_search": "upbeat corporate motivation 120bpm"
  }
}

VALIDATION before returning:
1. Sum all (keep_end - keep_start) for cuts = must match the target duration for each video ± 3
2. All relative timestamps must be within 0 to total_duration
3. subtitles must cover most of the speech (not just first few seconds)
4. At least 2 B-Roll placements per 30 seconds
5. At least 1 zoom every 7 seconds
6. camera_angles must cover entire duration with no gaps
7. transitions between every pair of cuts${promptEvolution ? `\n\n${promptEvolution}` : ''}`
        },
        {
          role: 'user' as const,
          content: `Creative Brief:
${JSON.stringify(creativeBrief)}

Full Transcript:
${JSON.stringify(transcript.segments)}

${perVideoDurationInfo}
Platforms: ${(platforms || ['tiktok', 'reels', 'shorts']).join(', ')}

Create precise technical edit plan.`
        }
      ],
      response_format: { type: 'json_object' as const },
      temperature: 0.3,
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) return res.status(500).json({ message: 'ChatGPT לא החזיר technical plan' })

    const plan = JSON.parse(content)

    // VALIDATE and fix the plan
    for (const video of plan.videos || []) {
      // Determine target duration for this video (per-video from creative brief, or global)
      const briefPlan = aiChoosesDuration && creativeBrief?.video_plans
        ? creativeBrief.video_plans.find((v: any) => v.video_index === video.video_index)
        : null
      const videoTargetDuration = briefPlan?.optimal_duration || (aiChoosesDuration ? 60 : targetDuration)

      // Propagate AI-chosen data to the video
      if (aiChoosesDuration && briefPlan) {
        video.optimal_duration = briefPlan.optimal_duration
        video.duration_reasoning = briefPlan.duration_reasoning
        video.recommended_platform = briefPlan.recommended_platform
      }

      const cutsDuration = (video.cuts || []).reduce((sum: number, c: any) => sum + (c.keep_end - c.keep_start), 0)
      if (Math.abs(cutsDuration - videoTargetDuration) > 5) {
        console.warn(`[TECH PLAN] Video ${video.video_index} duration ${cutsDuration.toFixed(1)}s != target ${videoTargetDuration}s. Adjusting...`)
        const diff = videoTargetDuration - cutsDuration
        if (video.cuts && video.cuts.length > 0) {
          video.cuts[video.cuts.length - 1].keep_end += diff
        }
      }

      // Ensure B-Roll exists
      if (!video.broll || video.broll.length === 0) {
        console.warn(`[TECH PLAN] Video ${video.video_index} has no B-Roll! Adding default placements.`)
        const totalDur = videoTargetDuration
        video.broll = [
          { relative_start: totalDur * 0.2, relative_end: totalDur * 0.2 + 3, prompt: 'professional business scene, cinematic lighting, 4K', transition_in: 'fade', transition_out: 'fade', animation: 'slow_zoom_in' },
          { relative_start: totalDur * 0.6, relative_end: totalDur * 0.6 + 4, prompt: 'modern workspace with technology, warm lighting, cinematic', transition_in: 'dissolve', transition_out: 'dissolve', animation: 'pan_right' },
        ]
      }

      // Ensure subtitles exist
      if (!video.subtitles || video.subtitles.length === 0) {
        console.warn(`[TECH PLAN] Video ${video.video_index} has no subtitles! Generating from cuts.`)
        video.subtitles = []
        let relativeOffset = 0
        for (const cut of video.cuts || []) {
          const segsInCut = (transcript.segments || []).filter((s: any) => s.start >= cut.keep_start && s.end <= cut.keep_end)
          for (const seg of segsInCut) {
            video.subtitles.push({
              relative_start: relativeOffset + (seg.start - cut.keep_start),
              relative_end: relativeOffset + (seg.end - cut.keep_start),
              text: seg.text,
            })
          }
          relativeOffset += (cut.keep_end - cut.keep_start)
        }
      }
    }

    console.log('[TECH PLAN] Videos:', plan.videos?.length, '| Validated and fixed')

    // Phase 2: Self-reflection
    let promptImprovements: string[] = []
    try {
      const reflectionResponse = await ai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content: `אתה מומחה לשיפור פרומפטים לתכנון טכני של עריכת וידאו.

קיבלת את התוצאה של תכנון טכני. מה אפשר לשפר בפרומפט כדי שבפעם הבאה התכנון יהיה מדויק יותר?

חשוב על:
- דיוק בזמנים של חיתוכים
- מעברים טבעיים יותר
- זומים שמתאימים לתוכן
- B-Roll שמשתלב טוב יותר
- כתוביות מדויקות יותר

מקסימום 3 שיפורים. כל אחד = משפט אחד.

החזר JSON:
{
  "improvements": ["...", "..."],
  "reasoning": "..."
}`
          },
          {
            role: 'user',
            content: `תוצאה: ${JSON.stringify(plan, null, 2).substring(0, 2000)}\n\nשפר.`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 500,
      })
      promptImprovements = JSON.parse(reflectionResponse.choices[0]?.message?.content || '{}').improvements || []
      if (promptImprovements.length > 0) {
        console.log('[TECH PLAN] Self-improvement suggestions:', promptImprovements)
      }
    } catch (reflErr: any) {
      console.warn('[TECH PLAN] Self-reflection failed (non-critical):', reflErr.message)
    }

    res.json({ ...plan, _promptImprovements: promptImprovements })
  } catch (err: any) {
    console.error('Technical plan error:', err.message)
    res.status(500).json({ message: err.message || 'שגיאת Technical Plan' })
  }
})

// POST /api/generate-background — Nano Banana (Gemini) image generation
let nanoBananaFailedAll = false

app.post('/api/generate-background', async (req, res) => {
  try {
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API Key לא מוגדר. הוסף GEMINI_API_KEY ב-.env' })

    const { prompt, aspectRatio = '9:16' } = req.body
    if (!prompt) return res.status(400).json({ message: 'חסר prompt' })

    console.log('[NANO BANANA] Generating background image...')

    let imageData: any = null

    // Use correct Gemini image generation models
    const modelNames = ['gemini-3.1-flash-image', 'gemini-3-pro-image-preview']

    for (const modelName of modelNames) {
      try {
        console.log(`[NANO BANANA] Trying model: ${modelName}`)
        const response = await ai.models.generateContent({
          model: modelName,
          contents: `Generate an image: ${prompt}`,
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

        if (imagePart?.inlineData) {
          imageData = {
            imageBytes: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType,
          }
          console.log('[NANO BANANA] Success with model:', modelName)
          nanoBananaFailedAll = false
          break
        }
        throw new Error('No image in response')
      } catch (modelErr: any) {
        const errMsg = modelErr.message || ''
        console.warn(`[NANO BANANA] Model ${modelName} failed:`, errMsg.slice(0, 150))
        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          console.log('[NANO BANANA] Quota exceeded, stopping')
          break
        }
      }
    }

    if (!imageData) {
      nanoBananaFailedAll = true
      console.error('[NANO BANANA] All models failed - skipping background image')
      return res.status(500).json({ message: 'Nano Banana לא החזיר תמונה (כל המודלים נכשלו)' })
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
      console.log('[SEEDANCE] Full response:', JSON.stringify(taskData))
      const taskId = taskData.data?.taskId || taskData.data?.task_id || taskData.data?.recordId || taskData.data?.id || taskData.taskId || taskData.task_id || taskData.id
      console.log('[SEEDANCE] Task created:', taskId)

      if (!taskId) {
        console.error('[SEEDANCE] No task ID in response:', JSON.stringify(taskData))
        return res.status(500).json({ message: 'לא התקבל task_id מ-kie.ai' })
      }

      // Step 2: Poll for result
      const pollUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`
      let videoUrl: string | null = null
      const maxAttempts = 60
      const pollInterval = 5000 // 5 seconds

      console.log('[SEEDANCE] Polling:', pollUrl)

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, pollInterval))

        try {
          const statusRes = await fetch(pollUrl, {
            headers: {
              'Authorization': `Bearer ${kieKey}`,
              'Content-Type': 'application/json',
            },
          })

          const statusData = await statusRes.json()

          // FIXED: Use "state" not "status"
          const state = statusData.data?.state || statusData.data?.status || ''

          console.log(`[SEEDANCE] Poll ${i + 1}/${maxAttempts}: state=${state}`)

          if (state === 'success') {
            // FIXED: Parse resultJson to get video URL
            if (statusData.data?.resultJson) {
              try {
                const result = typeof statusData.data.resultJson === 'string'
                  ? JSON.parse(statusData.data.resultJson)
                  : statusData.data.resultJson
                videoUrl = result?.resultUrls?.[0] || result?.url || null
                console.log('[SEEDANCE] Video URL from resultJson:', videoUrl)
              } catch (parseErr) {
                console.error('[SEEDANCE] Failed to parse resultJson:', statusData.data.resultJson)
              }
            }

            // Fallback: check other possible fields
            if (!videoUrl) {
              videoUrl = statusData.data?.resultUrl || statusData.data?.url || statusData.data?.videoUrl || null
            }

            if (videoUrl) {
              console.log('[SEEDANCE] Success! Video:', videoUrl)
            } else {
              console.error('[SEEDANCE] State is success but no URL found in:', JSON.stringify(statusData.data).substring(0, 500))
            }
            break
          }

          // FIXED: "fail" not "failed"
          if (state === 'fail' || state === 'failed' || state === 'error') {
            const errorMsg = statusData.data?.failMsg || statusData.data?.failCode || 'Unknown error'
            console.error('[SEEDANCE] Task failed:', errorMsg)
            videoUrl = null
            break
          }

          // Still processing (waiting/queuing/generating)
          if (i % 5 === 0) {
            console.log(`[SEEDANCE] Still ${state || 'processing'}... (${i * 5}s elapsed)`)
          }

        } catch (pollErr: any) {
          console.warn(`[SEEDANCE] Poll ${i + 1} error:`, pollErr.message)
        }
      }

      if (!videoUrl) {
        // FIXED: was "attempts" (undefined), now "maxAttempts"
        console.log(`[SEEDANCE] No video after ${maxAttempts} polls - skipping`)
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
        model: 'veo-3.1-generate',
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

  res.status(400).json({ message: 'חסר ספק (provider). בחר seedance או veo.' })
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

    console.log('[AUTO-TRANSCRIBE] Sending to gpt-4o-transcribe-diarize...')

    // Transcribe with diarize model (fallback chain)
    let transcription: any
    let usedModel = 'gpt-4o-transcribe-diarize'
    try {
      transcription = await ai.audio.transcriptions.create({
        model: 'gpt-4o-transcribe-diarize',
        file: fs.createReadStream(audioPath),
        language: 'he',
        response_format: 'diarized_json',
        chunking_strategy: 'auto',
      } as any)
    } catch (diarizeErr: any) {
      console.warn('[AUTO-TRANSCRIBE] Diarize failed, falling back:', diarizeErr.message)
      usedModel = 'gpt-4o-transcribe (fallback)'
      try {
        transcription = await ai.audio.transcriptions.create({
          model: 'gpt-4o-transcribe',
          file: fs.createReadStream(audioPath),
          language: 'he',
          response_format: 'json',
        } as any)
      } catch {
        usedModel = 'whisper-1 (fallback)'
        transcription = await ai.audio.transcriptions.create({
          file: fs.createReadStream(audioPath),
          model: 'whisper-1',
          language: 'he',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        })
      }
    }

    // Clean up temp files
    if (fs.existsSync(mp3Path)) try { fs.unlinkSync(mp3Path) } catch {}
    if (isTemp && fs.existsSync(filePath)) try { fs.unlinkSync(filePath) } catch {}

    // Map speaker IDs to Hebrew names
    const speakerColors = ['#7C5CFF', '#E94560', '#00D2FF', '#FFD700', '#00FF88', '#FF6B35']
    const speakerMap: Record<string, string> = {}
    let speakerCount = 0
    const segments = (transcription.segments || []).map((seg: any, i: number) => {
      const rawSpeaker = seg.speaker || 'speaker_0'
      if (!speakerMap[rawSpeaker]) {
        speakerCount++
        speakerMap[rawSpeaker] = `דובר ${speakerCount}`
      }
      return {
        ...seg,
        id: i,
        speaker: speakerMap[rawSpeaker],
        text: (seg.text || '').trim(),
      }
    })

    const speakers = Object.values(speakerMap).map((name, i) => ({
      name, color: speakerColors[i % speakerColors.length],
    }))

    // Calculate duration from segments (gpt-4o-transcribe-diarize may not return top-level duration)
    let totalDuration = transcription.duration || 0

    // Method 1: Use the last segment's end time
    if (totalDuration === 0 && segments.length > 0) {
      totalDuration = Math.max(...segments.map((s: any) => s.end || 0))
      if (totalDuration > 0) console.log('[AUTO-TRANSCRIBE] Duration from segments:', totalDuration)
    }

    // Method 2: Use ffprobe to get exact duration
    if (totalDuration === 0) {
      try {
        const ffprobePath = getFFmpeg().replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
        const probeResult = execSync(
          `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
          { timeout: 30000 }
        ).toString().trim()
        totalDuration = parseFloat(probeResult) || 0
        if (totalDuration > 0) console.log('[AUTO-TRANSCRIBE] Duration from ffprobe:', totalDuration)
      } catch (e) {
        console.warn('[AUTO-TRANSCRIBE] ffprobe failed, estimating from segments')
      }
    }

    // Method 3: Fallback - estimate from segment count (~3 seconds per segment)
    if (totalDuration === 0 && segments.length > 0) {
      totalDuration = segments.length * 3
      console.log('[AUTO-TRANSCRIBE] Estimated duration:', totalDuration)
    }

    // Identify speakers - return ALL speakers sorted by time so UI can allow manual selection
    const speakerTimes: Record<string, number> = {}
    segments.forEach((seg: any) => {
      const speaker = seg.speaker || 'unknown'
      if (!speakerTimes[speaker]) speakerTimes[speaker] = 0
      speakerTimes[speaker] += ((seg.end || 0) - (seg.start || 0))
    })

    // Sort speakers by time (most talking first) but don't assume most-talking = presenter
    const sortedSpeakers = Object.entries(speakerTimes)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([speaker, time]) => ({ speaker, time: Math.round((time as number) * 10) / 10 }))

    // Default to most-talking speaker, but mark as "auto-detected" so UI can override
    const mainSpeaker = sortedSpeakers[0]?.speaker || segments[0]?.speaker || 'unknown'

    console.log('[AUTO-TRANSCRIBE] All speakers:', JSON.stringify(sortedSpeakers))
    console.log('[AUTO-TRANSCRIBE] Auto-detected main presenter:', mainSpeaker, '(can be overridden by user)')

    // Mark each segment with isPresenter flag (default, UI can change this)
    segments.forEach((seg: any) => {
      seg.isPresenter = (seg.speaker === mainSpeaker)
    })

    console.log('[AUTO-TRANSCRIBE] Done:', segments.length, 'segments,', speakerCount, 'speakers,', totalDuration.toFixed(1), 'sec, model:', usedModel)

    res.json({
      segments,
      duration: totalDuration,
      text: transcription.text || '',
      speakers,
      mainSpeaker,
      speakerTimes,
      sortedSpeakers,
      autoDetected: true,
      model: usedModel,
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

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// Color grade presets
const colorGrades: Record<string, string> = {
  cinematic: 'eq=brightness=0.02:contrast=1.15:saturation=0.9,curves=m=0/0:0.3/0.25:0.7/0.8:1/1',
  warm: 'eq=brightness=0.03:contrast=1.05:saturation=1.2,colorbalance=rs=0.1:gs=0.05:bs=-0.05:rm=0.05:gm=0.02:bm=-0.03',
  cold: 'eq=brightness=0.02:contrast=1.1:saturation=0.85,colorbalance=rs=-0.05:gs=0:bs=0.1:rm=-0.03:gm=0.02:bm=0.08',
  vintage: 'eq=brightness=0.05:contrast=0.95:saturation=0.7,curves=r=0/0.1:0.5/0.5:1/0.9',
  vibrant: 'eq=brightness=0.03:contrast=1.2:saturation=1.4,unsharp=5:5:1.0:5:5:0.0',
  moody: 'eq=brightness=-0.02:contrast=1.2:saturation=0.8,curves=m=0/0:0.25/0.15:0.75/0.85:1/1,vignette=PI/4',
  clean: 'eq=brightness=0.04:contrast=1.05:saturation=1.05,unsharp=3:3:0.5',
  film: 'eq=brightness=0.01:contrast=1.1:saturation=0.95,curves=r=0/0.05:1/0.95:g=0/0.03:1/0.97,vignette=PI/5',
}

// Subtitle style presets (ASS format)
// Use "Sans" as font name for maximum cross-platform compatibility (maps to system sans-serif)
const subtitleStyles: Record<string, string> = {
  modern: 'Style: Default,Sans,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,40,1',
  karaoke: 'Style: Default,Sans,22,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,50,1',
  bold_white: 'Style: Default,Sans,24,&H00FFFFFF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,4,0,2,10,10,40,1',
  minimal: 'Style: Default,Sans,18,&H00FFFFFF,&H00000000,&H00000000,&H40000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,30,1',
  colorful: 'Style: Default,Sans,22,&H0000D7FF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,45,1',
}

// Generate styled ASS subtitles
function generateStyledSubtitles(segments: any[], cuts: any[], style: string = 'modern'): string {
  let ass = `[Script Info]
Title: Auto Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${subtitleStyles[style] || subtitleStyles.modern}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

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
        const start = formatAssTime(relStart)
        const end = formatAssTime(relEnd)
        // Add fade-in/fade-out animation
        const text = `{\\fad(200,200)}${seg.text}`
        ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`
      }
    }
    currentOffset += cutDuration
  }

  return ass
}

// Generate animated ASS subtitles (word-by-word karaoke/pop/typewriter/glow/bounce/slide)
function buildAnimatedASS(subtitles: any[], style: string, cuts: any[]): string {
  let ass = `[Script Info]
Title: Animated Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`
  switch (style) {
    case 'karaoke':
      ass += `Style: Default,Sans,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,60,1\n`
      break
    case 'pop':
      ass += `Style: Default,Sans,55,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,60,1\nStyle: Pop,Sans,70,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,20,20,60,1\n`
      break
    case 'typewriter':
      ass += `Style: Default,Sans,50,&H0000FF00,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,20,20,60,1\n`
      break
    case 'glow':
      ass += `Style: Default,Sans,60,&H00FFFFFF,&H000000FF,&H004B0082,&H80000000,-1,0,0,0,100,100,0,0,1,4,3,2,20,20,60,1\n`
      break
    case 'bounce':
      ass += `Style: Default,Sans,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,200,1\n`
      break
    case 'slide':
      ass += `Style: Default,Sans,55,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,60,1\n`
      break
    default:
      ass += `Style: Default,Sans,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,60,1\n`
  }
  ass += `\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`

  // Recalculate timestamps relative to cut video (same logic as standard subs)
  const adjustedSubs: Array<{ start: number; end: number; text: string }> = []
  let currentOffset = 0
  for (const cut of cuts) {
    const cutDuration = cut.keep_end - cut.keep_start
    for (const seg of subtitles) {
      const segStart = seg.start ?? seg.keepStart ?? 0
      const segEnd = seg.end ?? seg.keepEnd ?? 0
      if (segStart >= cut.keep_start && segEnd <= cut.keep_end) {
        adjustedSubs.push({
          start: currentOffset + (segStart - cut.keep_start),
          end: currentOffset + (segEnd - cut.keep_start),
          text: seg.text || '',
        })
      }
    }
    currentOffset += cutDuration
  }

  for (const sub of adjustedSubs) {
    const text = sub.text
    const words = text.split(' ').filter((w: string) => w.trim())
    if (words.length === 0) continue

    const subDuration = sub.end - sub.start
    const wordDuration = subDuration / words.length

    switch (style) {
      case 'karaoke': {
        words.forEach((word: string, wi: number) => {
          const wordStart = sub.start + wi * wordDuration
          const wordEnd = wordStart + wordDuration
          const ws = formatAssTime(wordStart)
          const we = formatAssTime(wordEnd)
          const beforeWords = words.slice(0, wi).join(' ')
          const afterWords = words.slice(wi + 1).join(' ')
          const highlighted = `${beforeWords ? beforeWords + ' ' : ''}{\\c&H00FFFF&\\fscx110\\fscy110\\b1}${word}{\\r}${afterWords ? ' ' + afterWords : ''}`
          ass += `Dialogue: 0,${ws},${we},Default,,0,0,0,,${highlighted}\n`
        })
        break
      }
      case 'pop': {
        words.forEach((word: string, wi: number) => {
          const wordStart = sub.start + wi * wordDuration
          const wordEnd = sub.end
          const ws = formatAssTime(wordStart)
          const we = formatAssTime(wordEnd)
          const xPos = 960 - ((words.length - 1) * 35) + (wi * 70)
          ass += `Dialogue: 0,${ws},${we},Pop,,0,0,0,,{\\an5\\pos(${xPos},950)\\fad(100,0)\\t(0,150,\\fscx100\\fscy100)\\fscx50\\fscy50}${word}\n`
        })
        break
      }
      case 'typewriter': {
        const chars = text.split('')
        const charDuration = subDuration / Math.max(chars.length, 1)
        let charIdx = 0
        for (let ci = 0; ci < chars.length; ci++) {
          if (chars[ci] === ' ') { charIdx++; continue }
          const charStart = sub.start + charIdx * charDuration
          const cs = formatAssTime(charStart)
          const we = formatAssTime(sub.end)
          const visibleText = text.substring(0, ci + 1)
          ass += `Dialogue: 0,${cs},${we},Default,,0,0,0,,${visibleText}\n`
          charIdx++
        }
        break
      }
      case 'glow': {
        words.forEach((word: string, wi: number) => {
          const wordStart = sub.start + wi * wordDuration
          const wordEnd = wordStart + wordDuration
          const ws = formatAssTime(wordStart)
          const we = formatAssTime(wordEnd)
          const beforeWords = words.slice(0, wi).join(' ')
          const afterWords = words.slice(wi + 1).join(' ')
          const glowLine = `${beforeWords ? beforeWords + ' ' : ''}{\\c&HFF00FF&\\bord5\\blur3\\b1}${word}{\\r}${afterWords ? ' ' + afterWords : ''}`
          ass += `Dialogue: 0,${ws},${we},Default,,0,0,0,,${glowLine}\n`
        })
        break
      }
      case 'bounce': {
        words.forEach((word: string, wi: number) => {
          const wordStart = sub.start + wi * wordDuration * 0.5
          const wordEnd = sub.end
          const ws = formatAssTime(wordStart)
          const we = formatAssTime(wordEnd)
          const xPos = 960 - ((words.length - 1) * 35) + (wi * 70)
          ass += `Dialogue: 0,${ws},${we},Default,,0,0,0,,{\\an5\\move(${xPos},1150,${xPos},950,0,200)\\fad(0,150)}${word}\n`
        })
        break
      }
      case 'slide': {
        words.forEach((word: string, wi: number) => {
          const wordStart = sub.start + wi * wordDuration * 0.3
          const wordEnd = sub.end
          const ws = formatAssTime(wordStart)
          const we = formatAssTime(wordEnd)
          const finalX = 960 - ((words.length - 1) * 35) + (wi * 70)
          ass += `Dialogue: 0,${ws},${we},Default,,0,0,0,,{\\an5\\move(2000,950,${finalX},950,0,250)\\fad(0,150)}${word}\n`
        })
        break
      }
      default: {
        const startTime = formatAssTime(sub.start)
        const endTime = formatAssTime(sub.end)
        ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,{\\fad(200,200)}${text}\n`
      }
    }
  }

  return ass
}

// Generate animated subtitles - ASS with fallback to drawtext
async function generateAnimatedSubtitles(
  inputFile: string,
  subtitles: any[],
  cuts: any[],
  style: string,
  outputDir: string,
  ffmpegPath: string,
  timestamp: number,
  filesToCleanup: string[]
): Promise<string> {
  const outputFile = path.join(outputDir, `step5_animated_subs_${timestamp}.mp4`)
  filesToCleanup.push(outputFile)

  const assContent = buildAnimatedASS(subtitles, style, cuts)
  const assPath = path.join(outputDir, `animated_subs_${timestamp}.ass`)
  fs.writeFileSync(assPath, '\ufeff' + assContent, 'utf-8')
  filesToCleanup.push(assPath)

  // Use basenames to avoid path escaping issues with colons/quotes/spaces
  const assBaseName = path.basename(assPath)
  const inputBaseName = path.basename(inputFile)
  const outputBaseName = path.basename(outputFile)

  // Try subtitles filter first (needs libass)
  try {
    execSync(
      `cd "${outputDir}" && "${ffmpegPath}" -i "${inputBaseName}" -vf "subtitles=${assBaseName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputBaseName}" -y`,
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024, cwd: outputDir }
    )
    console.log(`[PROCESS] Animated subtitles applied via subtitles filter (${style})`)
    return outputFile
  } catch (e: any) {
    console.warn('[PROCESS] ASS subtitles filter failed:', e.stderr?.toString().substring(0, 300))
    // Try ass filter as alternative
    try {
      execSync(
        `cd "${outputDir}" && "${ffmpegPath}" -i "${inputBaseName}" -vf "ass=${assBaseName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputBaseName}" -y`,
        { timeout: 180000, maxBuffer: 10 * 1024 * 1024, cwd: outputDir }
      )
      console.log(`[PROCESS] Animated subtitles applied via ass filter (${style})`)
      return outputFile
    } catch (e2: any) {
      console.warn('[PROCESS] ASS ass filter also failed:', e2.stderr?.toString().substring(0, 300))
      console.warn('[PROCESS] Falling back to drawtext...')
      return generateDrawtextAnimated(inputFile, subtitles, cuts, style, outputDir, ffmpegPath, timestamp, filesToCleanup)
    }
  }
}

// Fallback: drawtext-based animated subtitles
async function generateDrawtextAnimated(
  inputFile: string,
  subtitles: any[],
  cuts: any[],
  style: string,
  outputDir: string,
  ffmpegPath: string,
  timestamp: number,
  filesToCleanup: string[]
): Promise<string> {
  // Recalculate timestamps relative to cut video
  const adjustedSubs: Array<{ start: number; end: number; text: string }> = []
  let currentOffset = 0
  for (const cut of cuts) {
    const cutDuration = cut.keep_end - cut.keep_start
    for (const seg of subtitles) {
      const segStart = seg.start ?? seg.keepStart ?? 0
      const segEnd = seg.end ?? seg.keepEnd ?? 0
      if (segStart >= cut.keep_start && segEnd <= cut.keep_end) {
        adjustedSubs.push({
          start: currentOffset + (segStart - cut.keep_start),
          end: currentOffset + (segEnd - cut.keep_start),
          text: seg.text || '',
        })
      }
    }
    currentOffset += cutDuration
  }

  const filters: string[] = []
  adjustedSubs.forEach((sub, si) => {
    const text = sub.text
    const words = text.split(' ').filter((w: string) => w.trim())
    const subDuration = sub.end - sub.start
    const wordDur = subDuration / Math.max(words.length, 1)

    words.forEach((word: string, wi: number) => {
      const wordStart = sub.start + wi * wordDur
      const wordEnd = sub.end
      const highlightEnd = wordStart + wordDur

      const tmpFile = path.join(outputDir, `word_${timestamp}_${si}_${wi}.txt`)
      fs.writeFileSync(tmpFile, word, 'utf-8')
      filesToCleanup.push(tmpFile)
      const escapedTmp = tmpFile.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")

      const totalWidth = words.length * 70
      const x = `(w/2)-${Math.round(totalWidth / 2)}+${wi * 70}`
      const y = 'h-100'
      const isHighlighted = style === 'karaoke' || style === 'glow'

      if (isHighlighted) {
        filters.push(
          `drawtext=textfile='${escapedTmp}':fontsize=50:fontcolor=white:x=${x}:y=${y}:enable='between(t,${wordStart},${wordEnd})*not(between(t,${wordStart},${highlightEnd}))'`
        )
        filters.push(
          `drawtext=textfile='${escapedTmp}':fontsize=55:fontcolor=yellow:borderw=3:bordercolor=black:x=${x}:y=${y}:enable='between(t,${wordStart},${highlightEnd})'`
        )
      } else {
        filters.push(
          `drawtext=textfile='${escapedTmp}':fontsize=50:fontcolor=white:borderw=2:bordercolor=black:x=${x}:y=${y}:enable='between(t,${wordStart},${wordEnd})'`
        )
      }
    })
  })

  if (filters.length === 0) return inputFile

  // FFmpeg has filter limits, batch if needed
  const batchSize = 30
  let current = inputFile

  for (let i = 0; i < filters.length; i += batchSize) {
    const batch = filters.slice(i, i + batchSize)
    const batchOutput = path.join(outputDir, `subs_batch_${timestamp}_${i}.mp4`)
    filesToCleanup.push(batchOutput)

    try {
      execSync(
        `"${ffmpegPath}" -i "${current}" -vf "${batch.join(',')}" -c:v libx264 -preset fast -crf 23 -c:a copy "${batchOutput}" -y`,
        { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
      )
      current = batchOutput
    } catch (e: any) {
      console.warn(`[PROCESS] Drawtext batch ${i} failed:`, e.stderr?.toString().substring(0, 400))
      break
    }
  }

  if (current !== inputFile) {
    const finalOutput = path.join(outputDir, `step5_drawtext_subs_${timestamp}.mp4`)
    filesToCleanup.push(finalOutput)
    fs.renameSync(current, finalOutput)
    return finalOutput
  }

  return inputFile
}

// Build transition filter for xfade between cuts
function buildTransitionFilter(cuts: any[], transitions: string[] = ['fade'], transitionDuration: number = 0.5): { filter: string; useTransitions: boolean } {
  if (cuts.length <= 1) {
    const filter = `[0:v]trim=start=${cuts[0].keep_start}:end=${cuts[0].keep_end},setpts=PTS-STARTPTS[outv];[0:a]atrim=start=${cuts[0].keep_start}:end=${cuts[0].keep_end},asetpts=PTS-STARTPTS[outa]`
    return { filter, useTransitions: false }
  }

  const filters: string[] = []

  // Create trimmed segments
  cuts.forEach((cut: any, i: number) => {
    filters.push(`[0:v]trim=start=${cut.keep_start}:end=${cut.keep_end},setpts=PTS-STARTPTS[v${i}]`)
    filters.push(`[0:a]atrim=start=${cut.keep_start}:end=${cut.keep_end},asetpts=PTS-STARTPTS[a${i}]`)
  })

  // Apply xfade transitions between consecutive video segments
  let lastVideo = 'v0'
  let lastAudio = 'a0'
  let accumulatedOffset = 0

  for (let i = 1; i < cuts.length; i++) {
    const prevDuration = cuts[i - 1].keep_end - cuts[i - 1].keep_start
    accumulatedOffset += prevDuration - transitionDuration

    const transType = transitions[(i - 1) % transitions.length] || 'fade'
    const outLabel = i === cuts.length - 1 ? 'outv' : `xv${i}`
    const outAudioLabel = i === cuts.length - 1 ? 'outa' : `xa${i}`

    filters.push(`[${lastVideo}][v${i}]xfade=transition=${transType}:duration=${transitionDuration}:offset=${Math.max(0, accumulatedOffset)}[${outLabel}]`)
    filters.push(`[${lastAudio}][a${i}]acrossfade=d=${transitionDuration}[${outAudioLabel}]`)

    lastVideo = outLabel
    lastAudio = outAudioLabel
  }

  return { filter: filters.join(';'), useTransitions: true }
}

// Build multi-cam crop filter
// Uses a simpler approach: apply zoompan-based crops per segment using enable= time ranges
// This avoids trim+concat which is fragile with segment gaps/overlaps
function buildMultiCamFilter(cameraAngles: any[], videoWidth: number, videoHeight: number): string {
  if (!cameraAngles || cameraAngles.length === 0) return ''

  // Ensure dimensions are even (required by libx264)
  const w = videoWidth % 2 === 0 ? videoWidth : videoWidth - 1
  const h = videoHeight % 2 === 0 ? videoHeight : videoHeight - 1

  // Build a single dynamic crop expression that changes based on time
  // This is more reliable than chaining multiple crop+scale with enable=
  const nonWideAngles = cameraAngles.filter((seg: any) => (seg.camera || 'wide') !== 'wide')
  if (nonWideAngles.length === 0) return ''

  // Build crop expressions that dynamically compute crop params based on time
  const getCropParams = (camType: string) => {
    switch (camType) {
      case 'closeup': return { factor: 0.6 }
      case 'medium': return { factor: 0.8 }
      case 'left': return { factor: 0.75, xAlign: 'left' }
      case 'right': return { factor: 0.75, xAlign: 'right' }
      default: return { factor: 1.0 }
    }
  }

  // Build a single crop width/height/x/y expression using if(between(t,...),...)
  // Default to full frame (factor=1.0), override during angle time ranges
  let cwExpr = `${w}`
  let chExpr = `${h}`
  let cxExpr = '0'
  let cyExpr = '0'

  // Apply each angle as a conditional override (last matching wins)
  for (const seg of nonWideAngles) {
    const params = getCropParams(seg.camera || 'wide')
    if (params.factor >= 1.0) continue

    const cw = Math.round(w * params.factor)
    const ch = Math.round(h * params.factor)
    let cx: number, cy: number
    if (params.xAlign === 'left') {
      cx = 0
      cy = Math.round((h - ch) / 2)
    } else if (params.xAlign === 'right') {
      cx = w - cw
      cy = Math.round((h - ch) / 2)
    } else {
      cx = Math.round((w - cw) / 2)
      cy = Math.round((h - ch) / 2)
    }

    const cond = `between(t,${seg.start},${seg.end})`
    cwExpr = `if(${cond},${cw},${cwExpr})`
    chExpr = `if(${cond},${ch},${chExpr})`
    cxExpr = `if(${cond},${cx},${cxExpr})`
    cyExpr = `if(${cond},${cy},${cyExpr})`
  }

  return `crop='${cwExpr}':'${chExpr}':'${cxExpr}':'${cyExpr}',scale=${w}:${h}`
}

// Build smart framing filter for platform export
function buildSmartFramingFilter(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, strategy: string): string {
  const targetRatio = targetWidth / targetHeight

  if (strategy === 'crop_center') {
    if (targetRatio < 1) {
      // Vertical (9:16): crop center of 16:9
      const cropWidth = Math.floor(sourceHeight * targetWidth / targetHeight)
      const x = Math.floor((sourceWidth - cropWidth) / 2)
      return `crop=${Math.min(cropWidth, sourceWidth)}:${sourceHeight}:${Math.max(x, 0)}:0,scale=${targetWidth}:${targetHeight}`
    }
    if (Math.abs(targetRatio - 1) < 0.01) {
      // Square (1:1)
      const cropSize = Math.min(sourceWidth, sourceHeight)
      const x = Math.floor((sourceWidth - cropSize) / 2)
      const y = Math.floor((sourceHeight - cropSize) / 2)
      return `crop=${cropSize}:${cropSize}:${x}:${y},scale=${targetWidth}:${targetHeight}`
    }
    return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`
  }

  if (strategy === 'blur_background') {
    // Use filter_complex with blurred background + centered foreground
    // This needs to be handled specially in the caller since it requires filter_complex
    return `__blur_background__`
  }

  // Default: pad with black bars
  return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`
}

// Get intensity-based visual filter
function getIntensityFilter(intensity: number): string {
  switch (intensity) {
    case 5: return 'eq=contrast=1.2:saturation=1.3'
    case 4: return 'eq=contrast=1.1:saturation=1.15'
    case 2: return 'eq=brightness=0.02:saturation=0.95'
    case 1: return 'eq=brightness=0.03:saturation=0.85'
    default: return '' // intensity 3 = normal
  }
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

// Main processing endpoint: professional video processing pipeline
app.post('/api/auto-editor/process', async (req, res) => {
  const filesToCleanup: string[] = []

  try {
    const {
      videoUrl,
      videoPlan,
      targetDuration,
      platforms,
      musicUrl,
      backgroundImage,
      captionStyle,
      includeSubtitles = true,
      includeBackground = true,
      animatedSubtitles = false,
      animationStyle = 'karaoke',
      skipPlatformExport = false,
      transcript,
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
      const response = await fetch(videoUrl)
      const buffer = Buffer.from(await response.arrayBuffer())
      sourceFile = path.join(uploadsDir, `source_${timestamp}.mp4`)
      fs.writeFileSync(sourceFile, buffer)
      filesToCleanup.push(sourceFile)
    } else {
      return res.status(400).json({ message: 'חסר videoUrl' })
    }

    if (!fs.existsSync(sourceFile)) {
      return res.status(400).json({ message: 'קובץ המקור לא נמצא: ' + sourceFile })
    }

    console.log('[PROCESS] Source file:', sourceFile)
    console.log('[PROCESS] Options:', { includeSubtitles, includeBackground, animatedSubtitles })
    console.log('[PROCESS] Plan features:', {
      transitions: videoPlan?.transitions?.length || 0,
      zooms: videoPlan?.zooms?.length || 0,
      cameraAngles: (videoPlan?.camera_angles || videoPlan?.cameraAngles)?.length || 0,
      colorGrade: videoPlan?.color_grade || videoPlan?.colorGrade || 'clean',
      speakers: (videoPlan?.speakers || videoPlan?.lower_thirds || videoPlan?.lowerThirds)?.length || 0,
      graphics: (videoPlan?.graphics || videoPlan?.overlays || videoPlan?.text_overlays)?.length || 0,
      subtitles: videoPlan?.subtitles?.length || 0,
      transcriptSegments: transcript?.segments?.length || 0,
    })
    console.log('[PROCESS] Plan keys:', Object.keys(videoPlan || {}))

    const outputFiles: any[] = []

    // ============================================
    // STEP 1: CUT VIDEO WITH TRANSITIONS
    // ============================================

    // Normalize cuts from camelCase or snake_case
    let cuts = (videoPlan?.cuts || []).map((c: any) => ({
      keep_start: c.keep_start ?? c.keepStart ?? 0,
      keep_end: c.keep_end ?? c.keepEnd ?? targetDuration,
    }))

    if (cuts.length === 0) {
      cuts.push({ keep_start: 0, keep_end: targetDuration || 60 })
    }

    const transitions = videoPlan?.transitions || ['fade']
    const cutFile = path.join(uploadsDir, `cut_${timestamp}.mp4`)
    filesToCleanup.push(cutFile)

    console.log('[PROCESS] Step 1: Cutting video with', cuts.length, 'segments and transitions...')

    const { filter: transFilter, useTransitions } = buildTransitionFilter(cuts, transitions, 0.5)

    try {
      execSync(
        `"${ffmpegPath}" -i "${sourceFile}" -filter_complex "${transFilter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${cutFile}" -y`,
        { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      console.log('[PROCESS] Step 1 done: Cut video created' + (useTransitions ? ' with transitions' : ''))
    } catch (e: any) {
      // Fallback: simple concat without xfade if transitions fail
      console.log('[PROCESS] Transitions failed, falling back to simple concat:', e.message?.slice(0, 100))
      const cutFilters: string[] = []
      const concatInputs: string[] = []
      cuts.forEach((cut: any, i: number) => {
        cutFilters.push(`[0:v]trim=start=${cut.keep_start}:end=${cut.keep_end},setpts=PTS-STARTPTS[v${i}]`)
        cutFilters.push(`[0:a]atrim=start=${cut.keep_start}:end=${cut.keep_end},asetpts=PTS-STARTPTS[a${i}]`)
        concatInputs.push(`[v${i}][a${i}]`)
      })
      const fallbackFilter = [...cutFilters, `${concatInputs.join('')}concat=n=${cuts.length}:v=1:a=1[outv][outa]`].join(';')
      execSync(
        `"${ffmpegPath}" -i "${sourceFile}" -filter_complex "${fallbackFilter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${cutFile}" -y`,
        { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      console.log('[PROCESS] Step 1 done: Cut video created (fallback concat)')
    }

    let currentFile = cutFile

    // ============================================
    // STEP 2: MULTI-CAM SIMULATION
    // ============================================

    const cameraAngles = videoPlan?.camera_angles || videoPlan?.cameraAngles || []
    if (cameraAngles.length > 1) {
      const camFile = path.join(uploadsDir, `multicam_${timestamp}.mp4`)
      filesToCleanup.push(camFile)
      console.log('[PROCESS] Step 2: Multi-cam simulation with', cameraAngles.length, 'angles...')

      try {
        // Probe actual video dimensions
        let vidW = 1920, vidH = 1080
        try {
          const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
          const probeOut = execSync(
            `"${ffprobePath}" -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${currentFile}"`,
            { timeout: 15000 }
          ).toString().trim()
          const [pw, ph] = probeOut.split('x').map(Number)
          if (pw > 0 && ph > 0) { vidW = pw; vidH = ph }
        } catch { /* use defaults */ }

        // Ensure even dimensions
        vidW = vidW % 2 === 0 ? vidW : vidW - 1
        vidH = vidH % 2 === 0 ? vidH : vidH - 1

        // Remap camera angles to be relative to the cut video
        const cutDurations = cuts.map((c: any) => c.keep_end - c.keep_start)
        const totalCutDuration = cutDurations.reduce((s: number, d: number) => s + d, 0)

        // Scale camera angles to fit within cut video duration
        const scaledAngles = cameraAngles.map((ca: any) => {
          const relStart = Math.max(0, Math.min(ca.start, totalCutDuration))
          const relEnd = Math.max(relStart, Math.min(ca.end, totalCutDuration))
          return { start: relStart, end: relEnd, camera: ca.camera || 'wide', duration: Math.max(relEnd - relStart, 0.1) }
        }).filter((ca: any) => ca.end > ca.start)

        const nonWideAngles = scaledAngles.filter((ca: any) => ca.camera !== 'wide')
        if (nonWideAngles.length > 0) {
          // Segment-based approach: process each angle as a separate segment, then concat
          const mcSegments: string[] = []
          console.log(`[MULTI-CAM] Input: ${vidW}x${vidH}, ${scaledAngles.length} angles (${nonWideAngles.length} non-wide)`)

          for (let i = 0; i < scaledAngles.length; i++) {
            const angle = scaledAngles[i]
            const segFile = path.join(uploadsDir, `mc_${timestamp}_${i}.mp4`)
            filesToCleanup.push(segFile)

            let vf = `scale=${vidW}:${vidH}`
            switch (angle.camera) {
              case 'closeup': case 'close':
                vf = `crop=iw*0.6:ih*0.6:iw*0.2:ih*0.2,scale=${vidW}:${vidH}`
                break
              case 'medium':
                vf = `crop=iw*0.8:ih*0.8:iw*0.1:ih*0.1,scale=${vidW}:${vidH}`
                break
              case 'left':
                vf = `crop=iw*0.75:ih*0.85:0:ih*0.075,scale=${vidW}:${vidH}`
                break
              case 'right':
                vf = `crop=iw*0.75:ih*0.85:iw*0.25:ih*0.075,scale=${vidW}:${vidH}`
                break
              default:
                vf = `scale=${vidW}:${vidH}`
            }

            try {
              execSync(
                `"${ffmpegPath}" -i "${currentFile}" -ss ${angle.start} -t ${angle.duration} -vf "${vf}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${segFile}" -y`,
                { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
              )
              mcSegments.push(segFile)
            } catch (segErr: any) {
              console.warn(`[MULTI-CAM] Segment ${i} (${angle.camera}) failed:`, segErr.stderr?.toString().substring(0, 300))
              // Fallback: copy without crop
              try {
                execSync(
                  `"${ffmpegPath}" -i "${currentFile}" -ss ${angle.start} -t ${angle.duration} -c:v copy -c:a copy "${segFile}" -y`,
                  { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
                )
                mcSegments.push(segFile)
              } catch {}
            }
          }

          if (mcSegments.length > 0) {
            const listFile = path.join(uploadsDir, `mc_list_${timestamp}.txt`)
            filesToCleanup.push(listFile)
            fs.writeFileSync(listFile, mcSegments.map(f => `file '${f}'`).join('\n'))

            try {
              execSync(
                `"${ffmpegPath}" -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${camFile}" -y`,
                { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
              )
              currentFile = camFile
              console.log('[PROCESS] Step 2 done: Multi-cam applied (' + mcSegments.length + ' segments)')
            } catch (concatErr: any) {
              console.warn('[MULTI-CAM] Concat failed:', concatErr.stderr?.toString().substring(0, 300))
            }
          } else {
            console.log('[PROCESS] Step 2 skipped: No segments produced')
          }
        } else {
          console.log('[PROCESS] Step 2 skipped: All angles are wide')
        }
      } catch (e: any) {
        const stderr = e.stderr?.toString() || ''
        const stdout = e.stdout?.toString() || ''
        console.error(`[PROCESS] Step 2 MULTI-CAM FAILED:`)
        console.error(`  Command: ${e.cmd?.substring(0, 200)}`)
        console.error(`  stderr: ${stderr.substring(0, 500)}`)
        console.error(`  stdout: ${stdout.substring(0, 200)}`)
      }
    } else {
      console.log('[PROCESS] Step 2 skipped: No camera angles in plan')
    }

    // ============================================
    // STEP 3: COLOR GRADE
    // ============================================

    const colorGradeName = videoPlan?.color_grade || videoPlan?.colorGrade || 'clean'
    const gradeFilter = colorGrades[colorGradeName] || colorGrades.clean
    const gradedFile = path.join(uploadsDir, `graded_${timestamp}.mp4`)
    filesToCleanup.push(gradedFile)

    console.log(`[PROCESS] Step 3: Color grading (${colorGradeName})...`)
    execSync(
      `"${ffmpegPath}" -i "${currentFile}" -vf "${gradeFilter}" -c:v libx264 -preset fast -crf 23 -c:a copy "${gradedFile}" -y`,
      { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    )
    currentFile = gradedFile
    console.log('[PROCESS] Step 3 done')

    // ============================================
    // STEP 3.5: ZOOM / KEN BURNS EFFECTS
    // ============================================

    const zooms = videoPlan?.zooms || videoPlan?.zoom_effects || videoPlan?.zoomEffects || []
    if (zooms.length > 0) {
      const zoomFile = path.join(uploadsDir, `zoom_${timestamp}.mp4`)
      filesToCleanup.push(zoomFile)
      console.log('[PROCESS] Step 3.5: Applying', zooms.length, 'zoom effects...')

      try {
        // Probe actual video dimensions
        let zoomW = 1920, zoomH = 1080
        try {
          const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
          const probeOut = execSync(
            `"${ffprobePath}" -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${currentFile}"`,
            { timeout: 15000 }
          ).toString().trim()
          const [pw, ph] = probeOut.split('x').map(Number)
          if (pw > 0 && ph > 0) { zoomW = pw; zoomH = ph }
        } catch { /* use defaults */ }

        // Ensure even dimensions
        zoomW = zoomW % 2 === 0 ? zoomW : zoomW - 1
        zoomH = zoomH % 2 === 0 ? zoomH : zoomH - 1

        // Remap zoom timestamps to cut video time
        const remappedZooms = zooms.map((z: any) => {
          const atTime = z.at_time ?? z.atTime ?? 0
          let relativeStart = 0
          let cutOffset = 0
          for (const cut of cuts) {
            const cutDuration = cut.keep_end - cut.keep_start
            if (atTime >= cut.keep_start && atTime <= cut.keep_end) {
              relativeStart = cutOffset + (atTime - cut.keep_start)
              break
            }
            cutOffset += cutDuration
          }
          return {
            start: relativeStart,
            duration: z.duration || 3,
            scale: z.scale || 1.05,
            direction: z.direction || 'in',
          }
        })

        // Apply zooms one at a time for reliability
        let zoomCurrent = currentFile
        const limitedZooms = remappedZooms.slice(0, 5)

        for (let zi = 0; zi < limitedZooms.length; zi++) {
          const z = limitedZooms[zi]
          const start = z.start
          const dur = z.duration
          const intensity = Math.min(z.scale || 1.05, 1.5)
          const zoomOut = path.join(uploadsDir, `zoom_${timestamp}_${zi}.mp4`)
          filesToCleanup.push(zoomOut)

          // Use crop with enable expression: crop center during zoom, full frame otherwise
          // Inside single quotes, commas are literal - no escaping needed
          const cropRatio = (1 / intensity).toFixed(4)
          const vf = `crop='if(between(t,${start},${start + dur}),iw*${cropRatio},iw)':'if(between(t,${start},${start + dur}),ih*${cropRatio},ih)':'if(between(t,${start},${start + dur}),(iw-iw*${cropRatio})/2,0)':'if(between(t,${start},${start + dur}),(ih-ih*${cropRatio})/2,0)',scale=${zoomW}:${zoomH}`

          try {
            execSync(
              `"${ffmpegPath}" -i "${zoomCurrent}" -vf "${vf}" -c:v libx264 -preset fast -crf 23 -c:a copy "${zoomOut}" -y`,
              { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
            )
            zoomCurrent = zoomOut
          } catch (ze: any) {
            console.warn(`[ZOOM] Effect ${zi} failed:`, ze.stderr?.toString().substring(0, 300))
          }
        }

        if (zoomCurrent !== currentFile) {
          // Rename last successful zoom to the expected output file
          if (zoomCurrent !== zoomFile) {
            fs.copyFileSync(zoomCurrent, zoomFile)
          }
          currentFile = zoomFile
          console.log('[PROCESS] Step 3.5 done: Zoom effects applied')
        } else {
          console.log('[PROCESS] Step 3.5: All zoom effects failed, continuing without')
        }
      } catch (e: any) {
        const stderr = e.stderr?.toString() || ''
        const stdout = e.stdout?.toString() || ''
        console.error(`[PROCESS] Step 3.5 ZOOM FAILED:`)
        console.error(`  Command: ${e.cmd?.substring(0, 200)}`)
        console.error(`  stderr: ${stderr.substring(0, 500)}`)
        console.error(`  stdout: ${stdout.substring(0, 200)}`)
      }
    } else {
      console.log('[PROCESS] Step 3.5 skipped: No zooms in plan')
    }

    // ============================================
    // STEP 4: PROFESSIONAL AUDIO PROCESSING + MUSIC
    // ============================================

    const audioFile = path.join(uploadsDir, `audio_${timestamp}.mp4`)
    filesToCleanup.push(audioFile)

    console.log('[PROCESS] Step 4: Professional audio processing...')

    if (musicUrl) {
      try {
        let musicFile = ''
        if (musicUrl.includes('localhost')) {
          const musicFilename = path.basename(new URL(musicUrl, `http://localhost:${PORT}`).pathname)
          musicFile = path.join(uploadsDir, musicFilename)
        }

        if (!musicFile || !fs.existsSync(musicFile)) {
          musicFile = path.join(uploadsDir, `music_${timestamp}.mp3`)
          const musicResponse = await fetch(musicUrl)
          if (musicResponse.ok) {
            const musicBuffer = Buffer.from(await musicResponse.arrayBuffer())
            fs.writeFileSync(musicFile, musicBuffer)
            filesToCleanup.push(musicFile)
          }
        }

        if (fs.existsSync(musicFile)) {
          // Professional audio chain: clean voice + music with sidechain ducking
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -i "${musicFile}" -filter_complex "[0:a]highpass=f=80,lowpass=f=12000,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=5:release=50,loudnorm=I=-16:LRA=11:TP=-1.5[voice];[1:a]volume=0.15,afade=t=in:st=0:d=2,aloop=-1:2e+09[music];[voice][music]sidechaincompress=threshold=0.02:ratio=6:attack=10:release=200[outa]" -map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 128k -shortest "${audioFile}" -y`,
            { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
          currentFile = audioFile
          console.log('[PROCESS] Step 4 done: Audio processed with music + sidechain ducking')
        } else {
          // No music file - just clean the voice
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -af "highpass=f=80,lowpass=f=12000,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=5:release=50,loudnorm=I=-16:LRA=11:TP=-1.5" -c:v copy "${audioFile}" -y`,
            { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
          currentFile = audioFile
          console.log('[PROCESS] Step 4 done: Audio cleaned (no music)')
        }
      } catch (e: any) {
        console.log('[PROCESS] Music mix failed, falling back to basic audio clean:', e.message?.slice(0, 100))
        try {
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -af "highpass=f=80,lowpass=f=12000,afftdn=nf=-25,loudnorm=I=-16:LRA=11:TP=-1.5" -c:v copy "${audioFile}" -y`,
            { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
          currentFile = audioFile
        } catch { /* continue with current file */ }
      }
    } else {
      // No music - just clean the voice
      try {
        execSync(
          `"${ffmpegPath}" -i "${currentFile}" -af "highpass=f=80,lowpass=f=12000,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=5:release=50,loudnorm=I=-16:LRA=11:TP=-1.5" -c:v copy "${audioFile}" -y`,
          { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
        )
        currentFile = audioFile
        console.log('[PROCESS] Step 4 done: Audio cleaned')
      } catch (e: any) {
        console.log('[PROCESS] Audio clean failed, continuing:', e.message?.slice(0, 100))
      }
    }

    // ============================================
    // STEP 5: STYLED SUBTITLES (ASS FORMAT)
    // ============================================

    // Use plan subtitles first, then fall back to transcript segments for subtitle generation
    const segments = (videoPlan?.subtitles?.length > 0 ? videoPlan.subtitles : null)
      || (videoPlan?.source_segments?.length > 0 ? videoPlan.source_segments : null)
      || (videoPlan?.sourceSegments?.length > 0 ? videoPlan.sourceSegments : null)
      || (transcript?.segments?.length > 0 ? transcript.segments : null)
      || []
    let assFilePath: string | null = null

    console.log('[PROCESS] Step 5 check:', {
      planSubtitles: videoPlan?.subtitles?.length || 0,
      transcriptSegments: transcript?.segments?.length || 0,
      resolvedSegments: segments.length,
      includeSubtitles,
      animatedSubtitles,
    })

    if (!includeSubtitles) {
      console.log('[PROCESS] Step 5: Skipping subtitles (disabled by user)')
    } else if (segments.length > 0 && animatedSubtitles) {
      console.log(`[PROCESS] Step 5: Generating ANIMATED subtitles (${animationStyle})...`)
      try {
        currentFile = await generateAnimatedSubtitles(
          currentFile, segments, cuts, animationStyle || 'karaoke',
          uploadsDir, ffmpegPath, timestamp, filesToCleanup
        )
        console.log('[PROCESS] Step 5 done: Animated subtitles added')
      } catch (e: any) {
        console.warn('[PROCESS] Animated subtitles failed, falling back to standard:', e.stderr?.toString().substring(0, 300) || e.message?.slice(0, 200))
        // Fall back to standard subtitles
        try {
          const subStyle = captionStyle || 'modern'
          const assContent = generateStyledSubtitles(segments, cuts, subStyle)
          assFilePath = path.join(uploadsDir, `subs_${timestamp}.ass`)
          filesToCleanup.push(assFilePath)
          fs.writeFileSync(assFilePath, '\ufeff' + assContent, 'utf-8')
          const subFile = path.join(uploadsDir, `subbed_${timestamp}.mp4`)
          filesToCleanup.push(subFile)
          const assBase = path.basename(assFilePath)
          execSync(
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${path.basename(currentFile)}" -vf "subtitles=${assBase}" -c:v libx264 -preset fast -crf 23 -c:a copy "${path.basename(subFile)}" -y`,
            { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
          )
          currentFile = subFile
          console.log('[PROCESS] Step 5 done: Standard subtitles fallback')
        } catch (e2: any) {
          console.warn('[PROCESS] Standard ASS fallback also failed:', e2.stderr?.toString().substring(0, 300))
        }
      }
    } else if (segments.length > 0) {
      console.log('[PROCESS] Step 5: Generating styled subtitles (ASS)...')
      const subStyle = captionStyle || 'modern'
      const assContent = generateStyledSubtitles(segments, cuts, subStyle)
      assFilePath = path.join(uploadsDir, `subs_${timestamp}.ass`)
      filesToCleanup.push(assFilePath)
      fs.writeFileSync(assFilePath, '\ufeff' + assContent, 'utf-8')

      const subFile = path.join(uploadsDir, `subbed_${timestamp}.mp4`)
      filesToCleanup.push(subFile)

      // Use basenames to avoid path escaping issues with colons/quotes/spaces
      const assBase = path.basename(assFilePath)
      const subBase = path.basename(subFile)
      const curBase = path.basename(currentFile)

      try {
        execSync(
          `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "subtitles=${assBase}" -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
          { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
        )
        currentFile = subFile
        console.log('[PROCESS] Step 5 done: Styled subtitles added')
      } catch (e: any) {
        console.warn('[PROCESS] ASS subtitles filter failed:', e.stderr?.toString().substring(0, 300))
        // Try ass filter
        let assWorked = false
        try {
          execSync(
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "ass=${assBase}" -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
            { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
          )
          currentFile = subFile
          assWorked = true
          console.log('[PROCESS] Step 5 done: ASS filter subtitles added')
        } catch (e1: any) {
          console.warn('[PROCESS] ASS filter also failed:', e1.stderr?.toString().substring(0, 200))
        }

        if (!assWorked) {
          console.log('[PROCESS] Trying SRT fallback...')
          try {
            const srtFile = path.join(uploadsDir, `subs_${timestamp}.srt`)
            filesToCleanup.push(srtFile)
            let srtContent = ''
            let index = 1
            let currentOffset = 0
            for (const cut of cuts) {
              const cutDuration = cut.keep_end - cut.keep_start
              for (const seg of segments) {
                const segStart = seg.start ?? seg.keepStart
                const segEnd = seg.end ?? seg.keepEnd
                if (segStart >= cut.keep_start && segEnd <= cut.keep_end) {
                  const relStart = currentOffset + (segStart - cut.keep_start)
                  const relEnd = currentOffset + (segEnd - cut.keep_start)
                  srtContent += `${index}\n${formatSrtTime(relStart)} --> ${formatSrtTime(relEnd)}\n${seg.text}\n\n`
                  index++
                }
              }
              currentOffset += cutDuration
            }
            if (srtContent.trim()) {
              fs.writeFileSync(srtFile, '\ufeff' + srtContent, 'utf-8')
              const srtBase = path.basename(srtFile)
              execSync(
                `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "subtitles=${srtBase}:force_style='FontName=Arial,FontSize=24,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=30'" -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
                { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
              )
              currentFile = subFile
              console.log('[PROCESS] Step 5 done: SRT fallback subtitles added')
            }
          } catch (srtErr: any) {
            console.warn('[PROCESS] SRT subtitles also failed:', srtErr.stderr?.toString().substring(0, 300))
            // Last resort: drawtext fallback for Hebrew
            console.log('[PROCESS] Trying drawtext fallback for subtitles...')
            try {
              const dtFilters: string[] = []
              let dtOffset = 0
              for (const cut of cuts) {
                const cutDuration = cut.keep_end - cut.keep_start
                for (const seg of segments) {
                  const segStart = seg.start ?? seg.keepStart ?? 0
                  const segEnd = seg.end ?? seg.keepEnd ?? 0
                  if (segStart >= cut.keep_start && segEnd <= cut.keep_end) {
                    const relStart = dtOffset + (segStart - cut.keep_start)
                    const relEnd = dtOffset + (segEnd - cut.keep_start)
                    const textFile = path.join(uploadsDir, `sub_dt_${timestamp}_${dtFilters.length}.txt`)
                    fs.writeFileSync(textFile, seg.text || '', 'utf-8')
                    filesToCleanup.push(textFile)
                    const escapedTF = textFile.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")
                    dtFilters.push(
                      `drawtext=textfile='${escapedTF}':fontsize=24:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-80:enable='between(t,${relStart},${relEnd})'`
                    )
                  }
                }
                dtOffset += cutDuration
              }

              if (dtFilters.length > 0) {
                let dtCurrent = currentFile
                for (let dti = 0; dti < dtFilters.length; dti += 20) {
                  const batch = dtFilters.slice(dti, dti + 20)
                  const batchOut = path.join(uploadsDir, `sub_dt_batch_${timestamp}_${dti}.mp4`)
                  filesToCleanup.push(batchOut)
                  try {
                    execSync(
                      `"${ffmpegPath}" -i "${dtCurrent}" -vf "${batch.join(',')}" -c:v libx264 -preset fast -crf 23 -c:a copy "${batchOut}" -y`,
                      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
                    )
                    dtCurrent = batchOut
                  } catch (dtErr: any) {
                    console.warn(`[PROCESS] Drawtext subtitle batch ${dti} failed:`, dtErr.stderr?.toString().substring(0, 300))
                    break
                  }
                }
                if (dtCurrent !== currentFile) {
                  fs.copyFileSync(dtCurrent, subFile)
                  currentFile = subFile
                  console.log('[PROCESS] Step 5 done: Drawtext fallback subtitles added')
                }
              }
            } catch (dtFinalErr: any) {
              console.warn('[PROCESS] All subtitle methods failed:', dtFinalErr.message?.substring(0, 200))
            }
          }
        }
      }
    } else {
      console.log('[PROCESS] Step 5 skipped: No subtitles in plan')
    }

    // ============================================
    // STEP 6: LOWER THIRDS (SPEAKER NAMES)
    // ============================================

    const speakers = videoPlan?.speakers || videoPlan?.lower_thirds || videoPlan?.lowerThirds || []
    if (speakers.length > 0) {
      const lowerFile = path.join(uploadsDir, `lower_${timestamp}.mp4`)
      filesToCleanup.push(lowerFile)
      console.log('[PROCESS] Step 6: Adding speaker lower thirds...')

      try {
        // Remap speaker timestamps to cut video
        const dialogueLines: string[] = []
        speakers.forEach((s: any) => {
          const name = s.name || 'דובר'
          const firstAppear = s.first_appearance ?? s.firstAppearance ?? 0
          const displayDur = s.display_duration ?? s.displayDuration ?? 4

          // Calculate relative position in cut video
          let relativeStart = 0
          let cutOffset = 0
          for (const cut of cuts) {
            const cutDuration = cut.keep_end - cut.keep_start
            if (firstAppear >= cut.keep_start && firstAppear <= cut.keep_end) {
              relativeStart = cutOffset + (firstAppear - cut.keep_start)
              break
            }
            cutOffset += cutDuration
          }

          const endTime = relativeStart + displayDur
          dialogueLines.push(
            `Dialogue: 0,${formatAssTime(relativeStart)},${formatAssTime(endTime)},LowerThird,,20,20,40,,${name}`
          )
        })

        // Build ASS file for lower thirds (no drawtext needed)
        const ltAss = `\ufeff[Script Info]
Title: Lower Thirds
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: LowerThird,Sans,28,&H00FFFFFF,&H00FFFFFF,&H00000000,&HB07C5CFF,-1,0,0,0,100,100,0,0,3,2,1,1,20,20,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueLines.join('\n')}
`
        const ltAssPath = path.join(uploadsDir, `lt_${timestamp}.ass`)
        fs.writeFileSync(ltAssPath, ltAss, 'utf-8')
        filesToCleanup.push(ltAssPath)

        console.log(`[LOWER THIRDS] ASS file created with ${dialogueLines.length} entries`)

        // Use ASS filter (works without libfreetype/drawtext)
        let ltApplied = false
        // Try subtitles filter first
        try {
          const ltBaseName = path.basename(ltAssPath)
          execSync(
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${path.basename(currentFile)}" -vf "subtitles=${ltBaseName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${path.basename(lowerFile)}" -y`,
            { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
          )
          ltApplied = true
        } catch {
          // Try ass filter
          try {
            const ltBaseName = path.basename(ltAssPath)
            execSync(
              `cd "${uploadsDir}" && "${ffmpegPath}" -i "${path.basename(currentFile)}" -vf "ass=${ltBaseName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${path.basename(lowerFile)}" -y`,
              { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
            )
            ltApplied = true
          } catch (e2: any) {
            console.warn('[PROCESS] ASS lower thirds failed:', e2.stderr?.toString().substring(0, 300))
          }
        }

        if (ltApplied) {
          currentFile = lowerFile
          console.log('[PROCESS] Step 6 done: Speaker names added (ASS)')
        } else {
          console.log('[PROCESS] Step 6: ASS lower thirds failed, skipping')
        }
      } catch (e: any) {
        const stderr = e.stderr?.toString() || ''
        const stdout = e.stdout?.toString() || ''
        console.error(`[PROCESS] Step 6 LOWER THIRDS FAILED:`)
        console.error(`  Command: ${e.cmd?.substring(0, 200)}`)
        console.error(`  stderr: ${stderr.substring(0, 500)}`)
        console.error(`  stdout: ${stdout.substring(0, 200)}`)
      }
    } else {
      console.log('[PROCESS] Step 6 skipped: No speakers in plan')
    }

    // ============================================
    // STEP 7: MOTION GRAPHICS OVERLAYS
    // ============================================

    const graphics = videoPlan?.graphics || videoPlan?.overlays || videoPlan?.text_overlays || []
    if (graphics.length > 0) {
      const gfxFile = path.join(uploadsDir, `gfx_${timestamp}.mp4`)
      filesToCleanup.push(gfxFile)
      console.log('[PROCESS] Step 7: Adding motion graphics overlays...')

      try {
        // Map graphics to cut video time and build ASS dialogue lines
        const gfxDialogueLines: string[] = []
        graphics.forEach((g: any) => {
          const text = g.text || ''
          const atTime = g.at_time ?? g.atTime ?? 0
          const duration = g.duration ?? 3

          // Calculate relative position in cut video
          let relativeStart = 0
          let cutOffset = 0
          for (const cut of cuts) {
            const cutDuration = cut.keep_end - cut.keep_start
            if (atTime >= cut.keep_start && atTime <= cut.keep_end) {
              relativeStart = cutOffset + (atTime - cut.keep_start)
              break
            }
            cutOffset += cutDuration
          }

          const endTime = relativeStart + duration
          // Use ASS \move tag for slide-in from right (RTL friendly)
          gfxDialogueLines.push(
            `Dialogue: 0,${formatAssTime(relativeStart)},${formatAssTime(endTime)},GraphicOverlay,,0,0,0,,{\\move(1920,162,1500,162)}${text}`
          )
        })

        // Build ASS file for graphics (no drawtext needed)
        const gfxAss = `\ufeff[Script Info]
Title: Motion Graphics
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: GraphicOverlay,Sans,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&HCC7C5CFF,-1,0,0,0,100,100,0,0,3,2,1,7,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${gfxDialogueLines.join('\n')}
`
        const gfxAssPath = path.join(uploadsDir, `gfx_${timestamp}.ass`)
        fs.writeFileSync(gfxAssPath, gfxAss, 'utf-8')
        filesToCleanup.push(gfxAssPath)

        console.log(`[GRAPHICS] ASS file created with ${gfxDialogueLines.length} entries`)

        // Use ASS filter (works without libfreetype/drawtext)
        let gfxApplied = false
        // Try subtitles filter first
        try {
          const gfxBaseName = path.basename(gfxAssPath)
          execSync(
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${path.basename(currentFile)}" -vf "subtitles=${gfxBaseName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${path.basename(gfxFile)}" -y`,
            { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
          )
          gfxApplied = true
        } catch {
          // Try ass filter
          try {
            const gfxBaseName = path.basename(gfxAssPath)
            execSync(
              `cd "${uploadsDir}" && "${ffmpegPath}" -i "${path.basename(currentFile)}" -vf "ass=${gfxBaseName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${path.basename(gfxFile)}" -y`,
              { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
            )
            gfxApplied = true
          } catch (e2: any) {
            console.warn('[PROCESS] ASS graphics failed:', e2.stderr?.toString().substring(0, 300))
          }
        }

        if (gfxApplied) {
          currentFile = gfxFile
          console.log('[PROCESS] Step 7 done: Graphics overlays added (ASS)')
        } else {
          console.log('[PROCESS] Step 7: ASS graphics failed, skipping')
        }
      } catch (e: any) {
        const stderr = e.stderr?.toString() || ''
        const stdout = e.stdout?.toString() || ''
        console.error(`[PROCESS] Step 7 GRAPHICS FAILED:`)
        console.error(`  Command: ${e.cmd?.substring(0, 200)}`)
        console.error(`  stderr: ${stderr.substring(0, 500)}`)
        console.error(`  stdout: ${stdout.substring(0, 200)}`)
      }
    } else {
      console.log('[PROCESS] Step 7 skipped: No graphics in plan')
    }

    // ============================================
    // STEP 8: EXPORT FOR EACH PLATFORM (SMART FRAMING)
    // ============================================

    // If skipPlatformExport, return the single edited file without platform variants (for A/B preview)
    if (skipPlatformExport) {
      console.log('[PROCESS] Skipping platform export (A/B preview mode)')
      const fileSize = fs.statSync(currentFile).size / (1024 * 1024)
      return res.json({
        success: true,
        files: [{
          url: `http://localhost:${PORT}/uploads/${path.basename(currentFile)}`,
          platform: 'original',
          ratio: '16:9',
          resolution: '1920x1080',
          filename: path.basename(currentFile),
          sizeMB: parseFloat(fileSize.toFixed(1)),
        }],
        plan: req.body,
        message: 'עריכה הושלמה (ללא ייצוא לפלטפורמות)',
      })
    }

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

    const framingStrategy = videoPlan?.framing_strategy || videoPlan?.framingStrategy || 'blur_background'
    const targetPlatforms = platforms || ['tiktok']

    // Group platforms by aspect ratio to avoid re-encoding same ratio
    const ratioGroups: Record<string, string[]> = {}
    for (const platform of targetPlatforms) {
      const spec = platformSpecs[platform]
      if (!spec) continue
      if (!ratioGroups[spec.ratio]) ratioGroups[spec.ratio] = []
      ratioGroups[spec.ratio].push(platform)
    }

    console.log(`[PROCESS] Step 8: Exporting for ${targetPlatforms.length} platforms with ${framingStrategy} framing...`)

    for (const [ratio, platformList] of Object.entries(ratioGroups)) {
      const spec = platformSpecs[platformList[0]]
      const ratioFile = path.join(uploadsDir, `export_${ratio.replace(':', 'x')}_${timestamp}.mp4`)
      filesToCleanup.push(ratioFile)

      console.log(`[PROCESS] Exporting ${ratio} for ${platformList.join(', ')}...`)

      const isVertical = spec.h > spec.w

      if (isVertical && framingStrategy === 'blur_background') {
        // Blurred background + centered foreground for vertical exports
        try {
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -filter_complex "[0:v]scale=${spec.w}:${spec.h}:force_original_aspect_ratio=decrease[fg];[0:v]scale=${spec.w}:${spec.h},boxblur=20:20[bg];[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]" -map "[outv]" -map 0:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${ratioFile}" -y`,
            { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
        } catch (e: any) {
          console.log('[PROCESS] Blur background failed, falling back to pad:', e.message?.slice(0, 100))
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -vf "scale=${spec.w}:${spec.h}:force_original_aspect_ratio=decrease,pad=${spec.w}:${spec.h}:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${ratioFile}" -y`,
            { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
        }
      } else if (isVertical && framingStrategy === 'crop_center') {
        // Center crop for vertical
        const cropFilter = buildSmartFramingFilter(1920, 1080, spec.w, spec.h, 'crop_center')
        execSync(
          `"${ffmpegPath}" -i "${currentFile}" -vf "${cropFilter}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${ratioFile}" -y`,
          { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
        )
      } else {
        // Standard scale+pad for 16:9 or 1:1
        const vf = `scale=${spec.w}:${spec.h}:force_original_aspect_ratio=decrease,pad=${spec.w}:${spec.h}:(ow-iw)/2:(oh-ih)/2:black`
        execSync(
          `"${ffmpegPath}" -i "${currentFile}" -vf "${vf}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${ratioFile}" -y`,
          { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
        )
      }

      // Copy the same file for each platform with same ratio
      for (const platform of platformList) {
        const platformFile = path.join(uploadsDir, `final_${platform}_${timestamp}.mp4`)
        fs.copyFileSync(ratioFile, platformFile)

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
    }

    // Cleanup intermediate files
    for (const f of filesToCleanup) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }

    console.log('[PROCESS] Done! Created', outputFiles.length, 'files with professional effects')

    res.json({
      success: true,
      files: outputFiles,
      message: `נוצרו ${outputFiles.length} קבצים מקצועיים`,
    })
  } catch (error: any) {
    // Cleanup on error
    for (const f of filesToCleanup) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }
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

// Export with animated subtitles burned in (main editor)
app.post('/api/export/burn-subtitles', async (req, res) => {
  const filesToCleanup: string[] = []
  try {
    const { videoUrl, captions, animationStyle = 'karaoke', format = 'mp4-1080' } = req.body
    if (!videoUrl || !captions?.length) {
      return res.status(400).json({ message: 'חסר URL של הסרטון או כתוביות' })
    }

    const ffmpegPath = getFFmpeg()
    const timestamp = Date.now()

    // Resolve input file
    let inputPath: string
    if (videoUrl.includes('localhost')) {
      const urlPath = new URL(videoUrl, `http://localhost:${PORT}`).pathname
      inputPath = path.join(uploadsDir, path.basename(urlPath))
    } else if (videoUrl.startsWith('/uploads/')) {
      inputPath = path.join(uploadsDir, path.basename(videoUrl))
    } else {
      return res.status(400).json({ message: 'URL לא חוקי' })
    }

    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ message: 'קובץ לא נמצא' })
    }

    // Build subtitles in format expected by buildAnimatedASS
    const subs = captions.map((c: any) => ({
      start: c.startTime || c.start || 0,
      end: c.endTime || c.end || 0,
      text: c.text || '',
    }))

    // For main editor export, cuts = entire video as one cut
    const totalDur = subs.length > 0 ? Math.max(...subs.map((s: any) => s.end)) + 1 : 300
    const fakeCuts = [{ keep_start: 0, keep_end: totalDur }]

    const assContent = buildAnimatedASS(subs, animationStyle, fakeCuts)
    const assPath = path.join(uploadsDir, `export_subs_${timestamp}.ass`)
    fs.writeFileSync(assPath, assContent, 'utf-8')
    filesToCleanup.push(assPath)

    const scaleMap: Record<string, string> = {
      'mp4-720': 'scale=-2:720',
      'mp4-1080': 'scale=-2:1080',
      'mp4-4k': 'scale=-2:2160',
    }
    const scale = scaleMap[format] || 'scale=-2:1080'

    const outputPath = path.join(uploadsDir, `export_animated_${timestamp}.mp4`)
    filesToCleanup.push(outputPath)

    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")
    execSync(
      `"${ffmpegPath}" -i "${inputPath}" -vf "subtitles='${escapedAss}',${scale}" -c:v libx264 -preset fast -crf 23 -c:a aac "${outputPath}" -y`,
      { timeout: 600000, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    const outputFilename = path.basename(outputPath)
    console.log(`[EXPORT] Animated subtitles burned: ${outputFilename}`)

    // Don't cleanup the output
    filesToCleanup.pop()

    res.json({
      url: `http://localhost:${PORT}/uploads/${outputFilename}`,
      filename: outputFilename,
    })
  } catch (err: any) {
    console.error('[EXPORT BURN-SUBS ERROR]', err.message)
    res.status(500).json({ message: 'שגיאת ייצוא: ' + err.message })
  } finally {
    filesToCleanup.forEach(f => { try { fs.unlinkSync(f) } catch {} })
  }
})

// ==================== DETACH AUDIO ====================

app.post('/api/detach-audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'לא התקבל קובץ וידאו' })

    const ffmpegPath = getFFmpeg()
    const inputPath = req.file.path
    const audioPath = path.join(uploadsDir, `audio-${Date.now()}.mp3`)

    console.log('[DETACH AUDIO] Extracting audio from:', req.file.originalname)

    execSync(
      `"${ffmpegPath}" -i "${inputPath}" -vn -acodec libmp3lame -ab 192k -ar 44100 "${audioPath}" -y`,
      { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    // Cleanup original file
    try { fs.unlinkSync(inputPath) } catch {}

    const audioFilename = path.basename(audioPath)
    console.log('[DETACH AUDIO] Success:', audioFilename)

    res.json({
      audioUrl: `/api/audio/${audioFilename}`,
      filename: audioFilename,
    })
  } catch (error: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path) } catch {}
    }
    console.error('[DETACH AUDIO ERROR]', error.message)
    res.status(500).json({ message: 'שגיאה בהפרדת האודיו: ' + error.message })
  }
})

// ============================================
// SOCIAL LEARNING AGENT (SERVER-SIDE)
// ============================================

import { google } from 'googleapis'

const LEARNING_STATE_FILE = path.join(__dirname, 'learning-state.json')

function loadLearningState(): any {
  try {
    if (fs.existsSync(LEARNING_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(LEARNING_STATE_FILE, 'utf-8'))
    }
  } catch {}
  return {
    lastLearnDate: 0,
    totalVideosAnalyzed: 0,
    learnedPatterns: {},
    missingFeatures: [],
    dailyYoutubeUnits: 0,
    dailyGptCalls: 0,
    dailyDate: '',
    monthlyGptCost: 0,
    monthlyDate: '',
  }
}

function saveLearningState(state: any) {
  try {
    fs.writeFileSync(LEARNING_STATE_FILE, JSON.stringify(state, null, 2))
  } catch (e: any) {
    console.error('[LEARN] Failed to save state:', e.message)
  }
}

async function sendTelegram(message: string) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (!token || !chatId) return

    const chunks: string[] = []
    let remaining = message
    while (remaining.length > 0) {
      chunks.push(remaining.substring(0, 4000))
      remaining = remaining.substring(4000)
    }

    for (const chunk of chunks) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'HTML' }),
        })
      } catch {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunk }),
        })
      }
    }
  } catch (e: any) {
    console.error('[TELEGRAM]', e.message)
  }
}

function hasLearnedToday(): boolean {
  try {
    const state = loadLearningState()
    if (!state.lastLearnDate) return false

    // Compare dates in Israel timezone
    const lastLearn = new Date(state.lastLearnDate)
    const todayIsrael = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) // YYYY-MM-DD
    const lastLearnIsrael = lastLearn.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })

    return todayIsrael === lastLearnIsrael
  } catch {
    return false
  }
}

async function sendLearningReport(state: any, results: any) {
  const now = new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })

  let message = `📚 דוח למידה יומי - ${now}\n`
  message += `${'─'.repeat(30)}\n\n`

  // Categories learned
  const categoryEntries = Object.entries(results.categories || {})
  if (categoryEntries.length > 0) {
    message += `🏷️ קטגוריות:\n`
    categoryEntries.forEach(([cat, data]: [string, any]) => {
      message += `  ✅ ${cat}: ${data.videosAnalyzed || 0} סרטונים → ${data.rulesLearned || 0} כללים\n`
    })
    message += '\n'
  }

  // All learned rules
  const allRules: string[] = []
  Object.entries(state.learnedPatterns || {}).forEach(([_cat, p]: [string, any]) => {
    ;(p.editing_rules || []).forEach((r: any) => {
      allRules.push(`${Math.round(r.confidence * 100)}% ${r.rule}`)
    })
  })
  if (allRules.length > 0) {
    message += `📏 כללים שנלמדו (${allRules.length}):\n`
    allRules.forEach((r, i) => {
      message += `  ${i + 1}. ${r}\n`
    })
    message += '\n'
  }

  // Subtitle animation insights
  const subPatterns = state.learnedPatterns?.subtitles?.patterns?.subtitles?.animation_insights ||
                      state.learnedPatterns?.animated_captions?.patterns?.subtitles?.animation_insights
  if (subPatterns) {
    message += `💬 תובנות כתוביות:\n`
    message += `  סגנון פופולרי: ${subPatterns.most_popular_animation || '?'}\n`
    message += `  צבע הדגשה: ${subPatterns.most_popular_highlight_color || '?'}\n`
    message += `  מילה-מילה: ${subPatterns.word_by_word_percentage || '?'}%\n`
    message += `  גודל: ${subPatterns.best_font_size || '?'}\n\n`
  }

  // Missing features
  if (state.missingFeatures?.length > 0) {
    message += `⚠️ פיצ'רים חסרים (${state.missingFeatures.length}):\n`
    const pEmoji: Record<string, string> = { critical: '🔴', important: '🟡', high: '🔴', medium: '🟡', nice_to_have: '🟢', low: '🟢' }
    state.missingFeatures.forEach((f: any) => {
      const emoji = pEmoji[f.priority] || '⚪'
      message += `  ${emoji} ${f.name}: ${f.description || ''}\n`
    })
    message += '\n'
  }

  // Errors
  if (results.errors?.length > 0) {
    message += `❌ שגיאות: ${results.errors.join(', ')}\n\n`
  }

  // Costs
  message += `💰 עלויות:\n`
  message += `  YouTube API: ${state.dailyYoutubeUnits || 0} / 5,000 יחידות\n`
  message += `  GPT calls: ${state.dailyGptCalls || 0} / 15\n`
  message += `  עלות היום: $${(results.totalCost || 0).toFixed(2)}\n`
  message += `  עלות החודש: $${(state.monthlyGptCost || 0).toFixed(2)} / $5.00\n`
  message += `  סה"כ סרטונים: ${state.totalVideosAnalyzed || 0}\n`

  message += `\n${'─'.repeat(30)}\n`
  message += `✅ הלמידה הבאה: מחר ב-07:00`

  await sendTelegram(message)
}

async function runServerLearning() {
  const state = loadLearningState()
  const todayIsrael = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const thisMonth = todayIsrael.substring(0, 7)

  // Reset daily counters if new day (Israel timezone)
  if (state.dailyDate !== todayIsrael) {
    state.dailyYoutubeUnits = 0
    state.dailyGptCalls = 0
    state.dailyDate = todayIsrael
  }

  // Reset monthly cost if new month
  if (state.monthlyDate !== thisMonth) {
    state.monthlyGptCost = 0
    state.monthlyDate = thisMonth
  }

  // Check: already learned today? (Israel timezone)
  if (hasLearnedToday()) {
    console.log('[LEARN] Already learned today (Israel time), skipping')
    return
  }

  // Check monthly cost
  if (state.monthlyGptCost >= 5) {
    console.log('[LEARN] Monthly $5 limit reached, skipping')
    return
  }

  console.log('[LEARN] Starting daily learning session...')

  const allCategories = ['viral_editing', 'hooks', 'pacing', 'subtitles', 'broll', 'marketing', 'transitions', 'color_grading', 'animated_captions']
  const dayNumber = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  const startIndex = (dayNumber * 3) % allCategories.length
  const todayCategories: string[] = []
  for (let i = 0; i < 3; i++) {
    todayCategories.push(allCategories[(startIndex + i) % allCategories.length])
  }

  console.log('[LEARN] Categories today:', todayCategories)

  const ai = await getOpenAI()
  if (!ai) {
    console.log('[LEARN] OpenAI not configured, skipping')
    return
  }

  if (!process.env.YOUTUBE_API_KEY) {
    console.log('[LEARN] YouTube API not configured, skipping')
    return
  }
  const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY })

  const results: any = { categories: {}, errors: [], totalCost: 0 }

  for (const category of todayCategories) {
    // Check limits before each category
    if (state.dailyYoutubeUnits >= 5000 || state.dailyGptCalls >= 15) {
      console.log('[LEARN] Daily limit reached, stopping')
      break
    }

    try {
      // --- STEP 1: Search YouTube (100 units) ---
      const searchQueries: Record<string, string> = {
        'viral_editing': 'viral video editing techniques 2026',
        'hooks': 'best video hooks first 3 seconds',
        'transitions': 'creative video transitions trending',
        'subtitles': 'best subtitle styles social media viral',
        'pacing': 'fast cut editing rhythm viral',
        'broll': 'B-Roll techniques effective videos',
        'color_grading': 'cinematic color grading social media',
        'marketing': 'best product video ads viral 2026',
        'animated_captions': 'animated captions trending style TikTok Reels viral word by word 2026',
      }

      const searchRes = await youtube.search.list({
        part: ['snippet'],
        q: searchQueries[category] || 'viral video editing',
        type: ['video'],
        order: 'viewCount',
        maxResults: 5,
        relevanceLanguage: 'en',
        publishedAfter: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      })
      state.dailyYoutubeUnits += 100

      const videoIds = (searchRes.data.items || []).map((item: any) => item.id?.videoId).filter(Boolean)
      if (videoIds.length === 0) continue

      // --- STEP 2: Get video details (1 unit per video) ---
      const statsRes = await youtube.videos.list({
        part: ['statistics', 'contentDetails', 'snippet'],
        id: videoIds,
      })
      state.dailyYoutubeUnits += videoIds.length

      const videos = (statsRes.data.items || [])
        .map((video: any) => ({
          id: video.id,
          title: video.snippet?.title,
          views: parseInt(video.statistics?.viewCount || '0'),
          likes: parseInt(video.statistics?.likeCount || '0'),
          tags: video.snippet?.tags?.slice(0, 10) || [],
        }))
        .filter((v: any) => v.views >= 10000)
        .sort((a: any, b: any) => b.likes - a.likes)

      if (videos.length === 0) continue

      // --- STEP 3: Analyze top 2 videos with Vision ---
      const ytdlpPath = fs.existsSync('/opt/homebrew/bin/yt-dlp')
        ? '/opt/homebrew/bin/yt-dlp'
        : fs.existsSync('/usr/local/bin/yt-dlp')
          ? '/usr/local/bin/yt-dlp'
          : 'yt-dlp'
      const ffmpegPath = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg'
      const analyses: any[] = []

      // Check if yt-dlp is available before attempting video analysis
      let ytdlpAvailable = true
      try {
        execSync(`which yt-dlp || "${ytdlpPath}" --version`, { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch {
        console.warn('[LEARN] yt-dlp not installed. Skipping visual analysis. Install with: brew install yt-dlp')
        ytdlpAvailable = false
      }

      if (!ytdlpAvailable) {
        // Skip video analysis, go straight to synthesis with metadata only
        if (state.dailyGptCalls < 15) {
          const synthRes = await ai.chat.completions.create({
            model: 'gpt-5.4',
            messages: [
              { role: 'system', content: 'נתח patterns מסרטונים ויראליים על בסיס מטא-דאטה בלבד (ללא ניתוח ויזואלי). החזר JSON: {"editing_rules":[{"rule":"כלל בעברית","applies_to":"all/social/marketing","confidence":0.7}],"sop_update":"SOP מעודכן","patterns":{"hook":{"avg_seconds":2,"rule":"כלל"},"pacing":{"avg_cuts":12,"rule":"כלל"},"subtitles":{"style":"classic","rule":"כלל","animation_insights":{"most_popular_animation":"karaoke","most_popular_highlight_color":"yellow","word_by_word_percentage":80,"avg_words_per_frame":3,"best_font_size":"large","background_style":"black_box","position":"center","rule":"כלל על כתוביות"}}}}' },
              { role: 'user', content: `קטגוריה: ${category}\nסרטונים (מטא-דאטה בלבד):\n${videos.slice(0, 5).map((v: any) => `- "${v.title}" (${v.views} צפיות, ${v.likes} לייקים, תגיות: ${v.tags?.join(', ')})`).join('\n')}` }
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: 1000,
          })
          state.dailyGptCalls++
          state.monthlyGptCost += 0.01
          results.totalCost += 0.01
          try {
            const synthesis = JSON.parse(synthRes.choices[0]?.message?.content || '{}')
            if (synthesis.editing_rules) {
              results.rulesLearned += synthesis.editing_rules.length
              results.categories.push(category)
            }
          } catch {}
        }
        continue
      }

      for (const video of videos.slice(0, 2)) {
        if (state.dailyGptCalls >= 15) break

        const tmpDir = path.join(__dirname, 'uploads', `viral_${Date.now()}`)
        try {
          fs.mkdirSync(tmpDir, { recursive: true })
          const videoPath = path.join(tmpDir, 'video.mp4')
          const framesDir = path.join(tmpDir, 'frames')
          fs.mkdirSync(framesDir, { recursive: true })

          // Download first 60 sec, lowest quality
          try {
            execSync(`"${ytdlpPath}" --format "worst[ext=mp4]" --download-sections "*0:00-1:00" --max-filesize 15M -o "${videoPath}" "https://www.youtube.com/watch?v=${video.id}"`, { timeout: 45000, stdio: ['pipe', 'pipe', 'pipe'] })
          } catch {
            execSync(`"${ytdlpPath}" --format "worst[ext=mp4]" --max-filesize 10M -o "${videoPath}" "https://www.youtube.com/watch?v=${video.id}"`, { timeout: 45000, stdio: ['pipe', 'pipe', 'pipe'] })
          }

          if (!fs.existsSync(videoPath)) continue

          // Extract frames every 5 sec, low res
          execSync(`"${ffmpegPath}" -i "${videoPath}" -vf "fps=1/5,scale=320:-1" -q:v 8 "${framesDir}/frame_%04d.jpg" -y`, { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] })

          const frameFiles = fs.readdirSync(framesDir).filter((f: string) => f.endsWith('.jpg')).sort().slice(0, 10)
          const frameImages = frameFiles.map((file: string) => ({
            base64: fs.readFileSync(path.join(framesDir, file)).toString('base64'),
          }))

          // GPT Vision analysis
          const analysisRes = await ai.chat.completions.create({
            model: 'gpt-5.4',
            messages: [
              { role: 'system', content: 'נתח סרטון ויראלי. החזר JSON בלבד: {"hook_seconds":1.5,"hook_type":"text/question/visual","cuts_per_minute":15,"avg_clip_sec":2.5,"subtitle_style":"classic/karaoke/animated","subtitle_position":"center/bottom","subtitle_animation":{"type":"none/karaoke/pop/typewriter/glow/bounce/slide","word_by_word":true,"highlight_color":"yellow/white/purple","background":"none/black_box/blur","font_size":"small/medium/large/extra_large","words_per_frame":3,"animation_speed":"slow/medium/fast"},"broll_percent":35,"color_tone":"warm/cold/vibrant","special":["zoom","emoji"],"virality_reasons":["reason1"],"lessons":["lesson1"]}' },
              { role: 'user', content: [
                { type: 'text' as const, text: `"${video.title}" | ${category} | ${frameImages.length} frames:` },
                ...frameImages.map((f: any) => ({
                  type: 'image_url' as const,
                  image_url: { url: `data:image/jpeg;base64,${f.base64}`, detail: 'low' as const }
                }))
              ]}
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: 1000,
          })

          const analysis = JSON.parse(analysisRes.choices[0]?.message?.content || '{}')
          analyses.push(analysis)
          state.dailyGptCalls++
          state.monthlyGptCost += 0.02
          results.totalCost += 0.02
          state.totalVideosAnalyzed++
        } catch (e: any) {
          console.warn(`[LEARN] Video analysis failed: ${e.message}`)
        } finally {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
        }
      }

      if (analyses.length === 0) continue

      // --- STEP 4: Synthesize patterns (1 GPT call) ---
      if (state.dailyGptCalls < 15) {
        const synthRes = await ai.chat.completions.create({
          model: 'gpt-5.4',
          messages: [
            { role: 'system', content: 'נתח patterns מסרטונים ויראליים. החזר JSON: {"editing_rules":[{"rule":"כלל בעברית","applies_to":"all/social/marketing","confidence":0.9}],"sop_update":"SOP מעודכן","patterns":{"hook":{"avg_seconds":1.5,"rule":"כלל"},"pacing":{"avg_cuts":15,"rule":"כלל"},"subtitles":{"style":"karaoke","rule":"כלל","animation_insights":{"most_popular_animation":"karaoke","most_popular_highlight_color":"yellow","word_by_word_percentage":85,"avg_words_per_frame":3,"best_font_size":"large","background_style":"black_box","position":"center","rule":"כלל על כתוביות"}}}}' },
            { role: 'user', content: `${analyses.length} ניתוחים ל-"${category}":\n${JSON.stringify(analyses).substring(0, 6000)}` }
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 1500,
        })

        const patterns = JSON.parse(synthRes.choices[0]?.message?.content || '{}')
        state.learnedPatterns[category] = { ...patterns, learnedAt: Date.now() }
        state.dailyGptCalls++
        state.monthlyGptCost += 0.02
        results.totalCost += 0.02

        results.categories[category] = {
          videosAnalyzed: analyses.length,
          rulesLearned: patterns.editing_rules?.length || 0,
        }
      }

    } catch (e: any) {
      results.errors.push(`${category}: ${e.message}`)
    }
  }

  // --- STEP 5: Detect missing features (1 GPT call) ---
  if (state.dailyGptCalls < 15 && Object.keys(state.learnedPatterns).length > 0) {
    try {
      const currentFeatures = 'trim,split,speed,reverse,filters,crop,resize,subtitles,karaoke,animated_subtitles,word_by_word_captions,tts,voice_clone,clean_audio,ducking,auto_transcribe,filler_removal,silence_removal,ai_chat,auto_editor,broll_generation,multi_platform_export'

      const missingRes = await ai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: 'השווה בין מה שנלמד מסרטונים ויראליים לפיצ\'רים קיימים. מצא כלים חסרים (מקסימום 8). החזר JSON: {"missing_features":[{"name":"שם","description":"מה","why_important":"למה","viral_evidence":"בX%","difficulty":"easy/medium/hard","needs_new_api":false,"suggested_api":"FFmpeg/CSS","priority":"critical/important/nice_to_have"}],"summary":"סיכום","biggest_gap":"הפער"}' },
          { role: 'user', content: `נלמד:\n${JSON.stringify(state.learnedPatterns).substring(0, 6000)}\n\nקיים: ${currentFeatures}` }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 1500,
      })

      const missing = JSON.parse(missingRes.choices[0]?.message?.content || '{}')
      state.missingFeatures = missing.missing_features || []
      state.dailyGptCalls++
      state.monthlyGptCost += 0.02
      results.totalCost += 0.02
      results.missingFeatures = state.missingFeatures.length

      // Send Telegram: Missing features
      if (state.missingFeatures.length > 0 && process.env.TELEGRAM_BOT_TOKEN) {
        const pEmoji: Record<string, string> = { critical: '🔴', important: '🟡', nice_to_have: '🟢' }
        let msg = `🔧 <b>כלים חסרים (${state.missingFeatures.length})</b>\n\n`
        msg += `📊 ${missing.summary || ''}\n⚠️ ${missing.biggest_gap || ''}\n\n`
        state.missingFeatures.forEach((f: any, i: number) => {
          msg += `${pEmoji[f.priority] || '⚪'} <b>${i + 1}. ${f.name}</b>\n`
          msg += `   ${f.description}\n   📈 ${f.viral_evidence}\n`
          msg += `   ${f.needs_new_api ? '🔌 ' + f.suggested_api : '✅ אפשרי'} | ${f.difficulty}\n\n`
        })
        await sendTelegram(msg)
      }
    } catch (e: any) {
      console.warn('[LEARN] Missing features failed:', e.message)
    }
  }

  // --- STEP 6: Save state ---
  state.lastLearnDate = Date.now()
  state.lastLearnDateIsrael = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  saveLearningState(state)

  // --- STEP 7: Send comprehensive Telegram report ---
  await sendLearningReport(state, results)

  console.log('[LEARN] Daily learning complete, saved state')
}

// ENDPOINT: Get learned rules (called by frontend auto-editor silently)
app.get('/api/learning/rules', (_req, res) => {
  const state = loadLearningState()
  const rules: string[] = []
  let subtitleRules = ''

  Object.values(state.learnedPatterns || {}).forEach((pattern: any) => {
    ;(pattern.editing_rules || []).forEach((rule: any) => {
      if (rule.confidence >= 0.6) {
        rules.push(`- ${rule.rule} (${Math.round(rule.confidence * 100)}%)`)
      }
    })

    // Extract subtitle animation insights
    const subInsights = pattern.patterns?.subtitles?.animation_insights
    if (subInsights) {
      subtitleRules += `\nכתוביות מונפשות - מה עובד:`
      subtitleRules += `\n- סגנון פופולרי: ${subInsights.most_popular_animation || 'karaoke'}`
      subtitleRules += `\n- צבע הדגשה: ${subInsights.most_popular_highlight_color || 'yellow'}`
      subtitleRules += `\n- מילה-מילה: ${subInsights.word_by_word_percentage || 0}% מהסרטונים`
      subtitleRules += `\n- גודל פונט: ${subInsights.best_font_size || 'large'}`
      subtitleRules += `\n- רקע: ${subInsights.background_style || 'black_box'}`
      if (subInsights.rule) subtitleRules += `\n- כלל: ${subInsights.rule}`
    }
  })

  // Find the best subtitle recommendation across all patterns
  let subtitleRecommendation: { style: string; highlightColor: string } | null = null
  const subPatterns = state.learnedPatterns?.subtitles?.patterns?.subtitles?.animation_insights ||
                      state.learnedPatterns?.animated_captions?.patterns?.subtitles?.animation_insights
  if (subPatterns) {
    subtitleRecommendation = {
      style: subPatterns.most_popular_animation || 'karaoke',
      highlightColor: subPatterns.most_popular_highlight_color || 'yellow',
    }
  }

  const allRules = rules.length > 0
    ? `\n=== כללים שנלמדו מסרטונים ויראליים ===\n${rules.join('\n')}${subtitleRules}\n===`
    : ''

  res.json({
    rules: allRules,
    subtitleRecommendation,
    totalVideos: state.totalVideosAnalyzed || 0,
    totalRules: rules.length,
    lastLearned: state.lastLearnDate || 0,
  })
})

// ==================== DAILY LEARNING SCHEDULER ====================

function scheduleDailyLearning() {
  const ISRAEL_TIMEZONE = 'Asia/Jerusalem'
  const TARGET_HOUR = 7 // 7:00 AM Israel time
  const TARGET_MINUTE = 0

  function getNextRunTime(): number {
    const now = new Date()

    // Get current time in Israel
    const israelNowStr = now.toLocaleString('en-US', { timeZone: ISRAEL_TIMEZONE })
    const israelNow = new Date(israelNowStr)

    // Create target time for today at 7:00 AM Israel time
    const targetToday = new Date(israelNow)
    targetToday.setHours(TARGET_HOUR, TARGET_MINUTE, 0, 0)

    // If 7:00 AM already passed today, schedule for tomorrow
    if (israelNow >= targetToday) {
      targetToday.setDate(targetToday.getDate() + 1)
    }

    const msUntilTarget = targetToday.getTime() - israelNow.getTime()
    return msUntilTarget > 0 ? msUntilTarget : msUntilTarget + 24 * 60 * 60 * 1000
  }

  function scheduleNext() {
    const msUntilRun = getNextRunTime()
    const hoursUntil = (msUntilRun / (1000 * 60 * 60)).toFixed(1)

    const nextRunIsrael = new Date(Date.now() + msUntilRun)
      .toLocaleString('he-IL', { timeZone: ISRAEL_TIMEZONE, hour: '2-digit', minute: '2-digit' })

    console.log(`[LEARN] Next learning session scheduled in ${hoursUntil} hours (${nextRunIsrael} Israel time)`)

    setTimeout(async () => {
      console.log('[LEARN] Starting daily learning session (scheduled)...')
      try {
        await runServerLearning()
      } catch (err: any) {
        console.error('[LEARN] Daily learning failed:', err.message)
        // Send error notification to Telegram
        try {
          await sendTelegram(`❌ שגיאה בלמידה יומית:\n${err.message?.substring(0, 500)}`)
        } catch {}
      }
      // Schedule next run (tomorrow at 7:00 AM)
      scheduleNext()
    }, msUntilRun)
  }

  scheduleNext()
}

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 סטודיו AI Server running on port ${PORT}`)
  console.log(`   OpenAI:      ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log('   OpenAI Chat Model: gpt-5.4')
  console.log('   OpenAI Transcribe Model: gpt-4o-transcribe-diarize')
  console.log(`   ElevenLabs:  ${process.env.ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   DeepL:       ${process.env.DEEPL_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Gemini (Nano Banana + Veo): ${process.env.GEMINI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log('   Gemini Image: gemini-3.1-flash-image (Nano Banana 2)')
  console.log('   Gemini Video: veo-3.1-generate (Veo 3.1)')
  console.log(`   Seedance (kie.ai): ${process.env.KIE_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Pixabay:     ${process.env.PIXABAY_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   YouTube API: ${process.env.YOUTUBE_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Telegram:    ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Connected' : '❌ Not configured'}`)

  // Check FFmpeg availability
  console.log('Checking FFmpeg...')
  try {
    const ff = getFFmpeg()
    const ver = execSync(`"${ff}" -version`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().split('\n')[0]
    console.log('FFmpeg OK:', ver)
  } catch {
    console.error('FFmpeg NOT FOUND - transcription will fail!')
  }

  // Social Learning Agent - Daily at 07:00 Israel time
  console.log('[LEARN] Social Learning Agent configured:')
  console.log('[LEARN]   Schedule: Daily at 07:00 Israel time (Asia/Jerusalem)')
  console.log(`[LEARN]   Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Enabled' : '❌ Not configured'}`)
  console.log('[LEARN]   Categories: viral_editing, hooks, pacing, subtitles, broll, marketing, transitions, color_grading, animated_captions')

  // Check if we missed today's run
  console.log('[LEARN] Checking if daily learning was missed...')
  if (!hasLearnedToday()) {
    const israelHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false
    }))

    // If it's past 7 AM Israel time and we haven't learned today, run now
    if (israelHour >= 7) {
      console.log('[LEARN] Missed today\'s 7:00 AM session, running now (30s delay)...')
      setTimeout(() => {
        runServerLearning().catch(e => {
          console.error('[LEARN] Failed:', e.message)
          sendTelegram(`❌ שגיאה בלמידה יומית:\n${e.message?.substring(0, 500)}`).catch(() => {})
        })
      }, 30000)
    } else {
      console.log('[LEARN] Before 7:00 AM Israel time, will wait for scheduled time')
    }
  } else {
    console.log('[LEARN] Already learned today (Israel time)')
  }

  // Schedule daily learning at 7:00 AM Israel time
  scheduleDailyLearning()
})
