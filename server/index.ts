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
// Deepgram is used via REST API directly (more reliable than SDK)

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
    openai = new OpenAI({
      apiKey: (process.env.OPENAI_API_KEY || '').trim(),
      baseURL: 'https://api.openai.com/v1',
      timeout: 60000,
      maxRetries: 3,
    })
  }
  return openai
}

// Helper: detailed OpenAI error logging
function logOpenAIError(context: string, e: any): void {
  const errorDetails = {
    message: e.message?.substring(0, 200),
    code: e.code,
    status: e.status,
    type: e.type,
    cause: e.cause?.message?.substring(0, 100),
  }
  console.error(`[LEARN] ${context}:`, JSON.stringify(errorDetails))
}

// Helper: call OpenAI with retry and exponential backoff
async function callOpenAIWithRetry(ai: any, params: any, maxRetries: number = 2): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.chat.completions.create(params)
      return response
    } catch (e: any) {
      logOpenAIError(`OpenAI attempt ${attempt}/${maxRetries} failed`, e)
      if (attempt < maxRetries) {
        const delay = attempt * 3000
        console.warn(`[LEARN] Retrying in ${delay / 1000}s...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw e
      }
    }
  }
}

// Google Gemini AI
function getGemini() {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  return new GoogleGenAI({ apiKey: key })
}

// Deepgram transcription via REST API (Nova-3 with Hebrew/RTL support)

const app = express()
const PORT = 3001

// Global lock: prevents learning agent from running while auto-editor is processing
let autoEditorBusy = false

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
    // Allow cross-origin access for all files (fixes CORS audio/video loading)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
    } else if (filePath.endsWith('.mov') || filePath.endsWith('.MOV')) {
      res.setHeader('Content-Type', 'video/quicktime');
    } else if (filePath.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    }
  }
}))

// ==================== API STATUS ====================

app.get('/api/status', async (_req, res) => {
  const status = {
    openai: { connected: !!process.env.OPENAI_API_KEY, chatModel: 'gpt-5.4', transcribeModel: 'gpt-4o-transcribe-diarize', features: ['Chat (GPT-5.4)', 'Transcribe (Diarize)', 'DALL-E', 'Whisper'] },
    deepgram: {
      connected: !!process.env.DEEPGRAM_API_KEY,
      model: 'nova-3',
      features: 'multi-language auto-detect, speaker diarization, smart format',
    },
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
  // Try system ffmpeg first (Railway/Linux)
  try {
    const systemPath = execSync('which ffmpeg', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (systemPath) return systemPath
  } catch {}
  // Try homebrew (Mac local dev)
  if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg'
  // Try ffmpeg-static as last resort
  try { return esmRequire('ffmpeg-static') as string } catch {}
  return 'ffmpeg' // Hope it's in PATH
}

// Detect which text overlay filter is available in FFmpeg
function getAvailableTextFilter(ffmpegBin: string): 'subtitles' | 'ass' | 'drawtext' | null {
  try {
    const filters = execSync(`"${ffmpegBin}" -filters 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 })
    if (filters.includes(' subtitles ')) return 'subtitles'
    if (filters.includes(' ass ')) return 'ass'
    if (filters.includes('drawtext')) return 'drawtext'
    return null
  } catch {
    // If we can't check, assume subtitles is available (most common)
    return 'subtitles'
  }
}

// Cache the available text filter on startup
let AVAILABLE_TEXT_FILTER: 'subtitles' | 'ass' | 'drawtext' | null = null
try {
  const ffmpegBin = getFFmpeg()
  AVAILABLE_TEXT_FILTER = getAvailableTextFilter(ffmpegBin)
  console.log(`[FFMPEG] Path: ${ffmpegBin}`)

  // Detailed subtitle support check
  try {
    const filterCheck = execSync(`"${ffmpegBin}" -filters 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 })
    const hasSubtitles = filterCheck.includes(' subtitles ')
    const hasAss = filterCheck.includes(' ass ')
    const hasDrawtext = filterCheck.includes('drawtext')
    console.log(`[FFMPEG] Subtitle support: subtitles=${hasSubtitles} ass=${hasAss} drawtext=${hasDrawtext}`)

    if (!hasSubtitles && !hasAss && !hasDrawtext) {
      console.error('[FFMPEG] ⚠️  NO TEXT FILTER AVAILABLE - subtitles will NOT work!')
      console.error('[FFMPEG] FFmpeg was compiled WITHOUT libass and WITHOUT libfreetype.')
      console.error('[FFMPEG] Fix: Install missing libraries and rebuild FFmpeg:')
      console.error('[FFMPEG]   brew install libass freetype fontconfig harfbuzz fribidi')
      console.error('[FFMPEG]   brew reinstall ffmpeg')
      console.error('[FFMPEG] Or on Linux: apt-get install libass-dev libfreetype6-dev && rebuild ffmpeg')
    }
  } catch { /* filter check failed, continue with detected filter */ }

  console.log(`[FFMPEG] Available text filter: ${AVAILABLE_TEXT_FILTER || 'NONE'}`)
} catch (e: any) {
  console.warn(`[FFMPEG] Could not detect text filter: ${e.message}`)
}

// Helper: Apply subtitle/text overlay file using best available filter
function applySubtitleFilter(
  inputFile: string, subtitleFile: string, outputFile: string,
  ffmpegPath: string, uploadsDir: string
): boolean {
  const ext = path.extname(subtitleFile)
  const simpleName = `subs_${Date.now()}${ext}`
  const simplePath = path.join(uploadsDir, simpleName)
  fs.copyFileSync(subtitleFile, simplePath)

  const inputBase = path.basename(inputFile)
  const outputBase = path.basename(outputFile)

  const approaches: Array<{ name: string; cmd: string }> = []

  // Try subtitles filter (most common, supports ASS/SRT)
  if (AVAILABLE_TEXT_FILTER === 'subtitles' || AVAILABLE_TEXT_FILTER === null) {
    approaches.push({
      name: 'subtitles (relative)',
      cmd: `cd "${uploadsDir}" && "${ffmpegPath}" -i "${inputBase}" -vf "subtitles=${simpleName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputBase}" -y`,
    })
  }

  // Try ass filter
  if (AVAILABLE_TEXT_FILTER === 'ass' || AVAILABLE_TEXT_FILTER === null) {
    approaches.push({
      name: 'ass (relative)',
      cmd: `cd "${uploadsDir}" && "${ffmpegPath}" -i "${inputBase}" -vf "ass=${simpleName}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputBase}" -y`,
    })
  }

  // Try drawtext as last resort
  if (AVAILABLE_TEXT_FILTER === 'drawtext') {
    const escapedPath = simplePath.replace(/\\/g, '/').replace(/:/g, '\\\\:')
    approaches.push({
      name: 'drawtext',
      cmd: `"${ffmpegPath}" -i "${inputFile}" -vf "drawtext=textfile='${escapedPath}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=h-80" -c:a copy "${outputFile}" -y`,
    })
  }

  for (const approach of approaches) {
    try {
      console.log(`[SUBS] Trying: ${approach.name}`)
      execSync(approach.cmd, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 })
      console.log(`[SUBS] Success with: ${approach.name}`)
      try { fs.unlinkSync(simplePath) } catch {}
      return true
    } catch (e: any) {
      console.warn(`[SUBS] ${approach.name} failed:`, e.stderr?.toString().substring(0, 200))
    }
  }

  try { fs.unlinkSync(simplePath) } catch {}
  return false
}

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  console.log('=== TRANSCRIBE HANDLER V2 ===')

  // If Deepgram is configured, use it for better diarization
  if (process.env.DEEPGRAM_API_KEY && req.file) {
    try {
      const inputPath = req.file.path
      const timestamp = Date.now()
      const language = (req.body?.language as string) || 'he'

      console.log(`[TRANSCRIBE] Using Deepgram Nova-3 for: ${req.file.originalname} ${(req.file.size / 1024 / 1024).toFixed(1)}MB (language: ${language})`)

      // Extract audio as MP3
      const mp3Path = inputPath.replace(/\.[^.]+$/, '') + '_audio.mp3'
      const ffmpeg = getFFmpeg()
      try {
        execSync(`"${ffmpeg}" -i "${inputPath}" -vn -c:a libmp3lame -b:a 128k -ar 16000 -ac 1 "${mp3Path}" -y`, {
          timeout: 60000, maxBuffer: 10 * 1024 * 1024,
        })
      } catch {
        // Use original file if extraction fails
      }

      const fileToUpload = fs.existsSync(mp3Path) ? mp3Path : inputPath

      const audioBuffer = fs.readFileSync(fileToUpload)

      const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim()
      if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set')

      console.log(`[TRANSCRIBE] Sending ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to Deepgram REST API...`)

      const langParam = language === 'detect' ? 'detect_language=true' : `language=${language}`
      const dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&${langParam}&smart_format=true&diarize=true&utterances=true&punctuate=true&utterance_split=900`
      console.log(`[TRANSCRIBE] Deepgram URL: ${dgUrl}`)

      const dgResponse = await fetch(dgUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'audio/mp3',
        },
        body: audioBuffer,
      })

      if (!dgResponse.ok) {
        const errorText = await dgResponse.text()
        throw new Error(`Deepgram API ${dgResponse.status}: ${errorText.substring(0, 200)}`)
      }

      const result = await dgResponse.json() as any

      const channel = result.results?.channels?.[0]
      const alternatives = channel?.alternatives?.[0]
      const detectedLanguage = channel?.detected_language || 'unknown'
      const words = alternatives?.words || []
      const utterances = result.results?.utterances || []

      console.log(`[TRANSCRIBE] Deepgram done: ${words.length} words, ${utterances.length} utterances, language: ${detectedLanguage}`)

      // Build segments from utterances
      let rawSegments: any[] = []
      if (utterances.length > 0) {
        rawSegments = utterances.map((utt: any, i: number) => ({
          id: i,
          start: utt.start,
          end: utt.end,
          text: utt.transcript,
          speaker: `דובר ${(utt.speaker || 0) + 1}`,
          words: (utt.words || []).map((w: any) => ({
            word: w.punctuated_word || w.word,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
            speaker: `דובר ${(w.speaker || 0) + 1}`,
          })),
        }))
      } else {
        let currentSegment: any = null
        for (const word of words) {
          const speaker = `דובר ${(word.speaker || 0) + 1}`
          if (!currentSegment || currentSegment.speaker !== speaker || word.start - currentSegment.end > 1.5) {
            if (currentSegment) rawSegments.push(currentSegment)
            currentSegment = {
              id: rawSegments.length,
              start: word.start,
              end: word.end,
              text: word.punctuated_word || word.word,
              speaker,
              words: [{ word: word.punctuated_word || word.word, start: word.start, end: word.end, confidence: word.confidence, speaker }],
            }
          } else {
            currentSegment.end = word.end
            currentSegment.text += ' ' + (word.punctuated_word || word.word)
            currentSegment.words.push({ word: word.punctuated_word || word.word, start: word.start, end: word.end, confidence: word.confidence, speaker })
          }
        }
        if (currentSegment) rawSegments.push(currentSegment)
      }

      // Calculate speaker times and rename to sequential numbers
      const speakerTimes: Record<string, number> = {}
      rawSegments.forEach((seg: any) => {
        speakerTimes[seg.speaker] = (speakerTimes[seg.speaker] || 0) + (seg.end - seg.start)
      })

      const sortedSpeakerEntries = Object.entries(speakerTimes)
        .sort((a, b) => (b[1] as number) - (a[1] as number))

      const speakerRenameMap: Record<string, string> = {}
      sortedSpeakerEntries.forEach(([speaker], i) => {
        speakerRenameMap[speaker] = `דובר ${i + 1}`
      })

      const speakerColors = ['#7C5CFF', '#E94560', '#00D2FF', '#FFD700', '#00FF88', '#FF6B35']
      const segments = rawSegments.map((seg: any) => ({
        ...seg,
        speaker: speakerRenameMap[seg.speaker] || seg.speaker,
        speakerId: sortedSpeakerEntries.findIndex(([s]) => s === seg.speaker) + 1,
      }))

      const speakers = sortedSpeakerEntries.map(([speaker], i) => ({
        id: i + 1,
        name: speakerRenameMap[speaker] || speaker,
        color: speakerColors[i % speakerColors.length],
      }))

      let duration = segments.length > 0 ? Math.max(...segments.map((s: any) => s.end || 0)) : 0
      if (duration === 0 && inputPath) {
        try {
          const ffprobePath = ffmpeg === 'ffmpeg' ? 'ffprobe' : ffmpeg.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
          const probeResult = execSync(
            `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${inputPath}"`,
            { timeout: 30000 }
          ).toString().trim()
          duration = parseFloat(probeResult) || 0
        } catch {}
      }

      console.log('[TRANSCRIBE] Done:', segments.length, 'segments,', speakers.length, 'speakers, model: deepgram-nova-3')
      console.log(`[TRANSCRIBE] Confidence: ${((alternatives?.confidence || 0) * 100).toFixed(1)}%`)

      // Cleanup
      try { fs.unlinkSync(inputPath) } catch {}
      try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path) } catch {}

      return res.json({
        text: alternatives?.transcript || '',
        duration,
        language: detectedLanguage,
        segments,
        speakers,
        model: 'deepgram-nova-3',
        confidence: alternatives?.confidence || 0,
      })
    } catch (deepgramErr: any) {
      console.warn('[TRANSCRIBE] Deepgram failed, falling back to GPT-4o:', deepgramErr.message)
      // Fall through to GPT-4o logic below
    }
  }

  // GPT-4o fallback (original logic)
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
          content: `You are a professional video editor. Analyze this Hebrew transcript and suggest 5-8 B-Roll clips that would enhance the video.

For each B-Roll moment, create a detailed prompt that:
1. DIRECTLY illustrates what the presenter says at that EXACT moment
2. Matches the video's visual style and lighting
3. Is cinematically descriptive (camera angle, movement, lighting, mood)
4. Is in ENGLISH
5. Is 1-2 sentences, very specific

BAD B-Roll prompts:
- "modern office" (too vague)
- "business meeting" (not specific to content)
- "person working on laptop" (generic)

GOOD B-Roll prompts:
- "close-up of hands toggling between 5 browser tabs: CRM, WhatsApp Web, Gmail, Google Sheets, calendar app, screen reflecting on reading glasses, fast-paced tab switching, overhead camera angle, cool blue monitor light on face, documentary style"
- "overwhelmed small business owner at desk, multiple phone screens showing customer messages piling up, stressed expression, warm tungsten lighting, handheld camera slight movement, cinematic shallow depth of field"

For each suggestion provide:
- timestamp: when to show the B-Roll (in seconds)
- prompt: Detailed cinematic English prompt for AI image/video generation (NOT generic)
- what_presenter_says: the exact quote being said at this moment
- duration: how long to show (3-8 seconds)
- position: "fullscreen" or "pip"
- reason: explanation in Hebrew why this B-Roll is needed
- why: how this visual supports what's being said

Return ONLY valid JSON: {"suggestions": [{"timestamp": 5, "prompt": "...", "what_presenter_says": "...", "duration": 5, "position": "fullscreen", "reason": "...", "why": "..."}]}`,
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

    const IMAGE_MODELS: Record<string, string> = {
      'nano-banana': 'gemini-3-pro-image-preview',
      'nano-banana-2': 'gemini-3-pro-image-preview',
      'nano-banana-pro': 'gemini-3-pro-image-preview',
      'background': 'gemini-3-pro-image-preview',   // Deep/Pro - highest quality
      'broll': 'gemini-3-pro-image-preview',          // Also Pro for B-Roll quality
      'quick': 'gemini-3.1-flash-image',              // Flash - only for non-critical images
    }

    const modelId = IMAGE_MODELS[model] || 'gemini-3-pro-image-preview'

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
      'veo-3': 'veo-3.1-generate-preview',
      'veo-3-fast': 'veo-3.1-generate-preview',
      'veo-3.1': 'veo-3.1-generate-preview',
      'veo-3.1-fast': 'veo-3.1-generate-preview',
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
      model: 'gemini-3-pro-image-preview',
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
8. בעיות טכניות (חושך, טשטוש, חיתוך לא טוב)
9. זהה את הפרזנטור הראשי - האדם שמופיע מול המצלמה ומדבר אליה (לא צוות הפקה מאחורי המצלמה)

לכל פריים, גם זהה:
10. ENERGY LEVEL: high/medium/low (מבוסס על מחוות, הבעות פנים, תנועה)
11. BEST MOMENTS: סמן פריימים בהם הדובר הכי אנרגטי/מעניין
12. WEAKEST MOMENTS: סמן פריימים בהם הדובר נראה מוסח/משועמם
13. B-ROLL OPPORTUNITIES: רגעים שבהם הדובר מסתכל הצידה או עוצר (מושלם להכנסת B-Roll)
14. LIGHTING CHANGES: שינויי בהירות משמעותיים בין פריימים`

    const brainContextVisual = getEditorBrainPrompt('visual_analysis')
    console.log(`[AUTO-EDITOR] Visual analysis: brain injected = ${brainContextVisual.length > 0 ? 'YES' : 'NO'} (${brainContextVisual.length} chars)`)
    const visualSystemPrompt = (promptEvolution || baseVisualSystemPrompt) + brainContextVisual

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
      "notable": "משהו בולט - הבעה, מחווה, שינוי",
      "people_visible": 1,
      "person_speaking_to_camera": true,
      "energy_level": "high/medium/low"
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
    ],
    "highlight_reel": [
      {"time": 5, "reason": "הדובר הכי אנרגטי - מחווה חזקה"},
      {"time": 25, "reason": "רגע רגשי - הבעת פנים מרגשת"},
      {"time": 40, "reason": "נקודת שיא - מסתכל ישר למצלמה בביטחון"}
    ]
  },
  "presenter_detection": {
    "presenter_description": "תיאור פיזי של הפרזנטור הראשי (שיער, לבוש, וכו')",
    "presenter_appears_in_frames": [0, 1, 2, 3],
    "presenter_speaking_in_frames": [0, 1, 3],
    "other_people_visible": false,
    "other_people_description": "",
    "confidence": "high",
    "reasoning": "הסבר למה זה הפרזנטור"
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

    // Keep frames for presenter identification (will be cleaned up after processing)
    console.log(`[VISUAL] Keeping ${frameFiles.length} frames in ${framesDir} for presenter identification`)

    // Phase 2: Self-reflection - ask the model to improve its own prompt
    let promptImprovements: string[] = []
    try {
      const reflectionResponse = await ai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'system',
            content: `Based on the visual analysis you just did for THIS SPECIFIC VIDEO, suggest 3 improvements to your analysis prompt.

Focus ONLY on things you MISSED in THIS video:
- Did you miss a scene change at a specific frame?
- Did you fail to notice lighting issues at a specific timestamp?
- Did you miss someone entering/leaving frame?
- Could you better identify the presenter vs crew at specific moments?

Do NOT give generic advice. Reference specific frames and timestamps from THIS video.
BAD example: "בקש לזהות הבעות רגש" (too generic)
GOOD example: "בפריים 5 (25 שניות) לא זיהיתי שהדובר החליף מבט מהמצלמה ללפטופ - זה רגע טוב לB-Roll"

Return exactly 3 suggestions. Each suggestion must be:
- ONE sentence only
- Reference a specific timestamp or frame number from THIS video
- About VIDEO EDITING, not marketing strategy
- Actionable for the next edit of a similar video

חוקים:
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

    res.json({ ...analysis, _promptImprovements: promptImprovements, framesDir, frameCount: frameFiles.length, frameInterval: 5 })

  } catch (error: any) {
    console.error('[VISUAL ERROR]', error.message)
    res.status(500).json({ message: 'שגיאה בניתוח ויזואלי: ' + error.message })
  }
})

// Improved GPT presenter identification with content analysis
async function askGPTForPresenter(transcript: any, visualAnalysis: any, speakerTimes: Record<string, number>): Promise<string> {
  const validSpeakers = Object.keys(speakerTimes).filter(s => s && s !== 'undefined' && s !== 'null')

  if (validSpeakers.length === 0) return 'דובר 1'
  if (validSpeakers.length === 1) return validSpeakers[0]

  const speakerSamples: Record<string, string[]> = {}
  validSpeakers.forEach(speaker => {
    const segs = (transcript.segments || [])
      .filter((s: any) => s.speaker === speaker)
      .slice(0, 5)
    speakerSamples[speaker] = segs.map((s: any) => `[${(s.start || 0).toFixed(1)}s] "${s.text}"`)
  })

  const prompt = `Analyze this video transcript to identify the MAIN PRESENTER.
SPEAKERS:
${validSpeakers.map(s => `${s}: ${Math.round(speakerTimes[s])} seconds of speaking`).join('\n')}
SAMPLE DIALOGUE FOR EACH SPEAKER:
${validSpeakers.map(s => `\n${s}:\n${speakerSamples[s]?.join('\n') || 'no samples'}`).join('\n')}
RULES TO IDENTIFY THE PRESENTER:
1. The PRESENTER delivers the MAIN CONTENT - they explain, teach, sell, or present
2. The PRESENTER speaks in LONG sentences with a clear message
3. An INTERVIEWER/ASSISTANT asks SHORT questions or gives directions like "ספר לי על..." or "מה אתה חושב על..."
4. A PRODUCTION CREW member says things like "מוכן?", "עוד פעם", "יופי"
5. The presenter usually has the MOST content-rich speech (not just the most time)
Look at the CONTENT of what each speaker says:
- Who is EXPLAINING something? → likely presenter
- Who is ASKING questions? → likely interviewer
- Who has SHORT responses? → likely crew
Return ONLY the speaker name (e.g., "דובר 1"). Nothing else.`

  try {
    const ai = await getOpenAI()
    if (!ai) return validSpeakers[0]

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    })

    const result = response.choices[0].message.content?.trim() || ''
    console.log(`[PRESENTER] GPT analysis result: "${result}"`)

    // Extract speaker name
    const match = result.match(/דובר\s*\d+/)
    const identified = match ? match[0] : result

    if (validSpeakers.some(s => matchesSpeaker(s, identified))) {
      return identified
    }

    // Fallback
    console.warn(`[PRESENTER] GPT returned "${result}" which doesn't match any speaker`)
    return validSpeakers[0]
  } catch (e: any) {
    console.error('[PRESENTER] GPT failed:', e.message)
    return validSpeakers[0]
  }
}

// Video frame-based presenter identification
async function identifyPresenterWithVideo(
  transcript: any,
  framesDir: string,
  frameFiles: string[],
  speakerTimes: Record<string, number>
): Promise<{ presenter: string, confidence: 'high' | 'medium' | 'low' }> {

  const validSpeakers = Object.keys(speakerTimes).filter(s => s && s !== 'undefined')

  if (validSpeakers.length <= 1) {
    return { presenter: validSpeakers[0] || 'דובר 1', confidence: 'high' }
  }

  // Pick 6 frames spread across the video
  const selectedFrames: Array<{path: string, timestamp: number}> = []
  const step = Math.max(1, Math.floor(frameFiles.length / 6))

  for (let i = 0; i < frameFiles.length && selectedFrames.length < 6; i += step) {
    const framePath = path.join(framesDir, frameFiles[i])
    if (fs.existsSync(framePath)) {
      selectedFrames.push({
        path: framePath,
        timestamp: i * 5, // frames extracted every 5 seconds
      })
    }
  }

  if (selectedFrames.length === 0) {
    console.log('[PRESENTER-VIDEO] No frames available, falling back to text-only')
    const textResult = await askGPTForPresenter(transcript, null, speakerTimes)
    return { presenter: textResult, confidence: 'low' }
  }

  // For each frame, find which speaker is talking at that timestamp
  const frameContext = selectedFrames.map(frame => {
    const activeSegments = (transcript.segments || []).filter((seg: any) =>
      seg.start <= frame.timestamp && seg.end >= frame.timestamp
    )

    const activeSpeaker = activeSegments[0]?.speaker || 'silence'
    const activeText = activeSegments[0]?.text || ''

    return {
      timestamp: frame.timestamp,
      speaker: activeSpeaker,
      text: activeText,
    }
  })

  // Build GPT Vision request with frames + transcript
  const imageContents = selectedFrames.map((frame, i) => {
    const imageData = fs.readFileSync(frame.path).toString('base64')
    const context = frameContext[i]

    return [
      {
        type: 'text' as const,
        text: `Frame at ${context.timestamp}s - Speaker: "${context.speaker}" saying: "${context.text.substring(0, 80)}"`,
      },
      {
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${imageData}`,
          detail: 'low' as const,
        },
      },
    ]
  }).flat()

  // Speaker samples for context
  const speakerSamplesText = validSpeakers.map(speaker => {
    const segs = (transcript.segments || [])
      .filter((s: any) => s.speaker === speaker)
      .slice(0, 4)
    return `${speaker} (${Math.round(speakerTimes[speaker])}s):\n${segs.map((s: any) => `  [${s.start.toFixed(1)}s] "${(s.text || '').substring(0, 60)}"`).join('\n')}`
  }).join('\n\n')

  const prompt = `You are analyzing a video to identify the MAIN PRESENTER.
I'm showing you 6 frames from the video with timestamps. For each frame, I tell you which speaker the transcription says is talking.
SPEAKERS IN THIS VIDEO:
${speakerSamplesText}
YOUR TASK:
1. Look at each frame - who is VISIBLE on camera? Are they talking (mouth open, gesturing)?
2. Cross-reference: when a speaker is talking (according to transcript), is that person ON CAMERA?
3. The PRESENTER is the person who:
   - Appears on camera FACING the camera
   - Speaks TO the camera (presenting, explaining, selling)
   - Is the main visible person in most frames
4. Someone who SPEAKS but is NEVER or RARELY visible on camera is likely an interviewer or crew member
Based on the frames AND the transcript:
- Which speaker appears on camera most?
- Which speaker is talking while ON camera?
- Which speaker seems to be off-camera (voice only)?
Return a JSON object:
{
  "presenter": "דובר X",
  "confidence": "high" or "medium" or "low",
  "reasoning": "brief explanation",
  "on_camera_speaker": "דובר X - the person visible in most frames",
  "off_camera_speakers": ["דובר Y - heard but not seen"]
}
Return ONLY valid JSON.`

  try {
    const ai = await getOpenAI()
    if (!ai) {
      return { presenter: validSpeakers[0], confidence: 'low' }
    }

    console.log(`[PRESENTER-VIDEO] Sending ${selectedFrames.length} frames to GPT Vision...`)

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageContents,
        ],
      }],
    })

    const content = response.choices[0].message.content?.trim() || ''
    const cleaned = content.replace(/```json|```/g, '').trim()

    try {
      const result = JSON.parse(cleaned)

      console.log(`[PRESENTER-VIDEO] Result: ${result.presenter} (${result.confidence})`)
      console.log(`[PRESENTER-VIDEO] On camera: ${result.on_camera_speaker}`)
      console.log(`[PRESENTER-VIDEO] Off camera: ${result.off_camera_speakers?.join(', ')}`)
      console.log(`[PRESENTER-VIDEO] Reasoning: ${result.reasoning}`)

      // Validate
      if (result.presenter && validSpeakers.some(s => matchesSpeaker(s, result.presenter))) {
        return {
          presenter: result.presenter,
          confidence: result.confidence || 'medium',
        }
      }

      // Try on_camera_speaker as fallback
      if (result.on_camera_speaker) {
        const onCamMatch = result.on_camera_speaker.match(/דובר\s*\d+/)
        if (onCamMatch && validSpeakers.some(s => matchesSpeaker(s, onCamMatch[0]))) {
          return { presenter: onCamMatch[0], confidence: result.confidence || 'medium' }
        }
      }
    } catch (parseErr) {
      console.warn('[PRESENTER-VIDEO] Failed to parse GPT response:', content.substring(0, 200))
    }

    // Extract speaker name from raw text
    const rawMatch = content.match(/דובר\s*\d+/)
    if (rawMatch && validSpeakers.some(s => matchesSpeaker(s, rawMatch[0]))) {
      return { presenter: rawMatch[0], confidence: 'medium' }
    }
  } catch (e: any) {
    console.error('[PRESENTER-VIDEO] GPT Vision failed:', e.message?.substring(0, 150))
  }

  // Fallback to text-only analysis
  console.log('[PRESENTER-VIDEO] Falling back to text-only analysis')
  const textResult = await askGPTForPresenter(transcript, null, speakerTimes)
  return { presenter: textResult, confidence: 'low' }
}

// POST /api/auto-editor/identify-presenter — Cross-reference visual analysis with speaker diarization
app.post('/api/auto-editor/identify-presenter', async (req, res) => {
  try {
    const { transcript, visualAnalysis, speakerTimes, framesDir: reqFramesDir } = req.body

    if (!transcript?.segments || !speakerTimes) {
      return res.status(400).json({ message: 'חסר תמלול או נתוני דוברים' })
    }

    const validSpeakers = Object.keys(speakerTimes).filter(s => s && s !== 'undefined' && s !== 'null')

    // Try video frame-based identification if frames directory is available
    const framesPath = reqFramesDir || ''
    if (framesPath && fs.existsSync(framesPath)) {
      const frameFiles = fs.readdirSync(framesPath)
        .filter((f: string) => f.endsWith('.jpg') || f.endsWith('.png'))
        .sort()

      if (frameFiles.length > 0) {
        console.log(`[PRESENTER] Using ${frameFiles.length} video frames for identification`)
        const result = await identifyPresenterWithVideo(
          transcript, framesPath, frameFiles, speakerTimes
        )

        return res.json({
          mainPresenter: result.presenter,
          confidence: result.confidence,
          method: 'video_frames',
          presenterDescription: visualAnalysis?.presenter_detection?.presenter_description || '',
          reasoning: `Video frame analysis identified ${result.presenter}`,
          speakerOverlap: {},
        })
      }
    }

    const presenterDetection = visualAnalysis?.presenter_detection
    const segments: Array<{ speaker: string; start: number; end: number; text: string }> = transcript.segments

    // If visual analysis detected presenter frames, cross-reference with speakers
    const presenterFrames = presenterDetection?.presenter_speaking_in_frames ||
                            presenterDetection?.presenter_appears_in_frames || []

    if (presenterFrames.length > 0) {
      // Convert frame numbers to time ranges (each frame = 5 seconds)
      const presenterTimeRanges = presenterFrames.map((frame: number) => ({
        start: frame * 5,
        end: (frame + 1) * 5,
      }))

      // For each speaker, calculate overlap with presenter visible times
      const speakerOverlap: Record<string, number> = {}

      validSpeakers.forEach(speaker => {
        const speakerSegments = segments.filter(s => s.speaker === speaker)
        let overlap = 0

        speakerSegments.forEach(seg => {
          presenterTimeRanges.forEach((range: { start: number; end: number }) => {
            const overlapStart = Math.max(seg.start, range.start)
            const overlapEnd = Math.min(seg.end, range.end)
            if (overlapEnd > overlapStart) {
              overlap += overlapEnd - overlapStart
            }
          })
        })

        speakerOverlap[speaker] = overlap
      })

      console.log('[PRESENTER] Speaker overlap with on-screen presenter:', speakerOverlap)

      // The speaker with most overlap with on-screen time is the presenter
      const sortedByOverlap = Object.entries(speakerOverlap)
        .sort((a, b) => b[1] - a[1])

      if (sortedByOverlap.length > 0 && sortedByOverlap[0][1] > 0) {
        const presenter = sortedByOverlap[0][0]
        const confidence = presenterDetection?.confidence || 'medium'
        // Validate presenter is not undefined/invalid
        if (!presenter || presenter === 'undefined' || presenter === 'null') {
          console.warn('[PRESENTER] Cross-reference returned invalid speaker, falling back to GPT')
        } else {
          console.log(`[PRESENTER] Identified via visual cross-reference: ${presenter} (${sortedByOverlap[0][1]}s overlap, confidence: ${confidence})`)
          return res.json({
            mainPresenter: presenter,
            confidence,
            method: 'visual_crossref',
            presenterDescription: presenterDetection?.presenter_description || '',
            reasoning: presenterDetection?.reasoning || '',
            speakerOverlap,
          })
        }
      }
    }

    // Fallback: use improved GPT analysis with content understanding
    console.log('[PRESENTER] Visual overlap inconclusive, asking GPT with content analysis...')

    const result = await askGPTForPresenter(transcript, visualAnalysis, speakerTimes)

    if (result && validSpeakers.some(s => matchesSpeaker(s, result))) {
      return res.json({
        mainPresenter: result,
        confidence: 'medium',
        method: 'gpt_content_analysis',
        presenterDescription: presenterDetection?.presenter_description || '',
        reasoning: `GPT content analysis identified ${result} as presenter`,
        speakerOverlap: {},
      })
    }

    // Last fallback: most speaking time
    console.warn('[PRESENTER] GPT response not valid, falling back to most speaking time')
    const fallback = Object.entries(speakerTimes).filter(([s]) => s && s !== 'undefined').sort((a, b) => (b[1] as number) - (a[1] as number))[0]
    return res.json({
      mainPresenter: fallback?.[0] || 'דובר 1',
      confidence: 'low',
      method: 'speaking_time_fallback',
      presenterDescription: '',
      reasoning: 'GPT response not valid, using most speaking time as fallback',
      speakerOverlap: {},
    })

  } catch (error: any) {
    console.error('[PRESENTER ERROR]', error.message)
    // Non-fatal: return fallback
    const speakerTimes = req.body.speakerTimes || {}
    const fallback = Object.entries(speakerTimes).filter(([s]) => s && s !== 'undefined').sort((a, b) => (b[1] as number) - (a[1] as number))[0]
    res.json({
      mainPresenter: fallback?.[0] || 'דובר 1',
      confidence: 'low',
      method: 'error_fallback',
      presenterDescription: '',
      reasoning: 'Error during presenter identification: ' + error.message,
      speakerOverlap: {},
    })
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

    // Sync brain from Railway before editing starts
    await syncBrainFromRailway()

    const enrichBrainContext = getEditorBrainPrompt('enrich', 'marketing')
    console.log(`[AUTO-EDITOR] Enrich prompt: brain injected = ${enrichBrainContext.length > 0 ? 'YES' : 'NO'} (${enrichBrainContext.length} chars)`)

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system' as const,
          content: `אתה הבמאי הראשי של סטודיו עריכת וידאו מקצועי. אתה מומחה לכל סוגי הסרטונים בכל תעשייה.
${enrichBrainContext}

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

BACKGROUND IMAGE:
Based on the video content and transcript, describe a background image that:
1. Directly represents the TOPIC of this specific video
2. Matches the visual style of the video (corporate, casual, tech, etc.)
3. Would look good as a blurred/dimmed background behind the video frame
4. Is NOT a generic stock photo
Return a field "backgroundImagePrompt" with a detailed image generation prompt.
Example for a video about business automation:
BAD: "modern office with computers" (too generic)
GOOD: "clean minimal workspace with a laptop showing automation dashboard, flowchart diagrams floating around the screen, soft blue and purple gradient lighting, professional corporate atmosphere, the desk has a coffee cup and notebook, shallow depth of field, photorealistic"
The prompt must mention:
- Specific objects related to the video topic
- Lighting style that matches the video mood
- Color palette that complements the video
- Camera angle and depth of field
- Style reference (photorealistic, cinematic, etc.)

B-ROLL VIDEO PROMPTS:
For each B-Roll moment, create a Seedance video generation prompt that:
1. DIRECTLY illustrates what the presenter says at that EXACT moment
2. Matches the video's visual style and lighting
3. Is cinematically descriptive (camera angle, movement, lighting, mood)
4. Is in ENGLISH (Seedance works best with English prompts)
5. Is 1-2 sentences, very specific

For each B-Roll, also provide:
- "what_presenter_says": the exact quote being said at this moment
- "why": why this visual supports what's being said

RULES:
- B-Roll must SUPPORT the presenter's words, not distract from them
- Never place B-Roll over the presenter's most powerful statements
- B-Roll should cover transitions, pauses, or supporting examples
- Each B-Roll should show a DIFFERENT scene (no repetition)

BAD B-Roll prompts:
- "modern office" (too vague)
- "business meeting" (not specific to content)
- "person working on laptop" (generic)

GOOD B-Roll prompts:
- "close-up of hands toggling between 5 browser tabs: CRM, WhatsApp Web, Gmail, Google Sheets, calendar app, screen reflecting on reading glasses, fast-paced tab switching, overhead camera angle, cool blue monitor light on face, documentary style"
- "split-screen time-lapse: left side shows employee manually copying data between systems for hours, right side shows automated workflow completing same task in seconds with green checkmarks appearing, clean modern UI, cinematic lighting transition from warm to cool"

החזר JSON:
{
  "detected_type": "marketing_product / corporate / podcast / tutorial / ad / vlog / other",
  "detected_topic": "תיאור קצר של הנושא",
  "target_audience": "קהל יעד משוער",
  "enhanced_prompt": "פרומפט מפורט ומדויק לעריכה",
  "video_summary": "במשפט אחד - על מה הסרטון",
  "backgroundImagePrompt": "Detailed English prompt for background image generation that is SPECIFIC to the video topic - not generic",
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
      "prompt_en": "Specific, detailed English prompt for Seedance AI video generation - must describe camera angle, movement, lighting, mood, and specific objects related to what presenter says at this moment",
      "what_presenter_says": "exact quote the presenter says at this moment",
      "description_he": "מה הצופה יראה",
      "why": "למה B-Roll כאן חשוב - how it supports the presenter's words"
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
            content: `Based on the enrichment you just did for THIS SPECIFIC VIDEO, suggest 3 improvements.

Focus on what you could do BETTER for editing THIS video:
- Which B-Roll suggestion is weak and why?
- Where in the video is a strong moment you didn't highlight?
- What editing technique would work for a specific timestamp?

Do NOT give generic marketing advice. Reference specific content from the transcript.
BAD example: "להוסיף שאלות סגמנטציה" (marketing advice, not editing)
GOOD example: "בשנייה 15-18 הדובר אומר 'אנחנו חוסכים 40 שעות בחודש' - זה הרגע הכי חזק, צריך zoom in + טקסט על המסך"

Return exactly 3 suggestions. Each suggestion must be:
- ONE sentence only
- Reference a specific timestamp or frame number from THIS video
- About VIDEO EDITING, not marketing strategy
- Actionable for the next edit of a similar video

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

// POST /api/auto-editor/clean-transcript — Clean stutters, fillers, retakes from transcript
app.post('/api/auto-editor/clean-transcript', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(500).json({ message: 'OpenAI לא מחובר' })

    const { transcript, mainPresenter } = req.body

    // Filter to presenter segments only
    const presenterSegments = (transcript?.segments || []).filter((s: any) =>
      matchesSpeaker(s.speaker, mainPresenter)
    )
    // Also collect non-presenter segments for retake detection context
    const otherSegments = (transcript?.segments || []).filter((s: any) =>
      !matchesSpeaker(s.speaker, mainPresenter)
    )

    if (presenterSegments.length === 0) {
      return res.json({
        cleanedSegments: transcript?.segments || [],
        summary: { error: 'No presenter segments found' },
        originalCount: transcript?.segments?.length || 0,
        cleanedCount: transcript?.segments?.length || 0,
      })
    }

    // Build other speakers context for retake detection
    const otherSpeakersContext = otherSegments.length > 0
      ? `\n\nOTHER SPEAKERS (context only — do NOT keep these, but use them to detect retakes):
${otherSegments.slice(0, 30).map((s: any) =>
  `  ${(s.start || 0).toFixed(1)}s-${(s.end || 0).toFixed(1)}s [${s.speaker || 'other'}]: "${s.text}"`
).join('\n')}`
      : ''

    console.log(`[CLEAN] Presenter segments: ${presenterSegments.length}, Other speaker segments for context: ${otherSegments.length}`)

    const cleanPrompt = `You are a professional video editor cleaning a transcript for editing.

TRANSCRIPT (presenter segments only):
${presenterSegments.map((s: any, i: number) =>
  `[${i}] ${(s.start || 0).toFixed(1)}s-${(s.end || 0).toFixed(1)}s: "${s.text}"`
).join('\n')}
${otherSpeakersContext}

Your job: Mark which segments to KEEP and which to REMOVE.

REMOVE these:
1. Filler words: "אממ", "אה", "כאילו", "בעצם", "נו", "אוקיי אז"
2. Stutters: repeated words or syllables at start of sentences
3. False starts: when a sentence starts, stops, and restarts differently
4. Retakes: when the same idea is said twice and the second is better (remove the first)
5. Crew directions: "עוד פעם", "מוכן?", "שנייה", "בוא נעשה עוד take"
6. Unnatural long pauses (gaps > 2 seconds inside a sentence)
7. Incomplete sentences that don't add value

RETAKE DETECTION:
8. When another speaker says a sentence and the presenter repeats it shortly after (within 10 seconds),
   this is a retake/prompt scenario. REMOVE the presenter's FIRST attempt and KEEP only the LAST/BEST version.
9. If the presenter says the same idea multiple times in a row, keep only the last version.

KEEP these:
1. Complete, clean sentences
2. Natural short pauses between ideas (< 1 second)
3. Emotional moments and emphasis
4. The best version of repeated ideas

For each segment, return:
{
  "segments": [
    {
      "index": 0,
      "action": "keep" | "remove" | "trim_start" | "trim_end",
      "reason": "why",
      "trim_to": { "start": new_start, "end": new_end }
    }
  ],
  "summary": {
    "total_segments": number,
    "kept": number,
    "removed": number,
    "trimmed": number,
    "removed_reasons": { "filler": count, "stutter": count, "retake": count }
  }
}

IMPORTANT:
- Be aggressive about removing filler and stutters
- But NEVER remove content that carries the message
- When in doubt, KEEP the segment
- Trimming is better than full removal (trim the "אממ" at the start, keep the rest)
- Return ONLY valid JSON, no markdown fences`

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 4000,
      messages: [{ role: 'user', content: cleanPrompt }],
    })

    const content = response.choices[0].message.content?.trim() || ''
    const cleaned = content.replace(/```json|```/g, '').trim()
    const result = JSON.parse(cleaned)

    const retakeCount = (result.segments || []).filter((s: any) => s.action === 'remove' && s.reason?.toLowerCase().includes('retake')).length
    console.log(`[CLEAN] Detected ${retakeCount} retakes (presenter repeated after crew prompt)`)

    // Apply cleaning decisions to segments
    const cleanedSegments = presenterSegments
      .map((seg: any, i: number) => {
        const decision = result.segments?.find((d: any) => d.index === i)
        if (!decision) return seg

        if (decision.action === 'remove') return null

        if (decision.action === 'trim_start' && decision.trim_to?.start) {
          return { ...seg, start: decision.trim_to.start }
        }
        if (decision.action === 'trim_end' && decision.trim_to?.end) {
          return { ...seg, end: decision.trim_to.end }
        }
        if (decision.action === 'keep' && decision.trim_to) {
          return {
            ...seg,
            start: decision.trim_to.start ?? seg.start,
            end: decision.trim_to.end ?? seg.end,
          }
        }

        return seg
      })
      .filter(Boolean)

    console.log(`[CLEAN] Transcript: ${presenterSegments.length} → ${cleanedSegments.length} segments`)
    console.log(`[CLEAN] Summary:`, result.summary)

    res.json({
      cleanedSegments,
      summary: result.summary,
      originalCount: presenterSegments.length,
      cleanedCount: cleanedSegments.length,
    })

  } catch (e: any) {
    console.error('[CLEAN] Failed:', e.message)
    // Fallback: return original segments
    const presenterSegments = (req.body.transcript?.segments || []).filter((s: any) =>
      matchesSpeaker(s.speaker, req.body.mainPresenter)
    )
    res.json({
      cleanedSegments: presenterSegments.length > 0 ? presenterSegments : (req.body.transcript?.segments || []),
      summary: { error: e.message },
      originalCount: req.body.transcript?.segments?.length || 0,
      cleanedCount: presenterSegments.length || req.body.transcript?.segments?.length || 0,
    })
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

    const creativeBrainContext = getEditorBrainPrompt('creative_brief', contentType)
    console.log(`[AUTO-EDITOR] Creative brief: brain injected = ${creativeBrainContext.length > 0 ? 'YES' : 'NO'} (${creativeBrainContext.length} chars)`)

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system' as const,
          content: `אתה במאי תוכן מקצועי עם 20 שנות ניסיון בעריכת סרטונים לרשתות חברתיות.
${creativeBrainContext}

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
    "overall_vibe": "תיאור קצר של האווירה",
    "backgroundImagePrompt": "Detailed English prompt for generating a background image that is SPECIFIC to this video's topic - must mention specific objects, lighting style, color palette, camera angle, depth of field. NOT generic. Example for automation video: 'clean minimal workspace with laptop showing automation dashboard, flowchart diagrams floating, soft blue-purple gradient lighting, shallow depth of field, photorealistic'"
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
        { "after_segment": 1, "duration": 3, "prompt": "Detailed Seedance prompt: camera angle, movement, lighting, specific objects from video topic, cinematic style", "what_presenter_says": "exact quote being said", "type": "product_shot", "why": "how this B-Roll supports the presenter's words" },
        { "after_segment": 3, "duration": 4, "prompt": "Detailed Seedance prompt: NOT generic - must illustrate the specific concept the presenter discusses at this moment", "what_presenter_says": "exact quote being said", "type": "lifestyle", "why": "visual evidence for the claim being made" }
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
- B-Roll prompts: כתוב באנגלית, מפורט, סינמטי, עם תיאור תאורה וזווית
- B-Roll prompts MUST directly illustrate what the presenter says at that EXACT moment
- Each B-Roll prompt must include: camera angle, movement, lighting, mood, and specific objects related to the video topic
- BAD: "modern office" / "business meeting" / "person working" (too generic)
- GOOD: "close-up of hands toggling between CRM tabs, cool blue monitor light, documentary style" (specific to content)
- backgroundImagePrompt: MUST be specific to this video's topic, not a generic image${promptEvolution ? `\n\n${promptEvolution}` : ''}`
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
- העדף קטעים של הפרזנטור (isPresenter=true) אם קיים שדה כזה
- אם אין קטעים עם isPresenter=true, השתמש בכל הקטעים
- התעלם מדיבורים של עוזרי הפקה רק אם זוהו בפירוש
- ה-hook צריך להיות מהפרזנטור אם אפשר
- חובה להחזיר לפחות סרטון אחד! אסור להחזיר 0 סרטונים

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
            content: `Based on the creative brief you just wrote for THIS SPECIFIC VIDEO, suggest 3 improvements.

Focus on THIS video's content:
- Is the hook based on the strongest moment in the transcript?
- Does the brief use the actual words/claims from the video?
- Are the B-Roll suggestions matching specific moments?

BAD example: "להוסיף שאלות סגמנטציה מדויקות" (generic)
GOOD example: "ההוק שבחרתי ('אם הצמיחה שלך...') פחות חזק מהמשפט בשנייה 8: 'כל לקוח חדש עולה לי עובד' - תשתמש בזה כהוק"

Return exactly 3 suggestions. Each suggestion must be:
- ONE sentence only
- Reference a specific timestamp or frame number from THIS video
- About VIDEO EDITING, not marketing strategy
- Actionable for the next edit of a similar video

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

    const { creativeBrief, transcript, targetDuration, platforms, promptEvolution, socialLearningRules, temperature: reqTemperature } = req.body
    if (!creativeBrief || !transcript) return res.status(400).json({ message: 'חסר creativeBrief או transcript' })

    // Ensure presenter segments are marked - if no isPresenter field exists, mark all as presenter
    const mainPresenter = transcript.mainSpeaker
    if (transcript.segments && transcript.segments.length > 0) {
      const hasPresenterField = transcript.segments.some((s: any) => s.isPresenter === true)
      if (!hasPresenterField) {
        if (mainPresenter) {
          transcript.segments = transcript.segments.map((seg: any) => ({
            ...seg,
            isPresenter: matchesSpeaker(seg.speaker, mainPresenter),
          }))
          const presenterCount = transcript.segments.filter((s: any) => s.isPresenter).length
          console.log(`[TECH PLAN] Marked ${presenterCount}/${transcript.segments.length} segments as presenter (${mainPresenter})`)
          // If still no presenter segments (speaker name mismatch), mark ALL as presenter
          if (presenterCount === 0) {
            console.log('[TECH PLAN] No segments matched presenter name, marking ALL segments as presenter')
            transcript.segments = transcript.segments.map((seg: any) => ({
              ...seg,
              isPresenter: true,
            }))
          }
        } else {
          console.log('[TECH PLAN] No presenter identified, marking ALL segments as presenter')
          transcript.segments = transcript.segments.map((seg: any) => ({
            ...seg,
            isPresenter: true,
          }))
        }
      }
    }

    const aiChoosesDuration = targetDuration === -1

    // Build per-video duration instructions
    const perVideoDurationInfo = aiChoosesDuration && creativeBrief?.video_plans
      ? `כל סרטון יכול להיות באורך שונה (ה-AI בחר):\n${creativeBrief.video_plans.map((v: any) =>
          `סרטון ${v.video_index}: ${v.optimal_duration || v.estimated_duration || 60} שניות`
        ).join('\n')}`
      : `אורך יעד לכל סרטון: ${targetDuration} שניות`

    const techBrainContext = getEditorBrainPrompt('technical_plan')
    console.log(`[AUTO-EDITOR] Technical plan: brain injected = ${techBrainContext.length > 0 ? 'YES' : 'NO'} (${techBrainContext.length} chars)`)

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        {
          role: 'system' as const,
          content: `אתה עורך וידאו טכני מדויק. אתה מקבל brief יצירתי ותמלול, ומייצר תוכנית עריכה טכנית מדויקת לפריים.
${techBrainContext}

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
          "prompt": "MUST directly illustrate what presenter says at this moment - include camera angle, movement, lighting, specific objects, cinematic style - NOT generic",
          "what_presenter_says": "exact quote being said at this timestamp",
          "transition_in": "fade",
          "transition_out": "fade",
          "animation": "slow_zoom_in",
          "why": "how this B-Roll supports the presenter's words"
        },
        {
          "relative_start": 18.0,
          "relative_end": 22.0,
          "prompt": "SPECIFIC to content being discussed - describe camera angle, movement type, lighting mood, and objects that represent the topic",
          "what_presenter_says": "exact quote being said at this timestamp",
          "transition_in": "dissolve",
          "transition_out": "dissolve",
          "animation": "pan_right",
          "why": "visual evidence for the claim being made"
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

CRITICAL RULES:
1. You MUST return at least 1 video. NEVER return 0 videos.
2. If no segments have isPresenter=true, treat ALL segments as presenter segments.
3. Use the actual transcript timestamps to plan cuts - do NOT invent timestamps.
4. Every cut must reference real start/end times from the provided segments.
5. If the transcript has multiple speakers, prefer the speaker identified as main presenter: ${transcript.mainSpeaker || 'not specified - use speaker with most on-camera time'}.
6. NEVER cut mid-word. Cut ONLY on natural pauses, end of sentences, or breaths.
7. Keep at least 0.2s padding before/after cuts.
8. B-Roll prompts MUST directly illustrate what the presenter says at that EXACT moment - NOT generic.
9. B-Roll prompts must include: camera angle, movement, lighting, mood, specific objects from the video topic.
10. BAD B-Roll: "modern office" / "business meeting" / "person working on laptop" (too generic).
11. GOOD B-Roll: "close-up of hands toggling between 5 browser tabs: CRM, WhatsApp, Gmail, overhead angle, cool blue light, documentary style" (specific).
12. Zoom ONLY on the 2-3 most important statements per 30 seconds. Zoom must start when key word begins.
13. Camera angles: change every 4-8 seconds for dynamic feel. Use closeup on emotional/important statements, wide for transitions.
14. Graphics: ONLY for numbers, percentages, or key terms mentioned by presenter. Max 3 per 30 seconds.

=== SMART EDITING RULES ===

HOOK (first 3 seconds):
- Find the MOST POWERFUL moment in the entire transcript
- This is NOT necessarily the beginning - search the whole video
- If the speaker says something surprising, emotional, or controversial later in the video - START with that
- Show it as a "flash forward" then cut to "30 minutes earlier" or similar

CUT DECISIONS:
- Never cut mid-word. Always cut at silence points between words.
- When cutting between segments, add 0.15s of silence (breathing room)
- If a sentence is repeated (retake), keep ONLY the last version
- Remove all "אממ", "אהה", "אז", "כאילו" at the start of sentences

B-ROLL PLACEMENT:
- Insert B-Roll when the speaker mentions a concept, product, or abstract idea
- B-Roll should be 2-4 seconds, never longer than the speaker's sentence
- Keep the speaker's AUDIO playing under the B-Roll
- Match B-Roll aspect ratio to output format

ZOOM TIMING:
- Zoom IN (1.15x-1.3x) on key words and emotional moments
- Zoom OUT to default when transitioning between topics
- Never zoom during B-Roll
- Zoom changes should take 0.3-0.5 seconds (ease-in-out)

PACING BY CONTENT TYPE:
- Sales/Ad: Fast cuts every 2-3s, lots of zooms, energetic music 15-18%
- Tutorial: Slower cuts every 5-7s, minimal zooms, calm music 8-12%
- Podcast: Cuts on speaker changes only, no zooms on B-Roll, music 5-8%
- Testimonial: Medium cuts every 4-5s, subtle zooms on emotions, warm music 10-12%

COLOR GRADE MATCHING:
- Match color grade to the mood detected in the transcript
- Happy/exciting content → warm/vibrant
- Professional/corporate → clean/cold
- Emotional/personal → film/cinematic
- Energetic/youth → vibrant/trending

SUBTITLE INTELLIGENCE:
- Highlight the most important word in each subtitle line with a different color
- The important word is: a number, a product name, an emotional word, or a call-to-action
- Mark these words in the plan so FFmpeg can style them differently (wrap with ** like **word**)

VALIDATION before returning:
1. Sum all (keep_end - keep_start) for cuts = must match the target duration for each video ± 3
2. All relative timestamps must be within 0 to total_duration
3. subtitles must cover most of the speech (not just first few seconds)
4. At least 2 B-Roll placements per 30 seconds
5. At least 1 zoom every 7 seconds
6. camera_angles must cover entire duration with no gaps
7. transitions between every pair of cuts
8. Every B-Roll prompt references specific content from the transcript (not generic)
9. All timestamps come from the provided transcript - no invented timestamps${promptEvolution ? `\n\n${promptEvolution}` : ''}`
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
      temperature: reqTemperature ?? 0.3,
    })

    const content = response.choices?.[0]?.message?.content
    if (!content) return res.status(500).json({ message: 'ChatGPT לא החזיר technical plan' })

    const plan = JSON.parse(content)

    // Ensure at least 1 video exists - fallback if GPT returned 0
    if (!plan.videos || plan.videos.length === 0) {
      console.warn('[TECH PLAN] GPT returned 0 videos! Creating fallback video from transcript segments.')
      const totalDur = transcript.total_duration || transcript.totalDuration || 60
      const vidTargetDur = aiChoosesDuration ? Math.min(totalDur * 0.7, 60) : targetDuration
      plan.videos = [{
        video_index: 1,
        title: 'סרטון ראשי',
        total_duration: vidTargetDur,
        cuts: [{ keep_start: 0, keep_end: Math.min(vidTargetDur, totalDur), reason: 'fallback - full content' }],
        transitions: [{ between: [0, 0], type: 'fadeblack', duration: 0.5 }],
        camera_angles: [{ relative_start: 0, relative_end: vidTargetDur, camera: 'wide', reason: 'default' }],
        zooms: [{ relative_time: 0, scale: 1.05, duration: 2, direction: 'in', reason: 'intro' }],
        broll: [],
        subtitles: [],
        graphics: [],
        speakers: [],
        color_grade: 'cinematic',
        framing: 'blur_background',
        music_dynamics: [{ relative_time: 0, volume: 0.2, reason: 'background' }],
      }]
    }

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
            content: `Based on the technical plan you just created for THIS SPECIFIC VIDEO, suggest 3 improvements.

Focus on the actual editing decisions:
- Is there a better cut point at a specific timestamp?
- Should a zoom happen at a different moment?
- Is a B-Roll placement covering important content?

BAD example: "הוסף הנחיה שאם אין סגמנטים..." (meta/process advice)
GOOD example: "הקאט בשנייה 22 חותך באמצע המילה 'אוטומציה' - תזיז ל-22.5 שזה סוף המשפט"

Return exactly 3 suggestions. Each suggestion must be:
- ONE sentence only
- Reference a specific timestamp or frame number from THIS video
- About VIDEO EDITING, not marketing strategy
- Actionable for the next edit of a similar video

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

// Generate a content-specific background image prompt from transcript and creative brief
function generateBackgroundImagePrompt(transcript: any, creativeBrief: any): string {
  try {
    // Extract key topic from transcript (analyze full text, not just first 200 chars)
    let fullText = ''
    if (typeof transcript === 'string') {
      fullText = transcript
    } else if (transcript?.segments) {
      fullText = transcript.segments.map((s: any) => s.text).join(' ')
    }

    // Find core topic keywords (most frequent meaningful words)
    const words = fullText.replace(/[^\w\sא-ת]/g, '').split(/\s+/).filter((w: string) => w.length > 3)
    const wordFreq: Record<string, number> = {}
    for (const w of words) wordFreq[w] = (wordFreq[w] || 0) + 1
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w)
      .join(', ')

    // Use creative brief fields if available
    const summary = creativeBrief?.video_summary || creativeBrief?.enhanced_prompt || ''
    const colorMood = creativeBrief?.style?.color_mood || creativeBrief?.style?.color || ''
    const contentType = creativeBrief?.detected_type || ''

    // Build a rich, specific prompt
    const elements: string[] = []
    if (summary) elements.push(`Scene depicting: ${summary.substring(0, 150)}`)
    if (topWords) elements.push(`Related to: ${topWords}`)
    if (colorMood) elements.push(`Color mood: ${colorMood}`)

    // Content-type specific visual suggestions
    if (contentType === 'marketing_product' || contentType === 'ad_short') {
      elements.push('clean minimal workspace, product showcase, soft gradient lighting')
    } else if (contentType === 'podcast_interview') {
      elements.push('cozy studio environment, warm ambient lighting, microphone on desk')
    } else if (contentType === 'tutorial') {
      elements.push('organized desk with tools, clean whiteboard, educational setting')
    } else if (contentType === 'testimonial') {
      elements.push('professional office, natural window light, warm tones')
    } else {
      elements.push('professional setting, modern environment')
    }

    elements.push('shallow depth of field, photorealistic, cinematic quality, soft bokeh background')

    const result = elements.join('. ')
    console.log(`[NANO BANANA] Generated content-specific prompt: ${result.substring(0, 100)}`)
    return result
  } catch (err: any) {
    console.warn('[NANO BANANA] generateBackgroundImagePrompt failed, using original prompt:', err.message)
    return ''
  }
}

app.post('/api/generate-background', async (req, res) => {
  try {
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API Key לא מוגדר. הוסף GEMINI_API_KEY ב-.env' })

    const { prompt, aspectRatio = '9:16', transcript, creativeBrief } = req.body
    if (!prompt) return res.status(400).json({ message: 'חסר prompt' })

    // Generate content-specific prompt from transcript and creative brief
    let bgPrompt = prompt
    const genericPatterns = /^(modern|professional|abstract|background|office|business)\s/i
    if (genericPatterns.test(prompt) || creativeBrief || transcript) {
      const enrichedPrompt = generateBackgroundImagePrompt(transcript, creativeBrief)
      if (enrichedPrompt) {
        bgPrompt = enrichedPrompt
      }
    }

    console.log('[NANO BANANA] Generating background in DEEP mode (gemini-3-pro-image-preview)')
    console.log('[NANO BANANA] Using content-specific prompt:', bgPrompt.substring(0, 100))

    // Enhanced prompt for higher quality background images
    const enhancedPrompt = `Create a high-quality, photorealistic image with the following description.
Make it extremely detailed, with professional lighting, perfect composition, and cinematic quality.
The image should look like it was taken by a professional photographer with a high-end camera.
Description: ${bgPrompt}
Style requirements:
- Ultra high detail and sharpness
- Professional color grading
- Cinematic depth of field
- Natural, realistic lighting
- ${aspectRatio === '9:16' ? '9:16 vertical' : aspectRatio === '16:9' ? '16:9 horizontal' : aspectRatio} aspect ratio composition`

    let imageData: any = null

    // ONLY use Pro model for backgrounds (highest quality) - Flash only as last resort
    const modelNames = ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image']

    for (const modelName of modelNames) {
      try {
        console.log(`[NANO BANANA] Trying model: ${modelName}${modelName.includes('pro') ? ' (DEEP mode)' : ' (fallback)'}`)
        const response = await ai.models.generateContent({
          model: modelName,
          contents: enhancedPrompt,
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
          console.log(`[NANO BANANA] Background generated (${modelName.includes('pro') ? 'Pro/deep mode' : 'Flash fallback'})`)
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

// B-Roll models available through KIE.ai
const BROLL_MODELS: Record<string, {
  kieModel: string;
  label: string;
  costPerClip: number;
  duration: string;
  quality: string;
  input?: (prompt: string) => any;
}> = {
  'seedance': {
    kieModel: 'bytedance/seedance-1.5-pro',
    label: 'Seedance 1.5 Pro',
    costPerClip: 0.36,
    duration: '5s',
    quality: '720p',
    input: (prompt: string) => ({ prompt }),
  },
  'kling': {
    kieModel: 'kling/v2-5-turbo-text-to-video-pro',
    label: 'Kling v2.5 Turbo',
    costPerClip: 0.15,
    duration: '5s',
    quality: '720p',
    input: (prompt: string) => ({ prompt }),
  },
  'wan': {
    kieModel: 'wan/2-5-text-to-video',
    label: 'WAN 2.5',
    costPerClip: 0.10,
    duration: '5s',
    quality: '720p',
    input: (prompt: string) => ({ prompt }),
  },
  'veo-3.1-fast': {
    kieModel: 'google/veo-3.1-generate-preview',
    label: 'Veo 3.1 Fast',
    costPerClip: 0.20,
    duration: '4s',
    quality: '720p',
    input: (prompt: string) => ({ prompt, durationSeconds: 4 }),
  },
  'veo-3.1-quality': {
    kieModel: 'google/veo-3.1-generate-preview',
    label: 'Veo 3.1 Quality',
    costPerClip: 1.00,
    duration: '4s',
    quality: '1080p',
    input: (prompt: string) => ({ prompt, durationSeconds: 4 }),
  },
  'sora-2': {
    kieModel: 'openai/sora-2-text-to-video-stable',
    label: 'Sora 2',
    costPerClip: 0.25,
    duration: '5s',
    quality: '720p',
    input: (prompt: string) => ({ prompt, durationSeconds: 5 }),
  },
}

// Unified B-Roll generation through KIE.ai API
async function generateBRollViaKIE(prompt: string, modelId: string, imageUrl?: string): Promise<string | null> {
  const kieApiKey = (process.env.KIE_API_KEY || '').trim()
  if (!kieApiKey) {
    console.warn('[B-ROLL] KIE_API_KEY not set')
    return null
  }

  const modelConfig = BROLL_MODELS[modelId] || BROLL_MODELS['seedance']

  try {
    // Build request input using model-specific input function
    const input: any = modelConfig.input ? modelConfig.input(prompt) : { prompt }

    // Image-to-video: attach base64 image
    if (imageUrl) {
      const imagePath = imageUrl.startsWith('http://localhost')
        ? path.join(uploadsDir, path.basename(new URL(imageUrl).pathname))
        : imageUrl

      if (!fs.existsSync(imagePath)) {
        console.warn('[B-ROLL] Brand image not found:', imagePath)
        // Fall through to text-to-video
      } else {
        const imageBuffer = fs.readFileSync(imagePath)
        input.image = imageBuffer.toString('base64')
        console.log(`[B-ROLL] Image-to-Video with ${modelConfig.label}`)
      }
    }

    const requestBody = {
      model: modelConfig.kieModel,
      input,
    }

    const kieCreateUrl = 'https://api.kie.ai/api/v1/jobs/createTask'
    console.log(`[B-ROLL] KIE URL: ${kieCreateUrl}`)
    console.log(`[B-ROLL] Creating job with KIE.ai:`)
    console.log(`[B-ROLL]   Model: ${modelConfig.kieModel}`)
    console.log(`[B-ROLL]   Prompt: "${prompt.substring(0, 80)}..."`)
    console.log(`[B-ROLL]   Body: ${JSON.stringify(requestBody).substring(0, 300)}`)

    // Create job
    const createRes = await fetch(kieCreateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const createText = await createRes.text()
    console.log(`[B-ROLL] KIE response (${createRes.status}): ${createText.substring(0, 300)}`)

    if (!createRes.ok) {
      console.error(`[B-ROLL] KIE create failed ${createRes.status}: ${createText.substring(0, 200)}`)
      return null
    }

    let createData
    try {
      createData = JSON.parse(createText)
    } catch {
      console.error('[B-ROLL] Failed to parse KIE response')
      return null
    }

    const taskId = createData.data?.id || createData.data?.taskId || createData.data?.task_id || createData.data?.recordId
    if (!taskId) {
      console.error('[B-ROLL] No taskId in response:', createText.substring(0, 200))
      return null
    }

    console.log(`[B-ROLL] Task created: ${taskId} (${modelConfig.label})`)

    // Poll for completion (max 10 minutes)
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000))

      const pollRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${kieApiKey}` },
      })

      const pollData = await pollRes.json()
      const state = pollData.data?.state

      if (state === 'success') {
        let videoUrl: string | undefined

        // Try multiple ways to extract video URL
        try {
          const resultJson = typeof pollData.data.resultJson === 'string'
            ? JSON.parse(pollData.data.resultJson)
            : (pollData.data.resultJson || {})
          videoUrl = resultJson?.resultUrls?.[0] || resultJson?.url || resultJson?.videoUrl
        } catch {}

        if (!videoUrl) {
          videoUrl = pollData.data?.resultUrl || pollData.data?.url || pollData.data?.videoUrl
        }

        if (!videoUrl) {
          console.error('[B-ROLL] Success but no URL. Full response:', JSON.stringify(pollData.data).substring(0, 500))
          return null
        }

        console.log(`[B-ROLL] Video URL: ${videoUrl.substring(0, 100)}`)

        // Download immediately to prevent URL expiry
        const localPath = path.join(uploadsDir, `broll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`)
        const videoRes = await fetch(videoUrl)

        if (!videoRes.ok) {
          console.error(`[B-ROLL] Download failed: ${videoRes.status}`)
          return null
        }

        const buffer = Buffer.from(await videoRes.arrayBuffer())
        fs.writeFileSync(localPath, buffer)

        const serverUrl = `http://localhost:${PORT}/uploads/${path.basename(localPath)}`
        console.log(`[B-ROLL] ✅ ${modelConfig.label}: ${serverUrl} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`)

        return serverUrl
      }

      if (state === 'fail' || state === 'failed' || state === 'error') {
        console.error(`[B-ROLL] Task ${taskId} failed. Response:`, JSON.stringify(pollData.data).substring(0, 300))
        return null
      }

      // Log progress every 30 seconds
      if (i % 6 === 0 && i > 0) {
        console.log(`[B-ROLL] Polling ${taskId}: ${state} (${(i * 5 / 60).toFixed(1)} min)`)
      }
    }

    console.error(`[B-ROLL] Timeout after 10 minutes (${modelConfig.label})`)
    return null

  } catch (e: any) {
    console.error(`[B-ROLL] ${modelConfig.label} error:`, e.message?.substring(0, 150))
    return null
  }
}

// POST /api/generate-broll — B-Roll video generation via KIE.ai (all models)
app.post('/api/generate-broll', async (req, res) => {
  const { prompt, model, imageUrl } = req.body
  if (!prompt) return res.status(400).json({ message: 'חסר prompt' })

  const modelId = model || 'seedance'
  const modelLabel = BROLL_MODELS[modelId]?.label || modelId
  console.log(`[B-ROLL] Starting: "${prompt.substring(0, 50)}..." (model: ${modelLabel})`)

  const result = await generateBRollViaKIE(prompt, modelId, imageUrl)

  if (result) {
    return res.json({ url: result, model: modelId })
  }

  res.status(500).json({ message: `B-Roll generation failed (${modelLabel})` })
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
      `https://pixabay.com/api/music/?key=${apiKey}&q=${encodedQuery}&per_page=5`
    )

    if (!response.ok) {
      return res.status(response.status).json({ message: `שגיאת Pixabay: ${response.statusText}` })
    }

    let data = await response.json()

    // Fallback to generic search if no results
    if (!data.hits || data.hits.length === 0) {
      const fallbackResponse = await fetch(
        `https://pixabay.com/api/music/?key=${apiKey}&q=background+music&per_page=5`
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
// Fallback chain: 1. Deepgram Nova-3 (primary) 2. GPT-4o-transcribe-diarize (fallback)

// GPT-4o fallback for auto-editor transcription
async function handleGPTAutoTranscribe(req: any, res: any) {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { fileUrl } = req.body
    if (!fileUrl) return res.status(400).json({ message: 'חסר fileUrl' })

    console.log('[AUTO-TRANSCRIBE-GPT] Processing:', fileUrl)

    let filePath: string
    let isTemp = false

    if (fileUrl.startsWith(`http://localhost:${PORT}/uploads/`) || fileUrl.startsWith('/uploads/')) {
      const filename = path.basename(new URL(fileUrl, `http://localhost:${PORT}`).pathname)
      filePath = path.join(uploadsDir, filename)
      console.log('[AUTO-TRANSCRIBE-GPT] Local file:', filePath)
    } else if (fileUrl.startsWith('http')) {
      console.log('[AUTO-TRANSCRIBE-GPT] Downloading from remote URL...')
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

    console.log('[AUTO-TRANSCRIBE-GPT] File path:', filePath, '| Size:', (fs.statSync(filePath).size / 1024 / 1024).toFixed(1), 'MB')

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

    console.log('[AUTO-TRANSCRIBE-GPT] Sending to gpt-4o-transcribe-diarize...')

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
      console.warn('[AUTO-TRANSCRIBE-GPT] Diarize failed, falling back:', diarizeErr.message)
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

    if (fs.existsSync(mp3Path)) try { fs.unlinkSync(mp3Path) } catch {}

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

    let totalDuration = transcription.duration || 0
    if (totalDuration === 0 && segments.length > 0) {
      totalDuration = Math.max(...segments.map((s: any) => s.end || 0))
    }
    if (totalDuration === 0) {
      try {
        const ffprobePath = getFFmpeg().replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
        const probeResult = execSync(
          `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
          { timeout: 30000 }
        ).toString().trim()
        totalDuration = parseFloat(probeResult) || 0
      } catch {}
    }
    if (totalDuration === 0 && segments.length > 0) {
      totalDuration = segments.length * 3
    }

    const speakerTimes: Record<string, number> = {}
    segments.forEach((seg: any) => {
      const speaker = seg.speaker || 'unknown'
      if (!speakerTimes[speaker]) speakerTimes[speaker] = 0
      speakerTimes[speaker] += ((seg.end || 0) - (seg.start || 0))
    })

    const sortedSpeakers = Object.entries(speakerTimes)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([speaker, time]) => ({ speaker, time: Math.round((time as number) * 10) / 10 }))

    const mainSpeaker = sortedSpeakers[0]?.speaker || segments[0]?.speaker || 'unknown'

    segments.forEach((seg: any) => {
      seg.isPresenter = matchesSpeaker(seg.speaker, mainSpeaker)
    })

    console.log('[AUTO-TRANSCRIBE-GPT] Done:', segments.length, 'segments,', speakerCount, 'speakers,', totalDuration.toFixed(1), 'sec, model:', usedModel)

    const speakerSamples: Record<string, string> = {}
    const uniqueSpeakersForSample = [...new Set(segments.map((s: any) => s.speaker))].filter(Boolean) as string[]
    const sampleTimestamp = Date.now()
    const ffmpegForSamples = getFFmpeg()

    for (const speaker of uniqueSpeakersForSample) {
      const speakerSegments = segments
        .filter((s: any) => s.speaker === speaker)
        .sort((a: any, b: any) => (b.end - b.start) - (a.end - a.start))

      if (speakerSegments.length === 0) continue

      const bestSegment = speakerSegments[0]
      const sampleStart = bestSegment.start
      const sampleDuration = Math.min(bestSegment.end - bestSegment.start, 5)

      const speakerNum = speaker.match(/\d+/)?.[0] || '0'
      const sampleFile = path.join(uploadsDir, `speaker_sample_${sampleTimestamp}_${speakerNum}.mp3`)

      try {
        const cmd = `"${ffmpegForSamples}" -i "${filePath}" -ss ${sampleStart.toFixed(3)} -t ${sampleDuration.toFixed(3)} -vn -c:a libmp3lame -b:a 128k "${sampleFile}" -y`
        console.log(`[AUTO-TRANSCRIBE-GPT] Extracting sample for ${speaker}: ${sampleStart.toFixed(1)}s-${(sampleStart + sampleDuration).toFixed(1)}s`)
        execSync(cmd, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 })

        if (fs.existsSync(sampleFile) && fs.statSync(sampleFile).size > 1000) {
          const fileSize = fs.statSync(sampleFile).size
          const sampleUrl = `http://localhost:${PORT}/uploads/${path.basename(sampleFile)}`
          speakerSamples[speaker] = sampleUrl
          console.log(`[AUTO-TRANSCRIBE-GPT] ✅ Sample for ${speaker}: ${path.basename(sampleFile)} (${fileSize} bytes)`)
        } else {
          console.warn(`[AUTO-TRANSCRIBE-GPT] ❌ Sample too small or not created for ${speaker}`)
        }
      } catch (e: any) {
        console.error(`[AUTO-TRANSCRIBE-GPT] ❌ Sample failed for ${speaker}:`, e.message?.substring(0, 150))
      }
    }

    if (isTemp && fs.existsSync(filePath)) try { fs.unlinkSync(filePath) } catch {}

    res.json({
      segments,
      duration: totalDuration,
      text: transcription.text || '',
      speakers,
      mainSpeaker,
      speakerTimes,
      sortedSpeakers: sortedSpeakers.map(s => ({
        ...s,
        sampleUrl: speakerSamples[s.speaker] || null,
        sampleText: segments.find((seg: any) => seg.speaker === s.speaker)?.text?.substring(0, 80) || '',
      })),
      autoDetected: true,
      model: usedModel,
    })
  } catch (err: any) {
    console.error('[AUTO-TRANSCRIBE-GPT ERROR]', err.message)
    res.status(500).json({ message: 'שגיאה בתמלול: ' + err.message })
  }
}

// GPT-based speaker verification for when Deepgram merges multiple speakers into one
async function verifySpeakersWithGPT(segments: any[], speakerSamples: any[], transcript: string, expectedSpeakers: number = 0): Promise<any[]> {
  if (segments.length === 0) return segments;

  const deepgramSpeakers = [...new Set(segments.map(s => s.speaker))];
  console.log(`[SPEAKER VERIFY] Deepgram detected ${deepgramSpeakers.length} speakers`);

  // If only 1 speaker detected but audio has clear voice changes, ask GPT to re-analyze
  const shouldVerify = (deepgramSpeakers.length <= 1 && segments.length > 5) ||
    (expectedSpeakers > 0 && deepgramSpeakers.length < expectedSpeakers);

  if (shouldVerify) {
    console.log(`[SPEAKER VERIFY] Only ${deepgramSpeakers.length} speaker(s) detected${expectedSpeakers > 0 ? `, expected ${expectedSpeakers}` : ''}, asking GPT to verify...`);

    try {
      const ai = await getOpenAI();
      const sampleTexts = segments.slice(0, 20).map((s: any) =>
        `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`
      ).join('\n');

      const expectedHint = expectedSpeakers > 0
        ? `\nThe user indicated there should be approximately ${expectedSpeakers} speakers.`
        : '';

      const response = await ai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [{
          role: 'user',
          content: `Analyze this transcript from a video. Deepgram detected only ${deepgramSpeakers.length} speaker(s), but there might be multiple speakers.${expectedHint}
Look for patterns that indicate different speakers:
- Questions followed by answers (interviewer + interviewee)
- Short prompts like "ready?", "again", "great" (production crew)
- Different speaking styles or topics
- Conversational back-and-forth

Transcript:
${sampleTexts}

If you detect multiple speakers, return JSON:
{
  "speakers_detected": 2,
  "segments_to_split": [
    {"index": 3, "new_speaker": "דובר 2", "reason": "short production prompt"},
    {"index": 7, "new_speaker": "דובר 2", "reason": "question from interviewer"}
  ]
}
If 1 speaker seems correct, return:
{"speakers_detected": 1, "segments_to_split": []}
Return ONLY JSON.`
        }],
      });

      const result = JSON.parse(response.choices[0].message.content?.replace(/```json|```/g, '').trim() || '{}');

      if (result.speakers_detected > 1 && result.segments_to_split?.length > 0) {
        console.log(`[SPEAKER VERIFY] GPT detected ${result.speakers_detected} speakers, splitting ${result.segments_to_split.length} segments`);

        for (const split of result.segments_to_split) {
          if (segments[split.index]) {
            segments[split.index].speaker = split.new_speaker;
            if (segments[split.index].words) {
              segments[split.index].words.forEach((w: any) => { w.speaker = split.new_speaker; });
            }
            console.log(`[SPEAKER VERIFY] Segment ${split.index} → ${split.new_speaker} (${split.reason})`);
          }
        }
      } else {
        console.log('[SPEAKER VERIFY] GPT confirms single speaker');
      }
    } catch (e: any) {
      console.warn('[SPEAKER VERIFY] GPT verification failed:', e.message?.substring(0, 100));
    }
  }

  return segments;
}

app.post('/api/auto-editor/transcribe', async (req, res) => {
  autoEditorBusy = true
  console.log('[AUTO-EDITOR] Session started, learning agent paused')

  const { fileUrl, language = 'he', expectedSpeakers = 0 } = req.body
  const timestamp = Date.now()

  console.log(`[TRANSCRIBE] Starting with Deepgram Nova-3 (language: ${language})...`)
  console.log('[TRANSCRIBE] File:', fileUrl)

  if (!process.env.DEEPGRAM_API_KEY) {
    console.log('[TRANSCRIBE] DEEPGRAM_API_KEY not set, falling back to GPT-4o')
    return handleGPTAutoTranscribe(req, res)
  }

  try {
    if (!fileUrl) return res.status(400).json({ message: 'חסר fileUrl' })

    // Step 1: Get the local file path
    let localFilePath = ''
    let isTemp = false

    if (fileUrl.startsWith(`http://localhost:${PORT}/uploads/`) || fileUrl.startsWith('/uploads/')) {
      const filename = path.basename(new URL(fileUrl, `http://localhost:${PORT}`).pathname)
      localFilePath = path.join(uploadsDir, filename)
    } else if (fileUrl.startsWith('http')) {
      console.log('[TRANSCRIBE] Downloading from remote URL...')
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        return res.status(400).json({ message: `שגיאה בהורדת הקובץ: ${fileResponse.statusText}` })
      }
      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())
      localFilePath = path.join(uploadsDir, `temp-${timestamp}-download.mp4`)
      fs.writeFileSync(localFilePath, fileBuffer)
      isTemp = true
    } else {
      return res.status(400).json({ message: 'פורמט URL לא תקין: ' + fileUrl })
    }

    if (!fs.existsSync(localFilePath)) {
      return res.status(400).json({ error: 'File not found: ' + localFilePath })
    }

    const fileSize = (fs.statSync(localFilePath).size / (1024 * 1024)).toFixed(1)
    console.log(`[TRANSCRIBE] File: ${localFilePath} | Size: ${fileSize}MB`)

    // Step 2: Extract audio (Deepgram works best with audio)
    const audioPath = path.join(uploadsDir, `audio_extract_${timestamp}.mp3`)

    try {
      const ffmpeg = getFFmpeg()
      execSync(
        `"${ffmpeg}" -i "${localFilePath}" -vn -c:a libmp3lame -b:a 128k -ar 16000 -ac 1 "${audioPath}" -y`,
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      )
      console.log(`[TRANSCRIBE] Audio extracted: ${(fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1)}MB`)
    } catch {
      console.warn('[TRANSCRIBE] Audio extraction failed, using original')
    }

    const fileToSend = fs.existsSync(audioPath) ? audioPath : localFilePath

    // Step 3: Transcribe with Deepgram Nova-3 REST API
    const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim()
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set')

    const audioBuffer = fs.readFileSync(fileToSend)
    console.log(`[TRANSCRIBE] Sending ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB to Deepgram REST API...`)

    const langParam = language === 'detect' ? 'detect_language=true' : `language=${language}`
    const dgUrl = `https://api.deepgram.com/v1/listen?model=nova-3&${langParam}&smart_format=true&diarize=true&utterances=true&punctuate=true&utterance_split=900`
    console.log(`[TRANSCRIBE] Deepgram URL: ${dgUrl}`)

    const dgResponse = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/mp3',
      },
      body: audioBuffer,
    })

    if (!dgResponse.ok) {
      const errorText = await dgResponse.text()
      throw new Error(`Deepgram API ${dgResponse.status}: ${errorText.substring(0, 200)}`)
    }

    const result = await dgResponse.json() as any

    const channel = result.results?.channels?.[0]
    const alternatives = channel?.alternatives?.[0]
    const detectedLanguage = channel?.detected_language || 'unknown'

    console.log(`[TRANSCRIBE] Deepgram done: ${alternatives?.words?.length || 0} words, language: ${detectedLanguage}`)

    // Step 4: Convert Deepgram format to our format
    const words = alternatives?.words || []
    const utterances = result.results?.utterances || []

    // Build segments from utterances (each utterance = one speaker's continuous speech)
    let segments: any[] = []

    if (utterances.length > 0) {
      segments = utterances.map((utt: any, i: number) => ({
        id: i,
        start: utt.start,
        end: utt.end,
        text: utt.transcript,
        speaker: `דובר ${(utt.speaker || 0) + 1}`,
        words: (utt.words || []).map((w: any) => ({
          word: w.punctuated_word || w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          speaker: `דובר ${(w.speaker || 0) + 1}`,
        })),
      }))
    } else {
      // Fallback: build segments from words
      let currentSegment: any = null

      for (const word of words) {
        const speaker = `דובר ${(word.speaker || 0) + 1}`

        if (!currentSegment || currentSegment.speaker !== speaker || word.start - currentSegment.end > 1.5) {
          if (currentSegment) segments.push(currentSegment)
          currentSegment = {
            id: segments.length,
            start: word.start,
            end: word.end,
            text: word.punctuated_word || word.word,
            speaker,
            words: [{ word: word.punctuated_word || word.word, start: word.start, end: word.end, confidence: word.confidence, speaker }],
          }
        } else {
          currentSegment.end = word.end
          currentSegment.text += ' ' + (word.punctuated_word || word.word)
          currentSegment.words.push({ word: word.punctuated_word || word.word, start: word.start, end: word.end, confidence: word.confidence, speaker })
        }
      }
      if (currentSegment) segments.push(currentSegment)
    }

    // Step 4.5: GPT speaker verification
    const fullTranscript = segments.map((s: any) => s.text).join(' ');
    await verifySpeakersWithGPT(segments, [], fullTranscript, expectedSpeakers);

    // Step 5: Calculate speaker times
    const speakerTimes: Record<string, number> = {}
    segments.forEach((seg: any) => {
      speakerTimes[seg.speaker] = (speakerTimes[seg.speaker] || 0) + (seg.end - seg.start)
    })

    // Sort by speaking time
    const sortedSpeakers = Object.entries(speakerTimes)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([speaker, time]) => ({
        speaker,
        time: Math.round((time as number) * 10) / 10,
      }))

    const uniqueSpeakers = [...new Set(segments.map((s: any) => s.speaker))]
    const totalDuration = segments.length > 0 ? segments[segments.length - 1].end : 0

    console.log(`[TRANSCRIBE] Speakers: ${uniqueSpeakers.length} | Language: ${detectedLanguage}`)
    console.log('[TRANSCRIBE] Speaker times:', speakerTimes)

    // Step 6: Rename speakers to sequential Hebrew names (דובר 1, דובר 2, etc.)
    const speakerRenameMap: Record<string, string> = {}
    sortedSpeakers.forEach((s, i) => {
      speakerRenameMap[s.speaker] = `דובר ${i + 1}`
    })

    const renamedSegments = segments.map((seg: any) => ({
      ...seg,
      speaker: speakerRenameMap[seg.speaker] || seg.speaker,
      isPresenter: false,
      words: seg.words?.map((w: any) => ({
        ...w,
        speaker: speakerRenameMap[w.speaker] || w.speaker,
      })),
    }))

    const renamedSpeakerTimes: Record<string, number> = {}
    Object.entries(speakerTimes).forEach(([speaker, time]) => {
      renamedSpeakerTimes[speakerRenameMap[speaker] || speaker] = time as number
    })

    const renamedSortedSpeakers = sortedSpeakers.map(s => ({
      speaker: speakerRenameMap[s.speaker] || s.speaker,
      time: s.time,
    }))

    console.log('[TRANSCRIBE] Renamed speakers:', renamedSortedSpeakers)

    // Step 7: Presenter detection with visual cross-reference
    let mainSpeaker = renamedSortedSpeakers[0]?.speaker || 'דובר 1'
    let presenterConfidence = 'low'
    console.log(`[TRANSCRIBE] Preliminary presenter: ${mainSpeaker}`)

    // Run visual cross-reference to identify presenter (AUTHORITATIVE for medium/high confidence)
    try {
      const presenterResult = await identifyPresenterWithVisualCrossReference(
        { segments: renamedSegments },
        localFilePath,
        renamedSpeakerTimes,
        timestamp
      )
      if (presenterResult.confidence === 'high' || presenterResult.confidence === 'medium') {
        // Visual cross-reference is authoritative
        mainSpeaker = presenterResult.presenter
        presenterConfidence = presenterResult.confidence
        console.log(`[PRESENTER] Visual cross-reference: ${mainSpeaker} (${presenterConfidence}) - AUTHORITATIVE`)
      } else {
        // Low confidence - fall back to most talking time
        mainSpeaker = renamedSortedSpeakers[0]?.speaker || 'דובר 1'
        presenterConfidence = 'low'
        console.log(`[PRESENTER] Visual confidence low, using most talking time: ${mainSpeaker}`)
      }
    } catch (e: any) {
      console.warn(`[TRANSCRIBE] Visual cross-reference failed, using time-based:`, e.message?.substring(0, 100))
    }

    // Mark presenter on segments
    renamedSegments.forEach((seg: any) => {
      seg.isPresenter = matchesSpeaker(seg.speaker, mainSpeaker)
    })

    // Step 8: Extract audio samples for each speaker
    const speakerSamples: Record<string, string> = {}
    const ffmpegForSamples = getFFmpeg()

    for (const speaker of renamedSortedSpeakers) {
      const speakerSegs = renamedSegments
        .filter((s: any) => s.speaker === speaker.speaker)
        .sort((a: any, b: any) => (b.end - b.start) - (a.end - a.start))

      if (speakerSegs.length === 0) continue

      const bestSeg = speakerSegs[0]
      const sampleStart = bestSeg.start
      const sampleDuration = Math.min(bestSeg.end - bestSeg.start, 5)

      const speakerNum = speaker.speaker.match(/\d+/)?.[0] || '0'
      const sampleFile = path.join(uploadsDir, `speaker_sample_${timestamp}_${speakerNum}.mp3`)

      try {
        const cmd = `"${ffmpegForSamples}" -i "${localFilePath}" -ss ${sampleStart.toFixed(3)} -t ${sampleDuration.toFixed(3)} -vn -c:a libmp3lame -b:a 128k "${sampleFile}" -y`
        execSync(cmd, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 })

        if (fs.existsSync(sampleFile) && fs.statSync(sampleFile).size > 1000) {
          speakerSamples[speaker.speaker] = `http://localhost:${process.env.PORT || PORT}/uploads/${path.basename(sampleFile)}`
          console.log(`[TRANSCRIBE] ✅ Sample for ${speaker.speaker}: ${sampleDuration.toFixed(1)}s`)
        }
      } catch (e: any) {
        console.warn(`[TRANSCRIBE] ❌ Sample failed for ${speaker.speaker}`)
      }
    }

    // Build speakers array for response
    const speakerColors = ['#7C5CFF', '#E94560', '#00D2FF', '#FFD700', '#00FF88', '#FF6B35']
    const speakers = renamedSortedSpeakers.map((s, i) => ({
      name: s.speaker,
      color: speakerColors[i % speakerColors.length],
    }))

    // Step 9: Build response
    const response = {
      segments: renamedSegments,
      speakers,
      speakerTimes: renamedSpeakerTimes,
      sortedSpeakers: renamedSortedSpeakers.map(s => ({
        ...s,
        sampleUrl: speakerSamples[s.speaker] || null,
        sampleText: renamedSegments.find((seg: any) => seg.speaker === s.speaker)?.text?.substring(0, 80) || '',
        isPresenter: matchesSpeaker(s.speaker, mainSpeaker),
      })),
      mainSpeaker,
      presenterConfidence,
      totalDuration,
      duration: totalDuration,
      text: alternatives?.transcript || '',
      model: 'deepgram-nova-3',
      detectedLanguage,
      wordCount: words.length,
      confidence: alternatives?.confidence || 0,
      autoDetected: true,
    }

    console.log(`[TRANSCRIBE] Done: ${renamedSegments.length} segments, ${uniqueSpeakers.length} speakers, ${totalDuration.toFixed(1)}s, language: ${detectedLanguage}, model: deepgram-nova-3`)

    // Clean up extracted audio
    try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath) } catch {}
    // Clean up temp source file
    if (isTemp && fs.existsSync(localFilePath)) try { fs.unlinkSync(localFilePath) } catch {}

    res.json(response)

  } catch (error: any) {
    console.error('[TRANSCRIBE] Deepgram failed:', error.message)
    console.log('[TRANSCRIBE] Falling back to GPT-4o...')
    return handleGPTAutoTranscribe(req, res)
  }
})

// ==================== SPEAKER VERIFICATION ====================
// Multi-signal verification: Repetition Pattern + Volume Analysis + GPT-5.4 + Visual Cross-Reference

/**
 * Method 1: Repetition Pattern Detection (FREE, most reliable)
 * Detects dictation pairs where production assistant says a line and presenter repeats it.
 */
function detectRepetitionPatterns(segments: any[]): void {
  for (let i = 0; i < segments.length - 1; i++) {
    const segA = segments[i]
    const segB = segments[i + 1]
    if (!segA.text || !segB.text) continue

    const wordsA = segA.text.replace(/[,.\-!?״"׳']/g, '').split(/\s+/).filter((w: string) => w.length > 0)
    const wordsB = segB.text.replace(/[,.\-!?״"׳']/g, '').split(/\s+/).filter((w: string) => w.length > 0)
    if (wordsA.length === 0 || wordsB.length === 0) continue

    // Word overlap
    const setA = new Set(wordsA.map((w: string) => w.toLowerCase()))
    const setB = new Set(wordsB.map((w: string) => w.toLowerCase()))
    let overlap = 0
    for (const w of setA) { if (setB.has(w)) overlap++ }
    const shorter = Math.min(setA.size, setB.size)
    const similarity = shorter > 0 ? overlap / shorter : 0

    // Check time gap (within 3 seconds)
    const gap = segB.start - segA.end

    // Dictation pair: high similarity or (moderate similarity + close timing)
    if (similarity > 0.5 || (similarity > 0.4 && gap < 3)) {
      segA._verification = segA._verification || {}
      segA._verification.repetitionRole = 'dictator'
      segA._verification.repetitionSimilarity = Math.round(similarity * 100)
      segA._verification.repetitionPairIndex = i + 1

      segB._verification = segB._verification || {}
      segB._verification.repetitionRole = 'repeater'
      segB._verification.repetitionSimilarity = Math.round(similarity * 100)
      segB._verification.repetitionPairIndex = i

      console.log(`[SPEAKER VERIFY] Dictation pair: seg ${i} → seg ${i + 1} (similarity=${(similarity * 100).toFixed(0)}%, gap=${gap.toFixed(1)}s)`)
    }
  }

  // Mark remaining segments as 'none'
  for (const seg of segments) {
    if (!seg._verification) seg._verification = {}
    if (!seg._verification.repetitionRole) seg._verification.repetitionRole = 'none'
  }
}

/**
 * Method 2: Volume Analysis (FREE)
 * Measures mean volume per segment using FFmpeg volumedetect.
 */
async function analyzeSegmentVolumes(segments: any[], videoPath: string): Promise<{ medianDb: number }> {
  const ffmpeg = getFFmpeg()
  const volumes: number[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    seg._verification = seg._verification || {}

    // Skip segments shorter than 0.5 seconds
    const duration = seg.end - seg.start
    if (duration < 0.5) {
      seg._verification.volumeDb = null
      seg._verification.volumeFlag = 'normal'
      continue
    }

    try {
      const cmd = `"${ffmpeg}" -i "${videoPath}" -ss ${seg.start.toFixed(3)} -to ${seg.end.toFixed(3)} -af "volumedetect" -f null /dev/null 2>&1`
      const output = execSync(cmd, { timeout: 10000, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 })
      const match = output.match(/mean_volume:\s*([-\d.]+)\s*dB/)
      if (match) {
        const db = parseFloat(match[1])
        seg._verification.volumeDb = db
        volumes.push(db)
      } else {
        seg._verification.volumeDb = null
        seg._verification.volumeFlag = 'normal'
      }
    } catch {
      seg._verification.volumeDb = null
      seg._verification.volumeFlag = 'normal'
    }
  }

  // Calculate median
  if (volumes.length === 0) return { medianDb: 0 }
  const sorted = [...volumes].sort((a, b) => a - b)
  const medianDb = sorted[Math.floor(sorted.length / 2)]

  // Flag segments more than 5dB quieter than median
  for (const seg of segments) {
    if (seg._verification.volumeDb == null) continue
    const diff = medianDb - seg._verification.volumeDb
    if (diff > 5) {
      seg._verification.volumeFlag = 'quiet'
    } else if (diff < -5) {
      seg._verification.volumeFlag = 'loud'
    } else {
      seg._verification.volumeFlag = 'normal'
    }
  }

  return { medianDb }
}

/**
 * Method 3: GPT-5.4 Deep Analysis (~$0.03)
 * Sends all segments with context to GPT for classification.
 */
async function classifyWithGPT(segments: any[], medianDb: number): Promise<boolean> {
  try {
    const ai = await getOpenAI()
    if (!ai) {
      console.warn('[SPEAKER VERIFY] OpenAI not available, skipping GPT classification')
      return false
    }

    const segmentData = segments.map((seg: any, i: number) => ({
      index: i,
      start: parseFloat(seg.start.toFixed(1)),
      end: parseFloat(seg.end.toFixed(1)),
      text: seg.text,
      current_speaker_label: seg.speaker,
      volume_db: seg._verification?.volumeDb ?? null,
      word_count: (seg.text || '').split(/\s+/).filter((w: string) => w.length > 0).length,
      gap_to_next_segment_seconds: i < segments.length - 1
        ? parseFloat((segments[i + 1].start - seg.end).toFixed(1))
        : null,
    }))

    const systemPrompt = `You are an expert video editor analyzing a Hebrew transcript from a marketing video shoot.
FILMING SCENARIO:
* One PRESENTER sits in front of camera delivering content
* One PRODUCTION ASSISTANT stands behind the camera
* The assistant DICTATES lines to the presenter
* The presenter REPEATS what the assistant said, speaking to camera
* Sometimes the assistant also gives directions: "עוד פעם", "יופי", "מוכן?", "בוא נעשה עוד טייק"
YOUR JOB: For each segment, determine if the speaker is the PRESENTER or the PRODUCTION ASSISTANT.
DETECTION RULES:
1. DICTATION PATTERN: If two consecutive segments have very similar text, the FIRST one is the assistant dictating and the SECOND is the presenter repeating. This is the most reliable signal.
2. DIRECTIONS: Short phrases like "עוד פעם", "נתחיל", "יופי", "מוכן?", "בוא", "תגיד", "תחזור", "עצור", "מצוין", "פעם אחרונה", "בוא נעשה" are ALWAYS the production assistant.
3. REACTIONS: Very short segments (1-3 words) that are reactions like "פאק", "יאללה", "אוקיי", "כן" between longer segments are usually the production assistant.
4. DELIVERY STYLE: The presenter speaks in complete, polished sentences directed at an audience. The assistant speaks in casual, directive tone to the presenter.
5. VOLUME DATA: Lower volume (more negative dB) suggests the person is further from the mic (likely assistant), but this is not always reliable.
6. CONTEXT: Consider the flow — if the presenter was speaking, then a quiet/short segment appears, then the presenter continues the same topic — that middle segment is likely the assistant giving feedback.
Be VERY careful: the assistant and presenter often say THE SAME WORDS. The difference is in the PATTERN (who said it first) and CONTEXT.`

    const userPrompt = `Here are all transcript segments with timing and volume data:
${JSON.stringify(segmentData, null, 1)}

For each segment respond with:
* segment_index: number
* is_presenter: true or false
* confidence: "high", "medium", or "low"
* reason: brief explanation

CRITICAL: Respond ONLY with a valid JSON array. No markdown, no backticks, no explanation outside the array.`

    const response = await callOpenAIWithRetry(ai, {
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_completion_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content?.trim() || ''
    const cleanContent = content.replace(/```json|```/g, '').trim()
    const classifications = JSON.parse(cleanContent)

    if (!Array.isArray(classifications)) {
      console.warn('[SPEAKER VERIFY] GPT returned non-array, skipping')
      return false
    }

    for (const cls of classifications) {
      const idx = cls.segment_index
      if (idx != null && segments[idx]) {
        segments[idx]._verification = segments[idx]._verification || {}
        segments[idx]._verification.gptClassification = {
          isPresenter: cls.is_presenter,
          confidence: cls.confidence || 'low',
          reason: cls.reason || '',
        }
      }
    }

    console.log(`[SPEAKER VERIFY] GPT classified ${classifications.length} segments`)
    return true
  } catch (e: any) {
    console.warn(`[SPEAKER VERIFY] GPT classification failed: ${e.message?.substring(0, 150)}`)
    return false
  }
}

/**
 * Method 4: Visual Cross-Reference (FREE, uses existing frames)
 * For uncertain segments, check if the presenter's mouth is open.
 */
async function visualCrossReference(segments: any[], videoPath: string, maxChecks: number = 5): Promise<number> {
  const ai = await getOpenAI()
  if (!ai) return 0

  const ffmpeg = getFFmpeg()
  let checksPerformed = 0

  // Find uncertain segments: methods disagree or low confidence
  const uncertainIndices: number[] = []
  for (let i = 0; i < segments.length; i++) {
    const v = segments[i]._verification || {}
    if (v.repetitionRole !== 'none') continue // repetition already decided

    const gptConf = v.gptClassification?.confidence
    const gptPresenter = v.gptClassification?.isPresenter
    const volumeQuiet = v.volumeFlag === 'quiet'

    // Uncertain: GPT low confidence, or GPT and volume disagree
    if (gptConf === 'low' || (gptConf === 'medium' && gptPresenter && volumeQuiet)) {
      uncertainIndices.push(i)
    }
  }

  if (uncertainIndices.length === 0) {
    console.log('[SPEAKER VERIFY] No uncertain segments for visual check')
    return 0
  }

  const toCheck = uncertainIndices.slice(0, maxChecks)
  console.log(`[SPEAKER VERIFY] Visual cross-reference for ${toCheck.length} uncertain segments`)

  for (const idx of toCheck) {
    const seg = segments[idx]
    const midpoint = (seg.start + seg.end) / 2

    try {
      // Extract a frame at the midpoint
      const framePath = path.join(uploadsDir, `sv_frame_${Date.now()}_${idx}.jpg`)
      execSync(
        `"${ffmpeg}" -i "${videoPath}" -ss ${midpoint.toFixed(3)} -frames:v 1 -q:v 2 "${framePath}" -y`,
        { timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
      )

      if (!fs.existsSync(framePath) || fs.statSync(framePath).size < 500) {
        seg._verification.visualCheck = 'not_checked'
        continue
      }

      const imageBuffer = fs.readFileSync(framePath)
      const base64Image = imageBuffer.toString('base64')

      const visionResponse = await ai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Is the person in this image speaking (mouth open) or listening (mouth closed)? Respond with ONLY one word: "speaking" or "listening".',
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'low' },
            },
          ],
        }],
        max_tokens: 10,
      })

      const answer = visionResponse.choices[0]?.message?.content?.trim().toLowerCase() || ''
      if (answer.includes('speaking')) {
        seg._verification.visualCheck = 'speaking'
      } else if (answer.includes('listening')) {
        seg._verification.visualCheck = 'listening'
      } else {
        seg._verification.visualCheck = 'not_checked'
      }

      checksPerformed++

      // Clean up frame
      try { fs.unlinkSync(framePath) } catch {}
    } catch (e: any) {
      console.warn(`[SPEAKER VERIFY] Visual check failed for seg ${idx}: ${e.message?.substring(0, 80)}`)
      seg._verification.visualCheck = 'not_checked'
    }
  }

  return checksPerformed
}

/**
 * Voting Logic: Combine all signals to make a final decision per segment.
 */
function applyVotingLogic(segments: any[]): void {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const v = seg._verification || {}
    const wordCount = (seg.text || '').split(/\s+/).filter((w: string) => w.length > 0).length

    let verdict: 'presenter' | 'production_assistant' = 'presenter'
    let confidenceLevel: 'high' | 'medium' | 'low' = 'low'

    // Rule 1: Repetition pattern wins
    if (v.repetitionRole === 'dictator') {
      verdict = 'production_assistant'
      confidenceLevel = 'high'
    } else if (v.repetitionRole === 'repeater') {
      verdict = 'presenter'
      confidenceLevel = 'high'
    }
    // Rule 2: GPT high confidence + short segment
    else if (v.gptClassification?.confidence === 'high' && !v.gptClassification.isPresenter && wordCount < 5) {
      verdict = 'production_assistant'
      confidenceLevel = 'high'
    }
    // Rule 3: Multiple signals agree
    else {
      let notPresenterSignals = 0
      if (v.gptClassification && !v.gptClassification.isPresenter) notPresenterSignals++
      if (v.volumeFlag === 'quiet') notPresenterSignals++
      if (v.visualCheck === 'listening') notPresenterSignals++

      if (notPresenterSignals >= 2) {
        verdict = 'production_assistant'
        confidenceLevel = 'medium'
      }
      // Rule 4: GPT medium + volume quiet
      else if (v.gptClassification?.confidence === 'medium' && !v.gptClassification.isPresenter && v.volumeFlag === 'quiet') {
        verdict = 'production_assistant'
        confidenceLevel = 'medium'
      }
      // Rule 5: Visual tiebreaker
      else if (v.visualCheck === 'listening') {
        verdict = 'production_assistant'
        confidenceLevel = 'low'
      }
      // Rule 6: Default — keep as presenter
      else {
        if (v.gptClassification) {
          verdict = v.gptClassification.isPresenter ? 'presenter' : 'production_assistant'
          confidenceLevel = v.gptClassification.confidence || 'low'
        } else {
          verdict = 'presenter'
          confidenceLevel = 'low'
        }
      }
    }

    v.finalVerdict = verdict
    v.confidenceLevel = confidenceLevel
    seg._verification = v
  }
}

app.post('/api/auto-editor/verify-speakers', async (req, res) => {
  const { segments, videoUrl, framesDir } = req.body

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ message: 'חסר segments' })
  }

  console.log(`[SPEAKER VERIFY] === Starting verification for ${segments.length} segments ===`)
  const startTime = Date.now()

  // Resolve local video path
  let localFilePath = ''
  try {
    if (videoUrl.startsWith(`http://localhost:${PORT}/uploads/`) || videoUrl.startsWith('/uploads/')) {
      const filename = path.basename(new URL(videoUrl, `http://localhost:${PORT}`).pathname)
      localFilePath = path.join(uploadsDir, filename)
    } else if (videoUrl.startsWith('http')) {
      // Download remote file
      const fileResponse = await fetch(videoUrl)
      if (!fileResponse.ok) throw new Error(`Download failed: ${fileResponse.statusText}`)
      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())
      localFilePath = path.join(uploadsDir, `temp-sv-${Date.now()}.mp4`)
      fs.writeFileSync(localFilePath, fileBuffer)
    }
  } catch (e: any) {
    console.warn(`[SPEAKER VERIFY] Could not resolve video path: ${e.message?.substring(0, 100)}`)
  }

  const hasVideo = localFilePath && fs.existsSync(localFilePath)

  // Make working copies with _verification field
  const workingSegments = segments.map((s: any) => ({ ...s, _verification: {} }))

  // --- Method 1: Repetition Pattern Detection ---
  console.log('[SPEAKER VERIFY] Method 1: Repetition pattern detection...')
  detectRepetitionPatterns(workingSegments)
  const dictationPairs = workingSegments.filter((s: any) => s._verification.repetitionRole === 'dictator').length
  console.log(`[SPEAKER VERIFY] Found ${dictationPairs} dictation pairs`)

  // --- Method 2: Volume Analysis ---
  let medianDb = 0
  let volumeFlagged = 0
  if (hasVideo) {
    console.log('[SPEAKER VERIFY] Method 2: Volume analysis...')
    const volumeResult = await analyzeSegmentVolumes(workingSegments, localFilePath)
    medianDb = volumeResult.medianDb
    volumeFlagged = workingSegments.filter((s: any) => s._verification.volumeFlag === 'quiet').length
    console.log(`[SPEAKER VERIFY] Volume: median=${medianDb.toFixed(1)}dB, ${volumeFlagged} flagged as quiet`)
  } else {
    console.log('[SPEAKER VERIFY] Method 2: Skipped (no video file)')
    workingSegments.forEach((s: any) => { s._verification.volumeFlag = 'normal' })
  }

  // --- Method 3: GPT-5.4 Deep Analysis ---
  console.log('[SPEAKER VERIFY] Method 3: GPT-5.4 deep analysis...')
  const gptSuccess = await classifyWithGPT(workingSegments, medianDb)
  const gptClassified = gptSuccess ? workingSegments.filter((s: any) => s._verification.gptClassification).length : 0

  // --- Method 4: Visual Cross-Reference (only for uncertain segments) ---
  let visualChecked = 0
  if (hasVideo) {
    console.log('[SPEAKER VERIFY] Method 4: Visual cross-reference (uncertain segments only)...')
    visualChecked = await visualCrossReference(workingSegments, localFilePath, 5)
    console.log(`[SPEAKER VERIFY] Visual: ${visualChecked} segments checked`)
  } else {
    workingSegments.forEach((s: any) => { s._verification.visualCheck = 'not_checked' })
  }

  // --- Apply Voting Logic ---
  console.log('[SPEAKER VERIFY] Applying voting logic...')
  applyVotingLogic(workingSegments)

  // --- Determine which speaker label is the presenter ---
  const presenterVotes: Record<string, number> = {}
  for (const seg of workingSegments) {
    if (seg._verification.finalVerdict === 'presenter') {
      presenterVotes[seg.speaker] = (presenterVotes[seg.speaker] || 0) + 1
    }
  }
  const presenterLabel = Object.entries(presenterVotes)
    .sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || segments[0]?.speaker || 'דובר 1'

  // --- Per-segment logging & relabeling ---
  let presenterSegCount = 0
  let presenterDuration = 0
  let assistantSegCount = 0
  let assistantDuration = 0
  let highConf = 0
  let medConf = 0
  let lowConf = 0

  const correctedSegments = workingSegments.map((seg: any, i: number) => {
    const v = seg._verification
    const dur = seg.end - seg.start
    const isPresenter = v.finalVerdict === 'presenter'
    const conf = v.confidenceLevel || 'low'

    if (conf === 'high') highConf++
    else if (conf === 'medium') medConf++
    else lowConf++

    if (isPresenter) {
      presenterSegCount++
      presenterDuration += dur
    } else {
      assistantSegCount++
      assistantDuration += dur
    }

    // Per-segment log
    const repInfo = v.repetitionRole !== 'none'
      ? `repetition=${v.repetitionRole} (sim=${v.repetitionSimilarity || 0}% with seg ${v.repetitionPairIndex ?? '?'})`
      : 'repetition=none'
    const volInfo = v.volumeDb != null
      ? `volume=${v.volumeDb.toFixed(1)}dB (median=${medianDb.toFixed(1)}, diff=${(medianDb - v.volumeDb).toFixed(1)}dB, ${v.volumeFlag})`
      : 'volume=skipped'
    const gptInfo = v.gptClassification
      ? `gpt=${v.gptClassification.isPresenter ? 'presenter' : 'not_presenter'} (${v.gptClassification.confidence}) "${v.gptClassification.reason}"`
      : 'gpt=skipped'
    const visInfo = v.visualCheck !== 'not_checked' ? `visual=${v.visualCheck}` : ''
    const resultLabel = isPresenter ? `${presenterLabel} ✓` : 'עוזר הפקה ✗'

    console.log(`[SPEAKER VERIFY] Seg ${i} (${seg.start.toFixed(1)}-${seg.end.toFixed(1)}s) "${(seg.text || '').substring(0, 30)}..." [${seg.speaker}]: ${repInfo} ${volInfo} ${gptInfo} ${visInfo} → RESULT: ${resultLabel}`)

    // Return corrected segment
    const corrected: any = {
      start: seg.start,
      end: seg.end,
      text: seg.text,
      speaker: isPresenter ? presenterLabel : 'עוזר הפקה',
      isPresenter,
      words: seg.words,
      speakerVerification: {
        repetitionRole: v.repetitionRole || 'none',
        repetitionSimilarity: v.repetitionSimilarity,
        repetitionPairIndex: v.repetitionPairIndex,
        volumeDb: v.volumeDb,
        volumeFlag: v.volumeFlag || 'normal',
        gptClassification: v.gptClassification,
        visualCheck: v.visualCheck || 'not_checked',
        finalVerdict: v.finalVerdict,
      },
    }
    return corrected
  })

  // --- Summary log ---
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[SPEAKER VERIFY] === Summary ===`)
  console.log(`[SPEAKER VERIFY] Total segments: ${segments.length}`)
  console.log(`[SPEAKER VERIFY] Presenter (${presenterLabel}): ${presenterSegCount} segments (${presenterDuration.toFixed(1)}s)`)
  console.log(`[SPEAKER VERIFY] Production assistant: ${assistantSegCount} segments (${assistantDuration.toFixed(1)}s)`)
  console.log(`[SPEAKER VERIFY] Detection methods used: repetition=${dictationPairs} pairs found, volume=${volumeFlagged} flagged, gpt=${gptClassified} classified`)
  console.log(`[SPEAKER VERIFY] Dictation pairs found: ${dictationPairs} (assistant dictates, presenter repeats)`)
  console.log(`[SPEAKER VERIFY] High confidence: ${highConf}/${segments.length}, Medium: ${medConf}/${segments.length}, Low: ${lowConf}/${segments.length}`)
  console.log(`[SPEAKER VERIFY] Completed in ${elapsed}s`)

  const summary = {
    totalSegments: segments.length,
    presenterSegments: presenterSegCount,
    presenterDuration: parseFloat(presenterDuration.toFixed(1)),
    assistantSegments: assistantSegCount,
    assistantDuration: parseFloat(assistantDuration.toFixed(1)),
    dictationPairsFound: dictationPairs,
    volumeFlagged,
    gptClassified,
    highConfidence: highConf,
    mediumConfidence: medConf,
    lowConfidence: lowConf,
    presenterLabel,
    elapsed: parseFloat(elapsed),
  }

  res.json({
    segments: correctedSegments,
    summary,
    presenterLabel,
  })
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

// Color grade presets — rich cinematic looks
const colorGrades: Record<string, string> = {
  cinematic: "eq=brightness=-0.03:contrast=1.25:saturation=0.85,curves=m='0/0:0.15/0.05:0.5/0.5:0.85/0.95:1/1',colorbalance=rs=0.03:gs=-0.02:bs=0.05:rh=0.05:gh=-0.02:bh=0.02,vignette=PI/4",
  warm: "eq=brightness=0.04:contrast=1.1:saturation=1.15,colorbalance=rs=0.15:gs=0.08:bs=-0.1:rm=0.1:gm=0.05:bm=-0.08:rh=0.08:gh=0.03:bh=-0.05,curves=r='0/0:0.5/0.55:1/1':b='0/0.05:0.5/0.45:1/0.9'",
  cold: "eq=brightness=0.01:contrast=1.12:saturation=0.9,colorbalance=rs=-0.1:gs=-0.03:bs=0.15:rm=-0.08:gm=0.02:bm=0.12:rh=-0.05:gh=0.01:bh=0.1,curves=b='0/0.05:0.5/0.58:1/1':r='0/0:0.5/0.45:1/0.92'",
  vintage: "eq=brightness=0.05:contrast=0.9:saturation=0.6,curves=r='0/0.12:0.5/0.52:1/0.88':g='0/0.08:0.5/0.48:1/0.9':b='0/0.05:0.5/0.4:1/0.8',vignette=PI/3.5",
  vibrant: "eq=brightness=0.04:contrast=1.25:saturation=1.5,unsharp=5:5:1.2:5:5:0.0,curves=m='0/0:0.4/0.35:0.6/0.7:1/1'",
  moody: "eq=brightness=-0.05:contrast=1.3:saturation=0.7,curves=m='0/0:0.2/0.08:0.5/0.45:0.8/0.9:1/1',colorbalance=rs=0.02:gs=-0.03:bs=0.05,vignette=PI/3",
  clean: 'eq=brightness=0.04:contrast=1.08:saturation=1.08,unsharp=3:3:0.6',
  film: "eq=brightness=0.0:contrast=1.15:saturation=0.9,curves=r='0/0.03:0.5/0.5:1/0.95':g='0/0.02:0.5/0.48:1/0.95':b='0/0.05:0.5/0.5:1/0.92',vignette=PI/4.5,colorbalance=rm=0.03:gm=-0.01:bm=-0.02",
}

// Hebrew font path for ASS subtitles — Heebo variable font (supports Bold weight)
const HEBREW_FONT_PATH = path.resolve(__dirname, 'assets', 'fonts', 'Heebo-Bold.ttf')
const HEBREW_FONT_DIR = path.resolve(__dirname, 'assets', 'fonts')
const HEBREW_FONT_NAME = 'Heebo'

// Ensure the font file is available next to the ASS file for FFmpeg fontsdir
function ensureFontInDir(targetDir: string): string {
  const targetFont = path.join(targetDir, 'Heebo-Bold.ttf')
  if (!fs.existsSync(targetFont) && fs.existsSync(HEBREW_FONT_PATH)) {
    fs.copyFileSync(HEBREW_FONT_PATH, targetFont)
  }
  return targetFont
}

// Remove overlapping subtitle events: sort by start time, trim overlaps, add 50ms gaps
function deoverlapSubtitleEvents(events: Array<{ start: number; end: number; text: string }>): Array<{ start: number; end: number; text: string }> {
  if (events.length === 0) return events
  // Sort by start time
  events.sort((a, b) => a.start - b.start)
  // Trim overlaps — each event must end before next starts (50ms gap)
  const GAP = 0.05 // 50ms
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].end > events[i + 1].start - GAP) {
      events[i].end = Math.max(events[i].start + 0.1, events[i + 1].start - GAP)
    }
  }
  return events
}

// Log first N subtitle entries for debugging
function logFirstSubtitles(label: string, subs: Array<{ start: number; end: number; text: string }>, count: number = 3): void {
  console.log(`[SUBTITLE DEBUG] ${label} — first ${Math.min(count, subs.length)} of ${subs.length}:`)
  for (let i = 0; i < Math.min(count, subs.length); i++) {
    console.log(`  [${i + 1}] ${subs[i].start.toFixed(2)}s → ${subs[i].end.toFixed(2)}s | "${subs[i].text}"`)
  }
}

// Word-level timing from Deepgram transcript
interface WordTiming {
  word: string
  start: number
  end: number
}

// A phrase group: 3-5 words with their timestamps
interface PhraseGroup {
  words: WordTiming[]
  start: number  // start of first word
  end: number    // end of last word
  text: string   // joined words
}

// Group words into phrases of 3-5 words, splitting on pauses > 300ms, sentence boundaries, or max 5 words
function groupWordsIntoPhrases(words: WordTiming[], maxWords: number = 5, pauseThreshold: number = 0.3): PhraseGroup[] {
  if (words.length === 0) return []
  const groups: PhraseGroup[] = []
  let currentGroup: WordTiming[] = []

  for (let i = 0; i < words.length; i++) {
    currentGroup.push(words[i])

    const isLast = i === words.length - 1
    const reachedMax = currentGroup.length >= maxWords
    // Check for pause before next word
    const hasPause = !isLast && (words[i + 1].start - words[i].end) > pauseThreshold
    // Check for sentence boundary (period, question mark, exclamation)
    const isSentenceEnd = /[.?!。؟]$/.test(words[i].word)

    if (isLast || reachedMax || hasPause || isSentenceEnd) {
      if (currentGroup.length > 0) {
        groups.push({
          words: [...currentGroup],
          start: currentGroup[0].start,
          end: currentGroup[currentGroup.length - 1].end,
          text: currentGroup.map(w => w.word).join(' '),
        })
        currentGroup = []
      }
    }
  }

  return groups
}

// Extract word-level timings from a segment, with fallback to equal distribution
function extractWordTimings(seg: any): WordTiming[] {
  // If segment has Deepgram word-level data, use it
  if (seg.words && Array.isArray(seg.words) && seg.words.length > 0) {
    return seg.words.map((w: any) => ({
      word: w.word || w.punctuated_word || w.text || '',
      start: w.start ?? 0,
      end: w.end ?? 0,
    })).filter((w: WordTiming) => w.word.trim())
  }
  // Fallback: split text and distribute timing equally
  const text = (seg.text || '').trim()
  if (!text) return []
  const textWords = text.split(/\s+/).filter((w: string) => w)
  const segStart = seg.start ?? 0
  const segEnd = seg.end ?? 0
  const duration = segEnd - segStart
  const wordDur = duration / textWords.length
  return textWords.map((w: string, i: number) => ({
    word: w,
    start: segStart + i * wordDur,
    end: segStart + (i + 1) * wordDur,
  }))
}

// Remap word timings from original timeline to post-cut timeline
function remapWordTimings(words: WordTiming[], cuts: any[]): WordTiming[] {
  const remapped: WordTiming[] = []
  for (const w of words) {
    let offset = 0
    for (const cut of cuts) {
      const cutDur = cut.keep_end - cut.keep_start
      if (w.start >= cut.keep_start && w.end <= cut.keep_end) {
        remapped.push({
          word: w.word,
          start: offset + (w.start - cut.keep_start),
          end: offset + (w.end - cut.keep_start),
        })
        break
      }
      // Partial overlap: clamp to cut
      if (w.start < cut.keep_end && w.end > cut.keep_start) {
        const cStart = Math.max(w.start, cut.keep_start)
        const cEnd = Math.min(w.end, cut.keep_end)
        if (cEnd - cStart > 0.02) {
          remapped.push({
            word: w.word,
            start: offset + (cStart - cut.keep_start),
            end: offset + (cEnd - cut.keep_start),
          })
        }
        break
      }
      offset += cutDur
    }
  }
  return remapped
}

// Subtitle style presets (ASS format) — using Heebo Hebrew font
// Alignment=2 (bottom center), MarginV=40 (distance from bottom edge)
const subtitleStyles: Record<string, string> = {
  modern: `Style: Default,${HEBREW_FONT_NAME},24,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,40,177`,
  karaoke: `Style: Default,${HEBREW_FONT_NAME},26,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,40,177`,
  bold_white: `Style: Default,${HEBREW_FONT_NAME},28,&H00FFFFFF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,4,0,2,10,10,40,177`,
  minimal: `Style: Default,${HEBREW_FONT_NAME},22,&H00FFFFFF,&H00000000,&H00000000,&H40000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,40,177`,
  colorful: `Style: Default,${HEBREW_FONT_NAME},26,&H0000D7FF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,40,177`,
}

// Filter out speaker labels, production cues, and very short segments from subtitles
function filterSubtitleSegments(segments: any[]): any[] {
  return segments.filter((seg: any) => {
    const text = (seg.text || '').trim()
    // Remove speaker labels like "דובר 1", "דובר 2", "Speaker 1"
    if (/^דובר\s*\d*$/.test(text)) return false
    if (/^speaker\s*\d*$/i.test(text)) return false
    // Remove production cues
    if (/^(מוכן|אקשן|עוד פעם|יופי|סטופ|stop|action|ready|cut|קאט)\??!?$/i.test(text)) return false
    // Remove very short segments (less than 3 chars)
    if (text.length < 3) return false
    return true
  })
}

// Split long subtitle text into lines (max 8 words per line, max 2 lines per display)
function splitSubtitleText(text: string, maxWordsPerLine: number = 8): string[] {
  const words = text.split(' ').filter(w => w.trim())
  if (words.length <= maxWordsPerLine) return [text]

  const lines: string[] = []
  for (let i = 0; i < words.length; i += maxWordsPerLine) {
    lines.push(words.slice(i, i + maxWordsPerLine).join(' '))
  }

  // Max 2 lines per subtitle display — if more, split into multiple subtitle events
  if (lines.length <= 2) {
    return [lines.join('\\N')] // ASS line break
  }

  // Return individual chunks (each will become a separate subtitle event)
  const chunks: string[] = []
  for (let i = 0; i < lines.length; i += 2) {
    const chunk = lines.slice(i, i + 2).join('\\N')
    chunks.push(chunk)
  }
  return chunks
}

// Detect the most important word in a subtitle line for highlighting
function detectKeyWordLocal(words: string[]): string | null {
  if (words.length === 0) return null
  // Prefer numbers, then longest word (usually most meaningful)
  const numberWord = words.find(w => /\d+/.test(w))
  if (numberWord) return numberWord
  // Pick the longest word (skip very short words)
  let best = words[0]
  for (const w of words) {
    if (w.length > best.length) best = w
  }
  return best.length >= 3 ? best : null
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

  // Recalculate timestamps relative to cut video with overlap/clamp support
  const adjustedEvents: Array<{ start: number; end: number; text: string }> = []
  let currentOffset = 0
  for (const cut of cuts) {
    const cutDuration = cut.keep_end - cut.keep_start
    for (const seg of segments) {
      const segStart = seg.start ?? seg.keepStart
      const segEnd = seg.end ?? seg.keepEnd
      // Use overlap check instead of strict containment
      if (segStart < cut.keep_end && segEnd > cut.keep_start) {
        // Clamp segment to cut range
        const clampedStart = Math.max(segStart, cut.keep_start)
        const clampedEnd = Math.min(segEnd, cut.keep_end)
        const relStart = currentOffset + (clampedStart - cut.keep_start)
        const relEnd = currentOffset + (clampedEnd - cut.keep_start)
        if (relEnd - relStart < 0.1) continue // Skip tiny fragments
        adjustedEvents.push({ start: relStart, end: relEnd, text: seg.text || '' })
      }
    }
    currentOffset += cutDuration
  }

  // Fix overlaps: sort by start time, trim overlapping events, add 50ms gaps
  deoverlapSubtitleEvents(adjustedEvents)

  // Log first 3 subtitle entries for debugging
  logFirstSubtitles('generateStyledSubtitles', adjustedEvents)

  // Write dialogue lines
  for (const ev of adjustedEvents) {
    const start = formatAssTime(ev.start)
    const end = formatAssTime(ev.end)
    const text = `{\\fad(200,200)}${ev.text}`
    ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`
  }

  console.log(`[SUBTITLE] Synced ${adjustedEvents.length} subtitle segments to cut timeline. Offset adjustments applied.`)
  return ass
}

// Generate animated ASS subtitles with word-level Deepgram timestamps
// Supports: bold_pop, karaoke, word_flash, neon_glow + legacy styles
function buildAnimatedASS(subtitles: any[], style: string, cuts: any[]): string {
  const F = HEBREW_FONT_NAME // Short alias for font name
  let ass = `[Script Info]
Title: Animated Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`
  // --- Premium animated subtitle style definitions ---
  // All use Hebrew font (Heebo), Encoding=177
  switch (style) {
    case 'bold_pop':
      // White text with black outline, current word yellow — bottom center, large
      ass += `Style: Default,${F},52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,10,10,120,177\n`
      break
    case 'neon_glow':
      // White text, current word has colored glow + blur
      ass += `Style: Default,${F},48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H60000000,-1,0,0,0,100,100,0,0,1,1,2,2,10,10,120,177\n`
      break
    case 'word_flash':
      // One word at a time, large, center screen
      ass += `Style: Default,${F},72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,5,10,10,10,177\n`
      ass += `Style: Alt,${F},72,&H0000FFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,5,10,10,10,177\n`
      break
    case 'karaoke':
      // Full phrase in white, progressive RTL fill with highlight
      ass += `Style: Default,${F},48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,120,177\n`
      break
    case 'boxing':
      ass += `Style: Default,${F},20,&H00FFFFFF,&H00FFFFFF,&H00AA00AA,&H00AA00AA,-1,0,0,0,100,100,0,0,3,0,6,2,15,15,35,177\n`
      ass += `Style: Highlight,${F},22,&H00FFFFFF,&H00FFFFFF,&H000055FF,&H000055FF,-1,0,0,0,100,100,0,0,3,0,8,2,15,15,35,177\n`
      break
    case 'minimal':
      ass += `Style: Default,${F},18,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1.5,0,2,10,10,40,177\n`
      break
    // Legacy styles
    case 'pop':
      ass += `Style: Default,${F},24,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,35,177\n`
      ass += `Style: Highlight,${F},26,&H0000FFFF,&H0000FFFF,&H00000000,&HFF000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,35,177\n`
      break
    case 'typewriter':
      ass += `Style: Default,${F},20,&H0000FF00,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,35,177\n`
      break
    case 'glow':
      ass += `Style: Default,${F},22,&H00FFFFFF,&H000000FF,&H004B0082,&H80000000,-1,0,0,0,100,100,0,0,1,4,3,2,10,10,35,177\n`
      break
    case 'bounce':
      ass += `Style: Default,${F},22,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,35,177\n`
      break
    case 'slide':
      ass += `Style: Default,${F},22,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,35,177\n`
      break
    default:
      // Default to bold_pop
      ass += `Style: Default,${F},52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,10,10,120,177\n`
  }
  ass += `\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`

  // --- Collect all word-level timings from segments, remap to post-cut timeline ---
  const allWords: WordTiming[] = []
  for (const seg of subtitles) {
    const segWords = extractWordTimings(seg)
    const remapped = remapWordTimings(segWords, cuts)
    allWords.push(...remapped)
  }

  // Group words into phrases (3-5 words, split on pauses/sentence ends)
  const phrases = groupWordsIntoPhrases(allWords)

  // Fix overlaps between phrases
  deoverlapSubtitleEvents(phrases.map(p => ({ start: p.start, end: p.end, text: p.text })))

  // Log debug info
  console.log(`[SUBTITLE] Style: ${style}, ${allWords.length} words → ${phrases.length} phrase groups`)
  if (phrases.length > 0) {
    const logCount = Math.min(3, phrases.length)
    console.log(`[SUBTITLE DEBUG] buildAnimatedASS — first ${logCount} of ${phrases.length} phrases:`)
    for (let i = 0; i < logCount; i++) {
      const p = phrases[i]
      console.log(`  [${i + 1}] ${p.start.toFixed(2)}s → ${p.end.toFixed(2)}s | "${p.text}" (${p.words.length} words)`)
    }
  }

  // Premium styles that use word-level phrases
  const premiumStyles = ['bold_pop', 'karaoke', 'word_flash', 'neon_glow']

  if (premiumStyles.includes(style)) {
    // === PREMIUM WORD-LEVEL ANIMATIONS ===
    switch (style) {
      case 'bold_pop': {
        // Phrase-based: all words visible in white, current word highlighted yellow
        for (const phrase of phrases) {
          const pStart = formatAssTime(phrase.start)
          const pEnd = formatAssTime(phrase.end)

          // Build the phrase text with per-word color transitions
          // Each word gets a \t transform that changes it to yellow at its start time and back to white at the next word
          let phraseAss = ''
          for (let wi = 0; wi < phrase.words.length; wi++) {
            const w = phrase.words[wi]
            const relWordStart = Math.round((w.start - phrase.start) * 1000)
            const relWordEnd = Math.round((w.end - phrase.start) * 1000)

            // Current word: white initially, turns yellow when spoken, then back to white
            // Using override blocks per word
            if (wi > 0) phraseAss += ' '
            // Yellow highlight: \c&H00FFFF& (ASS BGR = yellow), scale up
            phraseAss += `{\\c&HFFFFFF&\\bord4\\t(${relWordStart},${relWordStart + 50},\\c&H00FFFF&\\fscx110\\fscy110)\\t(${relWordEnd},${relWordEnd + 50},\\c&HFFFFFF&\\fscx100\\fscy100)}${w.word}`
          }

          ass += `Dialogue: 0,${pStart},${pEnd},Default,,0,0,0,,{\\fad(100,0)}${phraseAss}\n`
        }
        break
      }

      case 'karaoke': {
        // Full phrase visible in white, words progressively fill with highlight color
        // Hebrew RTL: ASS \kf tag fills from logical start (right side for RTL)
        for (const phrase of phrases) {
          const pStart = formatAssTime(phrase.start)
          const pEnd = formatAssTime(phrase.end)

          // Build karaoke line with \kf tags — duration in centiseconds
          let karaokeText = '{\\fad(150,100)}'
          for (let wi = 0; wi < phrase.words.length; wi++) {
            const w = phrase.words[wi]
            const wordDurCs = Math.round((w.end - w.start) * 100) // centiseconds
            if (wi > 0) karaokeText += ' '
            // \kf = smooth fill karaoke, duration in centiseconds
            karaokeText += `{\\kf${wordDurCs}}${w.word}`
          }

          // Layer 0: base text (dimmed), Layer 1: karaoke fill
          ass += `Dialogue: 0,${pStart},${pEnd},Default,,0,0,0,,{\\c&H888888&\\fad(150,100)}${phrase.text}\n`
          ass += `Dialogue: 1,${pStart},${pEnd},Default,,0,0,0,,${karaokeText}\n`
        }
        break
      }

      case 'word_flash': {
        // ONE word at a time, large, center screen, alternating white/yellow
        for (let i = 0; i < allWords.length; i++) {
          const w = allWords[i]
          if (!w.word.trim()) continue
          const wStart = formatAssTime(w.start)
          const wEnd = formatAssTime(w.end)
          const styleName = (i % 2 === 0) ? 'Default' : 'Alt'
          // Pop in with scale overshoot then ease back
          ass += `Dialogue: 0,${wStart},${wEnd},${styleName},,0,0,0,,{\\fscx130\\fscy130\\t(0,150,\\fscx100\\fscy100)}${w.word}\n`
        }
        break
      }

      case 'neon_glow': {
        // Like bold_pop but current word has blur + colored border, others plain white
        for (const phrase of phrases) {
          const pStart = formatAssTime(phrase.start)
          const pEnd = formatAssTime(phrase.end)

          let phraseAss = ''
          for (let wi = 0; wi < phrase.words.length; wi++) {
            const w = phrase.words[wi]
            const relWordStart = Math.round((w.start - phrase.start) * 1000)
            const relWordEnd = Math.round((w.end - phrase.start) * 1000)

            if (wi > 0) phraseAss += ' '
            // Non-active: white, \bord1, no blur. Active: colored, \blur2, \bord3, \shad2
            phraseAss += `{\\c&HFFFFFF&\\bord1\\blur0\\shad0\\t(${relWordStart},${relWordStart + 50},\\c&HFF8800&\\bord3\\blur2\\shad2)\\t(${relWordEnd},${relWordEnd + 50},\\c&HFFFFFF&\\bord1\\blur0\\shad0)}${w.word}`
          }

          ass += `Dialogue: 0,${pStart},${pEnd},Default,,0,0,0,,{\\fad(100,0)}${phraseAss}\n`
        }
        break
      }
    }
  } else {
    // === LEGACY STYLES (use segment-level timing with equal word distribution) ===
    // Recalculate timestamps relative to cut video
    const adjustedSubs: Array<{ start: number; end: number; text: string }> = []
    let currentOffset = 0
    for (const cut of cuts) {
      const cutDuration = cut.keep_end - cut.keep_start
      for (const seg of subtitles) {
        const segStart = seg.start ?? seg.keepStart ?? 0
        const segEnd = seg.end ?? seg.keepEnd ?? 0
        if (segStart < cut.keep_end && segEnd > cut.keep_start) {
          const clampedStart = Math.max(segStart, cut.keep_start)
          const clampedEnd = Math.min(segEnd, cut.keep_end)
          const relStart = currentOffset + (clampedStart - cut.keep_start)
          const relEnd = currentOffset + (clampedEnd - cut.keep_start)
          if (relEnd - relStart < 0.1) continue
          adjustedSubs.push({ start: relStart, end: relEnd, text: seg.text || '' })
        }
      }
      currentOffset += cutDuration
    }
    deoverlapSubtitleEvents(adjustedSubs)

    for (const sub of adjustedSubs) {
      const text = sub.text
      const words = text.split(' ').filter((w: string) => w.trim())
      if (words.length === 0) continue
      const subDuration = sub.end - sub.start
      const wordDuration = subDuration / words.length
      const keyWord = detectKeyWordLocal(words)

      switch (style) {
        case 'boxing': {
          const boxWordDuration = Math.min(wordDuration, 0.4)
          words.forEach((word: string, wi: number) => {
            const wStart = sub.start + wi * boxWordDuration * 0.7
            const wEnd = sub.end
            const ws = formatAssTime(wStart)
            const we = formatAssTime(wEnd)
            const isKey = keyWord && word.includes(keyWord)
            const styleName = isKey ? 'Highlight' : 'Default'
            ass += `Dialogue: 0,${ws},${we},${styleName},,0,0,0,,{\\fad(150,100)\\t(0,100,\\fscx105\\fscy105)\\t(100,200,\\fscx100\\fscy100)}${word} \n`
          })
          break
        }
        case 'minimal': {
          const startTime = formatAssTime(sub.start)
          const endTime = formatAssTime(sub.end)
          ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,{\\fad(300,200)}${text}\n`
          break
        }
        case 'pop': {
          words.forEach((word: string, wi: number) => {
            const wordStart = sub.start + wi * wordDuration
            const wordEnd = sub.end
            const ws = formatAssTime(wordStart)
            const we = formatAssTime(wordEnd)
            const isKey = keyWord && word.includes(keyWord)
            const styleName = isKey ? 'Highlight' : 'Default'
            ass += `Dialogue: 0,${ws},${we},${styleName},,0,0,0,,{\\fad(100,0)\\t(0,150,\\fscx100\\fscy100)\\fscx50\\fscy50}${word} \n`
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
            ass += `Dialogue: 0,${ws},${we},Default,,0,0,0,,{\\fad(100,0)\\t(0,200,\\fscx110\\fscy110)\\t(200,300,\\fscx100\\fscy100)}${word} \n`
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
          // Fallback: simple fade per segment
          const startTime = formatAssTime(sub.start)
          const endTime = formatAssTime(sub.end)
          ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,{\\fad(200,200)}${text}\n`
        }
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

  // Ensure Hebrew font is available in the output directory for FFmpeg fontsdir
  ensureFontInDir(outputDir)

  // Use basenames to avoid path escaping issues with colons/quotes/spaces
  const assBaseName = path.basename(assPath)
  const inputBaseName = path.basename(inputFile)
  const outputBaseName = path.basename(outputFile)

  // Try subtitles filter first (needs libass) — with fontsdir for Hebrew font
  try {
    execSync(
      `cd "${outputDir}" && "${ffmpegPath}" -i "${inputBaseName}" -vf "subtitles=${assBaseName}:fontsdir=." -c:v libx264 -preset fast -crf 23 -c:a copy "${outputBaseName}" -y`,
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024, cwd: outputDir }
    )
    console.log(`[PROCESS] Animated subtitles applied via subtitles filter (${style})`)
    return outputFile
  } catch (e: any) {
    console.warn('[PROCESS] ASS subtitles filter failed:', e.stderr?.toString().substring(0, 300))
    // Try ass filter as alternative — with fontsdir for Hebrew font
    try {
      execSync(
        `cd "${outputDir}" && "${ffmpegPath}" -i "${inputBaseName}" -vf "ass=${assBaseName}:fontsdir=." -c:v libx264 -preset fast -crf 23 -c:a copy "${outputBaseName}" -y`,
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

// Visual cross-reference presenter detection: extract frames + GPT Vision
async function identifyPresenterWithVisualCrossReference(
  transcript: any,
  localFilePath: string,
  speakerTimes: Record<string, number>,
  timestamp: number
): Promise<{ presenter: string, confidence: string }> {
  const validSpeakers = Object.keys(speakerTimes).filter(s => s && s !== 'undefined')

  if (validSpeakers.length <= 1) {
    return { presenter: validSpeakers[0] || 'דובר 1', confidence: 'high' }
  }

  const ffmpegPath = getFFmpeg()
  const framesDir = path.join(uploadsDir, `frames_${timestamp}`)
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true })

  try {
    // Get video duration
    const ffprobePath = ffmpegPath === 'ffmpeg' ? 'ffprobe' : ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
    const durStr = execSync(
      `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${localFilePath}"`,
      { timeout: 10000, encoding: 'utf-8' }
    ).trim()
    const duration = parseFloat(durStr) || 60

    // Extract 6 frames spread across the video
    const frameCount = 6
    const interval = duration / (frameCount + 1)

    for (let i = 1; i <= frameCount; i++) {
      const t = interval * i
      const framePath = path.join(framesDir, `frame_${i}.jpg`)
      try {
        execSync(
          `"${ffmpegPath}" -ss ${t.toFixed(3)} -i "${localFilePath}" -vframes 1 -q:v 5 "${framePath}" -y`,
          { timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
        )
      } catch {}
    }

    const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort()
    console.log(`[PRESENTER] Extracted ${frameFiles.length} frames for visual analysis`)

    if (frameFiles.length === 0) {
      return textOnlyPresenterDetection(transcript, speakerTimes, validSpeakers)
    }

    const ai = await getOpenAI()
    if (!ai) {
      return textOnlyPresenterDetection(transcript, speakerTimes, validSpeakers)
    }

    // Build image content for GPT Vision
    const imageContents: any[] = []

    frameFiles.forEach((file, i) => {
      const framePath = path.join(framesDir, file)
      const frameTime = interval * (i + 1)

      // Find who is speaking at this timestamp
      const activeSeg = (transcript.segments || []).find((s: any) =>
        s.start <= frameTime && s.end >= frameTime
      )
      const activeSpeaker = activeSeg?.speaker || 'שתיקה'
      const activeText = activeSeg?.text?.substring(0, 60) || ''

      const imageData = fs.readFileSync(framePath).toString('base64')

      imageContents.push({
        type: 'text' as const,
        text: `פריים ${i + 1} (${frameTime.toFixed(1)}s) - דובר פעיל: "${activeSpeaker}" - אומר: "${activeText}"`,
      })
      imageContents.push({
        type: 'image_url' as const,
        image_url: { url: `data:image/jpeg;base64,${imageData}`, detail: 'low' as const },
      })
    })

    // Speaker samples for context
    const speakerSamples = validSpeakers.map(speaker => {
      const segs = (transcript.segments || [])
        .filter((s: any) => s.speaker === speaker)
        .slice(0, 4)
      return `${speaker} (${Math.round(speakerTimes[speaker])}s דיבור):\n${segs.map((s: any) => `  [${s.start.toFixed(1)}s] "${(s.text || '').substring(0, 60)}"`).join('\n')}`
    }).join('\n\n')

    const prompt = `אתה מנתח סרטון כדי לזהות מי הפרזנטור הראשי - האדם שמצולם במצלמה ומדבר לקהל.
אני מציג לך פריימים מהסרטון. לכל פריים אני מציין מי הדובר הפעיל לפי התמלול.
דוברים:
${speakerSamples}
כללים לזיהוי הפרזנטור:
1. הפרזנטור הוא מי שנראה על המסך ומסתכל לכיוון המצלמה
2. הפרזנטור מדבר תוכן ארוך ומשמעותי (לא שאלות קצרות)
3. אם אדם נראה על המסך ברוב הפריימים - הוא כנראה הפרזנטור
4. עוזר הפקה/מראיין: נשמע אבל לא נראה, שואל שאלות קצרות
5. צוות: אומר "מוכן?", "עוד פעם", "יופי"
חשוב מאוד:
- הפרזנטור הוא לא בהכרח מי שמדבר הכי הרבה!
- הפרזנטור הוא מי שנראה על המצלמה ומדבר ישירות לצופה
- מישהו שמדבר הרבה אבל לא נראה על המסך הוא כנראה מראיין
החזר JSON:
{
  "presenter": "דובר X",
  "confidence": "high" | "medium" | "low",
  "reasoning": "הסבר קצר",
  "on_camera": "דובר X",
  "off_camera": ["דובר Y", "דובר Z"]
}
החזר רק JSON תקין.`

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageContents,
        ],
      }],
    })

    const content = response.choices[0].message.content?.trim() || ''
    const cleaned = content.replace(/```json|```/g, '').trim()

    try {
      const result = JSON.parse(cleaned)

      console.log(`[PRESENTER] Visual analysis: ${result.presenter} (${result.confidence})`)
      console.log(`[PRESENTER] On camera: ${result.on_camera}`)
      console.log(`[PRESENTER] Off camera: ${JSON.stringify(result.off_camera)}`)
      console.log(`[PRESENTER] Reasoning: ${result.reasoning}`)

      if (result.presenter && validSpeakers.some(s => matchesSpeaker(s, result.presenter))) {
        return { presenter: result.presenter, confidence: result.confidence || 'medium' }
      }
    } catch {
      console.warn('[PRESENTER] Failed to parse GPT response:', content.substring(0, 200))
    }

    // Extract speaker name from text
    const match = content.match(/דובר\s*\d+/)
    if (match && validSpeakers.some(s => matchesSpeaker(s, match[0]))) {
      return { presenter: match[0], confidence: 'medium' }
    }
  } catch (e: any) {
    console.error('[PRESENTER] Visual cross-reference failed:', e.message?.substring(0, 150))
  } finally {
    // Clean up frames
    try {
      if (fs.existsSync(framesDir)) {
        fs.readdirSync(framesDir).forEach(f => fs.unlinkSync(path.join(framesDir, f)))
        fs.rmdirSync(framesDir)
      }
    } catch {}
  }

  // Fallback: text-only
  return textOnlyPresenterDetection(transcript, speakerTimes, validSpeakers)
}

// Text-only presenter detection fallback
async function textOnlyPresenterDetection(
  transcript: any,
  speakerTimes: Record<string, number>,
  validSpeakers: string[]
): Promise<{ presenter: string, confidence: string }> {
  const speakerSamples = validSpeakers.map(speaker => {
    const segs = (transcript.segments || [])
      .filter((s: any) => s.speaker === speaker)
      .slice(0, 5)
    return `${speaker} (${Math.round(speakerTimes[speaker])}s):\n${segs.map((s: any) => `  "${(s.text || '').substring(0, 60)}"`).join('\n')}`
  }).join('\n\n')

  try {
    const ai = await getOpenAI()
    if (!ai) {
      const mostSpeaking = validSpeakers.sort((a, b) => (speakerTimes[b] || 0) - (speakerTimes[a] || 0))[0]
      return { presenter: mostSpeaking || 'דובר 1', confidence: 'low' }
    }

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 50,
      messages: [{
        role: 'user',
        content: `מי הפרזנטור הראשי? הפרזנטור מדבר תוכן ארוך. מראיין/עוזר הפקה שואל שאלות קצרות.\n\n${speakerSamples}\n\nהחזר רק שם הדובר (לדוגמה: "דובר 1")`,
      }],
    })

    const result = response.choices[0].message.content?.trim() || ''
    const match = result.match(/דובר\s*\d+/)

    if (match && validSpeakers.some(s => matchesSpeaker(s, match[0]))) {
      console.log(`[PRESENTER] Text-only result: ${match[0]}`)
      return { presenter: match[0], confidence: 'low' }
    }
  } catch (e: any) {
    console.error('[PRESENTER] Text detection failed:', e.message?.substring(0, 100))
  }

  // Last resort: most speaking time
  const mostSpeaking = [...validSpeakers].sort((a, b) => (speakerTimes[b] || 0) - (speakerTimes[a] || 0))[0]
  return { presenter: mostSpeaking || 'דובר 1', confidence: 'low' }
}

// Robust speaker matching: handles whitespace, encoding, and number differences
function matchesSpeaker(segmentSpeaker: any, targetPresenter: string): boolean {
  if (!segmentSpeaker || !targetPresenter) return false

  const a = String(segmentSpeaker).trim().replace(/\s+/g, ' ').toLowerCase()
  const b = String(targetPresenter).trim().replace(/\s+/g, ' ').toLowerCase()

  // Exact match
  if (a === b) return true

  // Contains match
  if (a.includes(b) || b.includes(a)) return true

  // Number match (דובר 2 == speaker 2 == 2)
  const numA = a.match(/\d+/)?.[0]
  const numB = b.match(/\d+/)?.[0]
  if (numA && numB && numA === numB) return true

  return false
}

// Clean up speaker sample files after processing
function cleanupSpeakerSamples(uploadsDirectory: string, sampleTimestamp?: number) {
  try {
    const files = fs.readdirSync(uploadsDirectory).filter(f =>
      f.startsWith('speaker_sample_') && (sampleTimestamp ? f.includes(`${sampleTimestamp}`) : true)
    )
    files.forEach(f => {
      try { fs.unlinkSync(path.join(uploadsDirectory, f)) } catch {}
    })
    if (files.length > 0) {
      console.log(`[CLEANUP] Removed ${files.length} speaker sample files`)
    }
  } catch {}
}

// Schedule cleanup of old speaker samples (older than 1 hour)
setInterval(() => {
  try {
    const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('speaker_sample_'))
    const oneHourAgo = Date.now() - 3600000
    files.forEach(f => {
      const match = f.match(/speaker_sample_(\d+)/)
      if (match && parseInt(match[1]) < oneHourAgo) {
        try { fs.unlinkSync(path.join(uploadsDir, f)) } catch {}
      }
    })
  } catch {}
}, 600000) // every 10 minutes

// Build cut ranges that strictly include only presenter segments
function buildPresenterCutRanges(
  transcript: any,
  mainPresenter: string
): Array<{start: number, end: number}> {

  const allSegments = transcript.segments || []

  // Separate presenter vs other
  const presenterSegs = allSegments.filter((s: any) => matchesSpeaker(s.speaker, mainPresenter))
  const otherSegs = allSegments.filter((s: any) => !matchesSpeaker(s.speaker, mainPresenter))

  if (presenterSegs.length === 0) {
    console.warn('[SPEAKER] No presenter segments found, using all')
    return allSegments.map((s: any) => ({ start: s.start, end: s.end }))
  }

  // Sort presenter segments by time
  presenterSegs.sort((a: any, b: any) => a.start - b.start)

  // Build cut ranges with smart merging
  const ranges: Array<{start: number, end: number}> = []

  presenterSegs.forEach((seg: any, idx: number) => {
    const originalStart = seg.start
    const originalEnd = seg.end

    // Silence-aware padding: expand more into gaps, less into adjacent speech
    const prevSeg = presenterSegs[idx - 1]
    const nextSeg = presenterSegs[idx + 1]

    // Start padding: reduce if previous segment ended very recently (avoid catching tail of other speaker)
    let startPad = 0.25
    if (prevSeg && (seg.start - prevSeg.end) < 0.2) {
      startPad = 0.1
    }
    // End padding: expand more if next segment is far away (silence gap = room to breathe)
    let endPad = 0.25
    if (nextSeg && (nextSeg.start - seg.end) > 0.3) {
      endPad = 0.4
    }

    const segStart = Math.max(0, seg.start - startPad)
    const segEnd = seg.end + endPad
    console.log(`[CUT] Segment ${idx}: padded ${originalStart.toFixed(2)}→${segStart.toFixed(2)} to ${originalEnd.toFixed(2)}→${segEnd.toFixed(2)} (silence-aware)`)

    const last = ranges[ranges.length - 1]

    if (last) {
      const gap = segStart - last.end

      if (gap <= 0) {
        // Overlapping - extend
        last.end = Math.max(last.end, segEnd)
      } else if (gap < 0.3) {
        // Very small gap (natural pause) - merge
        last.end = segEnd
      } else {
        // Check if another speaker talks in this gap
        const otherInGap = otherSegs.some((other: any) =>
          other.start < segStart && other.end > last.end &&
          (other.end - other.start) > 0.3
        )

        if (otherInGap) {
          // Another speaker in the gap - DON'T merge, create new range
          console.log(`[SPEAKER] Gap ${last.end.toFixed(1)}-${segStart.toFixed(1)}: other speaker detected, cutting`)
          ranges.push({ start: segStart, end: segEnd })
        } else if (gap < 0.8) {
          // Short silence gap - merge for smooth flow
          last.end = segEnd
        } else {
          // Long gap - new range
          ranges.push({ start: segStart, end: segEnd })
        }
      }
    } else {
      ranges.push({ start: segStart, end: segEnd })
    }
  })

  console.log(`[SPEAKER] Built ${ranges.length} cut ranges from ${presenterSegs.length} presenter segments`)
  console.log(`[SPEAKER] Total presenter time: ${ranges.reduce((sum, r) => sum + r.end - r.start, 0).toFixed(1)}s`)

  // === Scene extension for short clips ===
  const MIN_CLIP_DURATION = 1.5
  const extendedRanges = ranges.map(range => {
    const duration = range.end - range.start
    if (duration < MIN_CLIP_DURATION && duration > 0.3) {
      const extensionNeeded = MIN_CLIP_DURATION - duration
      const extendBefore = Math.min(extensionNeeded / 2, range.start)
      const extendAfter = extensionNeeded - extendBefore

      console.log(`[CUT] Extending short clip ${range.start.toFixed(1)}→${range.end.toFixed(1)} (${duration.toFixed(1)}s) by ${extensionNeeded.toFixed(1)}s`)

      return {
        start: range.start - extendBefore,
        end: range.end + extendAfter,
      }
    }
    return range
  })

  console.log(`[SPEAKER] Cut ranges:`, extendedRanges.map(r => `${r.start.toFixed(1)}-${r.end.toFixed(1)}`).join(', '))

  return extendedRanges
}

// Validate cut ranges don't overlap with non-presenter speech
function validateCutRanges(
  ranges: Array<{start: number, end: number}>,
  transcript: any,
  mainPresenter: string
): Array<{start: number, end: number}> {
  const otherSegs = (transcript.segments || []).filter((s: any) =>
    !matchesSpeaker(s.speaker, mainPresenter)
  )

  let leakCount = 0

  ranges.forEach((range, i) => {
    otherSegs.forEach((other: any) => {
      // Check overlap
      const overlapStart = Math.max(range.start, other.start)
      const overlapEnd = Math.min(range.end, other.end)

      if (overlapEnd > overlapStart) {
        const overlapDuration = overlapEnd - overlapStart
        console.warn(`[SPEAKER] Warning: Range ${i} (${range.start.toFixed(1)}-${range.end.toFixed(1)}) overlaps with ${other.speaker} at ${other.start.toFixed(1)}-${other.end.toFixed(1)} by ${overlapDuration.toFixed(2)}s`)

        // Trim the range to exclude the overlap
        if (other.start <= range.start) {
          // Other speaker at the beginning of range
          range.start = other.end + 0.1
        } else if (other.end >= range.end) {
          // Other speaker at the end of range
          range.end = other.start - 0.1
        } else {
          // Other speaker in the middle - trim to before the other speaker
          console.warn(`[SPEAKER] Range ${i} has other speaker in middle, trimming`)
          range.end = other.start - 0.1
        }

        leakCount++
      }
    })
  })

  // Remove any ranges that became invalid (end <= start)
  const validRanges = ranges.filter(r => r.end - r.start > 0.3)

  if (leakCount > 0) {
    console.log(`[SPEAKER] Fixed ${leakCount} speaker overlaps, ${validRanges.length} valid ranges remain`)
  }

  return validRanges
}

// === PROFESSIONAL WORKFLOW HELPERS ===

// Generate rhythmic zooms every 5-6 seconds (professional editor pattern)
function generateRhythmicZooms(duration: number, segments: any[]): any[] {
  const zooms: any[] = []
  const ZOOM_INTERVAL = 5.5
  const ZOOM_DURATION = 2.0
  const ZOOM_INTENSITY = 1.15

  // First zoom at the start
  zooms.push({
    timestamp: 0.5,
    duration: ZOOM_DURATION,
    intensity: ZOOM_INTENSITY,
    direction: 'in',
    reason: 'opening zoom',
  })

  // Regular zooms every 5-6 seconds
  for (let t = ZOOM_INTERVAL; t < duration - 3; t += ZOOM_INTERVAL) {
    const direction = zooms.length % 2 === 0 ? 'in' : 'out'

    // Slightly vary the interval for natural feel
    const jitter = (Math.random() - 0.5) * 2
    const actualTime = t + jitter

    // Skip if too close to previous zoom
    const lastZoom = zooms[zooms.length - 1]
    if (lastZoom && actualTime - lastZoom.timestamp < 3) continue

    // Try to align with sentence boundaries
    const nearestSentenceEnd = segments
      .filter((s: any) => Math.abs(s.end - actualTime) < 1.5)
      .sort((a: any, b: any) => Math.abs(a.end - actualTime) - Math.abs(b.end - actualTime))[0]

    const alignedTime = nearestSentenceEnd
      ? nearestSentenceEnd.end + 0.2
      : actualTime

    zooms.push({
      timestamp: Math.max(0, alignedTime),
      duration: ZOOM_DURATION,
      intensity: ZOOM_INTENSITY + (Math.random() * 0.05),
      direction,
      reason: nearestSentenceEnd ? 'sentence boundary' : 'rhythmic',
    })
  }

  console.log(`[ZOOMS] Generated ${zooms.length} rhythmic zooms for ${duration.toFixed(1)}s video`)
  return zooms
}

// Generate camera angle switches every 2-4 sentences
function generateCameraAngles(segments: any[], duration: number): any[] {
  const angles: any[] = []
  const ANGLE_TYPES = ['wide', 'medium', 'closeup', 'medium', 'wide', 'closeup']
  let currentAngle = 0
  let lastSwitchTime = 0
  const MIN_SWITCH_INTERVAL = 4
  const MAX_SWITCH_INTERVAL = 8

  let sentenceCount = 0
  const switchEvery = 2 + Math.floor(Math.random() * 2) // 2-3 sentences

  segments.forEach((seg: any) => {
    sentenceCount++

    if (sentenceCount >= switchEvery && seg.start - lastSwitchTime >= MIN_SWITCH_INTERVAL) {
      const angleType = ANGLE_TYPES[currentAngle % ANGLE_TYPES.length]

      angles.push({
        timestamp: seg.start,
        duration: 0,
        type: angleType,
      })

      currentAngle++
      sentenceCount = 0
      lastSwitchTime = seg.start
    }

    // Force switch if too long without one
    if (seg.start - lastSwitchTime > MAX_SWITCH_INTERVAL) {
      const angleType = ANGLE_TYPES[currentAngle % ANGLE_TYPES.length]
      angles.push({
        timestamp: seg.start,
        duration: 0,
        type: angleType,
      })
      currentAngle++
      lastSwitchTime = seg.start
    }
  })

  // Calculate durations
  for (let i = 0; i < angles.length; i++) {
    const next = angles[i + 1]
    angles[i].duration = next ? next.timestamp - angles[i].timestamp : duration - angles[i].timestamp
  }

  // Calculate crop values for each angle type
  angles.forEach((angle: any) => {
    switch (angle.type) {
      case 'closeup':
        angle.cropX = 0.15; angle.cropY = 0.1
        angle.cropW = 0.7; angle.cropH = 0.7
        break
      case 'medium':
        angle.cropX = 0.08; angle.cropY = 0.05
        angle.cropW = 0.84; angle.cropH = 0.84
        break
      case 'wide':
      default:
        angle.cropX = 0; angle.cropY = 0
        angle.cropW = 1; angle.cropH = 1
        break
    }
  })

  console.log(`[ANGLES] Generated ${angles.length} camera angle switches`)
  return angles
}

// Get optimal subtitle position (below chin, not at very bottom)
function getSubtitlePosition(videoWidth: number, videoHeight: number): { marginV: number, alignment: number, fontSize: number } {
  if (videoHeight > videoWidth) {
    // Portrait (9:16): position below chin area
    return {
      marginV: Math.round(videoHeight * 0.35),
      alignment: 2,
      fontSize: Math.round(videoWidth * 0.045),
    }
  } else {
    // Landscape (16:9): bottom with margin
    return {
      marginV: 40,
      alignment: 2,
      fontSize: 24,
    }
  }
}

// Process step wrapper: log + validate + fallback
function processStepSync(stepName: string, inputFile: string, outputFile: string, fn: () => void): string {
  if (!fs.existsSync(inputFile)) {
    console.warn(`[PROCESS] ${stepName}: Input file missing, skipping`)
    return inputFile
  }

  console.log(`[PROCESS] ${stepName}...`)

  try {
    fn()

    if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 50000) {
      console.log(`[PROCESS] ${stepName} done`)
      return outputFile
    } else {
      console.warn(`[PROCESS] ${stepName}: Output invalid, keeping previous`)
      return inputFile
    }
  } catch (e: any) {
    console.warn(`[PROCESS] ${stepName} failed:`, e.stderr?.toString().substring(0, 200) || e.message)
    return inputFile
  }
}

// Calculate comprehensive quality score for professional editing
// Scores based on ACTUAL results, not just planned features
function calculateQualityScore(job: any, outputFile: string, extraInfo: {
  cuts: any[], planZooms: any[], filteredSubtitleSegments: any[],
  brollAssets: any[], musicUrl: string | null, planColorGrade: string,
  mainPresenter: string | null, planCameraAngles: any[],
  // Actual results flags
  subtitlesActuallyApplied?: boolean,
  musicActuallyApplied?: boolean,
  brollActuallyApplied?: number,
  logoActuallyApplied?: boolean,
  colorGradeActuallyApplied?: boolean,
  lowerThirdsActuallyApplied?: boolean,
  // Legacy compat
  logoApplied?: boolean,
  logoRequested?: boolean,
}): { score: number, report: any } {
  const report: any = {}
  let score = 0

  // 1. Error cleaning (10 points)
  if (job?.transcript?.cleaningSummary?.removed > 0) {
    score += 10
    report.errorCleaning = `נוקו ${job.transcript.cleaningSummary.removed} קטעים פגומים`
  } else {
    report.errorCleaning = 'לא בוצע ניקוי טעויות'
  }

  // 2. Presenter isolation (10 points)
  if (extraInfo.mainPresenter && extraInfo.mainPresenter !== 'none') {
    score += 10
    report.presenterIsolation = `בידוד דובר ראשי: ${extraInfo.mainPresenter}`
  }

  // 3. Camera angles (10 points)
  const angles = extraInfo.planCameraAngles?.length || 0
  if (angles >= 3) { score += 10; report.cameraAngles = `${angles} החלפות זווית` }
  else { report.cameraAngles = 'מעט החלפות זווית' }

  // 4. Color grade (5 points) — based on actual application
  const colorActual = extraInfo.colorGradeActuallyApplied !== undefined ? extraInfo.colorGradeActuallyApplied : (extraInfo.planColorGrade && extraInfo.planColorGrade !== 'none')
  if (colorActual) { score += 5; report.colorGrade = extraInfo.planColorGrade }
  else if (extraInfo.planColorGrade && extraInfo.planColorGrade !== 'none') {
    report.colorGrade = `! ${extraInfo.planColorGrade} תוכנן אך לא הוחל`
    score -= 5
  }

  // 5. Background blur (10 points)
  if (job?.plan?.backgroundBlur !== false) {
    score += 10
    report.backgroundBlur = 'טשטוש רקע'
  } else {
    report.backgroundBlur = 'ללא'
  }

  // 6. Zooms (10 points)
  const zoomCount = extraInfo.planZooms?.length || 0
  if (zoomCount >= 3) { score += 10; report.zooms = `${zoomCount} זומים` }

  // 7. Subtitles (15 points) — based on actual application
  const subsPlanned = (extraInfo.filteredSubtitleSegments?.length || 0) > 0
  const subsActual = extraInfo.subtitlesActuallyApplied !== undefined ? extraInfo.subtitlesActuallyApplied : subsPlanned
  if (subsActual) {
    score += 15
    report.subtitles = `${extraInfo.filteredSubtitleSegments?.length || 0} שורות כתוביות`
  } else if (subsPlanned) {
    report.subtitles = '! כתוביות תוכננו אך לא הוחלו'
    score -= 5
  } else {
    report.subtitles = 'ללא כתוביות'
  }

  // 8. Music (10 points) — based on actual application
  const musicActual = extraInfo.musicActuallyApplied !== undefined ? extraInfo.musicActuallyApplied : !!extraInfo.musicUrl
  if (musicActual) { score += 10; report.music = 'מוזיקת רקע' }
  else if (extraInfo.musicUrl) { report.music = '! מוזיקה תוכננה אך לא הוחלה'; score -= 5 }
  else { report.music = 'ללא מוזיקה' }

  // 9. B-Roll (15 points) — based on actual insertion count
  const brollPlanned = extraInfo.brollAssets?.length || 0
  const brollActual = extraInfo.brollActuallyApplied !== undefined ? extraInfo.brollActuallyApplied : brollPlanned
  if (brollActual >= 2) { score += 15; report.broll = `${brollActual} קטעי B-Roll` }
  else if (brollActual === 1) { score += 8; report.broll = '1 קטע B-Roll' }
  else if (brollPlanned > 0) { report.broll = `! ${brollPlanned} B-Roll תוכננו אך לא הוכנסו`; score -= 5 }
  else { report.broll = 'ללא B-Roll' }

  // 10. Output file valid (5 points)
  if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 100000) {
    score += 5
  }

  // 11. Logo (5 points) — based on actual application
  const logoActual = extraInfo.logoActuallyApplied !== undefined ? extraInfo.logoActuallyApplied : extraInfo.logoApplied
  if (logoActual) {
    score += 5
    report.logo = 'לוגו הוסף'
  } else if (extraInfo.logoRequested) {
    report.logo = '! לוגו תוכנן אך לא הוסף'
    score -= 5
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score)

  console.log(`[QUALITY] Score: ${Math.min(score, 100)}/100. Planned vs Actual: subtitles=${subsPlanned}/${subsActual}, broll=${brollPlanned}/${brollActual}, music=${!!extraInfo.musicUrl}/${musicActual}`)

  return { score: Math.min(score, 100), report }
}

// Legacy endpoint kept for backward compat
// POST /api/auto-editor/find-hook — Detect the best opening moment for hook
app.post('/api/auto-editor/find-hook', async (req, res) => {
  try {
    const ai = await getOpenAI()
    if (!ai) return res.status(400).json({ message: 'מפתח OpenAI API לא מוגדר' })

    const { segments, enrichment } = req.body
    if (!segments || segments.length === 0) {
      return res.json({ hook_start: 0, hook_end: 0, reason: 'no segments provided' })
    }

    const hookTimer = Date.now()
    console.log('[HOOK] Analyzing transcript for best hook moment...')

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [{
        role: 'user',
        content: `Analyze this transcript and find the SINGLE MOST POWERFUL moment to use as the video HOOK (first 3-5 seconds).

The hook should be:
- Surprising, emotional, controversial, or curiosity-inducing
- A complete thought (not cut mid-sentence)
- Something that makes the viewer NEED to keep watching

Transcript:
${segments.map((s: any) => `[${(s.start || 0).toFixed(1)}s] ${s.text}`).join('\n')}

Content type: ${enrichment?.detected_type || 'unknown'}

Return JSON:
{
  "hook_start": 45.2,
  "hook_end": 49.8,
  "hook_text": "the exact text",
  "reason": "why this is the best hook",
  "hook_type": "surprise" | "question" | "bold_claim" | "emotion" | "result"
}

If the video starts strong already (first 5 seconds are great), return:
{"hook_start": 0, "hook_end": 0, "reason": "original opening is strong"}

Return ONLY JSON.`
      }],
      response_format: { type: 'json_object' },
      max_completion_tokens: 500,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const result = JSON.parse(content.replace(/```json|```/g, '').trim())

    const elapsed = ((Date.now() - hookTimer) / 1000).toFixed(1)

    if (result.hook_start > 0) {
      console.log(`[HOOK] Best moment found at ${result.hook_start}s: "${(result.hook_text || '').substring(0, 50)}..." (${result.hook_type}) [${elapsed}s]`)
    } else {
      console.log(`[HOOK] Original opening is strong, keeping as-is [${elapsed}s]`)
    }

    res.json(result)
  } catch (err: any) {
    console.error('[HOOK ERROR]', err.message)
    // Non-critical - return null hook so pipeline continues
    res.json({ hook_start: 0, hook_end: 0, reason: `error: ${err.message}` })
  }
})

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

// Main processing endpoint: accepts EditJob or legacy format
app.post('/api/auto-editor/process', async (req, res) => {
  const filesToCleanup: string[] = []

  try {
    // === NEW ARCHITECTURE: Accept EditJob ===
    // Detect if this is a new EditJob (has 'id' and 'sourceUrl' fields) or legacy format
    const isEditJob = req.body.id && (req.body.sourceUrl || req.body.sourceFile)
    const job = isEditJob ? req.body : null

    // Extract data from EditJob or legacy format
    const videoUrl = job?.sourceUrl || job?.sourceFile || req.body.videoUrl
    const videoPlan = job?.plan ? {
      cuts: (job.plan.cuts || []).map((c: any) => ({ keepStart: c.sourceStart, keepEnd: c.sourceEnd })),
      zooms: job.plan.zooms || [],
      camera_angles: (job.plan.cameraAngles || []).map((ca: any) => ({
        start: ca.timestamp, end: ca.timestamp + ca.duration, camera: ca.type,
      })),
      color_grade: job.plan.colorGrade || 'clean',
      transitions: (job.plan.transitions || []).map((t: any) => t.type || 'fade'),
      speakers: (job.plan.speakers || []).map((s: any) => ({
        name: s.name, firstAppearance: s.firstAppearance, displayDuration: s.displayDuration,
      })),
      graphics: (job.plan.graphics || []).map((g: any) => ({
        type: g.type, text: g.text, atTime: g.atTime, duration: g.duration,
      })),
      brollPlacements: job.plan.brollPlacements || [],
    } : req.body.videoPlan
    const targetDuration = (job?.plan?.targetDuration === 'auto' ? 60 : job?.plan?.targetDuration) || req.body.targetDuration
    const platforms = (job?.output?.platforms || []).map((p: any) => p.name || p) || req.body.platforms
    const musicUrl = job?.assets?.musicTrack || req.body.musicUrl || req.body.backgroundMusic || req.body.assets?.musicTrack || null
    const backgroundImage = job?.assets?.backgroundImage || req.body.backgroundImage
    // Hook detection data (flash-forward)
    const hookInfo = job?.hook || req.body.hook || null
    if (hookInfo && hookInfo.sourceStart > 0) {
      console.log(`[HOOK] Flash-forward hook: ${hookInfo.sourceStart.toFixed(1)}s → ${hookInfo.sourceEnd.toFixed(1)}s (${hookInfo.type || 'surprise'})`)
    }

    // Music debug
    console.log('[MUSIC] === Debug ===', {
      'job.assets.musicTrack': job?.assets?.musicTrack?.substring(0, 80) || 'none',
      'body.musicUrl': req.body.musicUrl?.substring(0, 80) || 'none',
      'body.backgroundMusic': req.body.backgroundMusic?.substring(0, 80) || 'none',
      resolved: musicUrl?.substring(0, 80) || 'NONE',
    })
    const captionStyle = req.body.captionStyle
    const includeSubtitles = job ? job.subtitles?.enabled !== false : (req.body.includeSubtitles ?? true)
    const includeBackground = req.body.includeBackground ?? true
    const animatedSubtitles = job ? job.subtitles?.animated !== false : (req.body.animatedSubtitles !== false)
    const animationStyle = job ? job.subtitles?.style || 'karaoke' : (req.body.animationStyle || 'karaoke')
    const skipPlatformExport = job ? job.output?.skipPlatformExport : (req.body.skipPlatformExport ?? false)
    const transcript = job?.transcript ? {
      segments: job.transcript.segments || [],
      mainSpeaker: job.transcript.mainPresenter,
      totalDuration: job.transcript.totalDuration,
    } : req.body.transcript
    const brollAssets = job ? (job.plan?.brollPlacements || []).map((p: any, i: number) => {
      const clip = job.assets?.brollClips?.[p.assetIndex ?? i]
      return {
        url: clip?.url || clip?.localPath || '',
        insertAt: p.outputTimestamp || 0,
        duration: p.duration || 4,
        keepAudio: p.keepAudio !== false,
      }
    }).filter((b: any) => b.url) : (req.body.brollAssets || [])

    // B-Roll debug: log what data arrived and file resolution
    console.log('[B-ROLL] === Debug ===')
    console.log(`[B-ROLL] Raw data:`, {
      'job.plan.brollPlacements': job?.plan?.brollPlacements?.length || 0,
      'job.assets.brollClips': job?.assets?.brollClips?.length || 0,
      'body.brollAssets': req.body.brollAssets?.length || 0,
      'resolved': brollAssets.length,
    })
    brollAssets.forEach((asset: any, i: number) => {
      const url = asset.url || asset.localPath || ''
      let resolved = ''
      if (url.includes('localhost')) {
        try {
          const fn = path.basename(new URL(url, `http://localhost:${PORT}`).pathname)
          const fp = path.join(uploadsDir, fn)
          resolved = fs.existsSync(fp) ? `FOUND (${(fs.statSync(fp).size/1024).toFixed(0)}KB)` : 'NOT FOUND'
        } catch { resolved = 'URL_PARSE_ERROR' }
      } else if (url.startsWith('http')) {
        resolved = 'REMOTE (will download)'
      } else {
        resolved = fs.existsSync(url) ? 'FOUND' : 'NOT FOUND'
      }
      console.log(`[B-ROLL] Asset ${i}: ${path.basename(url || 'unknown')} → ${resolved}`)
    })

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
      return res.status(400).json({ message: 'חסר videoUrl', error: 'Missing source file' })
    }

    if (!fs.existsSync(sourceFile)) {
      return res.status(400).json({ message: 'קובץ המקור לא נמצא: ' + sourceFile, error: 'Source file not found' })
    }

    console.log('[PROCESS] === SERVER RECEIVED ===')
    console.log('[PROCESS] Format:', isEditJob ? 'EditJob' : 'Legacy')
    console.log('[PROCESS] Job ID:', job?.id || 'N/A')
    console.log('[PROCESS] Source file:', sourceFile)
    console.log('[PROCESS] Transcript segments:', transcript?.segments?.length || 0)
    console.log('[PROCESS] Main presenter:', transcript?.mainSpeaker || job?.transcript?.mainPresenter || 'NOT SET')
    console.log('[PROCESS] B-Roll assets:', brollAssets.length)
    console.log('[PROCESS] Subtitles:', includeSubtitles ? `enabled (${animatedSubtitles ? 'animated ' + animationStyle : 'standard'})` : 'disabled')
    console.log('[PROCESS] Music:', musicUrl ? 'YES' : 'NO')
    console.log('[PROCESS] Skip platform export:', skipPlatformExport)

    // Extract features from plan (EditJob uses consistent field names)
    let planZooms = videoPlan?.zooms || videoPlan?.zoom_effects || videoPlan?.zoomEffects || []
    let planCameraAngles = videoPlan?.camera_angles || videoPlan?.cameraAngles || videoPlan?.angles || []
    const planColorGrade = videoPlan?.color_grade || videoPlan?.colorGrade || 'clean'
    const planSpeakers = videoPlan?.speakers || videoPlan?.lower_thirds || videoPlan?.lowerThirds || []
    const planGraphics = videoPlan?.graphics || videoPlan?.overlays || videoPlan?.text_overlays || []
    const planTransitions = videoPlan?.transitions || ['fade']

    // Subtitles from EditJob or legacy
    const subtitleSegments = job?.subtitles?.segments?.length > 0
      ? job.subtitles.segments
      : (transcript?.segments || [])
    const mainPresenter = transcript?.mainSpeaker || job?.transcript?.mainPresenter || req.body.mainPresenter

    // Filter subtitle segments: remove speaker labels, production cues, short segments
    let filteredSubtitleSegments = filterSubtitleSegments(subtitleSegments)
    // Further filter by presenter if needed
    if (mainPresenter && filteredSubtitleSegments.length > 0 && !job?.subtitles?.segments?.length) {
      const filtered = filteredSubtitleSegments.filter((s: any) => matchesSpeaker(s.speaker, mainPresenter))
      if (filtered.length > 0) {
        filteredSubtitleSegments = filtered
      }
    }
    // Split long subtitle text (max 8 words/line, max 2 lines)
    // Preserve word-level timestamps when splitting
    filteredSubtitleSegments = filteredSubtitleSegments.flatMap((seg: any) => {
      const chunks = splitSubtitleText(seg.text || '')
      if (chunks.length <= 1) return [seg]
      // Split into multiple segments with proportional timing
      const segStart = seg.start ?? seg.keepStart ?? 0
      const segEnd = seg.end ?? seg.keepEnd ?? 0
      const segDuration = segEnd - segStart
      const chunkDuration = segDuration / chunks.length
      // Also split word-level data if available
      const segWords: any[] = seg.words || []
      let wordIdx = 0
      return chunks.map((chunk: string, i: number) => {
        const chunkWordCount = chunk.replace(/\\N/g, ' ').split(/\s+/).filter((w: string) => w).length
        const chunkWords = segWords.slice(wordIdx, wordIdx + chunkWordCount)
        wordIdx += chunkWordCount
        return {
          ...seg,
          text: chunk,
          start: chunkWords.length > 0 ? (chunkWords[0].start ?? segStart + i * chunkDuration) : segStart + i * chunkDuration,
          end: chunkWords.length > 0 ? (chunkWords[chunkWords.length - 1].end ?? segStart + (i + 1) * chunkDuration) : segStart + (i + 1) * chunkDuration,
          words: chunkWords.length > 0 ? chunkWords : undefined,
        }
      })
    })

    console.log('[PROCESS] Plan:', {
      cuts: (videoPlan?.cuts || []).length,
      zooms: planZooms.length,
      cameraAngles: planCameraAngles.length,
      speakers: planSpeakers.length,
      graphics: planGraphics.length,
      broll: brollAssets.length,
      colorGrade: planColorGrade,
      subtitles: filteredSubtitleSegments.length,
      mainPresenter: mainPresenter || 'none',
    })

    const outputFiles: any[] = []

    // Step tracking for process completion summary
    let brollInserted = 0
    let anglesApplied = 0
    let blurApplied = false
    let zoomsApplied = 0
    let audioCleanApplied = false
    let musicApplied = false
    let subtitlesApplied = false
    let lowerThirdsApplied = 0
    let graphicsApplied = 0
    let logoApplied = false

    // ============================================
    // STEP B: GET SOURCE VIDEO INFO
    // ============================================
    let sourceWidth = 1920, sourceHeight = 1080, sourceFps = 30, sourceDuration = 0
    try {
      const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
      const probeOut = execSync(
        `"${ffprobePath}" -v quiet -select_streams v:0 -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of json "${sourceFile}"`,
        { timeout: 15000, encoding: 'utf-8' }
      )
      const probeData = JSON.parse(probeOut)
      const stream = probeData.streams?.[0]
      if (stream?.width) sourceWidth = stream.width
      if (stream?.height) sourceHeight = stream.height
      if (stream?.r_frame_rate) {
        const [num, den] = stream.r_frame_rate.split('/')
        sourceFps = Math.round(parseInt(num) / (parseInt(den) || 1))
      }
      sourceDuration = parseFloat(probeData.format?.duration || '0')
      console.log(`[PROCESS] Step B: Source info: ${sourceWidth}x${sourceHeight} @ ${sourceFps}fps, ${sourceDuration.toFixed(1)}s`)
    } catch (e: any) {
      console.warn('[PROCESS] Step B: Probe failed, using defaults:', e.message?.substring(0, 100))
    }

    // ============================================
    // STEP C: CLEAN TRANSCRIPT (remove stutters, fillers, retakes)
    // ============================================
    // Use cleaned segments for all subsequent steps
    const cleanedSegments = job?.transcript?.cleanedSegments || transcript?.cleanedSegments
    const transcriptSegmentsToUse = cleanedSegments || transcript?.segments || []
    if (cleanedSegments) {
      console.log(`[PROCESS] Step C: Using pre-cleaned transcript (${cleanedSegments.length} segments)`)
    } else {
      console.log(`[PROCESS] Step C: No cleaned transcript, using original (${transcriptSegmentsToUse.length} segments)`)
    }

    // ============================================
    // STEP D: AUTO-GENERATE MISSING PLAN ELEMENTS
    // ============================================
    // Generate rhythmic zooms if none in plan
    if (planZooms.length === 0 && sourceDuration > 10) {
      planZooms = generateRhythmicZooms(sourceDuration, transcriptSegmentsToUse)
      console.log(`[PROCESS] Step D: Auto-generated ${planZooms.length} rhythmic zooms`)
    }

    // Generate camera angles if none in plan
    if (planCameraAngles.length <= 1 && transcriptSegmentsToUse.length > 3) {
      const generatedAngles = generateCameraAngles(transcriptSegmentsToUse, sourceDuration)
      if (generatedAngles.length > 1) {
        planCameraAngles = generatedAngles.map((a: any) => ({
          start: a.timestamp, end: a.timestamp + a.duration, camera: a.type,
        }))
        console.log(`[PROCESS] Step D: Auto-generated ${planCameraAngles.length} camera angle switches`)
      }
    }

    // ============================================
    // STEP E: CUT VIDEO WITH TRANSITIONS
    // ============================================

    // Normalize cuts from EditJob or legacy format
    let cuts = (videoPlan?.cuts || []).map((c: any) => ({
      keep_start: c.keep_start ?? c.keepStart ?? c.sourceStart ?? 0,
      keep_end: c.keep_end ?? c.keepEnd ?? c.sourceEnd ?? targetDuration,
    }))

    if (cuts.length === 0) {
      cuts.push({ keep_start: 0, keep_end: targetDuration || 60 })
    }

    // === HOOK: Insert flash-forward clip at the beginning ===
    if (hookInfo && hookInfo.sourceStart > 0 && hookInfo.sourceEnd > hookInfo.sourceStart) {
      const hookDuration = hookInfo.sourceEnd - hookInfo.sourceStart
      if (hookDuration >= 1.5 && hookDuration <= 8) {
        console.log(`[HOOK] Inserting flash-forward: ${hookInfo.sourceStart.toFixed(1)}s → ${hookInfo.sourceEnd.toFixed(1)}s (${hookDuration.toFixed(1)}s)`)
        // Prepend hook clip before all other cuts
        cuts.unshift({
          keep_start: hookInfo.sourceStart,
          keep_end: hookInfo.sourceEnd,
        })
      } else {
        console.log(`[HOOK] Skipping hook: duration ${hookDuration.toFixed(1)}s is outside 1.5-8s range`)
      }
    }

    const transitions = planTransitions
    const cutFile = path.join(uploadsDir, `cut_${timestamp}.mp4`)
    filesToCleanup.push(cutFile)

    console.log('[PROCESS] Step E: Cutting video with', cuts.length, 'segments and transitions...')

    const { filter: transFilter, useTransitions } = buildTransitionFilter(cuts, transitions, 0.5)

    try {
      execSync(
        `"${ffmpegPath}" -i "${sourceFile}" -filter_complex "${transFilter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -avoid_negative_ts make_zero "${cutFile}" -y`,
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
        `"${ffmpegPath}" -i "${sourceFile}" -filter_complex "${fallbackFilter}" -map "[outv]" -map "[outa]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -avoid_negative_ts make_zero "${cutFile}" -y`,
        { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      console.log('[PROCESS] Step 1 done: Cut video created (fallback concat)')
    }

    let currentFile = cutFile

    // ============================================
    // STEP 1.5: PRESENTER-ONLY AUDIO ISOLATION
    // ============================================
    // If we have transcript segments and a main presenter,
    // re-cut the video to only include segments where the presenter speaks
    const transcriptSegments = transcript?.segments || []
    if (mainPresenter && mainPresenter !== 'none' && transcriptSegments.length > 0) {
      console.log(`[PROCESS] Step 1.5: Isolating presenter "${mainPresenter}" audio...`)

      // === DIAGNOSTIC LOGGING ===
      const uniqueSpeakers = [...new Set(transcriptSegments.map((s: any) => s.speaker))]
      console.log('[SPEAKER] All unique speakers in transcript:', uniqueSpeakers)
      console.log('[SPEAKER] Target presenter:', mainPresenter)

      // Segment count per speaker
      const speakerCounts: Record<string, {count: number, totalTime: number}> = {}
      transcriptSegments.forEach((seg: any) => {
        const speaker = seg.speaker || 'unknown'
        if (!speakerCounts[speaker]) speakerCounts[speaker] = { count: 0, totalTime: 0 }
        speakerCounts[speaker].count++
        speakerCounts[speaker].totalTime += (seg.end - seg.start)
      })
      console.log('[SPEAKER] Segments per speaker:', JSON.stringify(speakerCounts, null, 2))

      // Match results for EACH speaker
      uniqueSpeakers.forEach(speaker => {
        const matches = matchesSpeaker(speaker, mainPresenter)
        console.log(`[SPEAKER] matchesSpeaker("${speaker}", "${mainPresenter}") = ${matches}`)
      })

      // Show which segments pass the filter
      const presenterSegsDiag = transcriptSegments.filter((seg: any) =>
        matchesSpeaker(seg.speaker, mainPresenter)
      )
      const nonPresenterSegsDiag = transcriptSegments.filter((seg: any) =>
        !matchesSpeaker(seg.speaker, mainPresenter)
      )
      console.log(`[SPEAKER] Presenter segments: ${presenterSegsDiag.length} (${presenterSegsDiag.reduce((sum: number, s: any) => sum + s.end - s.start, 0).toFixed(1)}s)`)
      console.log(`[SPEAKER] Non-presenter segments being CUT: ${nonPresenterSegsDiag.length} (${nonPresenterSegsDiag.reduce((sum: number, s: any) => sum + s.end - s.start, 0).toFixed(1)}s)`)

      // Show first 3 segments of EACH speaker for verification
      uniqueSpeakers.forEach(speaker => {
        const segs = transcriptSegments.filter((s: any) => s.speaker === speaker).slice(0, 3)
        console.log(`[SPEAKER] "${speaker}" first 3 segments:`)
        segs.forEach((s: any) => {
          console.log(`  [${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] "${(s.text || '').substring(0, 60)}"`)
        })
      })

      // === BUILD CUT RANGES using strict function ===
      const transcriptForCutting = { segments: transcriptSegments }
      let presenterCutRanges = buildPresenterCutRanges(transcriptForCutting, mainPresenter)

      // === VALIDATE cut ranges don't overlap with non-presenter ===
      presenterCutRanges = validateCutRanges(presenterCutRanges, transcriptForCutting, mainPresenter)

      const nonPresenterCount = nonPresenterSegsDiag.length

      if (presenterCutRanges.length > 0 && nonPresenterCount > 0) {
        // Remap presenter ranges from original timestamps to cut video timestamps
        const remappedRanges: Array<{ start: number; end: number }> = []
        let cutOffset = 0
        for (const cut of cuts) {
          const cutStart = cut.keep_start
          const cutEnd = cut.keep_end
          const cutDuration = cutEnd - cutStart

          for (const range of presenterCutRanges) {
            // Check if presenter range overlaps with this cut
            const overlapStart = Math.max(range.start, cutStart)
            const overlapEnd = Math.min(range.end, cutEnd)
            if (overlapStart < overlapEnd) {
              remappedRanges.push({
                start: cutOffset + (overlapStart - cutStart),
                end: cutOffset + (overlapEnd - cutStart),
              })
            }
          }
          cutOffset += cutDuration
        }

        // Merge remapped ranges (only merge very close ones to avoid leaking)
        const finalRanges: Array<{ start: number; end: number }> = []
        remappedRanges.sort((a, b) => a.start - b.start)
        remappedRanges.forEach(range => {
          const last = finalRanges[finalRanges.length - 1]
          if (last && range.start - last.end < 0.2) {
            last.end = Math.max(last.end, range.end)
          } else {
            finalRanges.push({ ...range })
          }
        })

        if (finalRanges.length > 0) {
          // Extract each presenter segment and concat
          const segmentFiles: string[] = []
          for (let i = 0; i < finalRanges.length; i++) {
            const range = finalRanges[i]
            const segFile = path.join(uploadsDir, `presenter_seg_${timestamp}_${i}.mp4`)
            filesToCleanup.push(segFile)

            try {
              execSync(
                `"${ffmpegPath}" -i "${currentFile}" -ss ${range.start} -to ${range.end} -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${segFile}" -y`,
                { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
              )

              if (fs.existsSync(segFile) && fs.statSync(segFile).size > 0) {
                segmentFiles.push(segFile)
              }
            } catch (e: any) {
              console.warn(`[PROCESS] Presenter segment ${i} failed:`, e.stderr?.toString().substring(0, 200))
            }
          }

          if (segmentFiles.length > 0) {
            const listFile = path.join(uploadsDir, `presenter_list_${timestamp}.txt`)
            filesToCleanup.push(listFile)
            fs.writeFileSync(listFile, segmentFiles.map(f => `file '${f}'`).join('\n'))

            const presenterOutput = path.join(uploadsDir, `presenter_cut_${timestamp}.mp4`)
            filesToCleanup.push(presenterOutput)

            try {
              execSync(
                `"${ffmpegPath}" -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${presenterOutput}" -y`,
                { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
              )

              if (fs.existsSync(presenterOutput) && fs.statSync(presenterOutput).size > 0) {
                // === AUDIO VERIFICATION ===
                console.log('[SPEAKER] === VERIFICATION ===')
                try {
                  const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
                  const inputDur = execSync(
                    `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${currentFile}"`,
                    { timeout: 10000, encoding: 'utf-8' }
                  ).trim()
                  const outDur = execSync(
                    `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${presenterOutput}"`,
                    { timeout: 10000, encoding: 'utf-8' }
                  ).trim()
                  const inputDuration = parseFloat(inputDur)
                  const outputDuration = parseFloat(outDur)
                  const removedTime = inputDuration - outputDuration

                  console.log(`[SPEAKER] Input duration: ${inputDuration.toFixed(1)}s`)
                  console.log(`[SPEAKER] Output duration: ${outputDuration.toFixed(1)}s`)
                  console.log(`[SPEAKER] Removed: ${removedTime.toFixed(1)}s (${Math.round(removedTime / inputDuration * 100)}% of cut video)`)

                  if (removedTime < 5) {
                    console.warn('[SPEAKER] Warning: Less than 5s removed - presenter filter may not be working correctly')
                  }
                } catch {}

                currentFile = presenterOutput
                console.log(`[PROCESS] Step 1.5 done: Cut to presenter only (${segmentFiles.length} segments)`)
              }
            } catch (e: any) {
              console.warn('[PROCESS] Presenter concat failed:', e.stderr?.toString().substring(0, 200))
            }
          }
        } else {
          console.log('[PROCESS] Step 1.5: No remapped ranges found, keeping full cut')
        }
      } else if (nonPresenterCount === 0) {
        console.log('[PROCESS] Step 1.5: All segments are from presenter, no filtering needed')
      }
    } else {
      console.log('[PROCESS] Step 1.5 skipped:', !mainPresenter || mainPresenter === 'none' ? 'No presenter identified' : `No transcript segments (${transcriptSegments.length})`)
    }

    // ============================================
    // STEP 1.75: INSERT B-ROLL CLIPS
    // ============================================
    if (brollAssets.length > 0) {
      console.log(`[PROCESS] Step 1.75: Inserting ${brollAssets.length} B-Roll clips...`)

      // Track accumulated time offset from previously inserted B-Rolls
      // so subsequent insertAt timestamps are correctly adjusted
      let brollTimeOffset = 0

      for (let i = 0; i < brollAssets.length; i++) {
        const broll = brollAssets[i]
        const brollUrl = broll.url || broll.localPath || ''
        const rawInsertAt = parseFloat(broll.insertAt || broll.insert_at || broll.time || 0)
        const insertAt = rawInsertAt + brollTimeOffset  // Adjust for previously inserted clips
        const duration = parseFloat(broll.duration || 4)

        if (!brollUrl) {
          console.warn(`[B-ROLL] Asset ${i} has no URL, skipping`)
          continue
        }

        // Download B-Roll if it's a URL
        let brollFile = ''
        if (brollUrl.includes('localhost')) {
          const brollFilename = path.basename(new URL(brollUrl, `http://localhost:${PORT}`).pathname)
          brollFile = path.join(uploadsDir, brollFilename)
        }

        if (!brollFile || !fs.existsSync(brollFile)) {
          if (brollUrl.startsWith('http')) {
            brollFile = path.join(uploadsDir, `broll_dl_${timestamp}_${i}.mp4`)
            try {
              const brollRes = await fetch(brollUrl)
              if (brollRes.ok) {
                const brollBuffer = Buffer.from(await brollRes.arrayBuffer())
                fs.writeFileSync(brollFile, brollBuffer)
                filesToCleanup.push(brollFile)
              } else {
                console.warn(`[B-ROLL] Download failed for asset ${i}: ${brollRes.status}`)
                continue
              }
            } catch (e: any) {
              console.warn(`[B-ROLL] Download error for asset ${i}:`, e.message)
              continue
            }
          } else {
            console.warn(`[B-ROLL] Asset ${i} file not found: ${brollUrl}`)
            continue
          }
        }

        if (!fs.existsSync(brollFile)) {
          console.warn(`[B-ROLL] Asset ${i} file missing after download`)
          continue
        }

        console.log(`[B-ROLL] Inserting clip ${i} at ${insertAt}s for ${duration}s`)

        // Get main video dimensions
        let vidWidth = 1920, vidHeight = 1080
        try {
          const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
          const probe = execSync(
            `"${ffprobePath}" -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${currentFile}"`,
            { timeout: 10000, encoding: 'utf-8' }
          ).trim()
          const [pw, ph] = probe.split('x').map(Number)
          if (pw > 0 && ph > 0) { vidWidth = pw; vidHeight = ph }
        } catch { /* use defaults */ }

        // Ensure even dimensions
        vidWidth = vidWidth % 2 === 0 ? vidWidth : vidWidth - 1
        vidHeight = vidHeight % 2 === 0 ? vidHeight : vidHeight - 1

        const output = path.join(uploadsDir, `broll_insert_${timestamp}_${i}.mp4`)
        filesToCleanup.push(output)

        try {
          const part1 = path.join(uploadsDir, `bp1_${timestamp}_${i}.mp4`)
          const brollScaled = path.join(uploadsDir, `bs_${timestamp}_${i}.mp4`)
          const part2 = path.join(uploadsDir, `bp2_${timestamp}_${i}.mp4`)
          filesToCleanup.push(part1, brollScaled, part2)

          // Part 1: main video up to insert point
          if (insertAt > 0.5) {
            execSync(
              `"${ffmpegPath}" -i "${currentFile}" -t ${insertAt} -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${part1}" -y`,
              { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
            )
          }

          // Scale B-Roll to match main video dimensions
          // When keepAudio is true, replace B-Roll audio with original presenter audio from that time segment
          const keepBrollAudio = broll.keepAudio !== false
          if (keepBrollAudio) {
            // Extract original audio from the insert segment, then combine with B-Roll video
            const origAudio = path.join(uploadsDir, `ba_${timestamp}_${i}.aac`)
            filesToCleanup.push(origAudio)
            try {
              execSync(
                `"${ffmpegPath}" -i "${currentFile}" -ss ${insertAt} -t ${duration} -vn -c:a aac -b:a 128k "${origAudio}" -y`,
                { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
              )
              execSync(
                `"${ffmpegPath}" -i "${brollFile}" -i "${origAudio}" -t ${duration} -vf "scale=${vidWidth}:${vidHeight}:force_original_aspect_ratio=decrease,pad=${vidWidth}:${vidHeight}:(ow-iw)/2:(oh-ih)/2" -map 0:v -map 1:a -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -shortest "${brollScaled}" -y`,
                { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
              )
            } catch {
              // Fallback: scale B-Roll with its own audio
              execSync(
                `"${ffmpegPath}" -i "${brollFile}" -t ${duration} -vf "scale=${vidWidth}:${vidHeight}:force_original_aspect_ratio=decrease,pad=${vidWidth}:${vidHeight}:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -shortest "${brollScaled}" -y`,
                { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
              )
            }
          } else {
            execSync(
              `"${ffmpegPath}" -i "${brollFile}" -t ${duration} -vf "scale=${vidWidth}:${vidHeight}:force_original_aspect_ratio=decrease,pad=${vidWidth}:${vidHeight}:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -shortest "${brollScaled}" -y`,
              { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
            )
          }

          // Part 2: main video after insert point
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -ss ${insertAt} -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${part2}" -y`,
            { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
          )

          // Concat: part1 + broll + part2
          const files: string[] = []
          if (insertAt > 0.5 && fs.existsSync(part1) && fs.statSync(part1).size > 10000) files.push(part1)
          files.push(brollScaled)
          if (fs.existsSync(part2) && fs.statSync(part2).size > 10000) files.push(part2)

          const listFile = path.join(uploadsDir, `bl_${timestamp}_${i}.txt`)
          filesToCleanup.push(listFile)
          fs.writeFileSync(listFile, files.map(f => `file '${f}'`).join('\n'))

          execSync(
            `"${ffmpegPath}" -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${output}" -y`,
            { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
          )

          if (fs.existsSync(output) && fs.statSync(output).size > 50000) {
            currentFile = output
            brollInserted++
            brollTimeOffset += duration  // Next insertAt must account for this clip's duration
            console.log(`[B-ROLL] Clip ${i} inserted at ${insertAt}s (offset now ${brollTimeOffset}s)`)
          }
        } catch (e: any) {
          console.warn(`[B-ROLL] Insert ${i} failed:`, e.stderr?.toString().substring(0, 200))
        }
      }

      console.log('[PROCESS] Step 1.75 done: B-Roll insertion')
    } else {
      console.log('[PROCESS] Step 1.75 skipped: No B-Roll assets')
    }

    // ============================================
    // STEP 2: MULTI-CAM SIMULATION
    // ============================================

    const cameraAngles = planCameraAngles
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
              anglesApplied = mcSegments.length
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
    // STEP H: BACKGROUND BLUR / DOF EFFECT
    // ============================================

    if (job?.plan?.backgroundBlur !== false) {
      const blurOutput = path.join(uploadsDir, `blur_${timestamp}.mp4`)
      filesToCleanup.push(blurOutput)

      console.log('[PROCESS] Step H: Applying background blur / DOF effect...')

      try {
        // Vignette + unsharp for subtle DOF look
        execSync(
          `"${ffmpegPath}" -i "${currentFile}" -vf "unsharp=5:5:0.5:5:5:0.5,vignette=PI/4" -c:a copy -preset fast -crf 18 "${blurOutput}" -y`,
          { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
        )

        if (fs.existsSync(blurOutput) && fs.statSync(blurOutput).size > 50000) {
          currentFile = blurOutput
          blurApplied = true
          console.log('[PROCESS] Step H done: Background blur / DOF applied')
        } else {
          console.warn('[PROCESS] Step H: Output invalid, keeping previous')
        }
      } catch (e: any) {
        console.warn('[PROCESS] Step H: Blur failed, trying simpler approach:', e.stderr?.toString().substring(0, 150))

        // Simpler fallback: just vignette + unsharp
        try {
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -vf "unsharp=7:7:1.5:7:7:0.5,vignette=PI/5" -c:a copy -preset fast -crf 18 "${blurOutput}" -y`,
            { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
          )

          if (fs.existsSync(blurOutput) && fs.statSync(blurOutput).size > 50000) {
            currentFile = blurOutput
            blurApplied = true
            console.log('[PROCESS] Step H done: Subtle DOF effect applied')
          }
        } catch {
          console.warn('[PROCESS] Step H: All blur methods failed, skipping')
        }
      }
    } else {
      console.log('[PROCESS] Step H skipped: Background blur disabled')
    }

    // ============================================
    // STEP I: COLOR GRADE
    // ============================================

    let colorGradeName = planColorGrade
    // Auto-select color grade based on content type if not specified or just 'clean'
    if (!colorGradeName || colorGradeName === 'clean') {
      const detectedType = job?.enrichment?.detected_type || job?.plan?.contentType || ''
      if (detectedType === 'ad_short' || detectedType === 'social_reels') colorGradeName = 'vibrant'
      else if (detectedType === 'podcast_interview') colorGradeName = 'warm'
      else if (detectedType === 'testimonial') colorGradeName = 'film'
      else if (detectedType === 'marketing_product') colorGradeName = 'cinematic'
      if (colorGradeName !== planColorGrade) {
        console.log(`[COLOR] Auto-selected grade "${colorGradeName}" for content type "${detectedType}"`)
      }
    }
    const gradeFilter = colorGrades[colorGradeName] || colorGrades.clean
    console.log(`[COLOR] Applying grade "${colorGradeName}": ${gradeFilter.substring(0, 80)}...`)
    const gradedFile = path.join(uploadsDir, `graded_${timestamp}.mp4`)
    filesToCleanup.push(gradedFile)

    console.log(`[PROCESS] Step I: Color grading (${colorGradeName})...`)
    try {
      execSync(
        `"${ffmpegPath}" -i "${currentFile}" -vf "${gradeFilter}" -c:v libx264 -preset fast -crf 23 -c:a copy "${gradedFile}" -y`,
        { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
      )
      if (fs.existsSync(gradedFile) && fs.statSync(gradedFile).size > 50000) {
        currentFile = gradedFile
        console.log('[PROCESS] Step I done')
      } else {
        console.warn('[PROCESS] Step I: Graded file invalid, keeping previous')
      }
    } catch (e: any) {
      console.warn('[PROCESS] Step I: Color grading failed, continuing without:', e.message?.slice(0, 150))
    }

    // ============================================
    // STEP J: ZOOM / KEN BURNS EFFECTS (every 5-6 seconds)
    // ============================================

    const zooms = planZooms
    console.log('[PROCESS] Zoom debug:', {
      planZooms: planZooms.length,
      firstZoom: planZooms[0] ? JSON.stringify(planZooms[0]) : 'none',
    })
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
          const atTime = z.at_time ?? z.atTime ?? z.relative_time ?? z.relativeTime ?? z.time ?? z.start ?? 0
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
            scale: z.scale || z.intensity || 1.05,
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
          zoomsApplied = limitedZooms.length
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
          audioCleanApplied = true
          musicApplied = true
          console.log('[PROCESS] Step 4 done: Audio processed with music + sidechain ducking')
        } else {
          // No music file - just clean the voice
          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -af "highpass=f=80,lowpass=f=12000,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=5:release=50,loudnorm=I=-16:LRA=11:TP=-1.5" -c:v copy "${audioFile}" -y`,
            { timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] }
          )
          currentFile = audioFile
          audioCleanApplied = true
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
        audioCleanApplied = true
        console.log('[PROCESS] Step 4 done: Audio cleaned')
      } catch (e: any) {
        console.log('[PROCESS] Audio clean failed, continuing:', e.message?.slice(0, 100))
      }
    }

    // ============================================
    // STEP 5: STYLED SUBTITLES (ASS FORMAT)
    // ============================================

    // Use filtered subtitle segments
    const segments = filteredSubtitleSegments
    let assFilePath: string | null = null

    console.log('[PROCESS] Step 5 check:', {
      resolvedSegments: segments.length,
      includeSubtitles,
      animatedSubtitles,
      mainPresenter: mainPresenter || 'none',
    })

    // Ensure Hebrew font is available in uploads dir for all subtitle paths
    ensureFontInDir(uploadsDir)

    if (!includeSubtitles) {
      console.log('[PROCESS] Step 5: Skipping subtitles (disabled by user)')
    } else if (segments.length > 0 && animatedSubtitles) {
      console.log(`[PROCESS] Step 5: Generating ANIMATED subtitles (${animationStyle})...`)
      try {
        currentFile = await generateAnimatedSubtitles(
          currentFile, segments, cuts, animationStyle || 'karaoke',
          uploadsDir, ffmpegPath, timestamp, filesToCleanup
        )
        subtitlesApplied = true
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
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${path.basename(currentFile)}" -vf "subtitles=${assBase}:fontsdir=." -c:v libx264 -preset fast -crf 23 -c:a copy "${path.basename(subFile)}" -y`,
            { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
          )
          currentFile = subFile
          subtitlesApplied = true
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
          `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "subtitles=${assBase}:fontsdir=." -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
          { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
        )
        currentFile = subFile
        subtitlesApplied = true
        console.log('[PROCESS] Step 5 done: Styled subtitles added')
      } catch (e: any) {
        console.warn('[PROCESS] ASS subtitles filter failed:', e.stderr?.toString().substring(0, 300))
        // Try ass filter
        let assWorked = false
        try {
          execSync(
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "ass=${assBase}:fontsdir=." -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
            { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
          )
          currentFile = subFile
          assWorked = true
          subtitlesApplied = true
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
                `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "subtitles=${srtBase}:fontsdir=.:force_style='FontName=${HEBREW_FONT_NAME},FontSize=24,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=30,Encoding=177'" -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
                { timeout: 300000, maxBuffer: 10 * 1024 * 1024, cwd: uploadsDir }
              )
              currentFile = subFile
              subtitlesApplied = true
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
                  subtitlesApplied = true
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
      console.log('[PROCESS] Step 5 skipped: No subtitles available (segments:', segments.length, 'includeSubtitles:', includeSubtitles, ')')
    }

    // ============================================
    // STEP 6: LOWER THIRDS (SPEAKER NAMES)
    // ============================================

    const speakers = planSpeakers
    // Filter out generic speaker names — only show lower thirds for real names
    const uniqueSpeakers = speakers.filter((s: any) => {
      const name = (s.name || '').trim()
      return name && name !== 'דובר' && name !== 'דובר 1' && !name.match(/^דובר\s*\d*$/) && !name.match(/^speaker\s*\d*$/i)
    })
    console.log(`[LOWER THIRDS] Filtered: ${speakers.length} planned → ${uniqueSpeakers.length} with real names.${speakers.length <= 1 || uniqueSpeakers.length === 0 ? ' Skipping lower thirds.' : ''}`)

    if (speakers.length > 1 && uniqueSpeakers.length > 0) {
      const lowerFile = path.join(uploadsDir, `lower_${timestamp}.mp4`)
      filesToCleanup.push(lowerFile)
      console.log('[PROCESS] Step 6: Adding speaker lower thirds...')

      try {
        // Remap speaker timestamps to cut video
        const dialogueLines: string[] = []
        uniqueSpeakers.forEach((s: any) => {
          const name = s.name
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
Style: LowerThird,Arial,28,&H00FFFFFF,&H00FFFFFF,&H00000000,&HB07C5CFF,-1,0,0,0,100,100,0,0,3,2,1,1,20,20,40,177

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
          lowerThirdsApplied = speakers.length
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

    const graphics = planGraphics
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
Style: GraphicOverlay,Arial,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&HCC7C5CFF,-1,0,0,0,100,100,0,0,3,2,1,7,20,20,20,177

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
          graphicsApplied = graphics.length
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
    // STEP 7.5: LOGO OVERLAY
    // ============================================
    if (job?.logo?.serverUrl) {
      console.log('[LOGO] Checking logo:', JSON.stringify({
        hasLogo: !!job?.logo,
        serverUrl: job?.logo?.serverUrl,
        position: job?.logo?.position,
        size: job?.logo?.size,
      }))
      let logoFile = job.logo.serverUrl
      // Convert localhost URL to local path using proper URL parsing
      if (logoFile.startsWith('http://localhost')) {
        try {
          const urlPath = new URL(logoFile).pathname  // e.g. /uploads/logo_123.png
          const filename = path.basename(urlPath)
          logoFile = path.join(uploadsDir, filename)
        } catch (urlErr: any) {
          console.warn('[LOGO] URL parse failed, trying regex fallback:', urlErr.message)
          logoFile = logoFile.replace(
            /http:\/\/localhost:\d+\/uploads\//,
            uploadsDir + '/'
          )
        }
      }
      const logoExists = fs.existsSync(logoFile)
      const fileSize = logoExists ? fs.statSync(logoFile).size : 0
      console.log(`[LOGO] Path resolved: ${logoFile}, exists: ${logoExists}, size: ${fileSize}bytes`)
      if (logoExists) {
        const position = job.logo.position || 'top-right'
        const size = job.logo.size || 'medium'
        const opacity = job.logo.opacity ?? 0.9

        const sizeMap: Record<string, number> = {
          small: 0.08,
          medium: 0.12,
          large: 0.18,
        }
        const logoScale = sizeMap[size] || 0.12

        const margin = 20
        let overlayPosition = ''
        switch (position) {
          case 'top-right':
            overlayPosition = `x=W-w-${margin}:y=${margin}`
            break
          case 'top-left':
            overlayPosition = `x=${margin}:y=${margin}`
            break
          case 'bottom-right':
            overlayPosition = `x=W-w-${margin}:y=H-h-${margin}`
            break
          case 'bottom-left':
            overlayPosition = `x=${margin}:y=H-h-${margin}`
            break
          default:
            overlayPosition = `x=W-w-${margin}:y=${margin}`
        }

        const logoOutput = path.join(uploadsDir, `logo_${timestamp}.mp4`)
        filesToCleanup.push(logoOutput)

        try {
          // Probe current file dimensions (may differ from source after processing)
          let videoWidth = sourceWidth || 1080
          try {
            const ffprobePath = ffmpegPath.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
            const probeOut = execSync(
              `"${ffprobePath}" -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 "${currentFile}"`,
              { timeout: 10000, encoding: 'utf-8' }
            ).trim()
            const pw = parseInt(probeOut)
            if (pw > 0) videoWidth = pw
          } catch { /* use sourceWidth fallback */ }
          const logoPixelWidth = Math.round(videoWidth * logoScale)

          execSync(
            `"${ffmpegPath}" -i "${currentFile}" -i "${logoFile}" -filter_complex "[1:v]scale=${logoPixelWidth}:-1,format=rgba,colorchannelmixer=aa=${opacity}[logo];[0:v][logo]overlay=${overlayPosition}[out]" -map "[out]" -map 0:a -c:a copy -preset fast -crf 18 "${logoOutput}" -y`,
            { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
          )

          if (fs.existsSync(logoOutput) && fs.statSync(logoOutput).size > 50000) {
            currentFile = logoOutput
            logoApplied = true
            console.log(`[LOGO] Applied: ${position}, ${size} (${logoPixelWidth}px), opacity ${opacity}`)
          }
        } catch (e: any) {
          console.warn('[LOGO] Overlay failed, trying simpler filter:', e.stderr?.toString().substring(0, 200))
          // Fallback: simpler overlay without colorchannelmixer
          try {
            execSync(
              `"${ffmpegPath}" -i "${currentFile}" -i "${logoFile}" -filter_complex "[1:v]scale=${logoPixelWidth}:-1[logo];[0:v][logo]overlay=${overlayPosition}[out]" -map "[out]" -map 0:a -c:a copy -preset fast -crf 18 "${logoOutput}" -y`,
              { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
            )
            if (fs.existsSync(logoOutput) && fs.statSync(logoOutput).size > 50000) {
              currentFile = logoOutput
              logoApplied = true
              console.log(`[LOGO] Applied with simple overlay fallback`)
            }
          } catch (e2: any) {
            console.warn('[LOGO] Simple overlay also failed:', e2.message?.substring(0, 150))
          }
        }
      } else {
        console.warn('[LOGO] File not found:', logoFile)
      }
    }

    // ============================================
    // EFFECTS VERIFICATION
    // ============================================
    const effectCount = [anglesApplied > 0, blurApplied, zoomsApplied > 0, brollInserted > 0, musicApplied, subtitlesApplied].filter(Boolean).length
    if (effectCount < 3) {
      console.warn(`[EFFECTS] WARNING: Only ${effectCount}/6 effects applied! Video may look unedited.`)
    } else {
      console.log(`[EFFECTS] ${effectCount}/6 effects applied`)
    }

    // ============================================
    // PROCESS COMPLETE SUMMARY
    // ============================================
    const cutRanges = cuts
    console.log('========== PROCESS COMPLETE ==========')
    console.log(`Input: ${path.basename(sourceFile)} (${sourceDuration.toFixed(1)}s)`)
    console.log(`Output: ${path.basename(currentFile)} (${(fs.statSync(currentFile).size/1024/1024).toFixed(1)}MB)`)
    console.log(`Steps executed:`)
    console.log(`  Clean transcript: ${job?.transcript?.cleaningSummary ? 'YES - removed ' + (job.transcript.cleaningSummary.removed || 0) : 'NO'}`)
    console.log(`  Presenter filter: ${mainPresenter || 'NONE'} (${cutRanges?.length || 0} cut ranges)`)
    console.log(`  B-Roll inserted: ${brollInserted} clips`)
    console.log(`  Camera angles: ${anglesApplied}`)
    console.log(`  Background blur: ${blurApplied ? 'YES' : 'NO'}`)
    console.log(`  Color grade: ${planColorGrade || 'NONE'}`)
    console.log(`  Zooms: ${zoomsApplied}`)
    console.log(`  Audio cleaned: ${audioCleanApplied ? 'YES' : 'NO'}`)
    console.log(`  Music mixed: ${musicApplied ? 'YES' : 'NO'}`)
    console.log(`  Subtitles: ${subtitlesApplied ? 'YES' : 'NO'} (${filteredSubtitleSegments?.length || 0} lines)`)
    console.log(`  Lower thirds: ${lowerThirdsApplied}`)
    console.log(`  Graphics: ${graphicsApplied}`)
    console.log(`  Logo: ${logoApplied ? 'YES (' + (job?.logo?.position || 'top-right') + ')' : 'NO'}`)
    console.log('======================================')

    // ============================================
    // STEP 8: EXPORT FOR EACH PLATFORM (SMART FRAMING)
    // ============================================

    // If skipPlatformExport, return the single edited file without platform variants (for A/B preview)
    if (skipPlatformExport) {
      console.log('[PROCESS] Skipping platform export (A/B preview mode)')
      const fileSize = fs.statSync(currentFile).size / (1024 * 1024)
      const fileUrl = `http://localhost:${PORT}/uploads/${path.basename(currentFile)}`

      // Calculate comprehensive quality score (professional editing standards)
      const { score: qualityScore, report: qualityReport } = calculateQualityScore(job, currentFile, {
        cuts, planZooms, filteredSubtitleSegments, brollAssets, musicUrl,
        planColorGrade, mainPresenter, planCameraAngles,
        subtitlesActuallyApplied: subtitlesApplied,
        musicActuallyApplied: musicApplied,
        brollActuallyApplied: brollInserted,
        logoActuallyApplied: logoApplied,
        colorGradeActuallyApplied: !!colorGradeName,
        lowerThirdsActuallyApplied: lowerThirdsApplied > 0,
        logoApplied, logoRequested: !!job?.logo?.serverUrl,
      })

      console.log(`[PROCESS] Done! Preview: ${fileUrl} (${fileSize.toFixed(1)}MB, quality: ${qualityScore})`)

      // Save edit record for self-evaluation
      try {
        const outputFrames = extractOutputFrames(currentFile, job?.id || `job_${timestamp}`)
        saveEditRecord({
          jobId: job?.id || `job_${timestamp}`,
          timestamp: new Date().toISOString(),
          inputDuration: sourceDuration,
          outputDuration: 0, // unknown in preview mode
          format: (platforms || ['original'])[0] || 'original',
          contentType: videoPlan?.content_type || videoPlan?.contentType || 'unknown',
          settings: {
            subtitleStyle: animationStyle || 'karaoke',
            colorGrade: planColorGrade,
            brollModel: 'wan',
          },
          results: {
            qualityScore,
            presenterSegments: filteredSubtitleSegments?.length || 0,
            cutSegments: (videoPlan?.cuts || []).length,
            brollClips: brollInserted,
            musicApplied,
            subtitlesApplied,
            zoomsApplied,
            cameraAngles: anglesApplied,
            colorGradeApplied: !!colorGradeName,
          },
          rulesUsed: {
            brainVersion: loadEditorBrain().version || 0,
            stagePrompts: !!loadEditorBrain().stagePrompts,
          },
          outputFrames,
          userRating: null,
          reviewed: false,
        })
      } catch (e: any) {
        console.warn('[SELF-EVAL] Failed to save edit record:', e.message?.substring(0, 100))
      }

      autoEditorBusy = false
      console.log('[AUTO-EDITOR] Session complete, learning agent resumed')

      return res.json({
        success: true,
        processedFile: fileUrl,
        files: [{
          url: fileUrl,
          platform: 'original',
          ratio: '16:9',
          resolution: '1920x1080',
          filename: path.basename(currentFile),
          sizeMB: parseFloat(fileSize.toFixed(1)),
        }],
        platformFiles: [],
        qualityScore,
        qualityReport,
        processingTime: Date.now() - timestamp,
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

    // Cleanup visual analysis frames directories
    try {
      const frameDirs = fs.readdirSync(uploadsDir).filter(d => d.startsWith('frames_'))
      frameDirs.forEach(d => {
        const dirPath = path.join(uploadsDir, d)
        try {
          if (fs.statSync(dirPath).isDirectory()) {
            fs.readdirSync(dirPath).forEach(f => fs.unlinkSync(path.join(dirPath, f)))
            fs.rmdirSync(dirPath)
          }
        } catch {}
      })
      if (frameDirs.length > 0) console.log(`[CLEANUP] Removed ${frameDirs.length} frame directories`)
    } catch {}

    // Cleanup speaker samples
    cleanupSpeakerSamples(uploadsDir)

    // Calculate quality score for platform export
    const { score: qualityScore, report: qualityReport } = calculateQualityScore(job, currentFile, {
      cuts, planZooms, filteredSubtitleSegments, brollAssets, musicUrl,
      planColorGrade, mainPresenter, planCameraAngles,
      subtitlesActuallyApplied: subtitlesApplied,
      musicActuallyApplied: musicApplied,
      brollActuallyApplied: brollInserted,
      logoActuallyApplied: logoApplied,
      colorGradeActuallyApplied: !!colorGradeName,
      lowerThirdsActuallyApplied: lowerThirdsApplied > 0,
      logoApplied, logoRequested: !!job?.logo?.serverUrl,
    })

    console.log('[PROCESS] Done! Created', outputFiles.length, 'files with professional effects')

    // Save edit record for self-evaluation
    try {
      const outputFrames = extractOutputFrames(currentFile, job?.id || `job_${timestamp}`)
      saveEditRecord({
        jobId: job?.id || `job_${timestamp}`,
        timestamp: new Date().toISOString(),
        inputDuration: sourceDuration,
        outputDuration: 0,
        format: (platforms || ['tiktok'])[0] || 'tiktok',
        contentType: videoPlan?.content_type || videoPlan?.contentType || 'unknown',
        settings: {
          subtitleStyle: animationStyle || 'karaoke',
          colorGrade: planColorGrade,
          brollModel: 'wan',
        },
        results: {
          qualityScore,
          presenterSegments: filteredSubtitleSegments?.length || 0,
          cutSegments: (videoPlan?.cuts || []).length,
          brollClips: brollInserted,
          musicApplied,
          subtitlesApplied,
          zoomsApplied,
          cameraAngles: anglesApplied,
          colorGradeApplied: !!colorGradeName,
        },
        rulesUsed: {
          brainVersion: loadEditorBrain().version || 0,
          stagePrompts: !!loadEditorBrain().stagePrompts,
        },
        outputFrames,
        userRating: null,
        reviewed: false,
      })
    } catch (e: any) {
      console.warn('[SELF-EVAL] Failed to save edit record:', e.message?.substring(0, 100))
    }

    autoEditorBusy = false
    console.log('[AUTO-EDITOR] Session complete, learning agent resumed')

    res.json({
      success: true,
      files: outputFiles,
      qualityScore,
      qualityReport,
      processingTime: Date.now() - timestamp,
      message: `נוצרו ${outputFiles.length} קבצים מקצועיים`,
    })
  } catch (error: any) {
    autoEditorBusy = false
    console.log('[AUTO-EDITOR] Session error, learning agent resumed')
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
    // Preserve word-level timestamps if available (from Deepgram)
    const subs = captions.map((c: any) => ({
      start: c.startTime || c.start || 0,
      end: c.endTime || c.end || 0,
      text: c.text || '',
      words: c.words || undefined,
    }))

    // For main editor export, cuts = entire video as one cut
    const totalDur = subs.length > 0 ? Math.max(...subs.map((s: any) => s.end)) + 1 : 300
    const fakeCuts = [{ keep_start: 0, keep_end: totalDur }]

    const assContent = buildAnimatedASS(subs, animationStyle, fakeCuts)
    const assPath = path.join(uploadsDir, `export_subs_${timestamp}.ass`)
    fs.writeFileSync(assPath, '\ufeff' + assContent, 'utf-8')
    filesToCleanup.push(assPath)

    // Ensure Hebrew font is available in uploads dir
    ensureFontInDir(uploadsDir)

    const scaleMap: Record<string, string> = {
      'mp4-720': 'scale=-2:720',
      'mp4-1080': 'scale=-2:1080',
      'mp4-4k': 'scale=-2:2160',
    }
    const scale = scaleMap[format] || 'scale=-2:1080'

    const outputPath = path.join(uploadsDir, `export_animated_${timestamp}.mp4`)
    filesToCleanup.push(outputPath)

    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")
    const fontsDirEscaped = uploadsDir.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")
    execSync(
      `"${ffmpegPath}" -i "${inputPath}" -vf "subtitles='${escapedAss}':fontsdir='${fontsDirEscaped}',${scale}" -c:v libx264 -preset fast -crf 23 -c:a aac "${outputPath}" -y`,
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

// Persistent data directory: Railway volume if available, else local
const DATA_DIR = (() => {
  if (fs.existsSync('/app/server/data')) {
    console.log('[DATA] Using Railway persistent volume: /app/server/data');
    return '/app/server/data';
  }
  console.log('[DATA] Using local directory:', __dirname);
  return __dirname;
})();
const learningStatePath = path.join(DATA_DIR, 'learning-state.json');
const editorBrainPath = path.join(DATA_DIR, 'editor-brain.json');
const editHistoryPath = path.join(DATA_DIR, 'edit-history.json');

// Budget constants
const DAILY_GPT_COST_LIMIT = 2.0   // $2 per day
const MONTHLY_GPT_COST_LIMIT = 30.0 // $30 per month
const DAILY_GPT_CALLS_LIMIT = 50    // ~50 calls/day at ~$0.02/call

function loadLearningState(): any {
  const brainPath = editorBrainPath

  // Try loading state file first
  try {
    if (fs.existsSync(learningStatePath)) {
      const state = JSON.parse(fs.readFileSync(learningStatePath, 'utf-8'))
      // Validate that state has meaningful data (not a reset/empty state)
      if (state.totalCost > 0 || state.learningMetrics?.totalSessions > 0 || state.totalVideosAnalyzed > 0) {
        console.log(`[LEARN] State loaded: ${state.learningMetrics?.totalSessions || 0} sessions, $${(state.totalCost || 0).toFixed(3)} total`)
        return state
      }
    }
  } catch {}

  // State file missing or empty (e.g. after Railway redeploy) - try to recover from editor brain
  try {
    if (fs.existsSync(brainPath)) {
      const brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'))
      if (brain.cumulativeStats) {
        console.log('[LEARN] Recovering stats from editor brain:', JSON.stringify(brain.cumulativeStats))
        return {
          lastLearnDate: brain.cumulativeStats.lastLearnDate || 0,
          totalVideosAnalyzed: brain.cumulativeStats.totalVideosAnalyzed || 0,
          learnedPatterns: {},
          missingFeatures: [],
          dailyYoutubeUnits: 0,
          dailyGptCalls: 0,
          dailyGptCost: 0,
          dailyDate: brain.cumulativeStats.dailyDate || '',
          dailyCost: brain.cumulativeStats.dailyCost || 0,
          monthlyGptCost: 0,
          monthlyDate: '',
          monthlyCost: brain.cumulativeStats.monthlyCost || 0,
          monthlyMonth: brain.cumulativeStats.monthlyMonth || '',
          totalCost: brain.cumulativeStats.totalCost || 0,
          expertise: {},
          trendInsights: { activeTrends: [], expiredTrends: [], evergreenRules: [] },
          learningMetrics: {
            totalSessions: brain.cumulativeStats.totalSessions || 0,
          },
          sessionHistory: brain.cumulativeStats.sessionHistory || [],
          lastSessionCost: brain.cumulativeStats.lastSessionCost || 0,
        }
      }
    }
  } catch {}

  // Nothing to recover from - start fresh
  console.log('[LEARN] No learning state or brain found, starting fresh')
  return {
    lastLearnDate: 0,
    totalVideosAnalyzed: 0,
    learnedPatterns: {},
    missingFeatures: [],
    dailyYoutubeUnits: 0,
    dailyGptCalls: 0,
    dailyGptCost: 0,
    dailyDate: '',
    dailyCost: 0,
    monthlyGptCost: 0,
    monthlyDate: '',
    monthlyCost: 0,
    monthlyMonth: '',
    totalCost: 0,
    expertise: {},
    trendInsights: { activeTrends: [], expiredTrends: [], evergreenRules: [] },
    learningMetrics: { totalSessions: 0 },
  }
}

// Estimate cost per GPT call based on tokens
function estimateCallCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, {input: number, output: number}> = {
    'gpt-5.4': { input: 0.005 / 1000, output: 0.015 / 1000 },
    'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 },
  }
  const p = pricing[model] || pricing['gpt-5.4']
  return (inputTokens * p.input) + (outputTokens * p.output)
}

// Track cost after each GPT call
function trackCost(state: any, model: string, usage: any): any {
  const cost = estimateCallCost(model, usage?.prompt_tokens || 500, usage?.completion_tokens || 500)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const month = today.substring(0, 7)

  if (state.dailyDate !== today) {
    state.dailyGptCost = 0
    state.dailyGptCalls = 0
    state.dailyDate = today
  }
  if (state.monthlyDate !== month) {
    state.monthlyGptCost = 0
    state.monthlyDate = month
  }

  state.dailyGptCost = (state.dailyGptCost || 0) + cost
  state.dailyGptCalls = (state.dailyGptCalls || 0) + 1
  state.monthlyGptCost = (state.monthlyGptCost || 0) + cost

  console.log(`[LEARN] Cost: $${(cost || 0).toFixed(4)} | Today: $${(state.dailyGptCost || 0).toFixed(3)}/$${DAILY_GPT_COST_LIMIT} | Month: $${(state.monthlyGptCost || 0).toFixed(2)}/$${MONTHLY_GPT_COST_LIMIT}`)
  return state
}

// Check if budget allows more GPT calls
function hasBudget(state: any): boolean {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  if (state.dailyDate !== today) return true // New day, reset

  if ((state.dailyGptCost || 0) >= DAILY_GPT_COST_LIMIT) {
    console.log(`[LEARN] Daily budget exhausted: $${(state.dailyGptCost || 0).toFixed(2)}/$${DAILY_GPT_COST_LIMIT}`)
    return false
  }
  if ((state.dailyGptCalls || 0) >= DAILY_GPT_CALLS_LIMIT) {
    console.log(`[LEARN] Daily call limit reached: ${state.dailyGptCalls}/${DAILY_GPT_CALLS_LIMIT}`)
    return false
  }
  if ((state.monthlyGptCost || 0) >= MONTHLY_GPT_COST_LIMIT) {
    console.log(`[LEARN] Monthly budget exhausted: $${(state.monthlyGptCost || 0).toFixed(2)}/$${MONTHLY_GPT_COST_LIMIT}`)
    return false
  }
  return true
}

// Get next session info for display
function getNextSessionInfo(): string {
  const israelHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false
  }))
  if (israelHour < 7) return 'היום 07:00'
  if (israelHour < 19) return 'היום 19:00'
  return 'מחר 07:00'
}

function saveLearningState(state: any) {
  try {
    fs.writeFileSync(learningStatePath, JSON.stringify(state, null, 2))
  } catch (e: any) {
    console.error('[LEARN] Failed to save state:', e.message)
  }
}

// ==================== EDIT HISTORY (Self-Evaluation) ====================

function loadEditHistory(): any {
  try {
    if (fs.existsSync(editHistoryPath)) {
      return JSON.parse(fs.readFileSync(editHistoryPath, 'utf-8'))
    }
  } catch {}
  return { edits: [] }
}

function saveEditHistory(history: any) {
  try {
    // Keep last 30 days of records
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    history.edits = (history.edits || []).filter((e: any) => new Date(e.timestamp).getTime() > thirtyDaysAgo)
    fs.writeFileSync(editHistoryPath, JSON.stringify(history, null, 2))
  } catch (e: any) {
    console.error('[SELF-EVAL] Failed to save edit history:', e.message)
  }
}

function extractOutputFrames(videoFile: string, jobId: string): string[] {
  const framesDir = path.join(uploadsDir, `eval_frames_${jobId}`)
  try {
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true })
    const ffmpeg = getFFmpeg()
    // Get video duration
    const ffprobe = ffmpeg.replace(/ffmpeg([^/]*)$/, 'ffprobe$1')
    let duration = 0
    try {
      const probeOut = execSync(`"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${videoFile}"`, { timeout: 15000 }).toString().trim()
      duration = parseFloat(probeOut) || 0
    } catch { duration = 30 }

    if (duration < 1) return []

    const frames: string[] = []
    const interval = duration / 6 // 5 frames evenly spaced (skip edges)
    for (let i = 1; i <= 5; i++) {
      const timestamp = (interval * i).toFixed(2)
      const framePath = path.join(framesDir, `frame_${i}.jpg`)
      try {
        execSync(
          `"${ffmpeg}" -ss ${timestamp} -i "${videoFile}" -vframes 1 -q:v 8 -vf "scale=480:-1" "${framePath}" -y`,
          { timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
        )
        if (fs.existsSync(framePath) && fs.statSync(framePath).size > 500) {
          frames.push(framePath)
        }
      } catch {}
    }
    console.log(`[SELF-EVAL] Extracted ${frames.length}/5 frames from output video`)
    return frames
  } catch (e: any) {
    console.error('[SELF-EVAL] Frame extraction failed:', e.message?.substring(0, 100))
    return []
  }
}

function saveEditRecord(record: any) {
  const history = loadEditHistory()
  history.edits.push(record)
  saveEditHistory(history)
  console.log(`[SELF-EVAL] Edit record saved for job ${record.jobId}`)
}

// ==================== LEARNING CATEGORIES (18+ diverse) ====================

const LEARNING_CATEGORIES: Record<string, Array<{query: string, goal: string}>> = {
  // EDITING TECHNIQUES
  editing_techniques: [
    { query: 'best video editing techniques 2026 reels', goal: 'learn cutting patterns and timing' },
    { query: 'professional video editor workflow breakdown', goal: 'learn pro editing decisions' },
    { query: 'jump cut vs smooth transition when to use', goal: 'learn transition logic' },
    { query: 'video editing mistakes beginners make', goal: 'learn what to avoid' },
  ],
  // HOOKS & RETENTION
  hooks_retention: [
    { query: 'best hooks for reels 2026 high retention', goal: 'learn hook patterns that work' },
    { query: 'why viewers scroll away first 3 seconds', goal: 'learn what kills retention' },
    { query: 'viral video opening analysis breakdown', goal: 'learn exact hook structures' },
    { query: 'pattern interrupt examples social media', goal: 'learn attention-grabbing openers' },
  ],
  // PACING & RHYTHM
  pacing_rhythm: [
    { query: 'video pacing tutorial fast vs slow editing', goal: 'learn when to speed up vs slow down' },
    { query: 'music sync editing technique beat matching', goal: 'learn audio-visual sync' },
    { query: 'emotional pacing documentary storytelling', goal: 'learn how pacing affects emotion' },
  ],
  // B-ROLL & VISUAL STORYTELLING
  broll_storytelling: [
    { query: 'b-roll techniques that tell a story', goal: 'learn purposeful B-Roll placement' },
    { query: 'when to cut to b-roll talking head videos', goal: 'learn B-Roll timing decisions' },
    { query: 'cinematic b-roll tips smartphone', goal: 'learn B-Roll visual quality' },
  ],
  // SUBTITLES & TEXT
  subtitles_text: [
    { query: 'best subtitle styles for reels tiktok 2026', goal: 'learn subtitle trends' },
    { query: 'animated captions that increase watch time', goal: 'learn effective caption animation' },
    { query: 'text on screen design for social media video', goal: 'learn text overlay design' },
  ],
  // COLOR & MOOD
  color_mood: [
    { query: 'color grading for different moods tutorial', goal: 'learn color-emotion mapping' },
    { query: 'cinematic color grade before after breakdown', goal: 'learn grading techniques' },
    { query: 'color psychology in video marketing', goal: 'learn why colors work' },
  ],
  // SOUND DESIGN
  sound_design: [
    { query: 'sound design for social media videos', goal: 'learn audio impact' },
    { query: 'background music selection for marketing videos', goal: 'learn music-content matching' },
    { query: 'audio mixing voice over music ratio', goal: 'learn audio balance' },
  ],
  // STORYTELLING STRUCTURE
  storytelling: [
    { query: 'storytelling structure for short form video', goal: 'learn narrative arc in 30-60s' },
    { query: 'problem solution video framework marketing', goal: 'learn persuasion structure' },
    { query: 'emotional storytelling techniques video', goal: 'learn emotional engagement' },
  ],
  // PLATFORM-SPECIFIC
  platform_specific: [
    { query: 'instagram reels algorithm 2026 what works', goal: 'learn platform requirements' },
    { query: 'tiktok editing style vs youtube shorts difference', goal: 'learn platform differences' },
    { query: 'linkedin video best practices business', goal: 'learn professional platform style' },
  ],
  // INDUSTRY-SPECIFIC
  industry_content: [
    { query: 'best marketing video for service business', goal: 'learn service business video style' },
    { query: 'SaaS product demo video editing', goal: 'learn tech product videos' },
    { query: 'real estate video editing techniques', goal: 'learn industry-specific editing' },
    { query: 'coaching consulting video content that converts', goal: 'learn expert-positioning videos' },
  ],
  // VIRAL ANALYSIS
  viral_analysis: [
    { query: 'why this video went viral breakdown analysis', goal: 'learn viral mechanics' },
    { query: 'most viewed reels 2026 editing analysis', goal: 'learn current trends' },
    { query: 'video editing trends 2026', goal: 'learn emerging techniques' },
  ],
  // CTA & CONVERSION
  cta_conversion: [
    { query: 'best call to action video ending techniques', goal: 'learn effective CTAs' },
    { query: 'video that converts viewers to customers', goal: 'learn conversion editing' },
    { query: 'end screen strategy short form video', goal: 'learn video endings' },
  ],
  // CURRENT TRENDS
  current_trends: [
    { query: 'trending reels editing style this week 2026', goal: 'learn what editing style is trending now' },
    { query: 'viral video trends march 2026', goal: 'learn current viral patterns' },
    { query: 'tiktok trending effects and transitions 2026', goal: 'learn trending effects' },
    { query: 'most popular editing style social media right now', goal: 'learn dominant current style' },
  ],
  // TRENDING FORMATS
  trending_formats: [
    { query: 'trending video formats reels tiktok 2026', goal: 'learn new format structures' },
    { query: 'new content format going viral 2026', goal: 'learn emerging formats' },
    { query: 'trending meme format video editing', goal: 'learn meme-style editing patterns' },
    { query: 'trending before after video format 2026', goal: 'learn transformation format trends' },
  ],
  // TRENDING AUDIO & MUSIC
  trending_audio: [
    { query: 'trending sounds for reels 2026 how to use', goal: 'learn audio trend patterns' },
    { query: 'viral sound effects editing 2026', goal: 'learn trending sound design' },
    { query: 'how music choice affects video virality', goal: 'learn music-virality connection' },
  ],
  // NICHE TRENDS
  niche_trends: [
    { query: 'trending business content style 2026', goal: 'learn business content trends' },
    { query: 'trending educational video format 2026', goal: 'learn edu-content trends' },
    { query: 'trending marketing video style small business', goal: 'learn SMB marketing trends' },
    { query: 'trending personal brand video editing', goal: 'learn personal brand trends' },
  ],
  // MARKETING STRATEGY
  marketing_strategy: [
    { query: 'video marketing strategy that converts 2026', goal: 'learn marketing video structure' },
    { query: 'how to sell with video without being salesy', goal: 'learn soft-sell techniques' },
    { query: 'emotional marketing video examples breakdown', goal: 'learn emotional persuasion in video' },
    { query: 'video funnel strategy awareness consideration conversion', goal: 'learn funnel-stage video differences' },
    { query: 'best marketing hooks for service businesses', goal: 'learn industry-specific hooks' },
  ],
  // PAID ADVERTISING
  paid_ads: [
    { query: 'meta ads video creative best practices 2026', goal: 'learn Facebook/Instagram ad video rules' },
    { query: 'youtube ads that convert editing breakdown', goal: 'learn YouTube ad editing patterns' },
    { query: 'tiktok spark ads creative strategy 2026', goal: 'learn TikTok ad format' },
    { query: 'video ad hook rate optimization first 3 seconds', goal: 'learn ad-specific hooks' },
    { query: 'UGC style ad vs polished ad performance comparison', goal: 'learn which ad style converts better' },
    { query: 'retargeting video ad strategy what to show', goal: 'learn retargeting video content' },
    { query: 'video ad creative fatigue how to prevent', goal: 'learn ad refresh strategies' },
  ],
  // SOCIAL MEDIA GROWTH
  social_growth: [
    { query: 'instagram algorithm 2026 what content gets pushed', goal: 'learn algorithm preferences' },
    { query: 'how to increase saves and shares on reels', goal: 'learn engagement optimization' },
    { query: 'content repurposing strategy one video multiple platforms', goal: 'learn multi-platform editing' },
    { query: 'social media content calendar for businesses', goal: 'learn content planning patterns' },
    { query: 'community building through video content', goal: 'learn engagement-driven content' },
  ],
  // CONVERSION PSYCHOLOGY
  conversion_psychology: [
    { query: 'psychological triggers in video marketing', goal: 'learn persuasion techniques for video' },
    { query: 'social proof in video ads examples', goal: 'learn trust-building in video' },
    { query: 'urgency and scarcity in video content', goal: 'learn conversion pressure techniques' },
    { query: 'objection handling in marketing videos', goal: 'learn how to address doubts in video' },
    { query: 'video testimonial editing that builds trust', goal: 'learn testimonial editing techniques' },
  ],
  // PROFESSIONAL WORKFLOW STEPS
  error_cleaning: [
    { query: 'how to clean video transcript remove filler words', goal: 'learn what to remove from speech' },
    { query: 'video editing removing stutters jump cuts tutorial', goal: 'learn stutter removal techniques' },
    { query: 'professional video editor cutting mistakes workflow', goal: 'learn pro error cleaning patterns' },
  ],
  camera_angles: [
    { query: 'when to switch camera angle talking head video', goal: 'learn angle switching timing' },
    { query: 'multicam editing single camera simulation', goal: 'learn faking multicam from one camera' },
    { query: 'camera angle variety video engagement', goal: 'learn which angles increase engagement' },
  ],
  color_correction: [
    { query: 'color grading talking head video tutorial 2026', goal: 'learn color grading for presenters' },
    { query: 'skin tone correction video professional', goal: 'learn skin tone optimization' },
    { query: 'matching colors between cameras video', goal: 'learn color matching techniques' },
    { query: 'LUT video editing best presets business', goal: 'learn which LUTs work for business' },
  ],
  background_blur: [
    { query: 'background blur video editing depth of field', goal: 'learn DOF techniques in post' },
    { query: 'separate subject from background video post', goal: 'learn foreground isolation' },
    { query: 'cinematic depth of field talking head', goal: 'learn cinematic DOF for presenters' },
  ],
  zoom_techniques: [
    { query: 'zoom in editing talking head when to zoom', goal: 'learn zoom timing for engagement' },
    { query: 'subtle zoom video editing ken burns effect', goal: 'learn subtle motion techniques' },
    { query: 'dynamic zoom reels tiktok editing', goal: 'learn social media zoom patterns' },
  ],
  subtitle_design: [
    { query: 'subtitle placement best practices video 2026', goal: 'learn optimal subtitle position' },
    { query: 'animated captions design engaging subtitles', goal: 'learn caption design trends' },
    { query: 'hebrew subtitles video RTL best practices', goal: 'learn Hebrew subtitle specifics' },
  ],
  music_selection: [
    { query: 'background music selection marketing video', goal: 'learn music-content matching' },
    { query: 'music volume mixing voice over ratio', goal: 'learn audio balance' },
    { query: 'royalty free music for business videos tips', goal: 'learn music selection strategy' },
  ],
  broll_creation: [
    { query: 'when to use b-roll talking head video', goal: 'learn B-Roll timing decisions' },
    { query: 'AI generated b-roll video editing workflow', goal: 'learn AI B-Roll techniques' },
    { query: 'b-roll types that increase video engagement', goal: 'learn which B-Roll works best' },
  ],
  final_polish: [
    { query: 'video editing final review checklist professional', goal: 'learn QA checklist' },
    { query: 'export settings social media video 2026', goal: 'learn optimal export settings' },
    { query: 'video quality check before publishing', goal: 'learn final quality checks' },
  ],
  // === HEBREW ADVERTISING & MARKETING ===
  hebrew_ads: [
    { query: 'פרסומת וידאו בעברית שעובדת טיפים', goal: 'learn what makes Hebrew video ads effective' },
    { query: 'סרטון פרסומת ישראלי ויראלי ניתוח', goal: 'learn viral Israeli ad patterns' },
    { query: 'קופירייטינג בעברית לפרסומות וידאו', goal: 'learn Hebrew copywriting for video' },
    { query: 'פרסומות ישראליות מצליחות 2025 2026', goal: 'learn successful Israeli ad campaigns' },
    { query: 'hebrew video ad creative best practices', goal: 'learn Hebrew-specific ad techniques' },
  ],
  hebrew_content: [
    { query: 'תוכן וידאו בעברית שמקבל צפיות', goal: 'learn Hebrew content that gets views' },
    { query: 'יוצרי תוכן ישראלים מצליחים סגנון עריכה', goal: 'learn Israeli creator editing styles' },
    { query: 'סרטון שיווקי בעברית דוגמאות', goal: 'learn Hebrew marketing video examples' },
    { query: 'RTL video editing subtitles hebrew', goal: 'learn RTL-specific editing techniques' },
  ],
  hebrew_social: [
    { query: 'אינסטגרם רילס ישראל טיפים 2026', goal: 'learn Israeli Instagram Reels best practices' },
    { query: 'טיקטוק ישראל מה עובד 2026', goal: 'learn what works on TikTok Israel' },
    { query: 'פרסום בפייסבוק ישראל וידאו', goal: 'learn Facebook video ads Israel' },
    { query: 'לינקדאין ישראל תוכן וידאו עסקי', goal: 'learn LinkedIn video content Israel' },
  ],
  // === ADVANCED PAID ADVERTISING ===
  paid_ads_creative: [
    { query: 'meta ads video creative that converts 2026', goal: 'learn high-converting Facebook/Instagram ad creatives' },
    { query: 'UGC ad vs polished ad which converts better', goal: 'learn UGC vs polished ad performance' },
    { query: 'video ad hook rate optimization first 3 seconds', goal: 'learn ad hook optimization' },
    { query: 'facebook video ad specs best practices 2026', goal: 'learn Facebook video ad technical specs' },
    { query: 'instagram reels ads vs stories ads performance', goal: 'learn Reels ads vs Stories ads' },
  ],
  paid_ads_strategy: [
    { query: 'video ad funnel strategy awareness retargeting', goal: 'learn video ad funnel strategy' },
    { query: 'retargeting video ad what to show second touch', goal: 'learn retargeting video content' },
    { query: 'video ad creative fatigue how to refresh', goal: 'learn ad creative refresh strategies' },
    { query: 'ad creative testing framework video', goal: 'learn A/B testing for video ads' },
    { query: 'lookalike audience video ad creative', goal: 'learn audience-specific ad creatives' },
  ],
  paid_ads_formats: [
    { query: 'youtube pre-roll ad editing best practices', goal: 'learn YouTube pre-roll ad editing' },
    { query: 'tiktok spark ads creative strategy 2026', goal: 'learn TikTok Spark Ads format' },
    { query: 'google demand gen video ad creative', goal: 'learn Google video ad formats' },
    { query: 'linkedin video ad B2B best practices', goal: 'learn LinkedIn B2B video ads' },
    { query: 'connected TV video ad editing CTV OTT', goal: 'learn CTV/OTT ad editing' },
  ],
  paid_ads_psychology: [
    { query: 'psychological triggers video advertising', goal: 'learn psychology in video ads' },
    { query: 'social proof in video ads examples', goal: 'learn social proof in ads' },
    { query: 'urgency scarcity in video ad creative', goal: 'learn urgency/scarcity in video ads' },
    { query: 'emotional vs rational video ad performance', goal: 'learn emotional vs rational ads' },
    { query: 'video ad objection handling techniques', goal: 'learn objection handling in video' },
  ],
  // === ADVANCED EDITING TECHNIQUES ===
  advanced_cuts: [
    { query: 'j-cut l-cut tutorial video editing', goal: 'learn J-cut and L-cut techniques' },
    { query: 'match cut editing technique examples', goal: 'learn match cut techniques' },
    { query: 'invisible cut seamless transition editing', goal: 'learn invisible cut techniques' },
    { query: 'jump cut rules when to use when to avoid', goal: 'learn jump cut best practices' },
    { query: 'montage editing technique short form video', goal: 'learn montage editing' },
  ],
  advanced_motion: [
    { query: 'ken burns effect video editing when to use', goal: 'learn Ken Burns effect usage' },
    { query: 'parallax effect video editing tutorial', goal: 'learn parallax scrolling effect' },
    { query: 'whip pan transition editing technique', goal: 'learn whip pan transitions' },
    { query: 'speed ramp slow motion editing technique', goal: 'learn speed ramp techniques' },
    { query: 'smooth zoom transition between scenes', goal: 'learn smooth zoom transitions' },
  ],
  advanced_audio: [
    { query: 'audio ducking voice over music mixing', goal: 'learn audio ducking techniques' },
    { query: 'sound design for social media videos 2026', goal: 'learn sound design for social' },
    { query: 'foley sound effects video editing impact', goal: 'learn foley and sound effects' },
    { query: 'audio normalization loudness standards video', goal: 'learn audio loudness standards' },
    { query: 'ASMR audio techniques video engagement', goal: 'learn ASMR-style audio for engagement' },
  ],
  advanced_color: [
    { query: 'color grading for different moods tutorial 2026', goal: 'learn mood-based color grading' },
    { query: 'LUT creation custom color grade video', goal: 'learn custom LUT creation' },
    { query: 'skin tone correction video different lighting', goal: 'learn skin tone correction' },
    { query: 'color contrast techniques video attention', goal: 'learn color contrast for attention' },
    { query: 'day for night color grade technique', goal: 'learn day-for-night grading' },
  ],
  // === VIDEO CONTENT STRATEGY ===
  content_hooks: [
    { query: 'best video hooks that stop the scroll 2026', goal: 'learn scroll-stopping hooks' },
    { query: 'pattern interrupt video opening techniques', goal: 'learn pattern interrupt openers' },
    { query: 'controversial opinion hook video marketing', goal: 'learn opinion-based hooks' },
    { query: 'question hook vs statement hook performance', goal: 'learn question vs statement hooks' },
    { query: 'visual hook techniques first frame optimization', goal: 'learn visual hook techniques' },
  ],
  content_retention: [
    { query: 'video retention graph analysis how to improve', goal: 'learn retention optimization' },
    { query: 'open loop storytelling video engagement', goal: 'learn open loop technique' },
    { query: 'curiosity gap video content strategy', goal: 'learn curiosity gap technique' },
    { query: 're-engagement techniques mid video', goal: 'learn mid-video re-engagement' },
    { query: 'watch time optimization short form video', goal: 'learn watch time optimization' },
  ],
  content_cta: [
    { query: 'best call to action video ending techniques 2026', goal: 'learn CTA techniques' },
    { query: 'soft CTA vs hard CTA video performance', goal: 'learn soft vs hard CTA' },
    { query: 'video loop technique for replays', goal: 'learn video loop for replay boost' },
    { query: 'end screen strategy short form video', goal: 'learn end screen strategies' },
    { query: 'save share comment trigger video techniques', goal: 'learn engagement trigger techniques' },
  ],
  content_storytelling: [
    { query: 'micro storytelling 30 second video structure', goal: 'learn 30-second story structure' },
    { query: 'before after transformation video format', goal: 'learn before/after format' },
    { query: 'problem agitation solution video framework', goal: 'learn PAS framework for video' },
    { query: 'hero journey short form video adaptation', goal: 'learn hero journey in short form' },
    { query: 'emotional arc 60 second video', goal: 'learn emotional arc in short video' },
  ],
  // === PLATFORM-SPECIFIC DEEP DIVES ===
  platform_instagram: [
    { query: 'instagram reels algorithm 2026 what gets pushed', goal: 'learn Instagram algorithm 2026' },
    { query: 'instagram reels editing style that goes viral', goal: 'learn viral Reels editing' },
    { query: 'instagram carousel vs reels engagement comparison', goal: 'learn carousel vs Reels' },
    { query: 'instagram reels cover image optimization', goal: 'learn Reels cover optimization' },
  ],
  platform_tiktok: [
    { query: 'tiktok algorithm 2026 how videos go viral', goal: 'learn TikTok algorithm 2026' },
    { query: 'tiktok editing style trends 2026', goal: 'learn TikTok editing trends' },
    { query: 'tiktok duet stitch video strategy', goal: 'learn duet/stitch strategies' },
    { query: 'tiktok business account video strategy', goal: 'learn TikTok for business' },
  ],
  platform_youtube: [
    { query: 'youtube shorts algorithm vs long form 2026', goal: 'learn YouTube Shorts algorithm' },
    { query: 'youtube thumbnail and title optimization 2026', goal: 'learn YouTube CTR optimization' },
    { query: 'youtube shorts to long form funnel strategy', goal: 'learn Shorts to long-form funnel' },
    { query: 'youtube video chapter editing strategy', goal: 'learn chapter-based editing' },
  ],
  platform_linkedin: [
    { query: 'linkedin video content strategy B2B 2026', goal: 'learn LinkedIn video for B2B' },
    { query: 'linkedin video ad best practices professional', goal: 'learn LinkedIn video ads' },
    { query: 'linkedin thought leader video format', goal: 'learn thought leader video format' },
  ],
  // === INDUSTRY-SPECIFIC ===
  industry_ecommerce: [
    { query: 'ecommerce product video editing that sells', goal: 'learn product video editing' },
    { query: 'unboxing video editing style 2026', goal: 'learn unboxing video style' },
    { query: 'product demo video editing best practices', goal: 'learn product demo editing' },
    { query: 'shoppable video ad creative strategy', goal: 'learn shoppable video ads' },
  ],
  industry_saas: [
    { query: 'SaaS product demo video editing tutorial', goal: 'learn SaaS demo video editing' },
    { query: 'software walkthrough video engaging editing', goal: 'learn software walkthrough editing' },
    { query: 'SaaS explainer video structure 60 seconds', goal: 'learn SaaS explainer structure' },
  ],
  industry_realestate: [
    { query: 'real estate video editing cinematic tour', goal: 'learn real estate video editing' },
    { query: 'property showcase video editing techniques', goal: 'learn property video techniques' },
    { query: 'real estate agent personal brand video', goal: 'learn agent brand videos' },
  ],
  industry_fitness: [
    { query: 'fitness video editing dynamic energy', goal: 'learn fitness video editing' },
    { query: 'before after transformation video fitness', goal: 'learn fitness transformation videos' },
    { query: 'workout tutorial video editing best practices', goal: 'learn workout video editing' },
  ],
  industry_food: [
    { query: 'food video editing recipe content 2026', goal: 'learn food video editing' },
    { query: 'restaurant marketing video that converts', goal: 'learn restaurant marketing videos' },
    { query: 'food photography to video transition editing', goal: 'learn food video transitions' },
  ],
  industry_coaching: [
    { query: 'coaching consulting video content that converts', goal: 'learn coaching video content' },
    { query: 'personal brand video editing authority building', goal: 'learn authority-building videos' },
    { query: 'testimonial video editing that builds trust', goal: 'learn testimonial editing' },
    { query: 'webinar highlight video editing strategy', goal: 'learn webinar highlight editing' },
  ],
}

// Daily rotation: pick 3 random categories per session
function getSessionCategories(count: number = 3): Array<{category: string, query: string, goal: string}> {
  const allCategories = Object.entries(LEARNING_CATEGORIES)
  const shuffled = allCategories.sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, count)
  return selected.map(([catName, queries]) => {
    const query = queries[Math.floor(Math.random() * queries.length)]
    return { category: catName, query: query.query, goal: query.goal }
  })
}

// Map categories to expertise domains
const CATEGORY_TO_DOMAIN: Record<string, string> = {
  editing_techniques: 'editing',
  hooks_retention: 'editing',
  pacing_rhythm: 'editing',
  broll_storytelling: 'editing',
  subtitles_text: 'editing',
  color_mood: 'editing',
  sound_design: 'editing',
  storytelling: 'editing',
  viral_analysis: 'social',
  platform_specific: 'social',
  social_growth: 'social',
  current_trends: 'social',
  trending_formats: 'social',
  trending_audio: 'social',
  niche_trends: 'social',
  marketing_strategy: 'marketing',
  conversion_psychology: 'marketing',
  cta_conversion: 'marketing',
  industry_content: 'marketing',
  paid_ads: 'paid_ads',
  // Professional workflow categories
  error_cleaning: 'editing',
  camera_angles: 'editing',
  color_correction: 'editing',
  background_blur: 'editing',
  zoom_techniques: 'editing',
  subtitle_design: 'editing',
  music_selection: 'editing',
  broll_creation: 'editing',
  final_polish: 'editing',
  // Hebrew advertising & marketing
  hebrew_ads: 'marketing',
  hebrew_content: 'social',
  hebrew_social: 'social',
  // Advanced paid advertising
  paid_ads_creative: 'paid_ads',
  paid_ads_strategy: 'paid_ads',
  paid_ads_formats: 'paid_ads',
  paid_ads_psychology: 'paid_ads',
  // Advanced editing techniques
  advanced_cuts: 'editing',
  advanced_motion: 'editing',
  advanced_audio: 'editing',
  advanced_color: 'editing',
  // Video content strategy
  content_hooks: 'marketing',
  content_retention: 'social',
  content_cta: 'marketing',
  content_storytelling: 'editing',
  // Platform-specific deep dives
  platform_instagram: 'social',
  platform_tiktok: 'social',
  platform_youtube: 'social',
  platform_linkedin: 'social',
  // Industry-specific
  industry_ecommerce: 'marketing',
  industry_saas: 'marketing',
  industry_realestate: 'marketing',
  industry_fitness: 'marketing',
  industry_food: 'marketing',
  industry_coaching: 'marketing',
}

function calculateExpertiseLevel(insightCount: number): string {
  if (insightCount >= 100) return 'expert'
  if (insightCount >= 50) return 'advanced'
  if (insightCount >= 20) return 'intermediate'
  return 'beginner'
}

function classifyInsightToDomain(state: any, category: string, rule: any) {
  const domain = CATEGORY_TO_DOMAIN[category] || 'editing'
  if (!state.expertise) state.expertise = {}
  if (!state.expertise[domain]) {
    state.expertise[domain] = { level: 'beginner', totalInsights: 0, insights: [] }
  }

  const ruleText = (rule.rule || rule).toString().trim().toLowerCase()
  const existing = state.expertise[domain].insights.map((r: any) =>
    (r.rule || r).toString().trim().toLowerCase()
  )

  if (!existing.some((e: string) => {
    const words1 = new Set(ruleText.split(/\s+/))
    const words2 = new Set(e.split(/\s+/))
    const overlap = [...words1].filter(w => words2.has(w)).length
    return overlap / Math.max(words1.size, words2.size) > 0.8
  })) {
    state.expertise[domain].insights.push({
      rule: rule.rule || rule,
      category,
      confidence: rule.confidence || 0.8,
      learnedAt: Date.now(),
    })
    state.expertise[domain].totalInsights = state.expertise[domain].insights.length
    state.expertise[domain].level = calculateExpertiseLevel(state.expertise[domain].totalInsights)
  }
}

function saveInsightWithTrendClassification(state: any, category: string, rule: any) {
  if (!state.trendInsights) {
    state.trendInsights = { activeTrends: [], expiredTrends: [], evergreenRules: [], lastTrendUpdate: null }
  }

  if (rule.trend_name || rule.lifecycle) {
    const existingTrend = state.trendInsights.activeTrends.find(
      (t: any) => t.trend_name === rule.trend_name
    )
    if (existingTrend) {
      existingTrend.techniques.push(rule.technique || rule.rule)
      existingTrend.lastSeen = Date.now()
      existingTrend.lifecycle = rule.lifecycle
    } else {
      state.trendInsights.activeTrends.push({
        trend_name: rule.trend_name,
        techniques: [rule.technique || rule.rule],
        lifecycle: rule.lifecycle || 'rising',
        shelf_life_weeks: rule.shelf_life_weeks || 4,
        first_seen: Date.now(),
        lastSeen: Date.now(),
        adaptation_for_business: rule.adaptation_for_business || '',
        category,
      })
    }
  } else {
    const ruleText = (rule.rule || rule.technique || rule).toString()
    if (!state.trendInsights.evergreenRules.includes(ruleText)) {
      state.trendInsights.evergreenRules.push(ruleText)
    }
  }
}

function cleanExpiredTrends(state: any) {
  if (!state.trendInsights) return
  const now = Date.now()
  const active: any[] = []
  const expired: any[] = []

  ;(state.trendInsights.activeTrends || []).forEach((trend: any) => {
    const weeksSinceFirstSeen = (now - trend.first_seen) / (1000 * 60 * 60 * 24 * 7)
    const shelfLife = trend.shelf_life_weeks || 4
    if (weeksSinceFirstSeen > shelfLife && trend.lifecycle === 'declining') {
      expired.push({ ...trend, expiredAt: now })
    } else {
      active.push(trend)
    }
  })

  state.trendInsights.activeTrends = active
  state.trendInsights.expiredTrends = [
    ...(state.trendInsights.expiredTrends || []),
    ...expired
  ].slice(-50)

  if (expired.length > 0) {
    console.log(`[LEARN] Expired ${expired.length} trends: ${expired.map((t: any) => t.trend_name).join(', ')}`)
  }
}

function saveSystemOptimizationIdeas(state: any, ideas: any[]) {
  if (!state.expertise) state.expertise = {}
  if (!state.expertise.systemOptimization) {
    state.expertise.systemOptimization = { ideas: [], implementedCount: 0 }
  }

  const existingIdeas = new Set(
    state.expertise.systemOptimization.ideas.map((i: any) =>
      (i.idea || i).toString().trim().toLowerCase()
    )
  )

  let addedCount = 0
  ideas.forEach((idea: any) => {
    const ideaText = (idea.idea || idea).toString().trim().toLowerCase()
    if (!existingIdeas.has(ideaText)) {
      state.expertise.systemOptimization.ideas.push({
        ...idea,
        suggestedAt: Date.now(),
        status: 'pending',
      })
      existingIdeas.add(ideaText)
      addedCount++
    }
  })

  console.log(`[LEARN] System optimization: added ${addedCount} new ideas (${state.expertise.systemOptimization.ideas.length} total)`)
  return addedCount
}

// ==================== EDITOR BRAIN ====================

// Embedded default brain - survives Railway redeploys
const DEFAULT_BRAIN = {
  lastUpdated: '2026-03-17T00:00:00.000Z',
  lastUpdatedIsrael: '17.3.2026, 02:00:00',
  version: 45,
  masterPrompt: `# COMPREHENSIVE AI VIDEO EDITING SYSTEM — MASTER PROMPT v45

## CORE PHILOSOPHY
You are an elite AI video editor. Every cut, transition, and effect must serve ONE purpose: keeping viewers watching AND taking action. No edit is cosmetic — every edit is strategic.

## SECTION 1: HOOK MASTERY (First 0-3 Seconds)
1. The first frame must create pattern interrupt — something unexpected, bold, or visually jarring
2. Never start with logos, intros, or "hey guys" — start mid-action or mid-sentence
3. Use jump-cut to the most emotionally charged moment as the opener
4. Text overlay in first 0.5s: bold, large, contrasting — the "scroll-stopping" text
5. Audio hook: start with a sound effect, dramatic music hit, or provocative statement
6. If speaker exists, cut to their most confident/energetic moment first
7. "Cold open" technique: show the result/climax first, then cut to "let me show you how"
8. First 3 seconds determine 85% of total watch-through rate

## SECTION 2: RETENTION & PACING
9. Average shot length: 2-4 seconds for social content, 4-8 seconds for professional
10. Never hold a static shot longer than 5 seconds without visual change (zoom, pan, overlay)
11. Use L-cuts and J-cuts for natural conversation flow — audio leads or trails video by 0.5-1s
12. Pattern: establish → disrupt → resolve. Every 15-30 seconds create a micro-pattern-interrupt
13. Pacing curve: fast start → slightly slower middle (content delivery) → accelerating end (CTA)
14. Remove ALL dead air, "umm", "ehh", long pauses — tighten every gap to <0.3s
15. Add subtle zoom (2-5%) on important statements — "Ken Burns" micro-effect
16. B-roll should cover transitions and reinforce points, never be random filler
17. Music energy should match content energy — drop music under key dialogue moments
18. Use speed ramps (1.2x-1.5x) on less important segments to maintain momentum

## SECTION 3: VISUAL HIERARCHY & TEXT
19. Maximum 7 words per text overlay — if more needed, split into sequential overlays
20. Text must have contrast treatment: shadow, outline, or background bar
21. Key terms: highlight in brand color or yellow/white for emphasis
22. Lower thirds for speakers: name + title, clean, minimal, 3-second duration
23. Statistics and numbers deserve their own full-screen moment with animation
24. Use consistent text positioning: titles top-center, subtitles bottom-center, CTAs center
25. Hebrew text: always RTL, Heebo or Assistant font, proper line breaks at logical points

## SECTION 4: AUDIO ENGINEERING
26. Dialogue: -14 LUFS to -12 LUFS, consistent throughout
27. Background music: -25 to -20 dB under dialogue, -12 dB during non-speech
28. Sound effects: subtle whooshes on transitions, pops on text appearance, risers before reveals
29. Remove background noise aggressively — clean audio = professional perception
30. Audio fade-in: 0.1s, Audio fade-out: 0.3-0.5s on every clip boundary
31. Music transitions: crossfade 1-2 seconds, never hard-cut music
32. Add room tone/ambient under silence gaps to avoid "dead" feeling

## SECTION 5: TRANSITIONS & EFFECTS
33. Default transition: hard cut (80% of transitions should be cuts)
34. Whip pan / swipe: for energy and topic changes
35. Dissolve: ONLY for time passage or emotional moments
36. Zoom transition: for dramatic reveals or "diving deeper" into topics
37. Never use cheesy built-in transitions (star wipe, page curl, etc.)
38. Match action cuts: align movement direction between shots
39. Use flash frames (2-3 frame white flash) sparingly for impact moments

## SECTION 6: SOCIAL MEDIA OPTIMIZATION
40. Vertical (9:16): subject centered, text in safe zones (top 15%, bottom 20% clear)
41. Square (1:1): subject slightly above center, text below
42. Captions/subtitles: MANDATORY for all social content — 85% watch without sound
43. Caption style: max 2 lines, large readable font, word-by-word or phrase-by-phrase highlight
44. End screen: clear CTA with visual pointer (arrow, animation) to follow/subscribe/link

## SECTION 7: CONTENT-TYPE SPECIFIC RULES

### Paid Ads:
45. Hook → Problem → Solution → Social Proof → CTA — strict 5-act structure
46. CTA must appear at least twice: mid-point and final 3 seconds
47. Show product/service in action within first 5 seconds
48. Testimonial clips: face close-up, emotional authenticity over production value

### Organic Social (Reels/TikTok/Shorts):
49. Prioritize native platform aesthetics — slightly raw > overly polished
50. Trend audio integration: sync key moments to beat drops
51. Text-on-screen storytelling: each new shot = new text overlay advancing the narrative
52. Loop potential: end connects visually/thematically to beginning

### Professional/Corporate:
53. Cleaner transitions, slower pacing (4-6 second shots)
54. Lower thirds mandatory for all speakers
55. Brand colors in text overlays and graphics
56. Background music: ambient/corporate, never distracting

### Educational/Tutorial:
57. Screen recordings: zoom into relevant areas, highlight cursor/clicks
58. Step numbering: persistent on-screen step indicator
59. Key takeaway summaries: visual recap cards every 60-90 seconds

## SECTION 8: PRESENTER DETECTION & FRAMING
60. Identify the main presenter: the person facing and speaking to camera
61. Presenter framing: head room 10-15% from top, eyes at upper third
62. When presenter gestures, ensure hands are in frame
63. Multi-person: cut to active speaker within 1 second of speech start
64. Reaction shots: 1-2 seconds of listener reaction to build dynamic
65. Never cut mid-word or mid-gesture — find natural pause points

## SECTION 9: COLOR & MOOD
66. Consistent color grade across all clips — match white balance first
67. Slight contrast boost (+10-15%) for social content punchiness
68. Warm tones for trust/comfort content, cool tones for tech/professional
69. Skin tones are sacred — never let color grading distort natural skin color
70. Dark/moody grade for drama, bright/airy for lifestyle — match the message

## SECTION 10: DELIVERY & QUALITY
71. Export: H.264, 1080p minimum, 8-12 Mbps for social, 20+ Mbps for professional
72. Thumbnail: extract the most expressive/dramatic frame — face + text + contrast
73. Verify audio sync across entire timeline before export
74. Final check: watch at 2x speed — if it feels slow at 2x, it IS slow at 1x
75. Every video must pass the "3 second test" — would YOU stop scrolling?`,
  stagePrompts: {
    visual_analysis: `VISUAL ANALYSIS RULES — What to LOOK FOR in video frames:

1. SCENE DETECTION: Flag frame when >40% pixel change between consecutive frames, or >25% brightness shift. Mark as hard_cut (instant change) or transition (gradual over 0.3-1s).
2. COMPOSITION: Check rule-of-thirds grid — subject should be within 15% of power points. Flag centered compositions as "static" and off-center as "dynamic."
3. FRAMING QUALITY: Head room 10-15% from top edge. Eyes at upper third line. Hands visible when gesturing. Flag if subject is cut off at joints (wrists, neck).
4. B-ROLL OPPORTUNITIES: Flag moments where speaker looks away from camera, pauses >1s, or gestures toward off-screen space. Mark gaze direction (left/right/up/down).
5. BACKGROUND ASSESSMENT: Detect blown-out areas (>95% white), cluttered backgrounds (high edge density behind subject), color cast issues. Flag distracting motion in background.
6. LIGHTING: Measure face illumination ratio (key-to-fill). Flag if >3:1 ratio (harsh shadows) or <1.2:1 (flat lighting). Detect backlight causing silhouette.
7. ENERGY SCORING: Rate each frame's energy 1-10 based on: facial expression intensity, gesture amplitude, body lean (forward=engaged). Mark peak energy frames.
8. MOTION DETECTION: Track subject movement velocity. Flag static shots >5s (candidate for zoom/pan). Flag excessive motion (shaky/unstable).
9. FOCUS: Detect soft focus on subject face. Flag frames where background is sharper than foreground.
10. MULTI-PERSON: Identify active speaker by lip movement and gesture. Flag reaction shots of listeners.`,

    enrich: `CONTENT ENRICHMENT RULES — Strategy and messaging:

1. HOOK STRATEGY: First 1-3s must create pattern interrupt. For talking-head: start at most energetic/confident moment. For product: show end result first. For tutorial: show the "wow" outcome before the process.
2. CONTENT TYPE DETECTION: Classify as one of: talking_head, product_demo, tutorial, testimonial, behind_scenes, event, interview, montage. Each type gets different editing approach.
3. STORY STRUCTURE: Every video follows problem→solution→result. Identify the core problem (0-20% of video), solution demonstration (20-70%), and result/proof (70-90%). Last 10% = CTA.
4. AUDIENCE MATCHING: Marketing content → emotional hooks, social proof, urgency. Tutorial → clear steps, zoom on details, numbered progression. Testimonial → authenticity, face close-ups, emotional peaks.
5. B-ROLL CONCEPTS: When speaker mentions a product → show product. When abstract concept → show metaphor visual. When emotion → show reaction. When data → show graphic. Never random filler B-Roll.
6. KEY MOMENT IDENTIFICATION: Mark moments of: emphasis (raised voice/gesture), humor (smile/laugh), surprise (eyebrow raise), conviction (forward lean + direct eye contact). These drive editing decisions.
7. MESSAGE HIERARCHY: Identify the single core message. All editing should reinforce it. Secondary points support the core message. Remove or minimize tangents.
8. PLATFORM INTENT: Reels/TikTok = entertainment-first, trend-aware. LinkedIn = value-first, professional tone. YouTube = depth, retention. Ads = conversion, CTA prominence.
9. HOOK VARIANTS: Cold open (show result), question hook (pose problem), stat hook (surprising number), controversy hook (challenge assumption). Match to content type.
10. RETENTION STRATEGY: New visual stimulus every 3-5 seconds. Text reinforcement of key spoken words. Pattern interrupts every 15-20s (camera change, B-Roll, graphic).`,

    creative_brief: `CREATIVE BRIEF RULES — Mood, style, and pacing:

1. PACING BY PLATFORM: TikTok/Reels: 1.5-2.5s average shot length, high energy throughout. LinkedIn: 3-5s shots, measured pacing, professional rhythm. YouTube: 2-4s shots, varied pacing with breathing room.
2. ENERGY CURVE: Open at 8/10 energy → settle to 6/10 for content delivery → build to 9/10 for climax → 7/10 for CTA. Never let energy drop below 5/10 at any point.
3. COLOR MOOD: Warm tones (orange shift +10-15%) for trust, lifestyle, personal brand. Cool tones (blue shift +10-15%) for tech, corporate, authority. High contrast + saturation for entertainment. Desaturated + grain for cinematic/premium.
4. MUSIC GENRE MATCHING: Talking head → lo-fi beats or soft electronic. Product launch → upbeat pop/electronic. Tutorial → minimal ambient. Testimonial → emotional piano/acoustic. Ad → energetic, builds to climax.
5. SUBTITLE STYLE BY PLATFORM: TikTok/Reels: bold, large (caption-style), word-by-word highlight, center-bottom. LinkedIn: clean, smaller, sentence-by-sentence, lower-third. YouTube: optional auto-captions or burnt-in with background bar.
6. TRANSITION PHILOSOPHY: 80% hard cuts (clean, professional). 10% whip/swipe (energy, topic change). 5% dissolve (emotional moments, time passage). 5% zoom (reveals, emphasis).
7. B-ROLL MOOD: Match B-Roll color temperature to main footage. B-Roll should feel like same "world." Bright B-Roll in bright videos, moody B-Roll in moody videos.
8. TEXT STYLE: Headlines: bold, max 5 words, high contrast. Stats: large number + small label. Lists: one item at a time, animated in. CTA: contrasting color, clear action verb.
9. AUDIO MOOD: Music volume follows energy curve — louder during visual-only moments, softer under speech. Sound effects: subtle whoosh on transitions, pop on text, riser before reveals.
10. CONTENT LENGTH: 15-30s for ads/Reels. 30-60s for organic social. 60-180s for YouTube/LinkedIn. Match pacing intensity inversely to length.`,

    technical_plan: `TECHNICAL PLAN RULES — Direct FFmpeg parameters:

1. ZOOM: trigger=emphasis_words|key_moments, intensity=1.05-1.15x(subtle)|1.15-1.25x(dramatic), duration=0.3-0.8s, easing=ease-in-out, center=speaker_face. Reset zoom over 0.5s.
2. CUT TIMING: talking_head=2-4s avg shot, broll=1.5-3s, product_closeup=2-3s, reaction=1-2s. Never hold static shot >5s without visual change.
3. COLOR GRADE: warm_trust={temperature:+15,tint:+5,saturation:+10,contrast:+8}. cool_tech={temperature:-15,tint:-5,saturation:-5,contrast:+12}. cinematic={saturation:-15,contrast:+20,highlights:-10,shadows:+15,grain:0.03}.
4. SUBTITLE PARAMS: tiktok_style={font:Heebo-Bold,size:48px,color:#FFFFFF,stroke:#000000,stroke_width:3px,position:center_bottom_20%,animation:word_highlight,highlight_color:#FFD700}. linkedin_style={font:Heebo-Regular,size:32px,color:#FFFFFF,bg:rgba(0,0,0,0.7),position:bottom_10%,animation:fade_in_0.2s}. max_words_per_line=7.
5. B-ROLL PLACEMENT: duration=2-5s, insert_at=speaker_pause|topic_transition|abstract_mention. transition_in=dissolve_0.3s|cut, transition_out=dissolve_0.3s. scale=1.05x(slight_zoom_motion). opacity_blend=100%.
6. CAMERA ANGLE SWITCH: crop_left={x:0,y:0,w:75%,h:100%,scale:1.33x}. crop_right={x:25%,y:0,w:75%,h:100%,scale:1.33x}. crop_center_tight={x:15%,y:10%,w:70%,h:80%,scale:1.43x}. trigger=every_8-15s|speaker_change|emphasis.
7. AUDIO MIX: speech_target=-14LUFS, music_under_speech=-25dB_to_-20dB, music_no_speech=-12dB, sfx_whoosh=-18dB, sfx_pop=-15dB, fade_in=0.1s, fade_out=0.3s, music_crossfade=1.5s.
8. SPEED RAMP: slow_segments=1.2x-1.5x(compress_time), fast_segments=0.7x(dramatic_moment), transition=0.3s_ease. Apply to non-critical dialogue segments only.
9. TEXT OVERLAY: appear_animation=scale_up_0.2s|fade_in_0.15s, disappear=fade_out_0.2s, duration=2-4s, position_title=top_center_safe_15%, position_cta=center, position_stat=center_large.
10. SAFE ZONES: vertical_9_16={top_clear:15%,bottom_clear:20%,side_clear:5%}. horizontal_16_9={top_clear:10%,bottom_clear:15%,side_clear:5%}. Subject_face must be within central 60% of frame.
11. TRANSITION PARAMS: hard_cut=0ms, dissolve=300-500ms, whip_pan=200ms_ease_in_out, zoom_transition=400ms, flash_frame=83ms(2frames)_white_opacity_80%.
12. HOOK EDIT: first_frame=most_energetic_moment, text_overlay_at=0.3s, zoom_in=1.1x_over_0.5s, audio_sfx=impact_hit_at_0s, music_start=0s_at_-20dB.`,
  },
  stats: {
    editingRules: 35,
    socialInsights: 15,
    marketingInsights: 15,
    paidAdsInsights: 10,
    activeTrends: 0,
    systemIdeas: 0,
    masterPromptWords: 850,
    masterPromptChars: 5200,
    stagePromptsGenerated: true,
    stagePromptWords: {
      visual_analysis: 280,
      enrich: 380,
      creative_brief: 370,
      technical_plan: 470,
    },
  },
  activeTrends: [],
  expertiseLevels: {
    editing: 'intermediate',
    social: 'intermediate',
    marketing: 'intermediate',
    paid_ads: 'beginner',
  },
  cumulativeStats: {
    totalCost: 0,
    monthlyCost: 0,
    monthlyMonth: '',
    dailyCost: 0,
    dailyDate: '',
    totalSessions: 0,
    totalVideosAnalyzed: 0,
    totalRules: 45,
    lastSessionCost: 0,
    sessionHistory: [],
    lastLearnDate: null,
    lastUpdated: '2026-03-17T00:00:00.000Z',
  },
}

function loadEditorBrain(): any {
  const brainPath = editorBrainPath
  try {
    if (fs.existsSync(brainPath)) {
      const brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'))
      if ((brain.masterPrompt && brain.masterPrompt.length > 100) || brain.stagePrompts) {
        const hasStages = brain.stagePrompts ? 'yes' : 'no'
        console.log(`[BRAIN] Loaded editor brain from file (v${brain.version}, ${brain.stats?.masterPromptWords || 0} words, stagePrompts=${hasStages})`)
        return brain
      }
    }
  } catch (e: any) {
    console.log('[BRAIN] Failed to parse editor-brain.json:', e.message)
  }

  // File missing or empty — use embedded default brain
  console.log('[BRAIN] Using embedded default brain (v' + DEFAULT_BRAIN.version + ')')
  fs.writeFileSync(brainPath, JSON.stringify(DEFAULT_BRAIN, null, 2))
  return DEFAULT_BRAIN
}

async function syncBrainFromRailway(): Promise<boolean> {
  // Only sync in development (local machine)
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    return false // Railway IS the source of truth
  }

  const railwayUrl = process.env.RAILWAY_URL || 'https://video-claude-production.up.railway.app'
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) return false

  try {
    console.log('[BRAIN] Syncing latest brain from Railway...')

    const response = await fetch(`${railwayUrl}/api/learning/download-state`, {
      headers: { 'x-admin-token': token },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      console.warn('[BRAIN] Railway sync failed:', response.status)
      return false
    }

    const data = await response.json() as any

    if (data.editorBrain?.masterPrompt && data.editorBrain.masterPrompt.length > 100) {
      const localBrain = loadEditorBrain()
      const remoteVersion = data.editorBrain.version || 0
      const localVersion = localBrain.version || 0

      if (remoteVersion > localVersion) {
        fs.writeFileSync(editorBrainPath, JSON.stringify(data.editorBrain, null, 2))
        console.log(`[BRAIN] ✅ Synced from Railway: v${localVersion} → v${remoteVersion} (${data.editorBrain.stats?.masterPromptWords || 0} words)`)
        return true
      } else {
        console.log(`[BRAIN] Already up to date: v${localVersion} (Railway: v${remoteVersion})`)
      }
    }

    // Also sync learning state if newer
    if (data.learningState) {
      const localState = loadLearningState()
      const remoteSessions = data.learningState.learningMetrics?.totalSessions || 0
      const localSessions = localState.learningMetrics?.totalSessions || 0

      if (remoteSessions > localSessions) {
        fs.writeFileSync(learningStatePath, JSON.stringify(data.learningState, null, 2))
        console.log(`[LEARN] ✅ State synced from Railway: ${localSessions} → ${remoteSessions} sessions`)
      }
    }

    return false
  } catch (e: any) {
    console.warn('[BRAIN] Railway sync failed:', e.message?.substring(0, 100))
    return false
  }
}

async function generateStagePrompts(
  ai: any,
  masterPrompt: string,
  allRules: string[],
  allSocialInsights: string[],
  allMarketingInsights: string[],
  allPaidAdsInsights: string[],
  allRuleObjects?: any[]
): Promise<{ visual_analysis: string; enrich: string; creative_brief: string; technical_plan: string }> {
  console.log('[BRAIN] Generating 4 stage-specific prompts...')

  // Exclude low-confidence rules (below 0.3)
  const filteredRuleObjects = (allRuleObjects || []).filter((r: any) => {
    if (r.confidence_score !== undefined && r.confidence_score < 0.3) {
      console.log(`[BRAIN] Rule excluded from prompts: '${r.ffmpeg_params?.action || r.rule?.substring(0, 30)}' confidence=${r.confidence_score.toFixed(2)}`)
      return false
    }
    return true
  })

  // Separate rules with ffmpeg_params (technical) from rules without (strategic)
  const rulesWithParams = filteredRuleObjects.filter((r: any) => r.ffmpeg_params)
  const rulesWithoutParams = filteredRuleObjects.filter((r: any) => !r.ffmpeg_params)

  // Sort by confidence (highest first)
  rulesWithParams.sort((a: any, b: any) => (b.confidence_score ?? 0.7) - (a.confidence_score ?? 0.7))
  rulesWithoutParams.sort((a: any, b: any) => (b.confidence_score ?? 0.7) - (a.confidence_score ?? 0.7))

  console.log(`[BRAIN] Rules routing: ${rulesWithParams.length} with FFmpeg params → technical_plan, ${rulesWithoutParams.length} without → enrich/creative_brief (${(allRuleObjects || []).length - filteredRuleObjects.length} excluded for low confidence)`)

  // Format rules with ffmpeg_params as compact parameter lines grouped by action type
  const paramsByAction: Record<string, string[]> = {}
  rulesWithParams.forEach((r: any) => {
    const p = r.ffmpeg_params
    const action = p.action || 'unknown'
    if (!paramsByAction[action]) paramsByAction[action] = []
    let line = ''
    switch (action) {
      case 'zoom':
        line = `* ${p.trigger || 'general'}: ${p.intensity || '1.10-1.20x'}, ${p.duration || '0.3-0.8s'}, ${p.easing || 'ease-in-out'}`
        break
      case 'cut':
        line = `* ${p.trigger || 'general'}: avg ${p.avg_length || '2.0s'} (${p.min_length || '0.8s'}-${p.max_length || '4.0s'} range)`
        break
      case 'color_grade':
        line = `* ${p.content_match || 'general'}: ${p.preset || 'cinematic'}`
        break
      case 'camera_angle':
        line = `* crop ${p.crop_intensity || '0.80'}, switch ${p.switch_frequency || 'every_3-5s'}, positions: ${(p.positions || ['center']).join(', ')}`
        break
      case 'broll':
        line = `* ${p.placement || 'on_topic_change'}: ${p.duration || '2-4s'}, ${p.transition || 'cut'}, ${p.timing || 'during_claim'}`
        break
      case 'subtitle':
        line = `* ${p.platform_match || 'general'}: ${p.style || 'bold_pop'}, ${p.words_per_group || '3-5'} words, ${p.position || 'bottom_center'}, highlight=${p.highlight_color || '#FFFF00'}`
        break
      case 'music':
        line = `* ${p.genre || 'general'}: vol ${p.volume || '10-15%'}, fade_in=${p.fade_in || '1-2s'}, fade_out=${p.fade_out || '2-3s'}, dip=${p.dip_on_speech ?? true}`
        break
      case 'pacing':
        line = `* hook=${p.hook_duration || '0.5-2.0s'}, avg_segment=${p.avg_segment || '2-4s'}, curve=${p.energy_curve || 'build_release'}, reset=${p.visual_reset_frequency || 'every_1-3s'}`
        break
      default:
        line = `* ${r.rule?.substring(0, 80) || JSON.stringify(p).substring(0, 80)}`
    }
    paramsByAction[action].push(line)
  })

  // Build pre-formatted technical parameter block
  const actionLabels: Record<string, string> = {
    zoom: 'ZOOM RULES', cut: 'CUT TIMING', color_grade: 'COLOR GRADE',
    camera_angle: 'CAMERA ANGLES', broll: 'B-ROLL', subtitle: 'SUBTITLES',
    music: 'MUSIC', pacing: 'PACING',
  }
  const technicalParamBlock = Object.entries(paramsByAction)
    .map(([action, lines]) => `${actionLabels[action] || action.toUpperCase()}:\n${lines.join('\n')}`)
    .join('\n\n')

  // Strategic rules (no params) formatted as text for enrich/creative_brief
  const strategicRulesText = rulesWithoutParams.map((r: any) => r.rule || r).join('\n')

  const allInsights = [
    ...allRules,
    ...allSocialInsights,
    ...allMarketingInsights,
    ...allPaidAdsInsights,
  ].join('\n')

  const stageResponse = await ai.chat.completions.create({
    model: 'gpt-5.4',
    max_completion_tokens: 6000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an expert video editor brain optimizer. You receive a list of editing rules and must organize them into 4 focused prompt sections, one for each editing pipeline stage. Each section must contain ONLY rules relevant to that stage. Remove all duplicates. Be concise — every word must earn its place. Express rules as actionable parameters with specific numbers where possible.`,
      },
      {
        role: 'user',
        content: `Here is the current master editing prompt and all raw insights:

MASTER PROMPT:
${masterPrompt}

RAW INSIGHTS:
${allInsights}

RULES WITH FFmpeg PARAMETERS (use these PRIMARILY for technical_plan):
${technicalParamBlock || '(none yet)'}

STRATEGIC RULES WITHOUT FFmpeg PARAMETERS (use these for enrich and creative_brief):
${strategicRulesText || '(none)'}

Create 4 prompt sections. Each section is a standalone instruction prompt for ONE stage of the video editing pipeline:

1. VISUAL_ANALYSIS (max 300 words): Rules about what to LOOK FOR in video frames only.
- How to identify scene changes, composition, lighting quality
- How to spot good B-Roll opportunities from visual context
- How to assess framing quality (centered subject, safe zones)
- How to detect background issues (blown out, cluttered, distracting)
- DO NOT include: sound rules, CTA rules, subtitle styles, color grading parameters

2. ENRICH (max 400 words): Rules about content STRATEGY and messaging only.
- Hook strategy (what makes a good opening based on content type)
- Story structure (problem → solution → result arc)
- Target audience matching (marketing vs tutorial vs testimonial)
- Content type detection and matching editing approach
- B-Roll CONCEPTS (not technical parameters — just "what to show")
- PRIORITIZE strategic rules WITHOUT ffmpeg_params here
- DO NOT include: FFmpeg parameters, zoom values, color hex codes, subtitle animation details

3. CREATIVE_BRIEF (max 400 words): Rules about MOOD and STYLE decisions only.
- Pacing guidelines (fast for TikTok, measured for LinkedIn)
- Color mood matching (warm for trust, cold for tech, cinematic for premium)
- Music genre matching by content type
- Subtitle style recommendations by platform
- Energy curve (how to build and release tension)
- PRIORITIZE strategic rules WITHOUT ffmpeg_params here
- DO NOT include: exact FFmpeg filter strings, pixel coordinates, specific zoom percentages

4. TECHNICAL_PLAN (max 500 words): Rules that translate DIRECTLY to FFmpeg actions.
- PRIORITIZE rules WITH ffmpeg_params — format them as compact parameter lines
- Include the pre-formatted parameter block below as-is, then add any additional technical rules
- Zoom: when to trigger, intensity range (1.05-1.2x), duration (0.3-0.8s), easing
- Cut timing: average cut length by content type (1.5-3s talking head, 0.5-1.5s B-Roll)
- Color grade: which preset for which content type
- Subtitle: which style for which platform
- B-Roll placement: duration (2-5s), transition type, timing relative to speech
- Camera angles: crop percentages, when to switch
- Audio: music volume relative to speech (10-15%), fade durations
- ALL rules must be expressed as PARAMETERS with numbers, not philosophy
- Example good rule: "zoom_on_keywords: intensity=1.15x, duration=0.5s, easing=ease-in-out, trigger=emphasis_words"
- Example BAD rule: "Use punch-ins to create visual emphasis" (too vague, no parameters)
- Do NOT put strategic/philosophical rules in technical_plan — those belong in enrich or creative_brief

PRE-FORMATTED TECHNICAL PARAMETERS (include in technical_plan):
${technicalParamBlock || '(none yet — generate parameter lines from raw insights)'}

Return as JSON: { "visual_analysis": "...", "enrich": "...", "creative_brief": "...", "technical_plan": "..." }
Each value is a single string containing all rules for that stage.`,
      },
    ],
  })

  // Log cost — gpt-5.4 pricing
  const usage = stageResponse.usage
  if (usage) {
    const inputCost = (usage.prompt_tokens || 0) * 0.00000015
    const outputCost = (usage.completion_tokens || 0) * 0.0000006
    const totalCost = inputCost + outputCost
    console.log(`[BRAIN] Stage prompt synthesis cost: $${totalCost.toFixed(4)} (${usage.prompt_tokens} in / ${usage.completion_tokens} out tokens)`)
  }

  const rawContent = stageResponse.choices[0].message.content?.trim() || '{}'
  const parsed = JSON.parse(rawContent)

  const result = {
    visual_analysis: (parsed.visual_analysis || '').trim(),
    enrich: (parsed.enrich || '').trim(),
    creative_brief: (parsed.creative_brief || '').trim(),
    technical_plan: (parsed.technical_plan || '').trim(),
  }

  const wordCounts = {
    visual_analysis: result.visual_analysis.split(/\s+/).length,
    enrich: result.enrich.split(/\s+/).length,
    creative_brief: result.creative_brief.split(/\s+/).length,
    technical_plan: result.technical_plan.split(/\s+/).length,
  }

  console.log(`[BRAIN] Stage prompts generated: visual=${wordCounts.visual_analysis}w, enrich=${wordCounts.enrich}w, brief=${wordCounts.creative_brief}w, tech=${wordCounts.technical_plan}w`)

  return result
}

async function updateEditorBrain(state: any) {
  console.log('[BRAIN] Updating editor brain with master prompt...')

  // Collect ALL insights from all sources
  const allRules: string[] = []
  const allSocialInsights: string[] = []
  const allMarketingInsights: string[] = []
  const allPaidAdsInsights: string[] = []

  // From expertise domains
  ;(state.expertise?.editing?.insights || []).forEach((r: any) => { if (r.rule) allRules.push(r.rule) })
  ;(state.expertise?.social?.insights || []).forEach((r: any) => { if (r.rule) allSocialInsights.push(r.rule) })
  ;(state.expertise?.marketing?.insights || []).forEach((r: any) => { if (r.rule) allMarketingInsights.push(r.rule) })
  ;(state.expertise?.paid_ads?.insights || []).forEach((r: any) => { if (r.rule) allPaidAdsInsights.push(r.rule) })

  // Collect full rule objects with ffmpeg_params for stage prompt routing
  const allRuleObjects: any[] = []

  // From learnedPatterns (older format)
  Object.values(state.learnedPatterns || {}).forEach((data: any) => {
    ;(data.editing_rules || []).forEach((r: any) => {
      const ruleText = r.rule || r
      if (ruleText && !allRules.includes(ruleText)) {
        allRules.push(ruleText)
        allRuleObjects.push(typeof r === 'string' ? { rule: r } : r)
      }
    })
  })

  const activeTrends = (state.trendInsights?.activeTrends || [])
    .filter((t: any) => t.lifecycle !== 'declining')
    .slice(0, 10)

  const totalInsights = allRules.length + allSocialInsights.length +
    allMarketingInsights.length + allPaidAdsInsights.length

  console.log(`[BRAIN] Insights to synthesize: ${totalInsights} (editing: ${allRules.length}, social: ${allSocialInsights.length}, marketing: ${allMarketingInsights.length}, ads: ${allPaidAdsInsights.length})`)

  let masterPrompt = ''

  if (totalInsights > 0) {
    try {
      const ai = await getOpenAI()
      if (!ai) {
        masterPrompt = allRules.map(r => `• ${r}`).join('\n')
      } else {
        const synthesisPrompt = `You are a world-class video editor and AI editing system architect.
I have accumulated ${totalInsights} editing insights from analyzing viral videos, professional editors, marketing content, and social media trends.
Synthesize ALL insights into ONE comprehensive editing instruction prompt.
This prompt will be injected into an AI that automatically edits videos.
Every instruction must be SPECIFIC and ACTIONABLE with exact parameters.
=== RAW INSIGHTS ===
EDITING RULES (${allRules.length}):
${allRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}
SOCIAL MEDIA INSIGHTS (${allSocialInsights.length}):
${allSocialInsights.map((r, i) => `${i + 1}. ${r}`).join('\n')}
MARKETING INSIGHTS (${allMarketingInsights.length}):
${allMarketingInsights.map((r, i) => `${i + 1}. ${r}`).join('\n')}
PAID ADS INSIGHTS (${allPaidAdsInsights.length}):
${allPaidAdsInsights.map((r, i) => `${i + 1}. ${r}`).join('\n')}
CURRENT TRENDS (${activeTrends.length}):
${activeTrends.map((t: any) => `- ${t.trend_name} (${t.lifecycle}): ${(t.techniques || []).slice(0, 2).join('; ')}`).join('\n')}
=== CREATE THE MASTER EDITING PROMPT ===
Organize into these sections:
1. HOOK (first 1-3 seconds): Exact techniques for the opening
2. PACING & RHYTHM: Cut timing rules, when fast vs slow, energy curve
3. CAMERA & ZOOMS: Zoom intensity, frequency, camera angle switching
4. B-ROLL: When to insert, duration, transition type
5. SUBTITLES: Style, position, animation, words per frame, emphasis
6. COLOR & VISUAL: Color grade, background effects, visual consistency
7. SOUND & MUSIC: Music genre, volume ratio, sound effects
8. STORYTELLING: Narrative arc for 30-60 second videos
9. PLATFORM RULES: Differences for Reels/TikTok/YouTube/LinkedIn
10. CONVERSION: CTA placement, trust signals, persuasion
RULES:
- Merge similar insights into single powerful rules
- Remove contradictions (keep higher-confidence version)
- Keep specific numbers (1.2x zoom, 0.5s timing, 15% volume)
- Each rule starts with ACTION VERB (Cut, Zoom, Add, Place, etc.)
- Max 5-8 rules per section
- Total under 2000 words
- English (system prompt for AI)
- NO explanations, NO headers with ===, just clean numbered rules per section
Start directly with: "HOOK RULES:" and continue section by section.`

        const response = await ai.chat.completions.create({
          model: 'gpt-5.4',
          max_completion_tokens: 4000,
          messages: [{ role: 'user', content: synthesisPrompt }],
        })

        masterPrompt = response.choices[0].message.content?.trim() || ''
        console.log(`[BRAIN] Master prompt generated: ${masterPrompt.length} chars (~${Math.round(masterPrompt.split(/\s+/).length)} words)`)
      }
    } catch (e: any) {
      console.error('[BRAIN] Master prompt generation failed:', e.message?.substring(0, 150))
      // Fallback: just list rules
      masterPrompt = allRules.map(r => `• ${r}`).join('\n')
    }
  }

  // Generate 4 stage-specific prompts
  let stagePrompts: { visual_analysis: string; enrich: string; creative_brief: string; technical_plan: string } | null = null

  if (masterPrompt.length > 100) {
    try {
      const ai = await getOpenAI()
      if (ai) {
        stagePrompts = await generateStagePrompts(ai, masterPrompt, allRules, allSocialInsights, allMarketingInsights, allPaidAdsInsights, allRuleObjects)
      }
    } catch (e: any) {
      console.error('[BRAIN] Stage prompts generation failed, will use masterPrompt fallback:', e.message?.substring(0, 150))
    }
  }

  // Save brain
  const brain: any = {
    lastUpdated: new Date().toISOString(),
    lastUpdatedIsrael: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
    version: totalInsights,
    masterPrompt,
    ...(stagePrompts ? { stagePrompts } : {}),
    stats: {
      editingRules: allRules.length,
      socialInsights: allSocialInsights.length,
      marketingInsights: allMarketingInsights.length,
      paidAdsInsights: allPaidAdsInsights.length,
      activeTrends: activeTrends.length,
      systemIdeas: state.expertise?.systemOptimization?.ideas?.length || 0,
      masterPromptWords: masterPrompt.split(/\s+/).length,
      masterPromptChars: masterPrompt.length,
      stagePromptsGenerated: !!stagePrompts,
      stagePromptWords: stagePrompts ? {
        visual_analysis: stagePrompts.visual_analysis.split(/\s+/).length,
        enrich: stagePrompts.enrich.split(/\s+/).length,
        creative_brief: stagePrompts.creative_brief.split(/\s+/).length,
        technical_plan: stagePrompts.technical_plan.split(/\s+/).length,
      } : null,
    },
    activeTrends: activeTrends.map((t: any) => ({
      name: t.trend_name,
      lifecycle: t.lifecycle,
      techniques: (t.techniques || []).slice(0, 3),
      businessUse: t.adaptation_for_business,
    })),
    expertiseLevels: {
      editing: state.expertise?.editing?.level || 'beginner',
      social: state.expertise?.social?.level || 'beginner',
      marketing: state.expertise?.marketing?.level || 'beginner',
      paid_ads: state.expertise?.paid_ads?.level || 'beginner',
    },
  }

  // Store cumulative stats for recovery after Railway redeploys
  brain.cumulativeStats = {
    totalCost: state.totalCost || 0,
    monthlyCost: state.monthlyCost || 0,
    monthlyMonth: state.monthlyMonth || '',
    dailyCost: state.dailyCost || 0,
    dailyDate: state.dailyDate || '',
    totalSessions: state.learningMetrics?.totalSessions || 0,
    totalVideosAnalyzed: state.totalVideosAnalyzed || 0,
    totalRules: totalInsights,
    lastSessionCost: state.lastSessionCost || 0,
    sessionHistory: (state.sessionHistory || []).slice(-100),
    lastLearnDate: state.lastLearnDate || null,
    lastUpdated: new Date().toISOString(),
  }

  console.log('[BRAIN] Cumulative stats saved:', JSON.stringify(brain.cumulativeStats))

  const brainPath = editorBrainPath
  fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2))

  if (stagePrompts) {
    const sw = brain.stats.stagePromptWords
    console.log(`[BRAIN] Generated 4 stage prompts: visual=${sw.visual_analysis}w, enrich=${sw.enrich}w, brief=${sw.creative_brief}w, tech=${sw.technical_plan}w`)
  }
  console.log(`[BRAIN] Editor brain v${brain.version} saved | Master prompt: ${brain.stats.masterPromptWords} words | Trends: ${activeTrends.length} | Cumulative: $${(state.totalCost || 0).toFixed(3)} total`)

  return brain
}

function getEditorBrainPrompt(stage?: 'visual_analysis' | 'enrich' | 'creative_brief' | 'technical_plan', contentType?: string): string {
  try {
    const brain = loadEditorBrain()

    if (!brain.masterPrompt || brain.masterPrompt.length < 50) {
      console.log('[BRAIN] Editor brain has no master prompt')
      return ''
    }

    // If stage-specific prompts exist and a stage was requested, use the focused prompt
    if (stage && brain.stagePrompts && brain.stagePrompts[stage]) {
      const stageContent = brain.stagePrompts[stage]
      const wordCount = stageContent.split(/\s+/).length
      const ruleCount = (stageContent.match(/\n/g) || []).length + 1

      console.log(`[BRAIN] Injecting stage prompt '${stage}' (${wordCount} words, ${ruleCount} rules)`)

      let prompt = `\n\n=== AI EDITOR KNOWLEDGE — ${stage.toUpperCase()} (v${brain.version}, ${wordCount} words, updated ${brain.lastUpdatedIsrael || 'unknown'}) ===\n\n`
      prompt += stageContent

      // Active trends (only for enrich and creative_brief stages)
      if (['enrich', 'creative_brief'].includes(stage) && brain.activeTrends?.length > 0) {
        prompt += `\n\nCURRENT ACTIVE TRENDS:\n`
        brain.activeTrends.forEach((t: any) => {
          prompt += `- ${t.name} (${t.lifecycle}): ${t.businessUse || t.techniques?.[0] || ''}\n`
        })
      }

      // Content type hint (only for enrich and creative_brief stages)
      if (contentType && ['enrich', 'creative_brief'].includes(stage)) {
        if (['ad', 'paid_ads', 'ad_short'].includes(contentType)) {
          prompt += `\nCONTENT TYPE: PAID AD - prioritize conversion, strong CTA, hook optimization.\n`
        } else if (['social_reels', 'reels', 'tiktok'].includes(contentType)) {
          prompt += `\nCONTENT TYPE: SOCIAL SHORT-FORM - prioritize retention, trend alignment, shareability.\n`
        } else if (['linkedin', 'professional'].includes(contentType)) {
          prompt += `\nCONTENT TYPE: PROFESSIONAL - prioritize credibility, clean editing, clear message.\n`
        }
      }

      prompt += `\n=== END AI EDITOR KNOWLEDGE (${stage.toUpperCase()}) ===\n`
      prompt += `IMPORTANT: Apply these ${stage.replace('_', ' ')} rules. Based on analysis of ${brain.version} real viral videos.\n`

      return prompt
    }

    // Fallback: use masterPrompt (backward compatibility for old brain format or no stage specified)
    console.log(`[BRAIN] Injecting editor brain v${brain.version} into ${contentType || stage || 'general'} prompt (${brain.stats?.masterPromptWords || 0} words, ${brain.stats?.editingRules || 0} rules, ${brain.stats?.activeTrends || 0} trends)${stage ? ' [FALLBACK: no stagePrompts]' : ''}`)

    let prompt = `\n\n=== AI EDITOR KNOWLEDGE (v${brain.version}, ${brain.stats?.masterPromptWords || 0} words, updated ${brain.lastUpdatedIsrael || 'unknown'}) ===\n\n`

    // The master prompt
    prompt += brain.masterPrompt

    // Active trends
    if (brain.activeTrends?.length > 0) {
      prompt += `\n\nCURRENT ACTIVE TRENDS:\n`
      brain.activeTrends.forEach((t: any) => {
        const emoji = t.lifecycle === 'rising' ? '📈' : t.lifecycle === 'peak' ? '🔝' : '📉'
        prompt += `${emoji} ${t.name}: ${t.businessUse || t.techniques?.[0] || ''}\n`
      })
    }

    // Content type hint
    if (contentType) {
      if (['ad', 'paid_ads', 'ad_short'].includes(contentType)) {
        prompt += `\nCONTENT TYPE: PAID AD - prioritize conversion, strong CTA, hook optimization.\n`
      } else if (['social_reels', 'reels', 'tiktok'].includes(contentType)) {
        prompt += `\nCONTENT TYPE: SOCIAL SHORT-FORM - prioritize retention, trend alignment, shareability.\n`
      } else if (['linkedin', 'professional'].includes(contentType)) {
        prompt += `\nCONTENT TYPE: PROFESSIONAL - prioritize credibility, clean editing, clear message.\n`
      }
    }

    prompt += `\n=== END AI EDITOR KNOWLEDGE ===\n`
    prompt += `IMPORTANT: Apply these rules when making ALL editing decisions. They are based on analysis of ${brain.version} real viral videos.\n`

    return prompt
  } catch (e: any) {
    console.log('[BRAIN] Failed to load editor brain:', e.message)
    return ''
  }
}

function logBrainStatus() {
  try {
    const brain = loadEditorBrain()
    console.log(`[BRAIN] Editor brain v${brain.version} loaded (master prompt: ${brain.stats?.masterPromptWords || 0} words, ${brain.activeTrends?.length || 0} trends, updated ${brain.lastUpdatedIsrael})`)
  } catch {
    console.log('[BRAIN] Editor brain not available')
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

function hasLearnedThisSessionGlobal(): boolean {
  try {
    const state = loadLearningState()
    if (!state.lastLearnDate) return false
    const hoursSince = (Date.now() - new Date(state.lastLearnDate).getTime()) / (1000 * 60 * 60)
    return hoursSince < 6
  } catch {
    return false
  }
}

// Deduplication: add rules to a category, skipping exact and similar duplicates
function addRulesToCategory(state: any, category: string, newRules: any[]): number {
  if (!state.learnedPatterns) state.learnedPatterns = {}
  if (!state.learnedPatterns[category]) {
    state.learnedPatterns[category] = { editing_rules: [] }
  }

  const existing = state.learnedPatterns[category].editing_rules || []
  const existingTexts = new Set(existing.map((r: any) => r.rule.trim().toLowerCase()))

  let addedCount = 0
  let withParamsCount = 0

  newRules.forEach((rule: any) => {
    const ruleText = (rule.rule || rule).trim().toLowerCase()
    const ruleAction = rule.ffmpeg_params?.action || ''

    // Skip exact duplicates (but allow same text with different action type)
    if (existingTexts.has(ruleText)) {
      // Check if same text but different action type — keep both
      const existingWithSameText = existing.filter((r: any) => r.rule.trim().toLowerCase() === ruleText)
      const hasSameAction = existingWithSameText.some((r: any) => (r.ffmpeg_params?.action || '') === ruleAction)
      if (hasSameAction) {
        console.log(`[LEARN] Skipping duplicate rule: ${ruleText.substring(0, 50)}...`)
        return
      }
    }

    // Skip very similar rules (>80% word overlap) — but only if same action type
    const ruleWords = new Set(ruleText.split(/\s+/))
    let isDuplicate = false

    for (const existingRuleObj of existing) {
      const existingText = (existingRuleObj.rule || '').trim().toLowerCase()
      const existingAction = existingRuleObj.ffmpeg_params?.action || ''
      const existingWords = new Set(existingText.split(/\s+/))
      const overlap = [...ruleWords].filter(w => existingWords.has(w)).length
      const similarity = overlap / Math.max(ruleWords.size, existingWords.size)

      if (similarity > 0.8 && ruleAction === existingAction) {
        console.log(`[LEARN] Skipping similar rule (${Math.round(similarity * 100)}% overlap, same action=${ruleAction}): ${ruleText.substring(0, 50)}...`)
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      const ruleObj = typeof rule === 'string' ? { rule, confidence: 0.8, applies_to: 'all' } : rule
      existing.push(ruleObj)
      existingTexts.add(ruleText)
      addedCount++

      // Log individual rule extraction with ffmpeg_params info
      if (ruleObj.ffmpeg_params) {
        withParamsCount++
        const p = ruleObj.ffmpeg_params
        const paramSummary = p.action === 'zoom' ? `${p.intensity}, ${p.duration}`
          : p.action === 'cut' ? `avg ${p.avg_length}`
          : p.action === 'color_grade' ? p.preset
          : p.action === 'subtitle' ? p.style
          : p.action === 'pacing' ? `avg ${p.avg_segment}`
          : p.action === 'music' ? `${p.genre}, ${p.volume}`
          : p.action === 'camera_angle' ? `crop ${p.crop_intensity}`
          : p.action === 'broll' ? `${p.placement}, ${p.duration}`
          : JSON.stringify(p).substring(0, 40)
        console.log(`[LEARN] Rule extracted: ${p.action} (${paramSummary}) — '${(ruleObj.rule || '').substring(0, 60)}'`)
      } else {
        console.log(`[LEARN] Rule extracted (no ffmpeg_params): '${(ruleObj.rule || '').substring(0, 60)}'`)
      }
    }
  })

  state.learnedPatterns[category].editing_rules = existing

  // Log ffmpeg_params stats
  const totalWithParams = existing.filter((r: any) => r.ffmpeg_params).length
  console.log(`[LEARN] Category ${category}: added ${addedCount} new rules (${withParamsCount} with FFmpeg params), ${existing.length} total`)
  console.log(`[LEARN] Rules with FFmpeg params: ${totalWithParams}/${existing.length} (${existing.length > 0 ? Math.round(totalWithParams / existing.length * 100) : 0}%)`)

  return addedCount
}

async function sendLearningReport(state: any, results: any) {
  // Safe number helper - prevents toFixed crashes on null/undefined
  const safe = (val: any, decimals: number = 3): string => {
    const num = Number(val)
    return isNaN(num) ? '0' : num.toFixed(decimals)
  }

  const israelHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false
  }))
  const sessionLabel = israelHour < 12 ? '🌅 בוקר' : '🌆 ערב'

  const now = new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })

  let message = `📚 דוח למידה ${sessionLabel} - ${now}\n`
  message += '─'.repeat(30) + '\n\n'

  // Session stats
  message += `📊 סטטיסטיקות:\n`
  message += `  🎬 סרטונים שנותחו הפעם: ${results.videosThisSession}\n`
  message += `  🎬 סה"כ סרטונים (כל הזמן): ${results.totalVideosAllTime}\n`
  message += `  💡 תובנות חדשות הפעם: ${results.newRulesCount}\n`
  message += `  💡 סה"כ תובנות (כל הזמן): ${results.totalRulesCount}\n`
  message += `  🏷️ קטגוריות: ${results.categories.join(', ')}\n\n`

  // NEW rules only
  if (results.newRules.length > 0) {
    message += `✨ תובנות חדשות (${results.newRules.length}):\n\n`

    const byCategory: Record<string, any[]> = {}
    results.newRules.forEach((r: any) => {
      if (!byCategory[r.category]) byCategory[r.category] = []
      byCategory[r.category].push(r)
    })

    Object.entries(byCategory).forEach(([cat, rules]) => {
      message += `🏷️ ${cat}:\n`
      rules.forEach((r: any, i: number) => {
        const confidence = Math.round((r.confidence || 0) * 100)
        message += `  ${i + 1}. ${r.rule}\n`
        message += `     (ביטחון: ${confidence}%)\n`
      })
      message += '\n'
    })
  }

  // New trends
  if (results.newTrends?.length > 0) {
    message += `🔥 טרנדים חדשים שזוהו:\n`
    results.newTrends.forEach((t: any) => {
      const lifecycle = t.lifecycle === 'rising' ? '📈' : t.lifecycle === 'peak' ? '🔝' : '📉'
      message += `  ${lifecycle} ${t.trend_name}\n`
      message += `     תוקף: ~${t.shelf_life_weeks} שבועות\n`
      message += `     שימוש עסקי: ${t.adaptation_for_business}\n`
    })
    message += '\n'
  }

  // Expertise levels
  const domainEmoji: Record<string, string> = { editing: '🎬', social: '📱', marketing: '📣', paid_ads: '💰' }
  const levelEmoji: Record<string, string> = { beginner: '🥉', intermediate: '🥈', advanced: '🥇', expert: '🏆' }
  const domainName: Record<string, string> = { editing: 'עריכת וידאו', social: 'סושיאל מדיה', marketing: 'שיווק', paid_ads: 'פרסום ממומן' }

  if (state.expertise) {
    message += `🧠 רמות מומחיות:\n`
    ;['editing', 'social', 'marketing', 'paid_ads'].forEach(domain => {
      const exp = state.expertise[domain]
      if (exp) {
        const emoji = domainEmoji[domain] || '📌'
        const level = levelEmoji[exp.level] || '🥉'
        message += `  ${emoji} ${domainName[domain]}: ${level} ${exp.level} (${exp.totalInsights} תובנות)\n`
      }
    })

    const sysOpt = state.expertise.systemOptimization
    if (sysOpt?.ideas?.length > 0) {
      const highImpact = sysOpt.ideas.filter((i: any) => i.impact === 'high' && i.status === 'pending').length
      message += `\n  ⚙️ רעיונות לשיפור המערכת: ${sysOpt.ideas.length} (${highImpact} בעדיפות גבוהה)\n`
    }
    message += '\n'
  }

  // Editor brain stats
  try {
    const brainPath = editorBrainPath
    if (fs.existsSync(brainPath)) {
      const brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'))
      message += `🧠 מוח העורך v${brain.version}:\n`
      message += `  📝 פרומפט מאסטר: ${brain.stats?.masterPromptWords || 0} מילים\n`
      message += `  🎬 עריכה: ${brain.stats?.editingRules || 0}\n`
      message += `  📱 סושיאל: ${brain.stats?.socialInsights || 0}\n`
      message += `  📣 שיווק: ${brain.stats?.marketingInsights || 0}\n`
      message += `  💰 ממומן: ${brain.stats?.paidAdsInsights || 0}\n`
      message += `  🔥 טרנדים: ${brain.stats?.activeTrends || 0}\n`
      message += `  ⚙️ רעיונות: ${brain.stats?.systemIdeas || 0}\n\n`
    }
  } catch {}

  // Learning metrics
  if (state.learningMetrics) {
    const m = state.learningMetrics
    message += `📈 מדדי למידה:\n`
    message += `  סשנים: ${m.totalSessions}\n`
    message += `  ממוצע תובנות לסשן: ${safe(m.avgRulesPerSession, 1)}\n`
    message += `  ביטחון ממוצע: ${safe((m.avgConfidence || 0) * 100, 0)}%\n`
    message += `  קטגוריות שכוסו: ${m.uniqueCategories || 0}/${Object.keys(LEARNING_CATEGORIES).length}\n`
    message += `  סשנים עם תובנות: ${m.sessionsWithNewInsights || 0}/${m.totalSessions || 0}\n\n`
  }

  // Missing features (only critical ones)
  if (results.missingFeatures?.length > 0) {
    const criticalFeatures = results.missingFeatures.filter((f: any) => f.priority === 'critical')
    if (criticalFeatures.length > 0) {
      message += `🔴 פיצ'רים חסרים (קריטיים):\n`
      criticalFeatures.forEach((f: any) => {
        message += `  • ${f.name}\n`
      })
      message += '\n'
    }
  }

  // Trends summary
  const trends = state.trendInsights || {}
  message += `🔥 טרנדים:\n`
  message += `  פעילים: ${(trends.activeTrends || []).length}\n`
  message += `  פגי תוקף: ${(trends.expiredTrends || []).length}\n`
  message += `  כללים נצחיים: ${(trends.evergreenRules || []).length}\n\n`

  // Costs
  message += `💰 תקציב:\n`
  message += `  היום: $${safe(state.dailyGptCost)} / $${safe(DAILY_GPT_COST_LIMIT, 2)}\n`
  message += `  קריאות: ${state.dailyGptCalls || 0} / ${DAILY_GPT_CALLS_LIMIT}\n`
  message += `  החודש: $${safe(state.monthlyGptCost, 2)} / $${safe(MONTHLY_GPT_COST_LIMIT, 0)}\n`
  message += `  YouTube API: ${state.dailyYoutubeUnits || 0} יחידות (היום)\n`

  // Next session
  message += '\n' + '─'.repeat(30) + '\n'
  message += israelHour < 12
    ? '✅ הלמידה הבאה: היום ב-19:00'
    : '✅ הלמידה הבאה: מחר ב-07:00'

  await sendTelegram(message)
}

async function runServerLearning(options?: { budget?: number, force?: boolean }) {
  if (autoEditorBusy) {
    console.log('[LEARN] Skipping: auto-editor is active')
    // Reschedule for 10 minutes later
    setTimeout(() => {
      if (!autoEditorBusy) {
        console.log('[LEARN] Retrying after auto-editor finished')
        runServerLearning(options).catch(() => {})
      }
    }, 10 * 60 * 1000)
    return
  }

  const sessionBudget = options?.budget || 0.10
  const force = options?.force || false
  const maxGptCalls = Math.floor(sessionBudget / 0.02)
  const numCategories = Math.min(5, Math.max(3, Math.ceil(maxGptCalls / 8)))

  console.log('[LEARN] === SESSION START ===')
  console.log(`[LEARN] Budget: $${sessionBudget} | Force: ${force} | Max GPT calls: ~${maxGptCalls} | Categories: ${numCategories}`)
  console.log(`[LEARN] State file: ${fs.existsSync(learningStatePath) ? 'EXISTS' : 'MISSING'}`)

  const startTime = Date.now()

  // Always send Telegram when learning starts
  const israelTimeStart = new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', minute: '2-digit',
  })

  // Snapshot BEFORE learning
  const stateBefore = loadLearningState()
  const rulesBefore: Record<string, Set<string>> = {}
  let totalRulesBefore = 0

  Object.entries(stateBefore.learnedPatterns || {}).forEach(([cat, data]: [string, any]) => {
    rulesBefore[cat] = new Set((data.editing_rules || []).map((r: any) => r.rule))
    totalRulesBefore += rulesBefore[cat].size
  })

  const videosBeforeTotal = stateBefore.totalVideosAnalyzed || 0

  console.log(`[LEARN] Before: ${totalRulesBefore} total rules across ${Object.keys(rulesBefore).length} categories`)

  const state = loadLearningState()
  const todayIsrael = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const thisMonth = todayIsrael.substring(0, 7)

  // Reset daily counters if new day (Israel timezone)
  if (state.dailyDate !== todayIsrael) {
    console.log(`[LEARN] New day detected: ${state.dailyDate} → ${todayIsrael}. Resetting daily cost.`)
    state.dailyYoutubeUnits = 0
    state.dailyGptCalls = 0
    state.dailyGptCost = 0
    state.dailyCost = 0
    state.dailyDate = todayIsrael
    saveLearningState(state)
  }

  // Reset monthly cost if new month
  if (state.monthlyDate !== thisMonth) {
    console.log(`[LEARN] New month: ${state.monthlyDate} → ${thisMonth}. Resetting monthly cost.`)
    state.monthlyGptCost = 0
    state.monthlyCost = 0
    state.monthlyDate = thisMonth
    state.monthlyMonth = thisMonth
    saveLearningState(state)
  }

  // Check if already learned this session (within 6 hours) - skip check if forced
  if (!force && hasLearnedThisSessionGlobal()) {
    console.log('[LEARN] Already learned this session (within 6 hours), skipping')
    return
  }
  if (force) {
    console.log('[LEARN] Force mode: bypassing session check')
  }

  // Check budget
  if (!hasBudget(state)) {
    console.log('[LEARN] Budget limit reached, skipping')
    return
  }

  console.log('[LEARN] Starting learning session...')

  // Use diverse categories with random selection
  const sessionCategories = getSessionCategories(numCategories)
  const todayCategories = sessionCategories.map(sc => sc.category)
  const sessionGoals = sessionCategories.map(sc => sc.goal)

  console.log('[LEARN] Categories today:', todayCategories.join(', '))
  console.log('[LEARN] Goals:', sessionGoals.join(' | '))

  await sendTelegram(
    `📚 התחלתי ללמוד (${israelTimeStart})\n` +
    `💰 תקציב: $${(sessionBudget || 0).toFixed(2)}\n` +
    `🏷️ קטגוריות: ${todayCategories.join(', ')}\n` +
    `🎯 מטרות: ${sessionGoals.join(' | ')}`
  )

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

  const results: any = { categories: {}, errors: [], totalCost: 0, rulesLearned: 0, newTrends: [], systemIdeas: [] }

  // Initialize expertise if not present
  if (!state.expertise) {
    state.expertise = {
      editing: { level: 'beginner', totalInsights: 0, insights: [] },
      social: { level: 'beginner', totalInsights: 0, insights: [] },
      marketing: { level: 'beginner', totalInsights: 0, insights: [] },
      paid_ads: { level: 'beginner', totalInsights: 0, insights: [] },
      systemOptimization: { ideas: [], implementedCount: 0 },
    }
  }
  if (!state.trendInsights) {
    state.trendInsights = { activeTrends: [], expiredTrends: [], evergreenRules: [], lastTrendUpdate: null }
  }

  // Clean expired trends
  cleanExpiredTrends(state)

  for (let catIdx = 0; catIdx < sessionCategories.length; catIdx++) {
    const { category, query: searchQuery, goal: sessionGoal } = sessionCategories[catIdx]

    // Check limits before each category
    if (state.dailyYoutubeUnits >= 5000 || !hasBudget(state)) {
      console.log('[LEARN] Daily limit reached, stopping')
      break
    }

    try {
      // --- STEP 1: Search YouTube (100 units) ---
      const searchRes = await youtube.search.list({
        part: ['snippet'],
        q: searchQuery,
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

      // --- STEP 3: Analyze top 2 videos with Deep Analysis ---
      const ytdlpPath = fs.existsSync('/opt/homebrew/bin/yt-dlp')
        ? '/opt/homebrew/bin/yt-dlp'
        : fs.existsSync('/usr/local/bin/yt-dlp')
          ? '/usr/local/bin/yt-dlp'
          : 'yt-dlp'
      const ffmpegPath = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg'
      const analyses: any[] = []

      let ytdlpAvailable = true
      try {
        execSync(`which yt-dlp || "${ytdlpPath}" --version`, { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch {
        console.warn('[LEARN] yt-dlp not installed. Skipping visual analysis.')
        ytdlpAvailable = false
      }

      // Deep analysis prompt with trend detection
      const deepAnalysisPrompt = `You are a world-class video editor and content strategist analyzing a video.
Your goal: ${sessionGoal}
Analyze these frames and provide DEEP, SPECIFIC insights.

For each aspect below, give CONCRETE observations:

1. HOOK ANALYSIS (first 1-3 seconds):
   - What exact visual/text/audio technique grabs attention?
   - What emotion does the hook trigger? (curiosity, fear, excitement, confusion)
   - Would you scroll past this? Why/why not?

2. EDITING RHYTHM:
   - What is the average shot length? Does it vary?
   - Where does the editor speed up? Slow down? WHY?
   - Are cuts on beat? On words? On emotion changes?

3. B-ROLL STRATEGY:
   - When does B-Roll appear? What triggers it?
   - Does B-Roll REPLACE the speaker or OVERLAY?
   - How long is each B-Roll clip?

4. TEXT & SUBTITLES:
   - Style: font, size, color, animation, position
   - How many words per screen at once?
   - Do subtitles highlight key words? How?

5. COLOR & VISUAL IDENTITY:
   - Dominant color palette? Color grade?
   - Does color change to signal mood shifts?

6. SOUND DESIGN:
   - Background music: genre, energy level
   - Sound effects: whooshes, clicks, transitions?

7. STORYTELLING STRUCTURE:
   - Narrative arc? (problem→solution, story→lesson, question→answer)
   - How does the video END? CTA? Loop?

8. CONVERSION ELEMENTS:
   - Is there a CTA? When does it appear?
   - How does the video build trust/authority?

9. WHAT MAKES THIS VIDEO SPECIAL:
   - ONE technique that other videos don't do?
   - What would you STEAL for your own editing?

10. TREND ANALYSIS:
   - Is this video following a current trend? Which one?
   - What elements are "trendy" vs "timeless"?
   - How long will this trend likely last?

CRITICAL: For every editing rule you extract, you MUST include an "ffmpeg_params" field with concrete, machine-readable parameters.
The auto-editor uses FFmpeg for all processing. Rules without specific parameters are USELESS.
Instead of: "Use zoom for emphasis"
Write: "Zoom 1.15x for 0.5s with ease-in-out on emphasis words"
And include ffmpeg_params with action type and numeric values.

Every rule must have an action type: zoom, cut, color_grade, camera_angle, broll, subtitle, music, or pacing.
If you observe a technique but cannot determine specific parameters, estimate reasonable ranges based on what you see in the frames and your knowledge of professional video editing.

Action type schemas:
- zoom: { action:"zoom", intensity:"1.10-1.20x", duration:"0.3-0.8s", easing:"ease-in-out"|"linear"|"ease-in", trigger:"emphasis_word"|"number_mention"|"question"|"punchline"|"every_N_seconds" }
- cut: { action:"cut", avg_length:"1.5-2.5s", min_length:"0.8s", max_length:"4.0s", trigger:"sentence_end"|"topic_change"|"speaker_pause"|"beat_sync" }
- color_grade: { action:"color_grade", preset:"cinematic"|"warm"|"cold"|"vintage"|"vibrant"|"moody"|"clean"|"film", content_match:"marketing"|"tutorial"|"testimonial"|"lifestyle" }
- camera_angle: { action:"camera_angle", crop_intensity:"0.75-0.85", switch_frequency:"every_3-5s"|"on_sentence_change", positions:["center","left_offset","right_offset","close_up"] }
- broll: { action:"broll", placement:"on_topic_change"|"on_abstract_concept"|"every_15-20s", duration:"2-4s", transition:"cut"|"fade"|"crossfade", timing:"before_claim"|"during_claim"|"after_claim" }
- subtitle: { action:"subtitle", style:"bold_pop"|"karaoke"|"word_flash"|"neon_glow"|"minimal", words_per_group:"3-5", position:"bottom_center"|"center"|"top", highlight_color:"#FFFF00"|"#00FF00"|"#FF0000", platform_match:"tiktok"|"reels"|"youtube"|"linkedin" }
- music: { action:"music", genre:"corporate"|"upbeat"|"minimal"|"dramatic"|"chill", volume:"10-15%", fade_in:"1-2s", fade_out:"2-3s", dip_on_speech:true|false }
- pacing: { action:"pacing", hook_duration:"0.5-2.0s", avg_segment:"2-4s", energy_curve:"build_release"|"constant_high"|"slow_build"|"wave", visual_reset_frequency:"every_1-3s"|"every_2-5s" }

Return JSON:
{
  "hook_seconds": 1.5,
  "hook_type": "text/question/visual",
  "hook_emotion": "curiosity/fear/excitement",
  "cuts_per_minute": 15,
  "avg_clip_sec": 2.5,
  "subtitle_style": "classic/karaoke/animated",
  "subtitle_position": "center/bottom",
  "subtitle_animation": {"type":"karaoke","word_by_word":true,"highlight_color":"yellow","background":"black_box","font_size":"large","words_per_frame":3},
  "broll_percent": 35,
  "broll_timing": "topic_change/emphasis/example",
  "color_tone": "warm/cold/vibrant",
  "special": ["zoom","emoji"],
  "editing_rules": [
    {
      "rule": "Zoom 1.15x for 0.5s with ease-in-out on emphasis words",
      "when_to_use": "When speaker makes a bold statement, reveals a number, or says a keyword",
      "when_NOT_to_use": "During casual transitions or B-Roll segments",
      "parameters": {"timing":"0.5s","intensity":"1.15x","frequency":"on emphasis words"},
      "confidence": 0.85,
      "ffmpeg_params": {
        "action": "zoom",
        "intensity": "1.12-1.18x",
        "duration": "0.4-0.6s",
        "easing": "ease-in-out",
        "trigger": "emphasis_word"
      }
    }
  ],
  "trend_techniques": [
    {
      "technique": "specific technique",
      "trend_name": "name of trend",
      "lifecycle": "rising/peak/declining",
      "shelf_life_weeks": 4,
      "adaptation_for_business": "how to use in business content"
    }
  ],
  "evergreen_techniques": [
    {"technique": "specific technique", "why_evergreen": "why this always works"}
  ],
  "virality_reasons": ["reason1"],
  "lessons": ["lesson1"]
}`

      if (!ytdlpAvailable) {
        // Thumbnail + metadata analysis (Railway fallback when yt-dlp unavailable)
        if (hasBudget(state)) {
          // Try to fetch thumbnails for top 2 videos (with fallback URLs)
          const thumbnailImages: Array<{base64: string; videoTitle: string}> = []
          for (const video of videos.slice(0, 2)) {
            const thumbUrls = [
              `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`,
              `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
              `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
            ]
            for (const thumbUrl of thumbUrls) {
              try {
                const thumbRes = await fetch(thumbUrl, { signal: AbortSignal.timeout(10000) })
                if (thumbRes.ok) {
                  const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
                  if (thumbBuffer.length > 5000) {
                    thumbnailImages.push({
                      base64: thumbBuffer.toString('base64'),
                      videoTitle: video.title,
                    })
                    console.log(`[LEARN] Thumbnail for "${video.title}": ${(thumbBuffer.length / 1024).toFixed(0)}KB`)
                    break
                  }
                }
              } catch {}
            }
          }

          const userContent: any[] = [
            { type: 'text' as const, text: `Category: ${category}\nGoal: ${sessionGoal}\nVideos:\n${videos.slice(0, 5).map((v: any) => `- "${v.title}" (${v.views} views, ${v.likes} likes, tags: ${v.tags?.join(', ')})`).join('\n')}` },
          ]

          // Add thumbnails if available
          thumbnailImages.forEach(thumb => {
            userContent.push({
              type: 'image_url' as const,
              image_url: { url: `data:image/jpeg;base64,${thumb.base64}`, detail: 'low' as const },
            })
          })

          const synthRes = await callOpenAIWithRetry(ai, {
            model: 'gpt-5.4',
            messages: [
              { role: 'system', content: `You are a world-class video editor analyzing videos. Goal: ${sessionGoal}. Analyze based on ${thumbnailImages.length > 0 ? 'thumbnails and metadata' : 'metadata only'}. CRITICAL: Every editing rule MUST include "ffmpeg_params" with concrete machine-readable parameters. Action types: zoom, cut, color_grade, camera_angle, broll, subtitle, music, pacing. Rules without ffmpeg_params are USELESS. Return JSON: {"editing_rules":[{"rule":"Zoom 1.15x for 0.5s on emphasis words","when_to_use":"when to apply","when_NOT_to_use":"when not to apply","applies_to":"all/social/marketing","confidence":0.7,"ffmpeg_params":{"action":"zoom","intensity":"1.12-1.18x","duration":"0.4-0.6s","easing":"ease-in-out","trigger":"emphasis_word"}}],"trend_techniques":[{"technique":"specific technique","trend_name":"trend name","lifecycle":"rising/peak/declining","shelf_life_weeks":4,"adaptation_for_business":"business use"}],"evergreen_techniques":[{"technique":"technique","why_evergreen":"reason"}],"system_optimization":[{"idea":"improvement idea","why":"connection to learned insight","impact":"high/medium/low","category":"new_feature/improve_existing/automation/ai_quality","implementation_hint":"brief approach"}],"sop_update":"Updated SOP","patterns":{"hook":{"avg_seconds":2,"rule":"rule"},"pacing":{"avg_cuts":12,"rule":"rule"},"subtitles":{"style":"classic","rule":"rule","animation_insights":{"most_popular_animation":"karaoke","most_popular_highlight_color":"yellow","word_by_word_percentage":80,"avg_words_per_frame":3,"best_font_size":"large","background_style":"black_box","position":"center","rule":"subtitle rule"}}}}` },
              { role: 'user', content: userContent }
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: 2000,
          }, 2)
          trackCost(state, 'gpt-5.4', synthRes.usage)
          results.totalCost += estimateCallCost('gpt-5.4', synthRes.usage?.prompt_tokens || 500, synthRes.usage?.completion_tokens || 500)
          state.totalVideosAnalyzed += thumbnailImages.length || 1
          try {
            const synthesis = JSON.parse(synthRes.choices[0]?.message?.content || '{}')
            if (synthesis.editing_rules) {
              if (!state.learnedPatterns[category]) state.learnedPatterns[category] = {}
              state.learnedPatterns[category].patterns = synthesis.patterns
              state.learnedPatterns[category].sop_update = synthesis.sop_update
              state.learnedPatterns[category].learnedAt = Date.now()
              const added = addRulesToCategory(state, category, synthesis.editing_rules)
              results.rulesLearned += added

              // Classify insights into expertise domains
              ;(synthesis.editing_rules || []).forEach((rule: any) => {
                classifyInsightToDomain(state, category, rule)
                saveInsightWithTrendClassification(state, category, rule)
              })

              // Track trends
              ;(synthesis.trend_techniques || []).forEach((t: any) => {
                saveInsightWithTrendClassification(state, category, t)
                results.newTrends.push(t)
              })

              // System optimization ideas
              if (synthesis.system_optimization?.length > 0) {
                saveSystemOptimizationIdeas(state, synthesis.system_optimization)
                results.systemIdeas.push(...synthesis.system_optimization)
              }

              results.categories[category] = {
                videosAnalyzed: thumbnailImages.length,
                rulesLearned: added,
              }
              console.log(`[LEARN] Category ${category} (thumbnail): ${added} new rules from ${thumbnailImages.length} thumbnails`)
            }
          } catch (thumbErr: any) {
            logOpenAIError(`Thumbnail synthesis failed for ${category}`, thumbErr)
          }
        }
        continue
      }

      for (const video of videos.slice(0, 2)) {
        if (!hasBudget(state)) break

        let analysisMethod = 'unknown'
        const tmpDir = path.join(__dirname, 'uploads', `viral_${Date.now()}`)
        try {
          fs.mkdirSync(tmpDir, { recursive: true })
          const videoPath = path.join(tmpDir, 'video.mp4')
          const framesDir = path.join(tmpDir, 'frames')
          fs.mkdirSync(framesDir, { recursive: true })

          let gotFrames = false

          // Try yt-dlp download with proper error handling
          try {
            try {
              execSync(`"${ytdlpPath}" --no-check-certificates --geo-bypass --socket-timeout 30 --retries 2 --format "worst[ext=mp4]" --download-sections "*0:00-1:00" --max-filesize 15M -o "${videoPath}" "https://www.youtube.com/watch?v=${video.id}"`, { timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] })
            } catch {
              execSync(`"${ytdlpPath}" --no-check-certificates --geo-bypass --socket-timeout 30 --retries 2 --format "worst[ext=mp4]" --max-filesize 10M -o "${videoPath}" "https://www.youtube.com/watch?v=${video.id}"`, { timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] })
            }

            if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 10000) {
              console.log(`[LEARN] Downloaded video: ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)}MB`)
              execSync(`"${ffmpegPath}" -i "${videoPath}" -vf "fps=1/5,scale=320:-1" -q:v 8 "${framesDir}/frame_%04d.jpg" -y`, { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] })
              gotFrames = true
              analysisMethod = 'video_frames'
            }
          } catch (dlErr: any) {
            console.warn(`[LEARN] yt-dlp failed for ${video.id}: ${dlErr.message?.substring(0, 100)}`)
          }

          // If yt-dlp failed, fallback to thumbnail analysis for this individual video
          if (!gotFrames) {
            console.log(`[LEARN] Using thumbnail fallback for video ${video.id}`)
            analysisMethod = 'thumbnail'
            const thumbnailUrls = [
              `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`,
              `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
              `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
            ]
            for (const thumbUrl of thumbnailUrls) {
              try {
                const thumbRes = await fetch(thumbUrl, { signal: AbortSignal.timeout(10000) })
                if (thumbRes.ok) {
                  const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
                  if (thumbBuffer.length > 5000) {
                    const thumbPath = path.join(framesDir, 'thumb_001.jpg')
                    fs.writeFileSync(thumbPath, thumbBuffer)
                    console.log(`[LEARN] Thumbnail downloaded: ${(thumbBuffer.length / 1024).toFixed(0)}KB`)
                    gotFrames = true
                    break
                  }
                }
              } catch {}
            }
          }

          if (!gotFrames) {
            console.warn(`[LEARN] No frames or thumbnail for ${video.id}, skipping`)
            continue
          }

          const frameFiles = fs.readdirSync(framesDir).filter((f: string) => f.endsWith('.jpg')).sort().slice(0, 10)
          const frameImages = frameFiles.map((file: string) => ({
            base64: fs.readFileSync(path.join(framesDir, file)).toString('base64'),
          }))

          // Deep GPT Vision analysis with retry
          let analysisSucceeded = false
          const metadataText = `"${video.title}" | ${category} | Goal: ${sessionGoal} | Analysis method: ${analysisMethod} | ${frameImages.length} ${analysisMethod === 'thumbnail' ? 'thumbnail' : 'frames'}:\nViews: ${video.views} | Likes: ${video.likes} | Tags: ${video.tags?.join(', ')}`
          try {
            const analysisRes = await callOpenAIWithRetry(ai, {
              model: 'gpt-5.4',
              messages: [
                { role: 'system', content: deepAnalysisPrompt },
                { role: 'user', content: [
                  { type: 'text' as const, text: metadataText },
                  ...frameImages.map((f: any) => ({
                    type: 'image_url' as const,
                    image_url: { url: `data:image/jpeg;base64,${f.base64}`, detail: 'low' as const }
                  }))
                ]}
              ],
              response_format: { type: 'json_object' },
              max_completion_tokens: 2000,
            }, 2)

            const analysis = JSON.parse(analysisRes.choices[0]?.message?.content || '{}')
            analysis.title = video.title
            analyses.push(analysis)
            trackCost(state, 'gpt-5.4', analysisRes.usage)
            results.totalCost += estimateCallCost('gpt-5.4', analysisRes.usage?.prompt_tokens || 500, analysisRes.usage?.completion_tokens || 500)
            state.totalVideosAnalyzed++
            analysisSucceeded = true
            console.log(`[LEARN] Video ${video.id}: ${(analysis.editing_rules || []).length} rules | Method: ${analysisMethod}`)
          } catch (visionErr: any) {
            logOpenAIError(`GPT Vision failed for ${video.id}`, visionErr)
          }

          // Fallback 1: if GPT Vision failed, try with single thumbnail image
          if (!analysisSucceeded && hasBudget(state)) {
            console.log(`[LEARN] Falling back to thumbnail metadata analysis for ${video.id}`)
            try {
              let thumbBase64 = ''
              if (analysisMethod === 'video_frames') {
                const thumbnailUrls = [
                  `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
                  `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
                ]
                for (const thumbUrl of thumbnailUrls) {
                  try {
                    const thumbRes = await fetch(thumbUrl, { signal: AbortSignal.timeout(10000) })
                    if (thumbRes.ok) {
                      const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
                      if (thumbBuffer.length > 5000) {
                        thumbBase64 = thumbBuffer.toString('base64')
                        break
                      }
                    }
                  } catch {}
                }
              } else {
                const existingFrames = fs.readdirSync(framesDir).filter((f: string) => f.endsWith('.jpg')).sort()
                if (existingFrames.length > 0) {
                  thumbBase64 = fs.readFileSync(path.join(framesDir, existingFrames[0])).toString('base64')
                }
              }

              const fallbackContent: Array<any> = [
                { type: 'text' as const, text: `Analyze this video based on metadata and thumbnail.\n${metadataText}\nProvide editing rules based on what you can infer.` },
              ]
              if (thumbBase64) {
                fallbackContent.push({
                  type: 'image_url' as const,
                  image_url: { url: `data:image/jpeg;base64,${thumbBase64}`, detail: 'low' as const }
                })
              }

              const fallbackRes = await callOpenAIWithRetry(ai, {
                model: 'gpt-5.4',
                messages: [
                  { role: 'system', content: deepAnalysisPrompt },
                  { role: 'user', content: fallbackContent }
                ],
                response_format: { type: 'json_object' },
                max_completion_tokens: 2000,
              }, 2)

              const fallbackAnalysis = JSON.parse(fallbackRes.choices[0]?.message?.content || '{}')
              fallbackAnalysis.title = video.title
              analyses.push(fallbackAnalysis)
              trackCost(state, 'gpt-5.4', fallbackRes.usage)
              results.totalCost += estimateCallCost('gpt-5.4', fallbackRes.usage?.prompt_tokens || 500, fallbackRes.usage?.completion_tokens || 500)
              state.totalVideosAnalyzed++
              analysisSucceeded = true
              console.log(`[LEARN] Video ${video.id}: ${(fallbackAnalysis.editing_rules || []).length} rules | Method: thumbnail_fallback`)
            } catch (fallbackErr: any) {
              logOpenAIError(`Thumbnail fallback failed for ${video.id}`, fallbackErr)
            }
          }

          // Fallback 2: TEXT-ONLY analysis (no image at all - smallest request, most likely to succeed)
          if (!analysisSucceeded && hasBudget(state)) {
            console.log(`[LEARN] Trying text-only analysis (no image) for ${video.id}...`)
            try {
              const textOnlyRes = await callOpenAIWithRetry(ai, {
                model: 'gpt-5.4',
                messages: [
                  { role: 'system', content: deepAnalysisPrompt },
                  { role: 'user', content: `Analyze this video based on metadata ONLY (no image available).\n${metadataText}\nDescription: ${(video.description || '').substring(0, 500)}\nProvide editing rules based on what you can infer from metadata.` }
                ],
                response_format: { type: 'json_object' },
                max_completion_tokens: 2000,
              }, 2)

              const textAnalysis = JSON.parse(textOnlyRes.choices[0]?.message?.content || '{}')
              textAnalysis.title = video.title
              analyses.push(textAnalysis)
              trackCost(state, 'gpt-5.4', textOnlyRes.usage)
              results.totalCost += estimateCallCost('gpt-5.4', textOnlyRes.usage?.prompt_tokens || 500, textOnlyRes.usage?.completion_tokens || 500)
              state.totalVideosAnalyzed++
              console.log(`[LEARN] Video ${video.id}: ${(textAnalysis.editing_rules || []).length} rules | Method: text_only`)
            } catch (textErr: any) {
              logOpenAIError(`Text-only analysis also failed for ${video.id}`, textErr)
            }
          }
        } catch (e: any) {
          logOpenAIError(`Video analysis failed for ${video.id}`, e)
        } finally {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
        }
      }

      if (analyses.length === 0) {
        console.warn(`[LEARN] No analyses for category ${category}, skipping synthesis`)
        continue
      }

      // --- STEP 4: Deep synthesis - pattern detection across videos ---
      if (hasBudget(state)) {
        const videoAnalyses = analyses
        const synthesisPrompt = `You are a master video editor who has analyzed ${videoAnalyses.length} videos.
Here are the individual analyses:
${videoAnalyses.map((a: any, i: number) => `VIDEO ${i + 1} (${a.title || 'untitled'}):\n${JSON.stringify(a).substring(0, 3000)}`).join('\n\n---\n\n')}

Find DEEP PATTERNS across these videos.

1. UNIVERSAL PATTERNS (appeared in 2+ videos):
   - What editing techniques are consistently used?
   - What specific timings/durations keep appearing?

2. CONTRASTING APPROACHES:
   - Where do the videos DIFFER in technique?
   - Which approach worked better?

3. SURPRISING INSIGHTS:
   - What technique was unexpected?
   - What "rule" was broken successfully?

4. TREND vs EVERGREEN:
   - Which techniques are TREND-dependent (will expire)?
   - Which are EVERGREEN (will always work)?

CRITICAL: Every editing rule MUST include an "ffmpeg_params" field with concrete, machine-readable parameters.
Action types: zoom, cut, color_grade, camera_angle, broll, subtitle, music, pacing.
Rules without ffmpeg_params are USELESS — the auto-editor needs FFmpeg-actionable numbers, not philosophy.

Return JSON:
{
  "editing_rules": [
    {
      "rule": "Zoom 1.15x for 0.5s on emphasis words across all analyzed videos",
      "when_to_use": "Exact situation/context",
      "when_NOT_to_use": "Situations where this hurts",
      "parameters": {"timing":"exact seconds","intensity":"specific values","frequency":"how often"},
      "evidence": "Which videos showed this",
      "confidence": 0.85,
      "applies_to": "all/social/marketing/corporate",
      "ffmpeg_params": {
        "action": "zoom",
        "intensity": "1.12-1.18x",
        "duration": "0.4-0.6s",
        "easing": "ease-in-out",
        "trigger": "emphasis_word"
      }
    }
  ],
  "trend_techniques": [
    {
      "technique": "specific technique",
      "trend_name": "name of trend",
      "lifecycle": "rising/peak/declining",
      "shelf_life_weeks": 4,
      "adaptation_for_business": "how to use in business content"
    }
  ],
  "evergreen_techniques": [
    {"technique": "specific technique", "why_evergreen": "reason"}
  ],
  "subtitle_insights": {
    "most_effective_style": "style name",
    "word_highlight_technique": "how key words are emphasized",
    "timing_pattern": "how subtitles sync with speech",
    "position_strategy": "when to use top/center/bottom",
    "font_and_color": "recommendations"
  },
  "system_optimization": [
    {
      "idea": "what to improve in our editing platform",
      "why": "connection to what we learned",
      "impact": "high/medium/low",
      "category": "new_feature/improve_existing/automation/ai_quality/performance",
      "implementation_hint": "brief technical approach"
    }
  ],
  "sop_update": "Updated SOP based on patterns",
  "patterns": {
    "hook": {"avg_seconds":1.5,"rule":"hook rule"},
    "pacing": {"avg_cuts":15,"rule":"pacing rule"},
    "subtitles": {"style":"karaoke","rule":"subtitle rule","animation_insights":{"most_popular_animation":"karaoke","most_popular_highlight_color":"yellow","word_by_word_percentage":85,"avg_words_per_frame":3,"best_font_size":"large","background_style":"black_box","position":"center","rule":"animation rule"}}
  }
}`

        const synthRes = await callOpenAIWithRetry(ai, {
          model: 'gpt-5.4',
          messages: [
            { role: 'system', content: synthesisPrompt },
            { role: 'user', content: `Category: ${category} | Goal: ${sessionGoal} | Synthesize ${videoAnalyses.length} video analyses above.` }
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 3000,
        }, 2)

        const patterns = JSON.parse(synthRes.choices[0]?.message?.content || '{}')
        if (!state.learnedPatterns[category]) state.learnedPatterns[category] = {}
        state.learnedPatterns[category].patterns = patterns.patterns
        state.learnedPatterns[category].sop_update = patterns.sop_update
        state.learnedPatterns[category].learnedAt = Date.now()
        const rulesAdded = addRulesToCategory(state, category, patterns.editing_rules || [])
        trackCost(state, 'gpt-5.4', synthRes.usage)
        results.totalCost += estimateCallCost('gpt-5.4', synthRes.usage?.prompt_tokens || 500, synthRes.usage?.completion_tokens || 500)

        // Classify into expertise domains
        ;(patterns.editing_rules || []).forEach((rule: any) => {
          classifyInsightToDomain(state, category, rule)
          saveInsightWithTrendClassification(state, category, rule)
        })

        // Track trends
        ;(patterns.trend_techniques || []).forEach((t: any) => {
          saveInsightWithTrendClassification(state, category, t)
          results.newTrends.push(t)
        })

        // Evergreen techniques
        ;(patterns.evergreen_techniques || []).forEach((t: any) => {
          saveInsightWithTrendClassification(state, category, t)
        })

        // System optimization ideas
        if (patterns.system_optimization?.length > 0) {
          saveSystemOptimizationIdeas(state, patterns.system_optimization)
          results.systemIdeas.push(...patterns.system_optimization)
        }

        results.categories[category] = {
          videosAnalyzed: analyses.length,
          rulesLearned: rulesAdded,
        }
        console.log(`[LEARN] Category ${category}: ${rulesAdded} new rules from ${analyses.length} videos`)
      }

    } catch (e: any) {
      logOpenAIError(`Category ${category} failed`, e)
      results.errors.push(`${category}: ${e.message}`)
    }
  }

  // --- STEP 5: Detect missing features focused on editing capabilities ---
  if (state.dailyGptCalls < 15 && Object.keys(state.learnedPatterns).length > 0) {
    try {
      const todaysInsights = Object.entries(state.learnedPatterns)
        .map(([cat, data]: [string, any]) => {
          const rules = (data.editing_rules || []).slice(-5).map((r: any) => r.rule).join('; ')
          return `${cat}: ${rules}`
        }).join('\n')

      const missingFeaturesPrompt = `Based on editing patterns we learned, compare against our current editing capabilities:

CURRENT CAPABILITIES:
- FFmpeg: cuts, concat, crop, zoom (static), color filters, text overlay (ASS/SRT), audio mix
- Multi-cam simulation (crop-based)
- B-Roll insertion (split and insert)
- Animated subtitles (karaoke, pop, typewriter, glow, bounce, slide)
- Background image behind video
- Platform export (9:16, 1:1, 16:9)
- Background music mixing

WHAT WE LEARNED TODAY:
${todaysInsights}

What SPECIFIC editing features would we need to implement the techniques we learned?
Return JSON: {"missing_features":[{"name":"Feature name","description":"What it does","why_important":"Which learned rule requires this","implementation":"How to build it (FFmpeg command, API, or code approach)","difficulty":"easy/medium/hard","impact":8,"priority":"critical/important/nice_to_have"}],"summary":"Summary","biggest_gap":"The gap"}`

      const missingRes = await callOpenAIWithRetry(ai, {
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: missingFeaturesPrompt },
          { role: 'user', content: 'Analyze and return missing features as JSON.' }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 1500,
      }, 2)

      const missing = JSON.parse(missingRes.choices[0]?.message?.content || '{}')
      state.missingFeatures = missing.missing_features || []
      trackCost(state, 'gpt-5.4', missingRes.usage)
      results.totalCost += estimateCallCost('gpt-5.4', missingRes.usage?.prompt_tokens || 500, missingRes.usage?.completion_tokens || 500)
      results.missingFeatures = state.missingFeatures.length

      if (state.missingFeatures.length > 0 && process.env.TELEGRAM_BOT_TOKEN) {
        const pEmoji: Record<string, string> = { critical: '🔴', important: '🟡', nice_to_have: '🟢' }
        let msg = `🔧 <b>כלים חסרים (${state.missingFeatures.length})</b>\n\n`
        msg += `📊 ${missing.summary || ''}\n⚠️ ${missing.biggest_gap || ''}\n\n`
        state.missingFeatures.forEach((f: any, i: number) => {
          msg += `${pEmoji[f.priority] || '⚪'} <b>${i + 1}. ${f.name}</b>\n`
          msg += `   ${f.description}\n`
          msg += `   ${f.implementation ? '🔧 ' + f.implementation.substring(0, 100) : ''} | ${f.difficulty}\n\n`
        })
        await sendTelegram(msg)
      }
    } catch (e: any) {
      console.warn('[LEARN] Missing features failed:', e.message)
    }
  }

  // --- STEP 6: Save state with learning metrics ---
  state.lastLearnDate = Date.now()
  state.lastLearnDateIsrael = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })

  // Update trend timestamp
  state.trendInsights.lastTrendUpdate = Date.now()

  saveLearningState(state)

  // --- STEP 7: Find what's NEW by comparing before/after ---
  const stateAfter = loadLearningState()

  const newRules: Array<{category: string; rule: string; confidence: number}> = []
  let totalRulesAfter = 0

  Object.entries(stateAfter.learnedPatterns || {}).forEach(([cat, data]: [string, any]) => {
    const rules = data.editing_rules || []
    totalRulesAfter += rules.length

    rules.forEach((r: any) => {
      if (!rulesBefore[cat] || !rulesBefore[cat].has(r.rule)) {
        newRules.push({ category: cat, rule: r.rule, confidence: r.confidence || 0 })
      }
    })
  })

  const videosThisSession = (stateAfter.totalVideosAnalyzed || 0) - videosBeforeTotal

  // Update learning metrics
  stateAfter.learningMetrics = stateAfter.learningMetrics || {
    totalSessions: 0,
    totalVideosAnalyzed: 0,
    totalRulesLearned: 0,
    avgRulesPerSession: 0,
    avgConfidence: 0,
    categoriesCovered: [],
    uniqueCategories: 0,
    sessionsWithNewInsights: 0,
    sessionsWithNoNewInsights: 0,
    editsWithBrain: 0,
    lastBrainVersionUsed: 0,
  }
  stateAfter.learningMetrics.totalSessions++
  stateAfter.learningMetrics.totalRulesLearned = totalRulesAfter
  stateAfter.learningMetrics.avgRulesPerSession = totalRulesAfter / stateAfter.learningMetrics.totalSessions
  stateAfter.learningMetrics.sessionsWithNewInsights += newRules.length > 0 ? 1 : 0
  stateAfter.learningMetrics.sessionsWithNoNewInsights += newRules.length === 0 ? 1 : 0

  // Track category coverage
  const todaysCatNames = todayCategories
  stateAfter.learningMetrics.categoriesCovered = [
    ...new Set([...(stateAfter.learningMetrics.categoriesCovered || []), ...todaysCatNames])
  ]
  stateAfter.learningMetrics.uniqueCategories = stateAfter.learningMetrics.categoriesCovered.length

  // Average confidence of all rules
  const allConfidences: number[] = []
  Object.values(stateAfter.learnedPatterns || {}).forEach((data: any) => {
    ;(data.editing_rules || []).forEach((r: any) => {
      if (r.confidence) allConfidences.push(r.confidence)
    })
  })
  stateAfter.learningMetrics.avgConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a: number, b: number) => a + b, 0) / allConfidences.length
    : 0

  const learningResults = {
    videosThisSession,
    totalVideosAllTime: stateAfter.totalVideosAnalyzed || 0,
    newRulesCount: newRules.length,
    totalRulesCount: totalRulesAfter,
    newRules,
    categories: Object.keys(stateAfter.learnedPatterns || {}),
    missingFeatures: stateAfter.missingFeatures || [],
    newTrends: results.newTrends || [],
    systemIdeas: results.systemIdeas || [],
  }

  const totalCost = results.totalCost

  // Count rules with ffmpeg_params across all categories
  let totalWithFfmpegParams = 0
  Object.values(stateAfter.learnedPatterns || {}).forEach((data: any) => {
    ;(data.editing_rules || []).forEach((r: any) => {
      if (r.ffmpeg_params) totalWithFfmpegParams++
    })
  })

  console.log('[LEARN] === SESSION END ===')
  console.log(`[LEARN] Videos analyzed: ${videosThisSession}`)
  console.log(`[LEARN] New rules: ${newRules.length}`)
  console.log(`[LEARN] Total rules: ${totalRulesAfter}`)
  console.log(`[LEARN] Rules with FFmpeg params: ${totalWithFfmpegParams}/${totalRulesAfter} (${totalRulesAfter > 0 ? Math.round(totalWithFfmpegParams / totalRulesAfter * 100) : 0}%)`)
  console.log(`[LEARN] Cost: $${totalCost.toFixed(3)}`)

  // --- Track ALL costs accurately across sessions ---
  const todayIsraelEnd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const monthIsrael = todayIsraelEnd.substring(0, 7)

  // Reset daily cost if new day (BEFORE adding current session cost)
  if (stateAfter.dailyDate !== todayIsraelEnd) {
    stateAfter.dailyCost = 0
    stateAfter.dailyDate = todayIsraelEnd
  }

  // Reset monthly cost if new month (BEFORE adding current session cost)
  if (stateAfter.monthlyMonth !== monthIsrael) {
    stateAfter.monthlyCost = 0
    stateAfter.monthlyMonth = monthIsrael
  }

  // Now accumulate costs correctly
  stateAfter.totalCost = (stateAfter.totalCost || 0) + totalCost
  stateAfter.dailyCost = (stateAfter.dailyCost || 0) + totalCost
  stateAfter.monthlyCost = (stateAfter.monthlyCost || 0) + totalCost
  stateAfter.lastSessionCost = totalCost
  stateAfter.dailyBudget = 2    // $2/day
  stateAfter.monthlyBudget = 30  // $30/month

  // Track per-session history
  if (!stateAfter.sessionHistory) stateAfter.sessionHistory = []
  stateAfter.sessionHistory.push({
    date: new Date().toISOString(),
    cost: totalCost,
    videos: videosThisSession,
    newRules: newRules.length,
    categories: todayCategories,
  })
  // Keep last 100 sessions
  if (stateAfter.sessionHistory.length > 100) {
    stateAfter.sessionHistory = stateAfter.sessionHistory.slice(-100)
  }

  // Backup learning state (survives Railway redeploys via log persistence)
  try {
    const backupTotalRules = Object.values(stateAfter.learnedPatterns || {}).reduce(
      (sum: number, cat: any) => sum + (cat.editing_rules?.length || 0), 0
    )
    if (backupTotalRules > 0) {
      console.log(`[BACKUP] Learning state: ${(JSON.stringify(stateAfter).length / 1024).toFixed(1)}KB, ${backupTotalRules} rules`)
      console.log(`[BACKUP] Recovery info: ${JSON.stringify({
        timestamp: Date.now(),
        totalRules: backupTotalRules,
        totalVideos: stateAfter.totalVideosAnalyzed || 0,
        sessions: stateAfter.learningMetrics?.totalSessions || 0,
      })}`)
    }
  } catch (e: any) {
    console.warn('[BACKUP] Failed:', e.message)
  }

  // --- STEP 8: Save state with correct costs BEFORE sending reports ---
  stateAfter.lastLearnDate = Date.now()
  stateAfter.lastLearnDateIsrael = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  stateAfter.lastSessionNewRules = newRules.length
  saveLearningState(stateAfter)

  // --- STEP 9: Update editor brain (stores cumulative stats for Railway recovery) ---
  try {
    await updateEditorBrain(stateAfter)
  } catch (e: any) {
    console.warn('[LEARN] Editor brain update failed:', e.message)
  }

  // --- STEP 10: Send Telegram report (AFTER state and brain are saved) ---
  if (newRules.length > 0) {
    await sendLearningReport(stateAfter, learningResults)
  }

  // Count total insights including expertise domains
  const totalInsightsForReport = totalRulesAfter +
    (stateAfter.expertise?.social?.insights?.length || 0) +
    (stateAfter.expertise?.marketing?.insights?.length || 0) +
    (stateAfter.expertise?.paid_ads?.insights?.length || 0)

  // Always send finish notification
  const endTime = new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', minute: '2-digit',
  })
  const durationMinutes = Math.round((Date.now() - startTime) / 1000 / 60)
  let finishMsg = `✅ סיימתי ללמוד (${endTime}) - ${durationMinutes} דקות\n`
  finishMsg += `🎬 סרטונים: ${videosThisSession}\n`
  finishMsg += `💡 תובנות חדשות: ${newRules.length}\n`
  finishMsg += `💡 סה"כ תובנות: ${totalInsightsForReport}\n`
  finishMsg += `💰 עלות סשן: $${totalCost.toFixed(3)}\n`
  finishMsg += `💰 היום: $${(stateAfter.dailyCost || 0).toFixed(3)} / $${stateAfter.dailyBudget || 1}\n`
  finishMsg += `💰 החודש: $${(stateAfter.monthlyCost || 0).toFixed(3)} / $${stateAfter.monthlyBudget || 30}\n`
  finishMsg += `💰 כולל: $${(stateAfter.totalCost || 0).toFixed(3)}\n`
  if (newRules.length > 0) {
    finishMsg += `\n🧠 מוח העורך עודכן לגרסה v${totalInsightsForReport}`
  }
  await sendTelegram(finishMsg)

  console.log('[LEARN] Learning session complete, saved state')
}

// Upload learning state (protected by a simple token)
app.post('/api/learning/upload-state', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { learningState, editorBrain } = req.body;

    if (learningState) {
      fs.writeFileSync(learningStatePath, JSON.stringify(learningState, null, 2));
      console.log('[ADMIN] Learning state uploaded:', (JSON.stringify(learningState).length / 1024).toFixed(1), 'KB');
    }

    if (editorBrain) {
      fs.writeFileSync(editorBrainPath, JSON.stringify(editorBrain, null, 2));
      console.log('[ADMIN] Editor brain uploaded:', (JSON.stringify(editorBrain).length / 1024).toFixed(1), 'KB');
    }

    res.json({
      success: true,
      stateSaved: !!learningState,
      brainSaved: !!editorBrain,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Download learning state
app.get('/api/learning/download-state', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const state = fs.existsSync(learningStatePath)
      ? JSON.parse(fs.readFileSync(learningStatePath, 'utf-8'))
      : null;
    const brain = fs.existsSync(editorBrainPath)
      ? JSON.parse(fs.readFileSync(editorBrainPath, 'utf-8'))
      : null;

    res.json({ learningState: state, editorBrain: brain });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

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

// ==================== LEARNING STATUS ENDPOINT ====================

app.get('/api/learning/status', (_req, res) => {
  const state = loadLearningState()

  const israelTime = new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', minute: '2-digit',
  })

  const totalRules = Object.values(state.learnedPatterns || {}).reduce(
    (sum: number, cat: any) => sum + (cat.editing_rules?.length || 0), 0
  )

  res.json({
    status: 'running',
    serverTime: new Date().toISOString(),
    israelTime,
    lastLearnDate: state.lastLearnDate ? new Date(state.lastLearnDate).toISOString() : null,
    lastLearnDateIsrael: state.lastLearnDateIsrael,
    totalVideosAnalyzed: state.totalVideosAnalyzed || 0,
    totalRules,
    totalSessions: state.learningMetrics?.totalSessions || 0,
    telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    nextSession: getNextSessionInfo(),
    budget: {
      dailyCost: state.dailyGptCost || 0,
      dailyLimit: DAILY_GPT_COST_LIMIT,
      dailyCalls: state.dailyGptCalls || 0,
      dailyCallsLimit: DAILY_GPT_CALLS_LIMIT,
      monthlyCost: state.monthlyGptCost || 0,
      monthlyLimit: MONTHLY_GPT_COST_LIMIT,
    },
    uptime: process.uptime(),
  })
})

app.post('/api/learning/sync-from-railway', async (_req, res) => {
  try {
    const synced = await syncBrainFromRailway()
    const brain = loadEditorBrain()

    res.json({
      synced,
      brainVersion: brain.version || 0,
      masterPromptWords: brain.stats?.masterPromptWords || 0,
      lastUpdated: brain.lastUpdatedIsrael || 'unknown',
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// ==================== USER RATING FOR EDIT HISTORY ====================

app.post('/api/auto-editor/rate', (req, res) => {
  try {
    const { jobId, rating, feedback } = req.body
    if (!jobId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'jobId and rating (1-5) required' })
    }

    const history = loadEditHistory()
    const edit = history.edits.find((e: any) => e.jobId === jobId)
    if (!edit) {
      return res.status(404).json({ error: `Edit ${jobId} not found` })
    }

    edit.userRating = rating
    if (feedback) edit.userFeedback = feedback
    saveEditHistory(history)

    console.log(`[SELF-EVAL] User rated job ${jobId}: ${rating}/5${feedback ? ` — "${feedback}"` : ''}`)
    res.json({ success: true, jobId, rating, feedback: feedback || null })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// ==================== DAILY PROMPT OPTIMIZATION ====================

async function runSelfEvaluation(): Promise<any[]> {
  console.log('[SELF-EVAL] === Nightly self-evaluation ===')

  const history = loadEditHistory()
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const unreviewedEdits = (history.edits || []).filter(
    (e: any) => !e.reviewed && new Date(e.timestamp).getTime() > sevenDaysAgo
  )

  if (unreviewedEdits.length === 0) {
    console.log('[SELF-EVAL] No unreviewed edits from last 7 days')
    return []
  }

  console.log(`[SELF-EVAL] Found ${unreviewedEdits.length} unreviewed edits from last 7 days`)

  const ai = await getOpenAI()
  if (!ai) {
    console.error('[SELF-EVAL] OpenAI not configured, skipping self-evaluation')
    return []
  }

  const allImprovements: any[] = []
  const editsToReview = unreviewedEdits.slice(0, 5) // Max 5 per night

  for (const edit of editsToReview) {
    console.log(`[SELF-EVAL] Analyzing ${edit.jobId} (${edit.contentType}, ${edit.format}, score=${edit.results?.qualityScore})...`)

    // Load output frames as base64
    const frameContents: any[] = []
    for (const framePath of (edit.outputFrames || [])) {
      try {
        if (fs.existsSync(framePath)) {
          const data = fs.readFileSync(framePath)
          frameContents.push({
            type: 'image_url' as const,
            image_url: { url: `data:image/jpeg;base64,${data.toString('base64')}` },
          })
        }
      } catch {}
    }

    if (frameContents.length === 0) {
      console.log(`[SELF-EVAL] No frames available for ${edit.jobId}, skipping`)
      edit.reviewed = true
      continue
    }

    try {
      const response = await ai.chat.completions.create({
        model: 'gpt-5.4',
        max_completion_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: `You are a professional video editor reviewing the output of an AI auto-editor.
Here are ${frameContents.length} frames from the edited video.
Edit settings: ${edit.contentType}, ${edit.format}, subtitle style: ${edit.settings?.subtitleStyle}, color grade: ${edit.settings?.colorGrade}
Quality score from system: ${edit.results?.qualityScore || 0}/100
User rating: ${edit.userRating || 'not rated'}
User feedback: ${edit.userFeedback || 'none'}

Analyze the output and identify:
1. What looks GOOD — professional quality elements
2. What looks BAD — issues, artifacts, poor choices
3. SPECIFIC improvements needed — express as editing parameters

For each improvement, format as:
{ "issue": "description of problem", "current_behavior": "what the editor did", "suggested_fix": "what it should do instead", "ffmpeg_params": { "action": "...", "intensity": "..." }, "confidence": "high/medium/low" }

Return as JSON: { "good": ["..."], "bad": ["..."], "improvements": [...] }`,
            },
            ...frameContents,
          ],
        }],
      })

      const usage = response.usage
      if (usage) {
        const cost = (usage.prompt_tokens || 0) * 0.000005 + (usage.completion_tokens || 0) * 0.000015
        console.log(`[SELF-EVAL] Vision call cost: $${cost.toFixed(4)}`)
      }

      const raw = response.choices[0].message.content?.trim() || '{}'
      // Parse JSON (strip markdown fences if present)
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const analysis = JSON.parse(cleaned)

      // Log results
      if (analysis.good?.length) {
        console.log(`[SELF-EVAL] Good: ${analysis.good.join(', ')}`)
      }
      if (analysis.bad?.length) {
        console.log(`[SELF-EVAL] Bad: ${analysis.bad.join(', ')}`)
      }
      if (analysis.improvements?.length) {
        console.log(`[SELF-EVAL] Improvements: ${analysis.improvements.length} suggested (${analysis.improvements.map((i: any) => i.ffmpeg_params?.action || i.issue?.substring(0, 20)).join(', ')})`)
        allImprovements.push(...analysis.improvements.map((imp: any) => ({
          ...imp,
          sourceJobId: edit.jobId,
          sourceQualityScore: edit.results?.qualityScore || 0,
          sourceUserRating: edit.userRating,
        })))
      }

      edit.reviewed = true
      edit.selfEvaluation = {
        good: analysis.good || [],
        bad: analysis.bad || [],
        improvementCount: analysis.improvements?.length || 0,
        reviewedAt: new Date().toISOString(),
      }
    } catch (e: any) {
      console.error(`[SELF-EVAL] Analysis failed for ${edit.jobId}:`, e.message?.substring(0, 150))
      edit.reviewed = true // Don't retry failed ones
    }
  }

  // Save updated history
  saveEditHistory(history)

  // Cleanup reviewed frames (older than 7 days)
  try {
    const evalFrameDirs = fs.readdirSync(uploadsDir).filter(d => d.startsWith('eval_frames_'))
    for (const dir of evalFrameDirs) {
      const dirPath = path.join(uploadsDir, dir)
      try {
        const stat = fs.statSync(dirPath)
        if (Date.now() - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
          fs.readdirSync(dirPath).forEach(f => fs.unlinkSync(path.join(dirPath, f)))
          fs.rmdirSync(dirPath)
        }
      } catch {}
    }
  } catch {}

  console.log(`[SELF-EVAL] === Summary: ${editsToReview.length} edits reviewed, ${allImprovements.length} improvements found ===`)
  return allImprovements
}

function applyImprovementsToRules(improvements: any[], state: any): { adjusted: number; added: number } {
  let adjusted = 0
  let added = 0

  // Ensure learnedPatterns exists
  if (!state.learnedPatterns) state.learnedPatterns = {}

  // Get all existing rules with their objects for matching
  const allExistingRules: any[] = []
  for (const category of Object.keys(state.learnedPatterns)) {
    const rules = state.learnedPatterns[category]?.editing_rules || []
    rules.forEach((r: any) => allExistingRules.push({ ...r, _category: category }))
  }

  // Also collect rules from expertise
  const expertiseRules: any[] = []
  for (const domain of Object.keys(state.expertise || {})) {
    const insights = state.expertise[domain]?.insights || []
    insights.forEach((r: any) => expertiseRules.push({ ...r, _domain: domain }))
  }

  for (const improvement of improvements) {
    const action = improvement.ffmpeg_params?.action
    if (!action) continue

    // Check if improvement contradicts an existing rule
    const matchingRule = allExistingRules.find((r: any) =>
      r.ffmpeg_params?.action === action
    )

    if (matchingRule) {
      // Lower confidence of contradicted rule
      const category = matchingRule._category
      const rules = state.learnedPatterns[category]?.editing_rules || []
      const ruleObj = rules.find((r: any) => r.ffmpeg_params?.action === action)
      if (ruleObj) {
        const oldConf = ruleObj.confidence_score ?? 0.7
        ruleObj.confidence_score = Math.max(0.1, oldConf - 0.1)
        console.log(`[SELF-EVAL] Rule adjusted: '${action}' confidence ${oldConf.toFixed(2)} → ${ruleObj.confidence_score.toFixed(2)}`)

        // Update ffmpeg_params if improvement suggests new values
        if (improvement.ffmpeg_params && Object.keys(improvement.ffmpeg_params).length > 1) {
          Object.assign(ruleObj.ffmpeg_params, improvement.ffmpeg_params)
        }
        adjusted++
      }
    } else {
      // Add as new rule
      const category = 'editing_techniques' // Default category for self-eval rules
      if (!state.learnedPatterns[category]) {
        state.learnedPatterns[category] = { editing_rules: [] }
      }
      state.learnedPatterns[category].editing_rules.push({
        rule: improvement.suggested_fix || improvement.issue,
        ffmpeg_params: improvement.ffmpeg_params,
        confidence_score: 0.5, // New self-eval rules start at 0.5
        source: 'self_evaluation',
        addedAt: new Date().toISOString(),
      })
      console.log(`[SELF-EVAL] New rule added: '${action}' from self-evaluation`)
      added++
    }
  }

  // Adjust confidence for rules that led to GOOD results
  // (edits with score > 75 or user rating >= 4)
  const goodJobIds = improvements
    .filter((i: any) => i.sourceQualityScore > 75 || (i.sourceUserRating && i.sourceUserRating >= 4))
    .map((i: any) => i.sourceJobId)

  if (goodJobIds.length > 0) {
    for (const category of Object.keys(state.learnedPatterns)) {
      const rules = state.learnedPatterns[category]?.editing_rules || []
      for (const rule of rules) {
        if (rule.confidence_score !== undefined && rule.confidence_score < 1.0) {
          const oldConf = rule.confidence_score
          rule.confidence_score = Math.min(1.0, oldConf + 0.05)
          if (rule.confidence_score !== oldConf) {
            console.log(`[BRAIN] Rule confidence adjusted: '${rule.ffmpeg_params?.action || rule.rule?.substring(0, 30)}' ${oldConf.toFixed(2)} → ${rule.confidence_score.toFixed(2)} (good result)`)
          }
        }
      }
    }
  }

  // Remove rules below 0.1 confidence
  for (const category of Object.keys(state.learnedPatterns)) {
    const rules = state.learnedPatterns[category]?.editing_rules || []
    const before = rules.length
    state.learnedPatterns[category].editing_rules = rules.filter((r: any) => {
      if (r.confidence_score !== undefined && r.confidence_score < 0.1) {
        console.log(`[BRAIN] Rule removed (confidence < 0.1): '${r.ffmpeg_params?.action || r.rule?.substring(0, 30)}'`)
        return false
      }
      return true
    })
    const removed = before - state.learnedPatterns[category].editing_rules.length
    if (removed > 0) adjusted += removed
  }

  return { adjusted, added }
}

async function optimizeMasterPrompt() {
  console.log('[BRAIN] Starting daily prompt optimization...')

  // Self-evaluation step: analyze recent edits before rebuilding prompts
  try {
    const improvements = await runSelfEvaluation()
    if (improvements.length > 0) {
      const state = loadLearningState()
      const { adjusted, added } = applyImprovementsToRules(improvements, state)
      saveLearningState(state)
      console.log(`[SELF-EVAL] === Summary: ${adjusted} rules adjusted, ${added} new rules added ===`)
    }
  } catch (e: any) {
    console.error('[SELF-EVAL] Self-evaluation failed:', e.message?.substring(0, 150))
  }

  const brain = loadEditorBrain()

  if (!brain.masterPrompt || brain.masterPrompt.length < 100) {
    console.log('[BRAIN] No master prompt to optimize')
    return
  }

  const currentWords = brain.masterPrompt.split(/\s+/).length
  console.log(`[BRAIN] Current prompt: ${currentWords} words, ${brain.masterPrompt.length} chars`)

  try {
    const ai = await getOpenAI()
    if (!ai) {
      console.error('[BRAIN] OpenAI not configured, skipping optimization')
      return
    }

    const response = await ai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are an expert prompt engineer optimizing an AI video editor's instruction prompt.
CURRENT MASTER PROMPT (${currentWords} words):
---
${brain.masterPrompt}
---
YOUR TASK: Optimize this prompt to be MORE EFFECTIVE while being SHORTER.
OPTIMIZATION RULES:
1. MERGE rules that say similar things into one stronger rule
2. REMOVE redundant instructions (if two rules say "use zoom on key moments", keep one)
3. SHARPEN vague rules into specific ones (replace "use good pacing" with exact timings)
4. KEEP all specific numbers (1.2x zoom, 0.5s, 15% volume) - never remove parameters
5. KEEP all unique insights - don't lose any technique that's mentioned only once
6. PRIORITIZE rules by impact - put the most important rules first in each section
7. USE shorter sentences - every word must earn its place
8. COMBINE small sections if they overlap
9. Target: ${Math.round(currentWords * 0.85)}-${Math.round(currentWords * 0.95)} words (5-15% shorter)
10. If the prompt is already tight and well-optimized, make minimal changes
ALSO:
- Fix any contradictions between rules
- If two rules contradict, keep the one with more specific parameters
- Ensure each section flows logically
- Add any obvious missing connections between rules
Return ONLY the optimized prompt. No explanations, no markdown, no headers with ===.
Start directly with the content.`,
      }],
    })

    const optimizedPrompt = response.choices[0].message.content?.trim() || ''
    const newWords = optimizedPrompt.split(/\s+/).length

    if (optimizedPrompt.length < 100) {
      console.warn('[BRAIN] Optimization returned too short, keeping original')
      return
    }

    // Don't accept if it's way too different in size (safety check)
    if (newWords < currentWords * 0.5 || newWords > currentWords * 1.2) {
      console.warn(`[BRAIN] Optimization size suspicious: ${currentWords} → ${newWords} words. Keeping original.`)
      return
    }

    const reduction = Math.round((1 - newWords / currentWords) * 100)

    // Save optimized version
    brain.masterPrompt = optimizedPrompt
    brain.lastOptimized = new Date().toISOString()
    brain.lastOptimizedIsrael = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
    brain.optimizationHistory = brain.optimizationHistory || []
    brain.optimizationHistory.push({
      date: new Date().toISOString(),
      beforeWords: currentWords,
      afterWords: newWords,
      reduction: `${reduction}%`,
    })
    // Keep last 30 optimization records
    if (brain.optimizationHistory.length > 30) {
      brain.optimizationHistory = brain.optimizationHistory.slice(-30)
    }

    brain.stats.masterPromptWords = newWords
    brain.stats.masterPromptChars = optimizedPrompt.length

    // Also regenerate stage prompts from the optimized master prompt
    try {
      console.log('[BRAIN] Regenerating stage prompts from optimized master prompt...')
      const state = loadLearningState()
      const allRules: string[] = []
      const allSocialInsights: string[] = []
      const allMarketingInsights: string[] = []
      const allPaidAdsInsights: string[] = []
      ;(state.expertise?.editing?.insights || []).forEach((r: any) => { if (r.rule) allRules.push(r.rule) })
      ;(state.expertise?.social?.insights || []).forEach((r: any) => { if (r.rule) allSocialInsights.push(r.rule) })
      ;(state.expertise?.marketing?.insights || []).forEach((r: any) => { if (r.rule) allMarketingInsights.push(r.rule) })
      ;(state.expertise?.paid_ads?.insights || []).forEach((r: any) => { if (r.rule) allPaidAdsInsights.push(r.rule) })

      // Collect all rule objects (with confidence_score) for filtering
      const allRuleObjects: any[] = []
      for (const category of Object.keys(state.learnedPatterns || {})) {
        const rules = state.learnedPatterns[category]?.editing_rules || []
        allRuleObjects.push(...rules)
      }

      const stagePrompts = await generateStagePrompts(ai, optimizedPrompt, allRules, allSocialInsights, allMarketingInsights, allPaidAdsInsights, allRuleObjects)
      brain.stagePrompts = stagePrompts
      brain.stats.stagePromptsGenerated = true
      brain.stats.stagePromptWords = {
        visual_analysis: stagePrompts.visual_analysis.split(/\s+/).length,
        enrich: stagePrompts.enrich.split(/\s+/).length,
        creative_brief: stagePrompts.creative_brief.split(/\s+/).length,
        technical_plan: stagePrompts.technical_plan.split(/\s+/).length,
      }
      const sw = brain.stats.stagePromptWords
      console.log(`[BRAIN] Stage prompts regenerated: visual=${sw.visual_analysis}w, enrich=${sw.enrich}w, brief=${sw.creative_brief}w, tech=${sw.technical_plan}w`)
    } catch (stageErr: any) {
      console.error('[BRAIN] Stage prompt regeneration failed during optimization:', stageErr.message?.substring(0, 150))
    }

    fs.writeFileSync(editorBrainPath, JSON.stringify(brain, null, 2))

    console.log(`[BRAIN] Optimized: ${currentWords} → ${newWords} words (${reduction}% reduction)`)

    // Send Telegram notification
    const stageInfo = brain.stagePrompts ? `\n📊 פרומפטים ממוקדים: 4 שלבים` : ''
    await sendTelegram(
      `🧠 אופטימיזציית פרומפט יומית\n` +
      `📝 לפני: ${currentWords} מילים\n` +
      `📝 אחרי: ${newWords} מילים\n` +
      `📉 קיצור: ${reduction}%${stageInfo}\n` +
      `✅ הפרומפט עודכן ומוכן לעריכות`
    )

  } catch (e: any) {
    console.error('[BRAIN] Optimization failed:', e.message?.substring(0, 150))
    await sendTelegram(`❌ אופטימיזציית פרומפט נכשלה: ${e.message?.substring(0, 200)}`)
  }
}

// ==================== DAILY LEARNING SCHEDULER ====================

function scheduleDailyLearning() {
  // In development: don't schedule ANY automatic learning
  if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT) {
    console.log('[LEARN] Development mode: automatic learning DISABLED (use Railway)')
    return
  }

  const ISRAEL_TIMEZONE = 'Asia/Jerusalem'
  const RUN_TIMES = [
    { hour: 3, minute: 0, label: 'אופטימיזציה', type: 'optimize' },
    { hour: 7, minute: 0, label: 'בוקר', type: 'learn' },
    { hour: 19, minute: 0, label: 'ערב', type: 'learn' },
  ]

  function getNextRunTime(): { ms: number; label: string; timeStr: string; type: string } {
    const now = new Date()
    const israelNow = new Date(now.toLocaleString('en-US', { timeZone: ISRAEL_TIMEZONE }))

    let closest = { ms: Infinity, label: '', timeStr: '', type: 'learn' }

    for (const runTime of RUN_TIMES) {
      const target = new Date(israelNow)
      target.setHours(runTime.hour, runTime.minute, 0, 0)

      let msUntil = target.getTime() - israelNow.getTime()
      if (msUntil <= 0) msUntil += 24 * 60 * 60 * 1000

      if (msUntil < closest.ms) {
        closest = {
          ms: msUntil,
          label: runTime.label,
          timeStr: `${String(runTime.hour).padStart(2, '0')}:${String(runTime.minute).padStart(2, '0')}`,
          type: runTime.type,
        }
      }
    }

    return closest
  }

  function hasLearnedThisSession(): boolean {
    try {
      const state = loadLearningState()
      if (!state.lastLearnDate) return false
      const hoursSince = (Date.now() - new Date(state.lastLearnDate).getTime()) / (1000 * 60 * 60)
      return hoursSince < 6
    } catch {
      return false
    }
  }

  // On startup: check if we missed a session (Railway restart catch-up)
  const israelHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: ISRAEL_TIMEZONE, hour: 'numeric', hour12: false
  }))

  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    // Only catch up missed sessions on Railway (production)
    if (!hasLearnedThisSession()) {
      const shouldRunNow = RUN_TIMES.some(rt => {
        const hoursSince = israelHour - rt.hour
        return rt.type === 'learn' && hoursSince >= 0 && hoursSince < 6
      })

      if (shouldRunNow) {
        console.log('[LEARN] Missed scheduled session, running now (30s delay)...')
        setTimeout(async () => {
          try {
            await runServerLearning()
          } catch (e: any) {
            console.error('[LEARN] Catch-up failed:', e.message)
          }
        }, 30000)
      }
    }
  } else {
    console.log('[LEARN] Development mode: skipping catch-up, waiting for scheduled time')
  }

  function scheduleNext() {
    const next = getNextRunTime()
    const hoursUntil = (next.ms / (1000 * 60 * 60)).toFixed(1)

    console.log(`[LEARN] Next: ${next.timeStr} Israel (${next.label}) - in ${hoursUntil}h`)

    setTimeout(async () => {
      try {
        if (next.type === 'optimize') {
          console.log('[BRAIN] Starting scheduled optimization...')
          await optimizeMasterPrompt()
        } else {
          if (hasLearnedThisSession()) {
            console.log('[LEARN] Already learned this session, skipping')
            scheduleNext()
            return
          }
          console.log(`[LEARN] Starting ${next.label} learning session...`)
          await runServerLearning()
        }
      } catch (err: any) {
        console.error(`[LEARN] ${next.label} failed:`, err.message)
        try {
          await sendTelegram(`❌ ${next.label} נכשל:\n${err.message?.substring(0, 500)}`)
        } catch {}
      }
      scheduleNext()
    }, next.ms)
  }

  scheduleNext()
}

// ==================== TELEGRAM BOT LISTENER ====================

function startTelegramBotListener() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    console.log('[TELEGRAM BOT] Not configured, skipping listener')
    return
  }

  let lastUpdateId = 0

  async function pollUpdates() {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 35000)

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`,
        { signal: controller.signal }
      )

      clearTimeout(timeoutId)

      if (!res.ok) {
        if (res.status === 409) {
          // 409 = another instance is polling - this is normal, don't spam logs
          setTimeout(pollUpdates, 15000)
          return
        }
        console.warn(`[TELEGRAM BOT] Poll error: ${res.status}`)
        setTimeout(pollUpdates, 10000)
        return
      }

      const data = await res.json() as any

      if (data.ok && data.result?.length > 0) {
        for (const update of data.result) {
          lastUpdateId = update.update_id

          const msg = update.message
          if (!msg?.text || String(msg.chat.id) !== String(chatId)) continue

          const text = msg.text.trim().toLowerCase()

          try {
            if (text === 'דוח' || text === 'report' || text === 'סטטוס' || text === 'status') {
              console.log('[TELEGRAM BOT] Report requested')
              await sendFullReport()
            } else if (text === 'צא ללמוד' || text === 'למד' || text === 'learn') {
              console.log('[TELEGRAM BOT] Manual learning triggered (force mode)')
              await sendTelegram('🚀 יוצא ללמוד עכשיו... (תקציב: $1)')
              // Run learning in background with force: true to bypass 6-hour check
              ;(async () => {
                try {
                  await runServerLearning({ budget: 1.0, force: true })
                } catch (e: any) {
                  await sendTelegram(`❌ הלמידה נכשלה: ${e.message?.substring(0, 300)}`)
                }
              })()
            } else if (text === 'אופטימיזציה' || text === 'optimize') {
              console.log('[TELEGRAM BOT] Manual optimization triggered')
              await sendTelegram('🧠 מתחיל אופטימיזציית פרומפט...')
              ;(async () => {
                try {
                  await optimizeMasterPrompt()
                } catch (e: any) {
                  await sendTelegram(`❌ נכשל: ${e.message?.substring(0, 300)}`)
                }
              })()
            } else if (text === 'שרת' || text === 'server' || text === 'ping') {
              console.log('[TELEGRAM BOT] Server status requested')
              const uptime = process.uptime()
              const hours = Math.floor(uptime / 3600)
              const minutes = Math.floor((uptime % 3600) / 60)

              const srvState = loadLearningState()
              const totalRules = Object.values(srvState.learnedPatterns || {}).reduce(
                (sum: number, cat: any) => sum + (cat.editing_rules?.length || 0), 0
              )

              const israelTime = new Date().toLocaleString('he-IL', {
                timeZone: 'Asia/Jerusalem',
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
              })

              await sendTelegram(
                `🖥️ סטטוס שרת - ${israelTime}\n` +
                `─────────────\n` +
                `✅ שרת פעיל: ${hours}:${String(minutes).padStart(2, '0')} שעות\n` +
                `📚 תובנות: ${totalRules}\n` +
                `🎬 סרטונים שנותחו: ${srvState.totalVideosAnalyzed || 0}\n` +
                `📅 למידה אחרונה: ${srvState.lastLearnDateIsrael || 'טרם'}\n` +
                `⏰ למידה הבאה: ${getNextSessionInfo()}\n` +
                `🧠 סשנים: ${srvState.learningMetrics?.totalSessions || 0}\n` +
                `💰 היום: $${Number(srvState.dailyGptCost || 0).toFixed(3)}/$${DAILY_GPT_COST_LIMIT}\n` +
                `💰 החודש: $${Number(srvState.monthlyGptCost || 0).toFixed(2)}/$${MONTHLY_GPT_COST_LIMIT}\n` +
                `\nפקודות:\n` +
                `  📊 דוח - דוח מלא\n` +
                `  📈 סטטוס - סטטוס מהיר\n` +
                `  🖥️ שרת - סטטוס שרת\n` +
                `  🚀 צא ללמוד - למידה מיידית ($1)\n` +
                `  🧠 אופטימיזציה - אופטימיזציית פרומפט\n` +
                `  📜 פרומפט - פרומפט מלא + תובנות`
              )
            } else if (text === 'פרומפט' || text === 'prompt') {
              console.log('[TELEGRAM BOT] Full prompt report requested')

              try {
                const brain = loadEditorBrain()
                const state = loadLearningState()

                // Part 1: Brain stats
                let msg = `🧠 מוח העורך - דוח מלא\n`
                msg += '═'.repeat(25) + '\n\n'
                msg += `📌 גרסה: v${brain.version || 0}\n`
                msg += `📝 מילים: ${brain.stats?.masterPromptWords || 0}\n`
                msg += `📅 עדכון אחרון: ${brain.lastUpdatedIsrael || 'לא ידוע'}\n`

                if (brain.lastOptimizedIsrael) {
                  msg += `🔧 אופטימיזציה אחרונה: ${brain.lastOptimizedIsrael}\n`
                }

                msg += `\n📊 סטטיסטיקות:\n`
                msg += `  🎬 כללי עריכה: ${brain.stats?.editingRules || 0}\n`
                msg += `  📱 תובנות סושיאל: ${brain.stats?.socialInsights || 0}\n`
                msg += `  📣 תובנות שיווק: ${brain.stats?.marketingInsights || 0}\n`
                msg += `  💰 תובנות פרסום: ${brain.stats?.paidAdsInsights || 0}\n`
                msg += `  🔥 טרנדים פעילים: ${brain.stats?.activeTrends || 0}\n`
                msg += `  💡 רעיונות מערכת: ${brain.stats?.systemIdeas || 0}\n`

                // Send brain stats first
                await sendTelegram(msg)

                // Part 2: Master Prompt (split into chunks because Telegram has 4096 char limit)
                const masterPrompt = brain.masterPrompt || 'אין פרומפט'
                const promptChunks: string[] = []
                const CHUNK_SIZE = 3500

                for (let i = 0; i < masterPrompt.length; i += CHUNK_SIZE) {
                  promptChunks.push(masterPrompt.substring(i, i + CHUNK_SIZE))
                }

                await sendTelegram(`📜 Master Prompt (${promptChunks.length} חלקים):\n` + '─'.repeat(20))

                for (let i = 0; i < promptChunks.length; i++) {
                  await sendTelegram(`📜 חלק ${i + 1}/${promptChunks.length}:\n\n${promptChunks[i]}`)
                  // Small delay to avoid Telegram rate limiting
                  await new Promise(r => setTimeout(r, 500))
                }

                // Part 3: All learned insights by category
                let insightsMsg = `\n💡 תובנות לפי קטגוריה:\n`
                insightsMsg += '═'.repeat(25) + '\n\n'

                let totalInsights = 0

                // Learned patterns
                const patterns = state.learnedPatterns || {}
                for (const [category, data] of Object.entries(patterns)) {
                  const rules = (data as any)?.editing_rules || []
                  if (rules.length === 0) continue

                  totalInsights += rules.length
                  insightsMsg += `📂 ${category} (${rules.length}):\n`

                  for (const rule of rules) {
                    const ruleText = typeof rule === 'string' ? rule : JSON.stringify(rule)
                    insightsMsg += `  • ${ruleText.substring(0, 120)}${ruleText.length > 120 ? '...' : ''}\n`
                  }
                  insightsMsg += '\n'

                  // Send in chunks if getting long
                  if (insightsMsg.length > 3500) {
                    await sendTelegram(insightsMsg)
                    insightsMsg = ''
                    await new Promise(r => setTimeout(r, 500))
                  }
                }

                // Expertise insights
                const expertise = state.expertise || {}
                for (const [domain, data] of Object.entries(expertise)) {
                  const insights = (data as any)?.insights || []
                  if (insights.length === 0) continue

                  totalInsights += insights.length
                  insightsMsg += `🎓 ${domain} (${insights.length}):\n`

                  for (const insight of insights) {
                    const insightText = typeof insight === 'string' ? insight : JSON.stringify(insight)
                    insightsMsg += `  • ${insightText.substring(0, 120)}${insightText.length > 120 ? '...' : ''}\n`
                  }
                  insightsMsg += '\n'

                  if (insightsMsg.length > 3500) {
                    await sendTelegram(insightsMsg)
                    insightsMsg = ''
                    await new Promise(r => setTimeout(r, 500))
                  }
                }

                // Send remaining insights
                if (insightsMsg.length > 0) {
                  await sendTelegram(insightsMsg)
                }

                // Part 4: Active trends
                const trends = state.trendInsights?.activeTrends || []
                if (trends.length > 0) {
                  let trendsMsg = `🔥 טרנדים פעילים (${trends.length}):\n`
                  trendsMsg += '─'.repeat(20) + '\n\n'

                  for (const trend of trends) {
                    if (typeof trend === 'object') {
                      trendsMsg += `  🔥 ${(trend as any).name || '?'} (${(trend as any).lifecycle || '?'})\n`
                      if ((trend as any).description) {
                        trendsMsg += `     ${(trend as any).description.substring(0, 100)}${(trend as any).description.length > 100 ? '...' : ''}\n`
                      }
                    } else {
                      trendsMsg += `  🔥 ${String(trend).substring(0, 120)}\n`
                    }
                  }

                  await sendTelegram(trendsMsg)
                }

                // Part 5: Summary
                await sendTelegram(
                  `\n✅ סיכום:\n` +
                  `  📝 פרומפט: ${brain.stats?.masterPromptWords || 0} מילים\n` +
                  `  💡 תובנות: ${totalInsights}\n` +
                  `  🔥 טרנדים: ${trends.length}\n` +
                  `  📅 סשנים: ${state.learningMetrics?.totalSessions || 0}\n` +
                  `  💰 עלות כוללת: $${(state.totalCost || 0).toFixed(3)}`
                )

              } catch (e: any) {
                console.error('[TELEGRAM BOT] Prompt report error:', e.message)
                await sendTelegram(`❌ שגיאה בהכנת דוח פרומפט: ${e.message?.substring(0, 200)}`)
              }
            }
          } catch (cmdError: any) {
            console.error('[TELEGRAM BOT] Command error:', cmdError.message)
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // Timeout is normal for long polling
      } else {
        console.warn('[TELEGRAM BOT] Poll error:', e.message?.substring(0, 100))
      }
    }

    // Always continue polling
    setTimeout(pollUpdates, 3000)
  }

  console.log('[TELEGRAM BOT] Listening for commands (דוח / סטטוס / שרת / צא ללמוד / אופטימיזציה / פרומפט)')
  pollUpdates()
}

async function sendFullReport() {
  try {
    const state = loadLearningState()

    // Safe number helper - prevents toFixed crashes on null/undefined
    const safe = (val: any, decimals: number = 3): string => {
      const num = Number(val)
      return isNaN(num) ? '0' : num.toFixed(decimals)
    }

    const now = new Date().toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })

    // Count all rules (including expertise domains)
    let totalRules = 0
    const categoryCounts: Record<string, number> = {}

    Object.entries(state.learnedPatterns || {}).forEach(([cat, data]: [string, any]) => {
      const count = (data.editing_rules || []).length
      categoryCounts[cat] = count
      totalRules += count
    })

    // Also count expertise domain insights
    ;['editing', 'social', 'marketing', 'paid_ads'].forEach(domain => {
      const insightCount = state.expertise?.[domain]?.insights?.length || 0
      if (insightCount > 0) {
        totalRules += insightCount
      }
    })

    const categories = Object.keys(state.learnedPatterns || {})

    let message = `📊 דוח סטטוס מלא - ${now}\n`
    message += '═'.repeat(30) + '\n\n'

    // General stats
    message += `📈 סטטיסטיקות כלליות:\n`
    message += `  🎬 סרטונים שנותחו: ${state.totalVideosAnalyzed || 0}\n`
    message += `  💡 סה"כ תובנות: ${totalRules}\n`
    message += `  🏷️ קטגוריות: ${categories.length}\n`
    message += `  📅 למידה אחרונה: ${state.lastLearnDateIsrael || 'לא ידוע'}\n`
    message += `  🆕 תובנות חדשות בפעם האחרונה: ${state.lastSessionNewRules || 0}\n\n`

    // Learning metrics
    if (state.learningMetrics) {
      const m = state.learningMetrics
      message += `📈 מדדי למידה:\n`
      message += `  סשנים: ${m.totalSessions}\n`
      message += `  ממוצע תובנות לסשן: ${safe(m.avgRulesPerSession, 1)}\n`
      message += `  ביטחון ממוצע: ${safe((m.avgConfidence || 0) * 100, 0)}%\n`
      message += `  קטגוריות שכוסו: ${m.uniqueCategories || 0}/${Object.keys(LEARNING_CATEGORIES).length}\n`
      message += `  סשנים עם תובנות: ${m.sessionsWithNewInsights || 0}/${m.totalSessions || 0}\n\n`
    }

    // Expertise breakdown
    const domainEmojiReport: Record<string, string> = { editing: '🎬', social: '📱', marketing: '📣', paid_ads: '💰' }
    const domainNameReport: Record<string, string> = { editing: 'עריכת וידאו', social: 'סושיאל מדיה', marketing: 'שיווק', paid_ads: 'פרסום ממומן' }

    if (state.expertise) {
      message += `🧠 מומחיות מפורטת:\n`
      ;['editing', 'social', 'marketing', 'paid_ads'].forEach(domain => {
        const exp = state.expertise[domain]
        if (exp && exp.totalInsights > 0) {
          const nextLevel = exp.level === 'beginner' ? 20 : exp.level === 'intermediate' ? 50 : exp.level === 'advanced' ? 100 : null
          const progress = nextLevel ? ` (${nextLevel - exp.totalInsights} עד הרמה הבאה)` : ' (מקסימום!)'
          message += `  ${domainEmojiReport[domain]} ${domainNameReport[domain]}: ${exp.totalInsights} תובנות${progress}\n`
        }
      })
      message += '\n'

      // Top system optimization ideas
      const sysOpt = state.expertise.systemOptimization
      if (sysOpt?.ideas?.length > 0) {
        const topIdeas = sysOpt.ideas
          .filter((i: any) => i.status === 'pending' && i.impact === 'high')
          .slice(0, 5)

        if (topIdeas.length > 0) {
          message += `⚙️ רעיונות שיפור מובילים:\n`
          topIdeas.forEach((idea: any, i: number) => {
            message += `  ${i + 1}. ${idea.idea}\n`
            message += `     (${idea.category}) - ${idea.implementation_hint || ''}\n`
          })
          message += '\n'
        }
      }
    }

    // Editor brain info
    try {
      const brainPath = editorBrainPath
      if (fs.existsSync(brainPath)) {
        const brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'))
        message += `🧠 מוח העורך v${brain.version}:\n`
        message += `  📝 פרומפט: ${brain.stats?.masterPromptWords || 0} מילים (${brain.stats?.masterPromptChars || 0} תווים)\n`
        message += `  מבוסס על: ${brain.version} תובנות\n`
        message += `  🎬 עריכה: ${brain.stats?.editingRules || 0}\n`
        message += `  📱 סושיאל: ${brain.stats?.socialInsights || 0}\n`
        message += `  📣 שיווק: ${brain.stats?.marketingInsights || 0}\n`
        message += `  💰 ממומן: ${brain.stats?.paidAdsInsights || 0}\n`
        message += `  🔥 טרנדים: ${brain.stats?.activeTrends || 0}\n`
        message += `  ⚙️ רעיונות: ${brain.stats?.systemIdeas || 0}\n`

        if (brain.lastOptimizedIsrael) {
          message += `\n🔧 אופטימיזציה אחרונה: ${brain.lastOptimizedIsrael}\n`
          if (brain.optimizationHistory?.length > 0) {
            const last = brain.optimizationHistory[brain.optimizationHistory.length - 1]
            message += `  ${last.beforeWords} → ${last.afterWords} מילים (${last.reduction} קיצור)\n`
          }
        }

        if (brain.masterPrompt) {
          message += `\n📋 תצוגה מקדימה:\n`
          message += `"${brain.masterPrompt.substring(0, 300)}..."\n`
        }
        message += '\n'
      }
    } catch {}

    // Trends
    const trends = state.trendInsights || {}
    message += `🔥 טרנדים:\n`
    message += `  פעילים: ${(trends.activeTrends || []).length}\n`
    message += `  פגי תוקף: ${(trends.expiredTrends || []).length}\n`
    message += `  כללים נצחיים: ${(trends.evergreenRules || []).length}\n`
    if ((trends.activeTrends || []).length > 0) {
      message += `\n  טרנדים פעילים:\n`
      trends.activeTrends.forEach((t: any) => {
        const lifecycle = t.lifecycle === 'rising' ? '📈' : t.lifecycle === 'peak' ? '🔝' : '📉'
        message += `    ${lifecycle} ${t.trend_name} (${t.techniques?.length || 0} טכניקות)\n`
      })
    }
    message += '\n'

    // Per category breakdown
    message += `📂 תובנות לפי קטגוריה:\n`
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        message += `  • ${cat}: ${count} תובנות\n`
      })
    message += '\n'

    // Cost report
    const totalSessions = state.learningMetrics?.totalSessions || state.sessionHistory?.length || 0
    message += `💰 עלויות:\n`
    message += `  היום: $${safe(state.dailyCost || state.dailyGptCost)} / $${state.dailyBudget || DAILY_GPT_COST_LIMIT}\n`
    message += `  החודש: $${safe(state.monthlyCost || state.monthlyGptCost)} / $${state.monthlyBudget || MONTHLY_GPT_COST_LIMIT}\n`
    message += `  כולל (כל הזמנים): $${safe(state.totalCost)}\n`
    message += `  סשנים: ${totalSessions}\n`
    message += `  ממוצע לסשן: $${totalSessions > 0 ? safe((state.totalCost || 0) / totalSessions) : '0.000'}\n`
    message += `  קריאות היום: ${state.dailyGptCalls || 0} / ${DAILY_GPT_CALLS_LIMIT}\n`
    message += `  YouTube API: ${state.dailyYoutubeUnits || 0} יחידות (היום)\n\n`

    // Missing features summary
    const missing = state.missingFeatures || []
    if (missing.length > 0) {
      const critical = missing.filter((f: any) => f.priority === 'critical').length
      const important = missing.filter((f: any) => f.priority === 'important').length
      const nice = missing.filter((f: any) => f.priority === 'nice_to_have').length

      message += `⚠️ פיצ'רים חסרים: ${missing.length}\n`
      message += `  🔴 קריטי: ${critical}\n`
      message += `  🟡 חשוב: ${important}\n`
      message += `  🟢 נחמד: ${nice}\n\n`
    }

    // Next learning session
    const israelHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false
    }))

    message += '═'.repeat(30) + '\n'
    if (israelHour < 7) {
      message += '⏰ למידה הבאה: היום 07:00'
    } else if (israelHour < 19) {
      message += '⏰ למידה הבאה: היום 19:00'
    } else {
      message += '⏰ למידה הבאה: מחר 07:00'
    }

    await sendTelegram(message)

  } catch (e: any) {
    console.error('[REPORT] Error:', e.message)
    await sendTelegram(`❌ שגיאה ביצירת דוח: ${e.message?.substring(0, 200)}`)
  }
}

// ==================== EXTERNAL API v1 ====================

// Job tracking for external API
interface ApiJobStatus {
  jobId: string
  status: 'processing' | 'done' | 'error'
  step: string
  progress: number
  videoUrl?: string
  duration?: number
  format?: string
  error?: string
  createdAt: number
}

const apiJobs = new Map<string, ApiJobStatus>()

// Helper: update job status and log
function updateJobStatus(jobId: string, updates: Partial<ApiJobStatus>) {
  const job = apiJobs.get(jobId)
  if (job) {
    Object.assign(job, updates)
    if (updates.step || updates.progress !== undefined) {
      console.log(`[API] Job ${jobId}: step=${job.step} (${job.progress}%)`)
    }
  }
}

// Helper: internal API call to existing pipeline endpoints
async function callPipeline(endpoint: string, body: any): Promise<any> {
  const res = await fetch(`http://localhost:${PORT}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(errBody.message || errBody.error || `Pipeline ${endpoint} failed: ${res.status}`)
  }
  return res.json()
}

// Helper: download video from URL to local uploads folder
async function downloadVideoForApi(videoUrl: string, jobId: string): Promise<string> {
  const ext = path.extname(new URL(videoUrl).pathname) || '.mp4'
  const localFilename = `api-${jobId}-source${ext}`
  const localPath = path.join(uploadsDir, localFilename)

  const response = await fetch(videoUrl)
  if (!response.ok) throw new Error(`Failed to download video: ${response.status} ${response.statusText}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(localPath, buffer)
  console.log(`[API] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB to ${localFilename}`)
  return localPath
}

// Run the full auto-editor pipeline server-side
async function runEditPipeline(jobId: string, localFilePath: string, options: {
  prompt?: string
  subtitleStyle?: string
  colorGrade?: string
  format?: string
  duration?: number | 'auto'
  brollModel?: string
  music?: boolean
  logo?: string
}): Promise<{ videoUrl: string; duration: number; format: string }> {
  const fileUrl = `http://localhost:${PORT}/uploads/${path.basename(localFilePath)}`
  const targetFormat = options.format || 'reels'

  // Step 1: Transcribe
  updateJobStatus(jobId, { step: 'transcribing', progress: 5 })
  const transcription = await callPipeline('auto-editor/transcribe', {
    fileUrl,
    language: 'he',
  })

  // Step 2: Verify speakers
  updateJobStatus(jobId, { step: 'verifying_speakers', progress: 15 })
  let verifiedSegments = transcription.segments
  try {
    const verification = await callPipeline('auto-editor/verify-speakers', {
      segments: transcription.segments,
      videoUrl: fileUrl,
    })
    verifiedSegments = verification.segments || transcription.segments
  } catch (e: any) {
    console.warn(`[API] Job ${jobId}: Speaker verification failed (non-critical): ${e.message}`)
  }

  // Step 3: Visual analysis
  updateJobStatus(jobId, { step: 'analyzing', progress: 25 })
  let visualAnalysis: any = {}
  try {
    visualAnalysis = await callPipeline('auto-editor/analyze-visuals', {
      videoUrl: fileUrl,
    })
  } catch (e: any) {
    console.warn(`[API] Job ${jobId}: Visual analysis failed (non-critical): ${e.message}`)
  }

  // Step 4: Identify presenter
  updateJobStatus(jobId, { step: 'analyzing', progress: 30 })
  let mainPresenter = transcription.mainSpeaker || 'דובר 1'
  try {
    const presenterResult = await callPipeline('auto-editor/identify-presenter', {
      transcript: { segments: verifiedSegments },
      visualAnalysis,
      speakerTimes: transcription.speakerTimes || {},
      framesDir: visualAnalysis.framesDir || '',
    })
    mainPresenter = presenterResult.mainPresenter || mainPresenter
  } catch (e: any) {
    console.warn(`[API] Job ${jobId}: Presenter identification failed (non-critical): ${e.message}`)
  }

  // Step 5: Enrich prompt
  updateJobStatus(jobId, { step: 'planning', progress: 35 })
  let enrichedPrompt = options.prompt || 'ערוך את הסרטון באופן מקצועי'
  try {
    const enrichResult = await callPipeline('auto-editor/enrich-prompt', {
      prompt: enrichedPrompt,
      transcript: { segments: verifiedSegments, mainSpeaker: mainPresenter },
      visualAnalysis,
    })
    enrichedPrompt = enrichResult.enrichedPrompt || enrichResult.prompt || enrichedPrompt
  } catch (e: any) {
    console.warn(`[API] Job ${jobId}: Prompt enrichment failed (non-critical): ${e.message}`)
  }

  // Step 6: Creative brief
  updateJobStatus(jobId, { step: 'planning', progress: 42 })
  const targetDuration = options.duration === 'auto' || !options.duration ? -1 : options.duration
  const creativeBrief = await callPipeline('auto-editor/creative-brief', {
    transcript: { segments: verifiedSegments, mainSpeaker: mainPresenter, totalDuration: transcription.totalDuration },
    prompt: enrichedPrompt,
    targetDuration,
    contentType: 'general',
    visualAnalysis,
    numberOfVideos: 1,
  })

  // Step 7: Technical plan
  updateJobStatus(jobId, { step: 'planning', progress: 50 })
  const technicalPlan = await callPipeline('auto-editor/technical-plan', {
    creativeBrief: creativeBrief.brief || creativeBrief,
    transcript: { segments: verifiedSegments, mainSpeaker: mainPresenter, totalDuration: transcription.totalDuration },
    targetDuration: targetDuration === -1 ? (creativeBrief.brief?.videos?.[0]?.duration || 60) : targetDuration,
    platforms: [targetFormat],
  })

  // Step 8: Generate B-Roll
  updateJobStatus(jobId, { step: 'generating_broll', progress: 55 })
  const brollPrompts = (technicalPlan.plan?.videos?.[0]?.brollMoments || technicalPlan.plan?.videos?.[0]?.broll || [])
  const brollClips: string[] = []
  const brollModel = options.brollModel || 'kling'

  for (const brollItem of brollPrompts.slice(0, 5)) {
    try {
      const brollResult = await callPipeline('generate-broll', {
        prompt: brollItem.prompt || brollItem.description || '',
        model: brollModel,
      })
      if (brollResult.url) brollClips.push(brollResult.url)
    } catch (e: any) {
      console.warn(`[API] Job ${jobId}: B-Roll generation failed for one clip: ${e.message}`)
    }
  }

  // Step 9: Find music
  let musicUrl = ''
  if (options.music !== false) {
    try {
      const musicResult = await callPipeline('find-music', {
        query: creativeBrief.brief?.musicSuggestion || creativeBrief.brief?.music_suggestion || 'upbeat background',
      })
      musicUrl = musicResult.url || musicResult.downloadUrl || ''
    } catch (e: any) {
      console.warn(`[API] Job ${jobId}: Music search failed (non-critical): ${e.message}`)
    }
  }

  // Step 10: Process video (FFmpeg pipeline)
  updateJobStatus(jobId, { step: 'processing', progress: 65 })
  const plan = technicalPlan.plan || technicalPlan
  const videoPlan = plan.videos?.[0] || plan

  // Build platform specs
  const platformSpecs: Record<string, { w: number; h: number; ratio: string }> = {
    reels: { w: 1080, h: 1920, ratio: '9:16' },
    tiktok: { w: 1080, h: 1920, ratio: '9:16' },
    shorts: { w: 1080, h: 1920, ratio: '9:16' },
    story: { w: 1080, h: 1920, ratio: '9:16' },
    youtube: { w: 1920, h: 1080, ratio: '16:9' },
  }

  const processResult = await callPipeline('auto-editor/process', {
    videoUrl: fileUrl,
    videoPlan: {
      cuts: (videoPlan.cuts || []).map((c: any) => ({
        keepStart: c.keepStart ?? c.keep_start ?? c.sourceStart ?? 0,
        keepEnd: c.keepEnd ?? c.keep_end ?? c.sourceEnd ?? 0,
      })),
      zooms: videoPlan.zooms || videoPlan.zoom_effects || [],
      camera_angles: videoPlan.cameraAngles || videoPlan.camera_angles || [],
      color_grade: options.colorGrade || videoPlan.colorGrade || videoPlan.color_grade || 'cinematic',
      transitions: videoPlan.transitions || ['fade'],
      speakers: videoPlan.speakers || videoPlan.lower_thirds || [],
      graphics: videoPlan.graphics || videoPlan.overlays || [],
      brollPlacements: (videoPlan.brollMoments || videoPlan.broll || []).map((b: any, i: number) => ({
        outputTimestamp: b.time || b.insert_at || b.atTime || (i * 15),
        duration: b.duration || 4,
        assetIndex: i,
      })),
    },
    targetDuration: targetDuration === -1 ? (videoPlan.duration || 60) : targetDuration,
    platforms: [targetFormat],
    musicUrl,
    backgroundImage: null,
    includeSubtitles: true,
    animatedSubtitles: true,
    animationStyle: options.subtitleStyle || 'karaoke',
    transcript: { segments: verifiedSegments, mainSpeaker: mainPresenter, totalDuration: transcription.totalDuration },
    brollAssets: brollClips.map((url, i) => ({
      url,
      insertAt: brollPrompts[i]?.time || brollPrompts[i]?.insert_at || (i * 15),
      duration: brollPrompts[i]?.duration || 4,
      keepAudio: true,
    })),
    skipPlatformExport: false,
    logo: options.logo ? { serverUrl: options.logo } : undefined,
  })

  // Step 11: Export
  updateJobStatus(jobId, { step: 'exporting', progress: 90 })

  // Find the main output file
  const outputFile = processResult.files?.[0]
  if (!outputFile?.url) {
    throw new Error('Processing completed but no output file was generated')
  }

  const outputUrl = outputFile.url
  const outputDuration = processResult.files?.[0]?.duration || targetDuration || 0

  return {
    videoUrl: outputUrl,
    duration: typeof outputDuration === 'number' ? outputDuration : parseFloat(String(outputDuration)) || 0,
    format: targetFormat,
  }
}

// Cleanup temporary files for an API job
function cleanupApiJobFiles(jobId: string) {
  try {
    const files = fs.readdirSync(uploadsDir).filter(f => f.includes(`api-${jobId}`))
    for (const f of files) {
      try { fs.unlinkSync(path.join(uploadsDir, f)) } catch {}
    }
    if (files.length > 0) console.log(`[API] Cleaned up ${files.length} temp files for job ${jobId}`)
  } catch {}
}

// Validate API key
function validateApiKey(req: any): boolean {
  const envKey = process.env.AUTO_EDITOR_API_KEY
  if (!envKey) return false

  // Check body.apiKey
  if (req.body?.apiKey === envKey) return true

  // Check Authorization header (Bearer token)
  const authHeader = req.headers?.authorization || ''
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === envKey) return true

  return false
}

// POST /api/v1/edit — External API endpoint for auto-editing
app.post('/api/v1/edit', async (req, res) => {
  // Check if API is enabled
  if (!process.env.AUTO_EDITOR_API_KEY) {
    return res.status(503).json({ error: 'External API is disabled. Set AUTO_EDITOR_API_KEY to enable.' })
  }

  // Authenticate
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  // Validate required fields
  const { videoUrl, prompt, settings = {}, callbackUrl } = req.body
  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' })
  }

  // Generate job ID
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Initialize job status
  apiJobs.set(jobId, {
    jobId,
    status: 'processing',
    step: 'downloading',
    progress: 0,
    format: settings.format || 'reels',
    createdAt: Date.now(),
  })

  console.log(`[API] Received edit request: jobId=${jobId}, videoUrl=${videoUrl}, format=${settings.format || 'reels'}`)

  // Pipeline execution function
  const executePipeline = async () => {
    try {
      // Download video
      updateJobStatus(jobId, { step: 'downloading', progress: 2 })
      const localFilePath = await downloadVideoForApi(videoUrl, jobId)

      // Run full pipeline
      const result = await runEditPipeline(jobId, localFilePath, {
        prompt,
        subtitleStyle: settings.subtitleStyle || 'bold_pop',
        colorGrade: settings.colorGrade || 'cinematic',
        format: settings.format || 'reels',
        duration: settings.duration || 'auto',
        brollModel: settings.brollModel || 'kling',
        music: settings.music !== false,
        logo: settings.logo,
      })

      // Update job as done
      updateJobStatus(jobId, {
        status: 'done',
        step: 'done',
        progress: 100,
        videoUrl: result.videoUrl,
        duration: result.duration,
        format: result.format,
      })

      // Cleanup temp source files
      cleanupApiJobFiles(jobId)

      // If callback URL, POST result
      if (callbackUrl) {
        try {
          await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId,
              status: 'done',
              videoUrl: result.videoUrl,
              duration: result.duration,
              format: result.format,
            }),
          })
          console.log(`[API] Job ${jobId}: Callback sent to ${callbackUrl}`)
        } catch (cbErr: any) {
          console.error(`[API] Job ${jobId}: Callback failed: ${cbErr.message}`)
        }
      }

      return result
    } catch (error: any) {
      console.error(`[API] Job ${jobId}: Pipeline error: ${error.message}`)
      updateJobStatus(jobId, {
        status: 'error',
        error: error.message,
      })

      cleanupApiJobFiles(jobId)

      // If callback URL, POST error
      if (callbackUrl) {
        try {
          await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId,
              status: 'error',
              error: error.message,
            }),
          })
        } catch {}
      }

      throw error
    }
  }

  // Async mode (with callback)
  if (callbackUrl) {
    // Start pipeline in background, return immediately
    executePipeline().catch(() => {}) // errors handled inside
    return res.json({ status: 'processing', jobId })
  }

  // Sync mode (no callback) — wait for result with 10 minute timeout
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Processing timeout (10 minutes)')), 10 * 60 * 1000)
    )
    const result = await Promise.race([executePipeline(), timeoutPromise])
    return res.json({
      status: 'done',
      jobId,
      videoUrl: result.videoUrl,
      duration: result.duration,
      format: result.format,
    })
  } catch (error: any) {
    const job = apiJobs.get(jobId)
    if (job?.status === 'error') {
      return res.status(500).json({ status: 'error', jobId, error: job.error })
    }
    return res.status(500).json({ status: 'error', jobId, error: error.message })
  }
})

// GET /api/v1/edit/status/:jobId — Check job status
app.get('/api/v1/edit/status/:jobId', (req, res) => {
  // Check if API is enabled
  if (!process.env.AUTO_EDITOR_API_KEY) {
    return res.status(503).json({ error: 'External API is disabled' })
  }

  // Authenticate (via query param or header)
  const apiKey = (req.query.apiKey as string) || ''
  const authHeader = req.headers.authorization || ''
  const envKey = process.env.AUTO_EDITOR_API_KEY

  if (apiKey !== envKey && (!authHeader.startsWith('Bearer ') || authHeader.slice(7).trim() !== envKey)) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  const { jobId } = req.params
  const job = apiJobs.get(jobId)

  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }

  if (job.status === 'done') {
    return res.json({
      status: 'done',
      videoUrl: job.videoUrl,
      duration: job.duration,
      format: job.format,
    })
  }

  if (job.status === 'error') {
    return res.json({
      status: 'error',
      error: job.error,
    })
  }

  return res.json({
    status: 'processing',
    step: job.step,
    progress: job.progress,
  })
})

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 סטודיו AI Server running on port ${PORT}`)
  console.log(`   OpenAI:      ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log('   OpenAI Chat Model: gpt-5.4')
  console.log('   OpenAI Transcribe Model: gpt-4o-transcribe-diarize')
  const hasDeepgram = !!process.env.DEEPGRAM_API_KEY
  console.log(`   Transcription: ${hasDeepgram ? '✅ Deepgram Nova-3 (multi-language + diarization)' : '⚠️ GPT-4o-transcribe (fallback)'}`)
  if (!hasDeepgram) {
    console.log('   💡 Tip: Add DEEPGRAM_API_KEY to .env for multi-language transcription with speaker diarization')
  }
  console.log(`   ElevenLabs:  ${process.env.ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   DeepL:       ${process.env.DEEPL_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Gemini (Nano Banana + Veo): ${process.env.GEMINI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log('   Gemini Image: gemini-3-pro-image-preview (Nano Banana Pro)')
  console.log('   Gemini Video: veo-3.1-generate-preview (Veo 3.1)')
  console.log(`   Seedance (kie.ai): ${process.env.KIE_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Pixabay:     ${process.env.PIXABAY_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   YouTube API: ${process.env.YOUTUBE_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Telegram:    ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Connected' : '❌ Not configured'}`)

  // External API check
  if (process.env.AUTO_EDITOR_API_KEY) {
    console.log('   External API: ✅ Enabled (POST /api/v1/edit)')
  } else {
    console.log('[API] Warning: AUTO_EDITOR_API_KEY not set. External API is disabled.')
  }

  // Check FFmpeg availability and auto-editor dependencies
  console.log('Checking FFmpeg...')
  try {
    const ff = getFFmpeg()
    const ver = execSync(`"${ff}" -version`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().split('\n')[0]
    console.log('FFmpeg OK:', ver)

    // Auto-editor dependency check
    const filtersOut = execSync(`"${ff}" -filters 2>&1`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).toString()
    const hasSubtitles = filtersOut.includes('subtitles')
    const hasDrawtext = filtersOut.includes('drawtext')
    const hasOverlay = filtersOut.includes('overlay')
    const hasAss = filtersOut.includes(' ass ')
    console.log('[AUTO-EDITOR] Dependency check:')
    console.log(`  FFmpeg subtitles: ${hasSubtitles ? '✅' : '❌ (Hebrew subs will use drawtext fallback)'}`)
    console.log(`  FFmpeg drawtext:  ${hasDrawtext ? '✅' : '❌'}`)
    console.log(`  FFmpeg overlay:   ${hasOverlay ? '✅' : '❌'}`)
    console.log(`  FFmpeg ass:       ${hasAss ? '✅' : '❌'}`)
    console.log(`  Deepgram:         ${process.env.DEEPGRAM_API_KEY ? '✅' : '❌'}`)
    console.log(`  OpenAI:           ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`)
    console.log(`  Gemini:           ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`)
    console.log(`  Seedance:         ${process.env.KIE_API_KEY ? '✅' : '❌'}`)
    console.log(`  Pixabay:          ${process.env.PIXABAY_API_KEY ? '✅' : '❌'}`)
    try {
      const brainVersion = getEditorBrainPrompt().length > 100 ? '✅ loaded' : '❌ empty'
      console.log(`  Editor brain:     ${brainVersion}`)
    } catch { console.log('  Editor brain:     ❌ failed to load') }
  } catch {
    console.error('FFmpeg NOT FOUND - transcription will fail!')
  }

  // Social Learning Agent
  console.log('[LEARN] Social Learning Agent: ✅ Active')
  console.log(`[LEARN]   Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log('[LEARN]   Schedule: 03:00 (optimize) + 07:00 (learn) + 19:00 (learn) Israel time')
  console.log(`[LEARN]   Budget: $${DAILY_GPT_COST_LIMIT}/day, ${DAILY_GPT_CALLS_LIMIT} calls/day, $${MONTHLY_GPT_COST_LIMIT}/month`)
  console.log(`[LEARN]   Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✅' : '❌'}`)
  const totalCategories = Object.keys(LEARNING_CATEGORIES).length;
  const totalQueries = Object.values(LEARNING_CATEGORIES).reduce((sum, cats) => sum + cats.length, 0);
  console.log(`[LEARN]   Categories: ${totalCategories} across 4 domains (${totalQueries} unique queries)`)

  // Check yt-dlp availability
  try {
    execSync('which yt-dlp', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    console.log('[LEARN]   yt-dlp: ✅ Available (full video analysis)')
  } catch {
    console.log('[LEARN]   yt-dlp: ❌ Not available (thumbnail-only analysis)')
  }

  // Test OpenAI API connectivity at startup
  (async () => {
    try {
      const ai = await getOpenAI()
      if (ai) {
        const test = await ai.chat.completions.create({
          model: 'gpt-5.4',
          max_completion_tokens: 10,
          messages: [{ role: 'user', content: 'Say OK' }],
        })
        console.log('[OPENAI] ✅ Connected, response:', test.choices[0].message.content)
      } else {
        console.log('[OPENAI] ❌ No API key configured')
      }
    } catch (e: any) {
      console.error('[OPENAI] ❌ FAILED:', JSON.stringify({
        message: e.message,
        code: e.code,
        status: e.status,
        type: e.type,
        cause: e.cause?.message,
        errno: e.cause?.errno,
        syscall: e.cause?.syscall,
      }))

      // Test raw connectivity
      try {
        const raw = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${(process.env.OPENAI_API_KEY || '').trim()}` },
          signal: AbortSignal.timeout(15000),
        })
        console.log('[OPENAI] Raw fetch status:', raw.status)
      } catch (fe: any) {
        console.error('[OPENAI] Raw fetch failed:', fe.message, fe.cause?.message)
      }
    }
  })()

  logBrainStatus()

  // Sync brain from Railway on startup (development only)
  console.log(`[BRAIN] Auto-sync from Railway: ${process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT ? '✅ Enabled' : '⏭️ Skipped (is Railway)'}`)
  if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT) {
    setTimeout(async () => {
      await syncBrainFromRailway()
    }, 5000)
  }

  // Schedule learning at 7:00 + 19:00 Israel time (handles restart catch-up internally)
  scheduleDailyLearning()

  // Start Telegram bot listener for commands (production only to avoid conflicts with Railway)
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    console.log('[TELEGRAM BOT] Commands: דוח / סטטוס / שרת / צא ללמוד / report')
    startTelegramBotListener()
    console.log('[TELEGRAM BOT] Listening for commands (production mode)')
  } else {
    console.log('[TELEGRAM BOT] Disabled in development (use Railway for Telegram)')
  }
})
