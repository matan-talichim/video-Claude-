export interface SilenceSegment {
  start: number
  end: number
  duration: number
}

export interface FillerWord {
  word: string
  startTime: number
  endTime: number
  count: number
}

const HEBREW_FILLERS = ['אממ', 'אההה', 'כאילו', 'נו', 'בעצם', 'אז', 'סתם', 'יודע', 'יודעת']

export async function enhanceAudio(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  )

  const source = ctx.createBufferSource()
  source.buffer = audioBuffer

  // Highpass filter at 80Hz - remove rumble
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 80

  // Compressor - even out volume
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -24
  compressor.knee.value = 12
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.25

  // Gain - normalize
  const gain = ctx.createGain()
  gain.gain.value = 1.2

  source.connect(highpass)
  highpass.connect(compressor)
  compressor.connect(gain)
  gain.connect(ctx.destination)

  source.start(0)
  return ctx.startRendering()
}

export function detectSilence(
  audioBuffer: AudioBuffer,
  threshold = -40,
  minDuration = 0.5
): SilenceSegment[] {
  const data = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const silences: SilenceSegment[] = []
  const thresholdLinear = Math.pow(10, threshold / 20)

  let silenceStart: number | null = null

  for (let i = 0; i < data.length; i++) {
    const amplitude = Math.abs(data[i])
    const time = i / sampleRate

    if (amplitude < thresholdLinear) {
      if (silenceStart === null) silenceStart = time
    } else {
      if (silenceStart !== null) {
        const duration = time - silenceStart
        if (duration >= minDuration) {
          silences.push({ start: silenceStart, end: time, duration })
        }
        silenceStart = null
      }
    }
  }

  // Handle trailing silence
  if (silenceStart !== null) {
    const duration = audioBuffer.duration - silenceStart
    if (duration >= minDuration) {
      silences.push({ start: silenceStart, end: audioBuffer.duration, duration })
    }
  }

  return silences
}

export function detectFillerWords(
  words: Array<{ text: string; start: number; end: number }>,
  language = 'he'
): FillerWord[] {
  const fillers = language === 'he' ? HEBREW_FILLERS : HEBREW_FILLERS
  const counts: Record<string, FillerWord> = {}

  for (const w of words) {
    const clean = w.text.replace(/[.,!?]/g, '')
    if (fillers.includes(clean)) {
      if (counts[clean]) {
        counts[clean].count++
      } else {
        counts[clean] = { word: clean, startTime: w.start, endTime: w.end, count: 1 }
      }
    }
  }

  return Object.values(counts)
}

export function generateWaveformData(audioBuffer: AudioBuffer, samples = 1000): number[] {
  const data = audioBuffer.getChannelData(0)
  const blockSize = Math.floor(data.length / samples)
  const waveform: number[] = []

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize
    let sum = 0
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(data[start + j] || 0)
    }
    waveform.push(sum / blockSize)
  }

  // Normalize to 0-1
  const max = Math.max(...waveform, 0.01)
  return waveform.map((v) => v / max)
}
