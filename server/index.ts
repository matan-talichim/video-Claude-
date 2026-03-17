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
import { AssemblyAI } from 'assemblyai'

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

// AssemblyAI client (transcription + speaker diarization)
const assemblyai = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
})

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
    } else if (filePath.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    }
  }
}))

// ==================== API STATUS ====================

app.get('/api/status', async (_req, res) => {
  const status = {
    openai: { connected: !!process.env.OPENAI_API_KEY, chatModel: 'gpt-5.4', transcribeModel: 'gpt-4o-transcribe-diarize', features: ['Chat (GPT-5.4)', 'Transcribe (Diarize)', 'DALL-E', 'Whisper'] },
    assemblyai: {
      connected: !!process.env.ASSEMBLYAI_API_KEY,
      provider: 'AssemblyAI',
      model: 'Universal-2 + Speaker Diarization',
      note: process.env.ASSEMBLYAI_API_KEY ? 'Premium diarization active' : 'Not configured - using GPT-4o fallback',
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

  // If AssemblyAI is configured, use it for better diarization
  if (process.env.ASSEMBLYAI_API_KEY && req.file) {
    try {
      const inputPath = req.file.path
      const timestamp = Date.now()

      console.log('[TRANSCRIBE] Using AssemblyAI for:', req.file.originalname, (req.file.size / 1024 / 1024).toFixed(1) + 'MB')

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

      console.log('[TRANSCRIBE] Sending to AssemblyAI (transcription + speaker diarization)...')

      const transcript = await assemblyai.transcripts.transcribe({
        audio: fileToUpload,
        speaker_labels: true,
        language_code: 'he',
        punctuate: true,
        format_text: true,
      })

      if (transcript.status === 'error') {
        throw new Error(transcript.error || 'Transcription failed')
      }

      console.log(`[TRANSCRIBE] AssemblyAI done: ${transcript.words?.length || 0} words, ${transcript.utterances?.length || 0} utterances`)

      const utterances = transcript.utterances || []

      // Build segments from utterances
      const rawSegments = utterances.map((utt: any, i: number) => ({
        id: i,
        start: utt.start / 1000,
        end: utt.end / 1000,
        text: utt.text,
        speaker: `דובר ${utt.speaker}`,
        words: (utt.words || []).map((w: any) => ({
          word: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
        })),
      }))

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

      console.log('[TRANSCRIBE] Done:', segments.length, 'segments,', speakers.length, 'speakers, model: assemblyai')
      console.log(`[TRANSCRIBE] Confidence: ${((transcript.confidence || 0) * 100).toFixed(1)}%`)

      // Cleanup
      try { fs.unlinkSync(inputPath) } catch {}
      try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path) } catch {}

      return res.json({
        text: transcript.text || '',
        duration,
        language: 'he',
        segments,
        speakers,
        model: 'assemblyai',
        confidence: transcript.confidence || 0,
      })
    } catch (assemblyErr: any) {
      console.warn('[TRANSCRIBE] AssemblyAI failed, falling back to GPT-4o:', assemblyErr.message)
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
8. בעיות טכניות (חושך, טשטוש, חיתוך לא טוב)
9. זהה את הפרזנטור הראשי - האדם שמופיע מול המצלמה ומדבר אליה (לא צוות הפקה מאחורי המצלמה)`

    const brainContextVisual = getEditorBrainPrompt()
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
      "person_speaking_to_camera": true
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

    const enrichBrainContext = getEditorBrainPrompt('marketing')
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

    if (presenterSegments.length === 0) {
      return res.json({
        cleanedSegments: transcript?.segments || [],
        summary: { error: 'No presenter segments found' },
        originalCount: transcript?.segments?.length || 0,
        cleanedCount: transcript?.segments?.length || 0,
      })
    }

    const cleanPrompt = `You are a professional video editor cleaning a transcript for editing.

TRANSCRIPT (presenter segments only):
${presenterSegments.map((s: any, i: number) =>
  `[${i}] ${(s.start || 0).toFixed(1)}s-${(s.end || 0).toFixed(1)}s: "${s.text}"`
).join('\n')}

Your job: Mark which segments to KEEP and which to REMOVE.

REMOVE these:
1. Filler words: "אממ", "אה", "כאילו", "בעצם", "נו", "אוקיי אז"
2. Stutters: repeated words or syllables at start of sentences
3. False starts: when a sentence starts, stops, and restarts differently
4. Retakes: when the same idea is said twice and the second is better (remove the first)
5. Crew directions: "עוד פעם", "מוכן?", "שנייה", "בוא נעשה עוד take"
6. Unnatural long pauses (gaps > 2 seconds inside a sentence)
7. Incomplete sentences that don't add value

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

    const creativeBrainContext = getEditorBrainPrompt(contentType)
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

    const { creativeBrief, transcript, targetDuration, platforms, promptEvolution, socialLearningRules } = req.body
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

    const techBrainContext = getEditorBrainPrompt()
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
      temperature: 0.3,
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

app.post('/api/generate-background', async (req, res) => {
  try {
    const ai = getGemini()
    if (!ai) return res.status(400).json({ message: 'Gemini API Key לא מוגדר. הוסף GEMINI_API_KEY ב-.env' })

    const { prompt, aspectRatio = '9:16', transcript } = req.body
    if (!prompt) return res.status(400).json({ message: 'חסר prompt' })

    // If prompt looks generic, try to enrich from transcript
    let bgPrompt = prompt
    const genericPatterns = /^(modern|professional|abstract|background|office|business)\s/i
    if (genericPatterns.test(prompt) && transcript) {
      const topicSummary = typeof transcript === 'string'
        ? transcript.substring(0, 200)
        : (transcript.segments || []).slice(0, 5).map((s: any) => s.text).join(' ').substring(0, 200)
      bgPrompt = `Professional background image related to: ${topicSummary}. Photorealistic, shallow depth of field, soft lighting, suitable as blurred background. ${prompt}`
      console.log('[NANO BANANA] Enriched generic prompt with transcript context')
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
// Uses AssemblyAI for premium speaker diarization when configured, falls back to GPT-4o

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

app.post('/api/auto-editor/transcribe', async (req, res) => {
  const { fileUrl } = req.body
  const timestamp = Date.now()

  console.log('[TRANSCRIBE] Starting with AssemblyAI...')
  console.log('[TRANSCRIBE] File:', fileUrl)

  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.error('[TRANSCRIBE] ASSEMBLYAI_API_KEY not set, falling back to GPT-4o')
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

    // Step 2: Extract audio from video (AssemblyAI works best with audio files)
    const audioPath = path.join(uploadsDir, `audio_extract_${timestamp}.mp3`)

    try {
      const ffmpeg = getFFmpeg()
      execSync(
        `"${ffmpeg}" -i "${localFilePath}" -vn -c:a libmp3lame -b:a 128k -ar 16000 -ac 1 "${audioPath}" -y`,
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      )
      console.log(`[TRANSCRIBE] Audio extracted: ${(fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1)}MB`)
    } catch (e: any) {
      console.warn('[TRANSCRIBE] Audio extraction failed, using original file:', e.message?.substring(0, 100))
    }

    const fileToUpload = fs.existsSync(audioPath) ? audioPath : localFilePath

    // Step 3: Transcribe with AssemblyAI (transcription + diarization in one call)
    console.log('[TRANSCRIBE] Sending to AssemblyAI (transcription + speaker diarization)...')

    const transcript = await assemblyai.transcripts.transcribe({
      audio: fileToUpload,
      speaker_labels: true,
      language_code: 'he',
      punctuate: true,
      format_text: true,
    })

    if (transcript.status === 'error') {
      console.error('[TRANSCRIBE] AssemblyAI error:', transcript.error)
      throw new Error(transcript.error || 'Transcription failed')
    }

    console.log(`[TRANSCRIBE] AssemblyAI done: ${transcript.words?.length || 0} words, ${transcript.utterances?.length || 0} utterances`)

    // Step 4: Convert AssemblyAI format to our format
    const utterances = transcript.utterances || []
    const words = transcript.words || []

    // Build segments from utterances (each utterance = one speaker's continuous speech)
    const segments = utterances.map((utt: any, i: number) => ({
      id: i,
      start: utt.start / 1000,
      end: utt.end / 1000,
      text: utt.text,
      speaker: `דובר ${utt.speaker}`,
      words: (utt.words || []).map((w: any) => ({
        word: w.text,
        start: w.start / 1000,
        end: w.end / 1000,
        confidence: w.confidence,
        speaker: `דובר ${w.speaker}`,
      })),
    }))

    // Step 5: Calculate speaker times
    const speakerTimes: Record<string, number> = {}
    segments.forEach((seg: any) => {
      const speaker = seg.speaker
      speakerTimes[speaker] = (speakerTimes[speaker] || 0) + (seg.end - seg.start)
    })

    // Sort speakers by time (most speaking first)
    const sortedSpeakers = Object.entries(speakerTimes)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([speaker, time]) => ({
        speaker,
        time: Math.round((time as number) * 10) / 10,
      }))

    const uniqueSpeakers = [...new Set(segments.map((s: any) => s.speaker))]
    const totalDuration = segments.length > 0
      ? segments[segments.length - 1].end
      : 0

    console.log(`[TRANSCRIBE] Speakers: ${uniqueSpeakers.length}`)
    console.log('[TRANSCRIBE] Speaker times:', speakerTimes)
    console.log(`[TRANSCRIBE] Total duration: ${totalDuration.toFixed(1)}s`)

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
    console.log(`[TRANSCRIBE] Preliminary main speaker (by time): ${mainSpeaker}`)

    // Run visual cross-reference to identify presenter
    try {
      const presenterResult = await identifyPresenterWithVisualCrossReference(
        { segments: renamedSegments },
        localFilePath,
        renamedSpeakerTimes,
        timestamp
      )
      mainSpeaker = presenterResult.presenter
      presenterConfidence = presenterResult.confidence
      console.log(`[TRANSCRIBE] Presenter (visual cross-ref): ${mainSpeaker} (${presenterConfidence})`)
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

      console.log(`[TRANSCRIBE] Extracting sample for ${speaker.speaker}: ${sampleStart.toFixed(1)}s-${(sampleStart + sampleDuration).toFixed(1)}s → ${path.basename(sampleFile)}`)

      try {
        const cmd = `"${ffmpegForSamples}" -i "${localFilePath}" -ss ${sampleStart.toFixed(3)} -t ${sampleDuration.toFixed(3)} -vn -c:a libmp3lame -b:a 128k "${sampleFile}" -y`
        execSync(cmd, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 })

        if (fs.existsSync(sampleFile)) {
          const fileSize = fs.statSync(sampleFile).size
          console.log(`[TRANSCRIBE] Sample file created: ${path.basename(sampleFile)} (${fileSize} bytes)`)

          if (fileSize > 1000) {
            const sampleUrl = `http://localhost:${process.env.PORT || PORT}/uploads/${path.basename(sampleFile)}`
            speakerSamples[speaker.speaker] = sampleUrl
            console.log(`[TRANSCRIBE] ✅ Sample URL: ${sampleUrl}`)
          } else {
            console.warn(`[TRANSCRIBE] ❌ Sample too small: ${fileSize} bytes`)
          }
        } else {
          console.warn(`[TRANSCRIBE] ❌ Sample file not created`)
        }
      } catch (e: any) {
        console.error(`[TRANSCRIBE] ❌ FFmpeg failed for ${speaker.speaker}:`, e.stderr?.substring(0, 200) || e.message?.substring(0, 200))
      }
    }

    // Log final samples map
    console.log('[TRANSCRIBE] Speaker samples:', JSON.stringify(
      Object.fromEntries(
        Object.entries(speakerSamples).map(([k, v]) => [k, v ? '✅' : '❌'])
      )
    ))

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
      text: transcript.text || '',
      model: 'assemblyai',
      wordCount: words.length,
      confidence: transcript.confidence || 0,
      autoDetected: true,
    }

    console.log(`[TRANSCRIBE] Done: ${renamedSegments.length} segments, ${uniqueSpeakers.length} speakers, ${totalDuration.toFixed(1)}s, model: assemblyai`)
    console.log(`[TRANSCRIBE] Confidence: ${((transcript.confidence || 0) * 100).toFixed(1)}%`)

    // Clean up extracted audio
    try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath) } catch {}
    // Clean up temp source file
    if (isTemp && fs.existsSync(localFilePath)) try { fs.unlinkSync(localFilePath) } catch {}

    res.json(response)

  } catch (error: any) {
    console.error('[TRANSCRIBE] AssemblyAI failed:', error.message)

    // Fallback to GPT-4o-transcribe-diarize
    console.log('[TRANSCRIBE] Falling back to GPT-4o-transcribe-diarize...')
    return handleGPTAutoTranscribe(req, res)
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
  // MarginV=120 positions subtitles below chin, not at very bottom of screen
  modern: 'Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,120,177',
  karaoke: 'Style: Default,Arial,26,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,120,177',
  bold_white: 'Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,4,0,2,10,10,120,177',
  minimal: 'Style: Default,Arial,22,&H00FFFFFF,&H00000000,&H00000000,&H40000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,120,177',
  colorful: 'Style: Default,Arial,26,&H0000D7FF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,120,177',
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
      ass += `Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,120,177\n`
      break
    case 'pop':
      ass += `Style: Default,Arial,55,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,60,177\nStyle: Pop,Arial,70,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,20,20,120,177\n`
      break
    case 'typewriter':
      ass += `Style: Default,Arial,50,&H0000FF00,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,20,20,120,177\n`
      break
    case 'glow':
      ass += `Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H004B0082,&H80000000,-1,0,0,0,100,100,0,0,1,4,3,2,20,20,120,177\n`
      break
    case 'bounce':
      ass += `Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,200,177\n`
      break
    case 'slide':
      ass += `Style: Default,Arial,55,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,120,177\n`
      break
    default:
      ass += `Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,120,177\n`
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

    const prompt = `אתה מנתח סרטון כדי לזהות מי הפרזנטור הראשי.
אני מציג לך 6 פריימים מהסרטון עם timestamps. לכל פריים אני מציין מי הדובר לפי התמלול.
דוברים בסרטון:
${speakerSamples}
המשימה שלך:
1. הסתכל על כל פריים - מי נראה על המסך? האם הוא מדבר (פה פתוח, מחוות)?
2. הפרזנטור הוא מי ש:
   - נראה על המסך ומסתכל למצלמה
   - מדבר תוכן (מסביר, מלמד, מוכר)
   - נראה ברוב הפריימים
3. עוזר הפקה / מראיין:
   - לפעמים נשמע אבל לא נראה על המסך
   - שואל שאלות קצרות
   - אומר דברים כמו "ספר לי", "מה אתה חושב", "עוד פעם"
4. צוות הפקה:
   - אומר דברים כמו "מוכן?", "יופי", "עוד טייק"
   - כמעט אף פעם לא נראה על המסך
התבסס על הפריימים:
- מי נראה על המסך ברוב הפריימים? → כנראה הפרזנטור
- מי מדבר כשלא נראה אף אחד חדש על המסך? → כנראה הפרזנטור
- מי שואל שאלות קצרות? → כנראה מראיין/עוזר הפקה
החזר JSON:
{
  "presenter": "דובר X",
  "confidence": "high" | "medium" | "low",
  "reasoning": "הסבר קצר",
  "on_camera": "דובר X - מי שנראה על המסך ברוב הפריימים",
  "off_camera": ["דובר Y - נשמע אבל לא נראה"]
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

  presenterSegs.forEach((seg: any) => {
    const segStart = Math.max(0, seg.start - 0.15) // Small padding
    const segEnd = seg.end + 0.15

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
  console.log(`[SPEAKER] Cut ranges:`, ranges.map(r => `${r.start.toFixed(1)}-${r.end.toFixed(1)}`).join(', '))

  return ranges
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
function calculateQualityScore(job: any, outputFile: string, extraInfo: {
  cuts: any[], planZooms: any[], filteredSubtitleSegments: any[],
  brollAssets: any[], musicUrl: string | null, planColorGrade: string,
  mainPresenter: string | null, planCameraAngles: any[],
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

  // 4. Color grade (5 points)
  if (extraInfo.planColorGrade && extraInfo.planColorGrade !== 'none') { score += 5; report.colorGrade = extraInfo.planColorGrade }

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

  // 7. Subtitles (15 points)
  if (extraInfo.filteredSubtitleSegments?.length > 0) {
    score += 15
    report.subtitles = `${extraInfo.filteredSubtitleSegments.length} שורות כתוביות`
  } else {
    report.subtitles = 'ללא כתוביות'
  }

  // 8. Music (10 points)
  if (extraInfo.musicUrl) { score += 10; report.music = 'מוזיקת רקע' }
  else { report.music = 'ללא מוזיקה' }

  // 9. B-Roll (15 points)
  const brollCount = extraInfo.brollAssets?.length || 0
  if (brollCount >= 2) { score += 15; report.broll = `${brollCount} קטעי B-Roll` }
  else if (brollCount === 1) { score += 8; report.broll = '1 קטע B-Roll' }
  else { report.broll = 'ללא B-Roll' }

  // 10. Output file valid (5 points)
  if (fs.existsSync(outputFile) && fs.statSync(outputFile).size > 100000) {
    score += 5
  }

  // 11. Logo (5 points)
  if ((extraInfo as any).logoApplied) {
    score += 5
    report.logo = 'לוגו הוסף'
  } else if ((extraInfo as any).logoRequested) {
    report.logo = '! לוגו תוכנן אך לא הוסף'
  }

  return { score: Math.min(score, 100), report }
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

    // Filter subtitle segments by presenter if needed
    let filteredSubtitleSegments = subtitleSegments
    if (mainPresenter && subtitleSegments.length > 0 && !job?.subtitles?.segments?.length) {
      const filtered = subtitleSegments.filter((s: any) => matchesSpeaker(s.speaker, mainPresenter))
      if (filtered.length > 0) {
        filteredSubtitleSegments = filtered
      }
    }

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

    const transitions = planTransitions
    const cutFile = path.join(uploadsDir, `cut_${timestamp}.mp4`)
    filesToCleanup.push(cutFile)

    console.log('[PROCESS] Step E: Cutting video with', cuts.length, 'segments and transitions...')

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

      for (let i = 0; i < brollAssets.length; i++) {
        const broll = brollAssets[i]
        const brollUrl = broll.url || broll.localPath || ''
        const insertAt = parseFloat(broll.insertAt || broll.insert_at || broll.time || 0)
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
          execSync(
            `"${ffmpegPath}" -i "${brollFile}" -t ${duration} -vf "scale=${vidWidth}:${vidHeight}:force_original_aspect_ratio=decrease,pad=${vidWidth}:${vidHeight}:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -shortest "${brollScaled}" -y`,
            { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
          )

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
            console.log(`[B-ROLL] Clip ${i} inserted at ${insertAt}s`)
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

    const colorGradeName = planColorGrade
    const gradeFilter = colorGrades[colorGradeName] || colorGrades.clean
    const gradedFile = path.join(uploadsDir, `graded_${timestamp}.mp4`)
    filesToCleanup.push(gradedFile)

    console.log(`[PROCESS] Step I: Color grading (${colorGradeName})...`)
    execSync(
      `"${ffmpegPath}" -i "${currentFile}" -vf "${gradeFilter}" -c:v libx264 -preset fast -crf 23 -c:a copy "${gradedFile}" -y`,
      { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    )
    currentFile = gradedFile
    console.log('[PROCESS] Step I done')

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
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${path.basename(currentFile)}" -vf "subtitles=${assBase}" -c:v libx264 -preset fast -crf 23 -c:a copy "${path.basename(subFile)}" -y`,
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
          `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "subtitles=${assBase}" -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
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
            `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "ass=${assBase}" -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
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
                `cd "${uploadsDir}" && "${ffmpegPath}" -i "${curBase}" -vf "subtitles=${srtBase}:force_style='FontName=Arial,FontSize=24,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=30,Encoding=177'" -c:v libx264 -preset fast -crf 23 -c:a copy "${subBase}" -y`,
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
      console.log('[PROCESS] Step 7.5: Adding logo overlay...')
      let logoFile = job.logo.serverUrl
      // Convert localhost URL to local path
      if (logoFile.startsWith('http://localhost')) {
        logoFile = logoFile.replace(
          /http:\/\/localhost:\d+\/uploads\//,
          path.join(uploadsDir, '/')
        )
      }
      if (fs.existsSync(logoFile)) {
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
          let videoWidth = sourceWidth || 1080
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
          console.warn('[LOGO] Overlay failed:', e.stderr?.toString().substring(0, 200))
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
        logoApplied, logoRequested: !!job?.logo?.serverUrl,
      })

      console.log(`[PROCESS] Done! Preview: ${fileUrl} (${fileSize.toFixed(1)}MB, quality: ${qualityScore})`)

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
      logoApplied, logoRequested: !!job?.logo?.serverUrl,
    })

    console.log('[PROCESS] Done! Created', outputFiles.length, 'files with professional effects')

    res.json({
      success: true,
      files: outputFiles,
      qualityScore,
      qualityReport,
      processingTime: Date.now() - timestamp,
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

// Budget constants
const DAILY_GPT_COST_LIMIT = 1.0   // $1 per day
const MONTHLY_GPT_COST_LIMIT = 30.0 // $30 per month
const DAILY_GPT_CALLS_LIMIT = 50    // ~50 calls/day at ~$0.02/call

function loadLearningState(): any {
  const brainPath = path.join(__dirname, 'editor-brain.json')

  // Try loading state file first
  try {
    if (fs.existsSync(LEARNING_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(LEARNING_STATE_FILE, 'utf-8'))
      // Validate that state has meaningful data (not a reset/empty state)
      if (state.totalCost > 0 || state.learningMetrics?.totalSessions > 0 || state.totalVideosAnalyzed > 0) {
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
          lastLearnDate: 0,
          totalVideosAnalyzed: brain.cumulativeStats.totalVideosAnalyzed || 0,
          learnedPatterns: {},
          missingFeatures: [],
          dailyYoutubeUnits: 0,
          dailyGptCalls: 0,
          dailyGptCost: 0,
          dailyDate: '',
          dailyCost: 0,
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
    fs.writeFileSync(LEARNING_STATE_FILE, JSON.stringify(state, null, 2))
  } catch (e: any) {
    console.error('[LEARN] Failed to save state:', e.message)
  }
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

  // From learnedPatterns (older format)
  Object.values(state.learnedPatterns || {}).forEach((data: any) => {
    ;(data.editing_rules || []).forEach((r: any) => {
      const ruleText = r.rule || r
      if (ruleText && !allRules.includes(ruleText)) allRules.push(ruleText)
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

  // Save brain
  const brain: any = {
    lastUpdated: new Date().toISOString(),
    lastUpdatedIsrael: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
    version: totalInsights,
    masterPrompt,
    stats: {
      editingRules: allRules.length,
      socialInsights: allSocialInsights.length,
      marketingInsights: allMarketingInsights.length,
      paidAdsInsights: allPaidAdsInsights.length,
      activeTrends: activeTrends.length,
      systemIdeas: state.expertise?.systemOptimization?.ideas?.length || 0,
      masterPromptWords: masterPrompt.split(/\s+/).length,
      masterPromptChars: masterPrompt.length,
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
    totalSessions: state.learningMetrics?.totalSessions || 0,
    totalVideosAnalyzed: state.totalVideosAnalyzed || 0,
    totalRules: totalInsights,
    lastSessionCost: state.lastSessionCost || 0,
    sessionHistory: (state.sessionHistory || []).slice(-100),
    lastUpdated: new Date().toISOString(),
  }

  const brainPath = path.join(__dirname, 'editor-brain.json')
  fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2))

  console.log(`[BRAIN] Editor brain v${brain.version} saved | Master prompt: ${brain.stats.masterPromptWords} words | Trends: ${activeTrends.length} | Cumulative: $${(state.totalCost || 0).toFixed(3)} total`)

  return brain
}

function getEditorBrainPrompt(contentType?: string): string {
  try {
    const brainPath = path.join(__dirname, 'editor-brain.json')
    if (!fs.existsSync(brainPath)) {
      console.log('[BRAIN] No editor brain file found')
      return ''
    }

    const brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'))

    if (!brain.masterPrompt || brain.masterPrompt.length < 50) {
      console.log('[BRAIN] Editor brain has no master prompt')
      return ''
    }

    console.log(`[BRAIN] ✅ Injecting editor brain v${brain.version} into ${contentType || 'general'} prompt (${brain.stats?.masterPromptWords || 0} words, ${brain.stats?.editingRules || 0} rules, ${brain.stats?.activeTrends || 0} trends)`)

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
    const brainPath = path.join(__dirname, 'editor-brain.json')
    if (fs.existsSync(brainPath)) {
      const brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'))
      console.log(`[BRAIN] Editor brain v${brain.version} loaded (master prompt: ${brain.stats?.masterPromptWords || 0} words, ${brain.activeTrends?.length || 0} trends, updated ${brain.lastUpdatedIsrael})`)
    } else {
      console.log('[BRAIN] No editor brain yet - will be created after first learning session')
    }
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

  newRules.forEach((rule: any) => {
    const ruleText = (rule.rule || rule).trim().toLowerCase()

    // Skip exact duplicates
    if (existingTexts.has(ruleText)) {
      console.log(`[LEARN] Skipping duplicate rule: ${ruleText.substring(0, 50)}...`)
      return
    }

    // Skip very similar rules (>80% word overlap)
    const ruleWords = new Set(ruleText.split(/\s+/))
    let isDuplicate = false

    for (const existingRule of existingTexts) {
      const existingWords = new Set(existingRule.split(/\s+/))
      const overlap = [...ruleWords].filter(w => existingWords.has(w)).length
      const similarity = overlap / Math.max(ruleWords.size, existingWords.size)

      if (similarity > 0.8) {
        console.log(`[LEARN] Skipping similar rule (${Math.round(similarity * 100)}% overlap): ${ruleText.substring(0, 50)}...`)
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      existing.push(typeof rule === 'string' ? { rule, confidence: 0.8, applies_to: 'all' } : rule)
      existingTexts.add(ruleText)
      addedCount++
    }
  })

  state.learnedPatterns[category].editing_rules = existing
  console.log(`[LEARN] Category ${category}: added ${addedCount} new rules, ${existing.length} total`)

  return addedCount
}

async function sendLearningReport(state: any, results: any) {
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
    const brainPath = path.join(__dirname, 'editor-brain.json')
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
    message += `  ממוצע תובנות לסשן: ${(m.avgRulesPerSession || 0).toFixed(1)}\n`
    message += `  ביטחון ממוצע: ${((m.avgConfidence || 0) * 100).toFixed(0)}%\n`
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
  message += `  היום: $${(state.dailyGptCost || 0).toFixed(3)} / $${DAILY_GPT_COST_LIMIT.toFixed(2)}\n`
  message += `  קריאות: ${state.dailyGptCalls || 0} / ${DAILY_GPT_CALLS_LIMIT}\n`
  message += `  החודש: $${(state.monthlyGptCost || 0).toFixed(2)} / $${MONTHLY_GPT_COST_LIMIT.toFixed(0)}\n`
  message += `  YouTube API: ${state.dailyYoutubeUnits || 0} יחידות (היום)\n`

  // Next session
  message += '\n' + '─'.repeat(30) + '\n'
  message += israelHour < 12
    ? '✅ הלמידה הבאה: היום ב-19:00'
    : '✅ הלמידה הבאה: מחר ב-07:00'

  await sendTelegram(message)
}

async function runServerLearning(options?: { budget?: number, force?: boolean }) {
  const sessionBudget = options?.budget || 0.10
  const force = options?.force || false
  const maxGptCalls = Math.floor(sessionBudget / 0.02)
  const numCategories = Math.min(5, Math.max(3, Math.ceil(maxGptCalls / 8)))

  console.log('[LEARN] === SESSION START ===')
  console.log(`[LEARN] Budget: $${sessionBudget} | Force: ${force} | Max GPT calls: ~${maxGptCalls} | Categories: ${numCategories}`)
  console.log(`[LEARN] State file: ${fs.existsSync(LEARNING_STATE_FILE) ? 'EXISTS' : 'MISSING'}`)

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
    state.dailyYoutubeUnits = 0
    state.dailyGptCalls = 0
    state.dailyDate = todayIsrael
  }

  // Reset monthly cost if new month
  if (state.monthlyDate !== thisMonth) {
    state.monthlyGptCost = 0
    state.monthlyDate = thisMonth
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
      "rule": "Specific implementable rule with exact parameters",
      "when_to_use": "Exact situation where this applies",
      "when_NOT_to_use": "Situations where this would hurt",
      "parameters": {"timing":"0.5s","intensity":"1.2x","frequency":"every 5s"},
      "confidence": 0.85
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
              { role: 'system', content: `You are a world-class video editor analyzing videos. Goal: ${sessionGoal}. Analyze based on ${thumbnailImages.length > 0 ? 'thumbnails and metadata' : 'metadata only'}. Return JSON: {"editing_rules":[{"rule":"Specific actionable rule with parameters","when_to_use":"when to apply","when_NOT_to_use":"when not to apply","applies_to":"all/social/marketing","confidence":0.7}],"trend_techniques":[{"technique":"specific technique","trend_name":"trend name","lifecycle":"rising/peak/declining","shelf_life_weeks":4,"adaptation_for_business":"business use"}],"evergreen_techniques":[{"technique":"technique","why_evergreen":"reason"}],"system_optimization":[{"idea":"improvement idea","why":"connection to learned insight","impact":"high/medium/low","category":"new_feature/improve_existing/automation/ai_quality","implementation_hint":"brief approach"}],"sop_update":"Updated SOP","patterns":{"hook":{"avg_seconds":2,"rule":"rule"},"pacing":{"avg_cuts":12,"rule":"rule"},"subtitles":{"style":"classic","rule":"rule","animation_insights":{"most_popular_animation":"karaoke","most_popular_highlight_color":"yellow","word_by_word_percentage":80,"avg_words_per_frame":3,"best_font_size":"large","background_style":"black_box","position":"center","rule":"subtitle rule"}}}}` },
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

Return JSON:
{
  "editing_rules": [
    {
      "rule": "Specific implementable instruction with exact parameters",
      "when_to_use": "Exact situation/context",
      "when_NOT_to_use": "Situations where this hurts",
      "parameters": {"timing":"exact seconds","intensity":"specific values","frequency":"how often"},
      "evidence": "Which videos showed this",
      "confidence": 0.85,
      "applies_to": "all/social/marketing/corporate"
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

  console.log('[LEARN] === SESSION END ===')
  console.log(`[LEARN] Videos analyzed: ${videosThisSession}`)
  console.log(`[LEARN] New rules: ${newRules.length}`)
  console.log(`[LEARN] Total rules: ${totalRulesAfter}`)
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
  stateAfter.dailyBudget = 1    // $1/day
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

// ==================== DAILY LEARNING SCHEDULER ====================

function scheduleDailyLearning() {
  const ISRAEL_TIMEZONE = 'Asia/Jerusalem'
  const RUN_TIMES = [
    { hour: 7, minute: 0, label: 'בוקר' },
    { hour: 19, minute: 0, label: 'ערב' },
  ]

  function getNextRunTime(): { ms: number; label: string; timeStr: string } {
    const now = new Date()
    const israelNow = new Date(now.toLocaleString('en-US', { timeZone: ISRAEL_TIMEZONE }))

    let closest = { ms: Infinity, label: '', timeStr: '' }

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

  if (!hasLearnedThisSession()) {
    const shouldRunNow = RUN_TIMES.some(rt => {
      const hoursSince = israelHour - rt.hour
      return hoursSince >= 0 && hoursSince < 6
    })

    if (shouldRunNow) {
      console.log('[LEARN] Missed scheduled session after restart, running now (30s delay)...')
      setTimeout(async () => {
        try {
          await runServerLearning()
        } catch (e: any) {
          console.error('[LEARN] Catch-up session failed:', e.message)
        }
      }, 30000)
    }
  }

  function scheduleNext() {
    const next = getNextRunTime()
    const hoursUntil = (next.ms / (1000 * 60 * 60)).toFixed(1)
    console.log(`[LEARN] Next session: ${next.timeStr} Israel time (${next.label}) - in ${hoursUntil} hours`)

    setTimeout(async () => {
      if (hasLearnedThisSession()) {
        console.log('[LEARN] Already learned this session, skipping')
        scheduleNext()
        return
      }

      console.log(`[LEARN] Starting ${next.label} learning session...`)
      try {
        await runServerLearning()
      } catch (err: any) {
        console.error('[LEARN] Learning failed:', err.message)
        try {
          await sendTelegram(`❌ שגיאה בלמידה (${next.label}):\n${err.message?.substring(0, 500)}`)
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
                `💰 היום: $${(srvState.dailyGptCost || 0).toFixed(3)}/$${DAILY_GPT_COST_LIMIT}\n` +
                `💰 החודש: $${(srvState.monthlyGptCost || 0).toFixed(2)}/$${MONTHLY_GPT_COST_LIMIT}\n` +
                `\nפקודות:\n` +
                `  📊 דוח - דוח מלא\n` +
                `  📈 סטטוס - סטטוס מהיר\n` +
                `  🖥️ שרת - סטטוס שרת\n` +
                `  🚀 צא ללמוד - למידה מיידית ($1)`
              )
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

  console.log('[TELEGRAM BOT] Listening for commands (דוח / סטטוס / שרת / צא ללמוד)')
  pollUpdates()
}

async function sendFullReport() {
  try {
    const state = loadLearningState()

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
      message += `  ממוצע תובנות לסשן: ${(m.avgRulesPerSession || 0).toFixed(1)}\n`
      message += `  ביטחון ממוצע: ${((m.avgConfidence || 0) * 100).toFixed(0)}%\n`
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
      const brainPath = path.join(__dirname, 'editor-brain.json')
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
    message += `  היום: $${(state.dailyCost || state.dailyGptCost || 0).toFixed(3)} / $${state.dailyBudget || DAILY_GPT_COST_LIMIT}\n`
    message += `  החודש: $${(state.monthlyCost || state.monthlyGptCost || 0).toFixed(3)} / $${state.monthlyBudget || MONTHLY_GPT_COST_LIMIT}\n`
    message += `  כולל (כל הזמנים): $${(state.totalCost || 0).toFixed(3)}\n`
    message += `  סשנים: ${totalSessions}\n`
    message += `  ממוצע לסשן: $${totalSessions > 0 ? ((state.totalCost || 0) / totalSessions).toFixed(3) : '0.000'}\n`
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
    await sendTelegram(`❌ שגיאה ביצירת דוח: ${e.message}`)
  }
}

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 סטודיו AI Server running on port ${PORT}`)
  console.log(`   OpenAI:      ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log('   OpenAI Chat Model: gpt-5.4')
  console.log('   OpenAI Transcribe Model: gpt-4o-transcribe-diarize')
  const hasAssemblyAI = !!process.env.ASSEMBLYAI_API_KEY
  console.log(`   Transcription: ${hasAssemblyAI ? '✅ AssemblyAI (premium diarization)' : '⚠️ GPT-4o-transcribe (basic diarization)'}`)
  if (!hasAssemblyAI) {
    console.log('   💡 Tip: Add ASSEMBLYAI_API_KEY to .env for much better speaker detection')
    console.log('   💡 Sign up free at https://www.assemblyai.com ($50 free credit)')
  }
  console.log(`   ElevenLabs:  ${process.env.ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   DeepL:       ${process.env.DEEPL_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log(`   Gemini (Nano Banana + Veo): ${process.env.GEMINI_API_KEY ? '✅ Connected' : '❌ Not configured'}`)
  console.log('   Gemini Image: gemini-3-pro-image-preview (Nano Banana Pro)')
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

  // Social Learning Agent
  console.log('[LEARN] Social Learning Agent: ✅ Active')
  console.log(`[LEARN]   Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log('[LEARN]   Schedule: 07:00 + 19:00 Israel time')
  console.log(`[LEARN]   Budget: $${DAILY_GPT_COST_LIMIT}/day, ${DAILY_GPT_CALLS_LIMIT} calls/day, $${MONTHLY_GPT_COST_LIMIT}/month`)
  console.log(`[LEARN]   Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✅' : '❌'}`)
  console.log(`[LEARN]   Categories: ${Object.keys(LEARNING_CATEGORIES).length} diverse categories across 4 domains`)

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

  // Schedule learning at 7:00 + 19:00 Israel time (handles restart catch-up internally)
  scheduleDailyLearning()

  // Start Telegram bot listener for commands
  console.log('[TELEGRAM BOT] Commands: דוח / סטטוס / שרת / צא ללמוד / report')
  startTelegramBotListener()
})
