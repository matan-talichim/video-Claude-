import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg
  ffmpeg = new FFmpeg()

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  return ffmpeg
}

export async function exportVideo(
  inputBlobUrl: string,
  format: 'mp4-720' | 'mp4-1080' | 'mp4-4k' | 'webm',
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg()

  ff.on('progress', ({ progress }) => {
    onProgress(Math.round(progress * 100))
  })

  const inputData = await fetchFile(inputBlobUrl)
  await ff.writeFile('input.mp4', inputData)

  let args: string[]
  let outputName: string

  switch (format) {
    case 'mp4-720':
      args = ['-i', 'input.mp4', '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-c:a', 'aac', 'output.mp4']
      outputName = 'output.mp4'
      break
    case 'mp4-1080':
      args = ['-i', 'input.mp4', '-vf', 'scale=-2:1080', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', 'output.mp4']
      outputName = 'output.mp4'
      break
    case 'mp4-4k':
      args = ['-i', 'input.mp4', '-vf', 'scale=-2:2160', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', 'output.mp4']
      outputName = 'output.mp4'
      break
    case 'webm':
      args = ['-i', 'input.mp4', '-c:v', 'libvpx-vp9', '-crf', '30', '-c:a', 'libopus', 'output.webm']
      outputName = 'output.webm'
      break
  }

  await ff.exec(args)
  const data = await ff.readFile(outputName)
  return new Blob([data], { type: format === 'webm' ? 'video/webm' : 'video/mp4' })
}

export async function exportAudio(
  inputBlobUrl: string,
  format: 'mp3-128' | 'mp3-256' | 'mp3-320' | 'wav',
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg()

  ff.on('progress', ({ progress }) => {
    onProgress(Math.round(progress * 100))
  })

  const inputData = await fetchFile(inputBlobUrl)
  await ff.writeFile('input', inputData)

  let args: string[]
  let outputName: string
  let mimeType: string

  switch (format) {
    case 'mp3-128':
      args = ['-i', 'input', '-vn', '-acodec', 'libmp3lame', '-ab', '128k', 'output.mp3']
      outputName = 'output.mp3'
      mimeType = 'audio/mpeg'
      break
    case 'mp3-256':
      args = ['-i', 'input', '-vn', '-acodec', 'libmp3lame', '-ab', '256k', 'output.mp3']
      outputName = 'output.mp3'
      mimeType = 'audio/mpeg'
      break
    case 'mp3-320':
      args = ['-i', 'input', '-vn', '-acodec', 'libmp3lame', '-ab', '320k', 'output.mp3']
      outputName = 'output.mp3'
      mimeType = 'audio/mpeg'
      break
    case 'wav':
      args = ['-i', 'input', '-vn', '-acodec', 'pcm_s16le', 'output.wav']
      outputName = 'output.wav'
      mimeType = 'audio/wav'
      break
  }

  await ff.exec(args)
  const data = await ff.readFile(outputName)
  return new Blob([data], { type: mimeType })
}

export function exportSubtitles(
  transcript: Array<{ text: string; start: number; end: number }>,
  format: 'srt' | 'vtt'
): Blob {
  if (format === 'srt') {
    let srt = ''
    transcript.forEach((seg, i) => {
      srt += `${i + 1}\n`
      srt += `${formatTime(seg.start, 'srt')} --> ${formatTime(seg.end, 'srt')}\n`
      srt += `${seg.text}\n\n`
    })
    return new Blob([srt], { type: 'text/plain' })
  } else {
    let vtt = 'WEBVTT\n\n'
    transcript.forEach((seg) => {
      vtt += `${formatTime(seg.start, 'vtt')} --> ${formatTime(seg.end, 'vtt')}\n`
      vtt += `${seg.text}\n\n`
    })
    return new Blob([vtt], { type: 'text/vtt' })
  }
}

export function exportTranscript(
  transcript: Array<{ speaker: string; text: string; start: number }>,
  format: 'txt' | 'docx'
): Blob {
  if (format === 'txt') {
    let txt = ''
    transcript.forEach((seg) => {
      txt += `[${formatTime(seg.start, 'simple')}] ${seg.speaker}: ${seg.text}\n\n`
    })
    return new Blob([txt], { type: 'text/plain' })
  }
  // For docx, create simple text format
  let txt = 'תמלול - סטודיו AI\n\n'
  transcript.forEach((seg) => {
    txt += `[${formatTime(seg.start, 'simple')}] ${seg.speaker}:\n${seg.text}\n\n`
  })
  return new Blob([txt], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

function formatTime(seconds: number, format: 'srt' | 'vtt' | 'simple'): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  if (format === 'simple') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  if (format === 'srt') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
