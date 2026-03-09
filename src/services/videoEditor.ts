export interface EditPoint {
  type: 'delete' | 'keep'
  startTime: number
  endTime: number
}

/**
 * Compute the list of edit points (keep segments) from deleted regions.
 * Takes the total duration and a list of deleted regions, returns
 * the sequence of 'keep' and 'delete' segments in order.
 */
export function computeEditPoints(
  totalDuration: number,
  deletedRegions: { startTime: number; endTime: number }[]
): EditPoint[] {
  if (deletedRegions.length === 0) {
    return [{ type: 'keep', startTime: 0, endTime: totalDuration }]
  }

  // Sort deleted regions by start time
  const sorted = [...deletedRegions].sort((a, b) => a.startTime - b.startTime)

  // Merge overlapping deleted regions
  const merged: { startTime: number; endTime: number }[] = []
  for (const region of sorted) {
    const last = merged[merged.length - 1]
    if (last && region.startTime <= last.endTime) {
      last.endTime = Math.max(last.endTime, region.endTime)
    } else {
      merged.push({ ...region })
    }
  }

  const points: EditPoint[] = []
  let cursor = 0

  for (const del of merged) {
    if (cursor < del.startTime) {
      points.push({ type: 'keep', startTime: cursor, endTime: del.startTime })
    }
    points.push({ type: 'delete', startTime: del.startTime, endTime: del.endTime })
    cursor = del.endTime
  }

  if (cursor < totalDuration) {
    points.push({ type: 'keep', startTime: cursor, endTime: totalDuration })
  }

  return points
}

/**
 * Check if a given time falls within a deleted region.
 * Returns the end time of the deleted region to skip to, or null if not deleted.
 */
export function getDeletedRegionEnd(
  time: number,
  deletedRegions: { startTime: number; endTime: number }[]
): number | null {
  for (const region of deletedRegions) {
    if (time >= region.startTime && time < region.endTime) {
      return region.endTime
    }
  }
  return null
}

/**
 * Build FFmpeg filter for keeping only non-deleted segments.
 */
export function buildFFmpegTrimArgs(
  editPoints: EditPoint[],
  inputFile: string,
  outputFile: string
): string[] {
  const keeps = editPoints.filter(e => e.type === 'keep')
  if (keeps.length === 0) return []

  if (keeps.length === 1) {
    const k = keeps[0]
    return [
      '-i', inputFile,
      '-ss', k.startTime.toFixed(3),
      '-to', k.endTime.toFixed(3),
      '-c:v', 'libx264', '-preset', 'fast',
      '-c:a', 'aac',
      outputFile,
    ]
  }

  // Multiple segments: use complex filter
  const filterParts: string[] = []
  const concatInputs: string[] = []

  keeps.forEach((k, i) => {
    filterParts.push(
      `[0:v]trim=start=${k.startTime.toFixed(3)}:end=${k.endTime.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` +
      `[0:a]atrim=start=${k.startTime.toFixed(3)}:end=${k.endTime.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
    )
    concatInputs.push(`[v${i}][a${i}]`)
  })

  const filterComplex = filterParts.join(';') +
    `;${concatInputs.join('')}concat=n=${keeps.length}:v=1:a=1[outv][outa]`

  return [
    '-i', inputFile,
    '-filter_complex', filterComplex,
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'fast',
    '-c:a', 'aac',
    outputFile,
  ]
}

/**
 * Compute total deleted duration from deleted regions.
 */
export function getTotalDeletedDuration(
  deletedRegions: { startTime: number; endTime: number }[]
): number {
  return deletedRegions.reduce((sum, r) => sum + (r.endTime - r.startTime), 0)
}
