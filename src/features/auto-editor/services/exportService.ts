import { useAutoEditorStore, type ExportResult } from '../store/autoEditorStore'

interface PlatformSpec {
  w: number
  h: number
  fps: number
}

const PLATFORMS: Record<string, PlatformSpec> = {
  tiktok: { w: 1080, h: 1920, fps: 30 },
  reels: { w: 1080, h: 1920, fps: 30 },
  youtube_shorts: { w: 1080, h: 1920, fps: 30 },
  linkedin: { w: 1080, h: 1080, fps: 30 },
}

async function exportForPlatform(
  videoUrl: string,
  platform: string,
  spec: PlatformSpec,
  videoIndex: number
): Promise<ExportResult> {
  const log = useAutoEditorStore.getState().addLog

  log(`מייצא סרטון ${videoIndex} ל-${platform} (${spec.w}x${spec.h})...`)

  const response = await fetch('http://localhost:3001/api/auto-edit/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl,
      platform,
      width: spec.w,
      height: spec.h,
      fps: spec.fps,
      videoIndex,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`שגיאת ייצוא ${platform}: ${err.message || response.statusText}`)
  }

  const result = await response.json()

  return {
    videoIndex,
    platform,
    url: result.url || result.outputUrl,
    fileName: `video_${videoIndex}_${platform}.mp4`,
    width: spec.w,
    height: spec.h,
  }
}

export async function exportAllPlatforms(editedVideoUrls: string[]): Promise<ExportResult[]> {
  const log = useAutoEditorStore.getState().addLog

  log(`מייצא ${editedVideoUrls.length} סרטונים ל-${Object.keys(PLATFORMS).length} פלטפורמות...`)

  const allExports = await Promise.all(
    editedVideoUrls.flatMap((videoUrl, i) =>
      Object.entries(PLATFORMS).map(([platform, spec]) =>
        exportForPlatform(videoUrl, platform, spec, i + 1)
      )
    )
  )

  log(`ייצוא הושלם: ${allExports.length} קבצים`)
  return allExports
}
