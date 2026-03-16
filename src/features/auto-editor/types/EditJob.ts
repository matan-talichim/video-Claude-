// The SINGLE source of truth for an entire editing job.
// Created at start, enriched at each step, passed to FFmpeg at the end.

export interface EditJob {
  // === SOURCE ===
  id: string
  sourceFile: string              // Local path to uploaded video
  sourceUrl: string               // URL for playback
  sourceDuration: number          // Total duration in seconds
  sourceWidth: number
  sourceHeight: number
  sourceFps: number

  // === TRANSCRIPT ===
  transcript: {
    segments: TranscriptSegment[]
    cleanedSegments?: TranscriptSegment[]   // After error cleaning (stutters/fillers removed)
    cleaningSummary?: {
      total_segments?: number
      kept?: number
      removed?: number
      trimmed?: number
      removed_reasons?: Record<string, number>
      error?: string
    }
    speakers: SpeakerInfo[]
    mainPresenter: string         // "דובר 2" etc
    presenterConfidence: 'high' | 'medium' | 'low'
    totalDuration: number
  } | null

  // === VISUAL ANALYSIS ===
  visualAnalysis: {
    frames: FrameAnalysis[]
    presenterDescription: string
    presenterFrames: number[]
    sceneChanges: number[]        // timestamps
  } | null

  // === CREATIVE PLAN ===
  plan: {
    contentType: string           // 'marketing', 'ad', 'social', etc.
    targetDuration: number | 'auto'
    mainMessage: string
    hookStrategy: string

    // Editing decisions
    cuts: CutSegment[]            // Which parts of source to keep
    cameraAngles: CameraAngle[]   // Multi-cam simulation
    zooms: ZoomEffect[]           // Zoom in/out effects
    transitions: Transition[]     // Between cuts
    colorGrade: string            // 'warm', 'cold', 'clean', 'cinematic'
    backgroundBlur?: boolean      // Apply background blur / DOF effect

    // Overlays
    speakers: LowerThird[]        // Speaker name overlays
    graphics: GraphicOverlay[]    // Text/stat overlays

    // B-Roll
    brollPlacements: BRollPlacement[]
  } | null

  // === GENERATED ASSETS ===
  assets: {
    brollClips: GeneratedAsset[]  // Seedance video clips
    backgroundImage: string | null // Nano Banana image path
    musicTrack: string | null     // Pixabay music path
    musicVolume: number           // 0.0-1.0, default 0.15
  }

  // === SUBTITLE SETTINGS ===
  subtitles: {
    enabled: boolean
    style: 'auto' | 'karaoke' | 'pop' | 'typewriter' | 'glow' | 'bounce' | 'slide'
    animated: boolean
    segments: SubtitleSegment[]   // Pre-generated from transcript
  }

  // === OUTPUT SETTINGS ===
  output: {
    platforms: PlatformExport[]
    skipPlatformExport: boolean   // true for A/B preview
    version: 'A' | 'B'
  }

  // === RESULTS ===
  results: {
    processedFile: string | null
    platformFiles: PlatformFile[]
    qualityScore: number
    processingTime: number
    brainVersion: number
  }
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  speaker: string
  isPresenter: boolean
}

export interface SpeakerInfo {
  name: string           // "דובר 1"
  totalTime: number      // seconds
  isPresenter: boolean
}

export interface FrameAnalysis {
  timestamp: number
  description: string
  objects: string[]
}

export interface CutSegment {
  sourceStart: number    // Start time in source video
  sourceEnd: number      // End time in source video
  outputStart: number    // Start time in output video (calculated)
  type: 'presenter' | 'broll' | 'transition'
}

export interface ZoomEffect {
  timestamp: number      // In output video timeline
  duration: number
  intensity: number      // 1.1 - 1.5
  direction: 'in' | 'out'
  reason: string         // "key word: אוטומציה"
}

export interface CameraAngle {
  timestamp: number
  duration: number
  type: 'wide' | 'medium' | 'closeup' | 'left' | 'right'
  cropX: number          // Pre-calculated crop values
  cropY: number
  cropW: number
  cropH: number
}

export interface Transition {
  type: 'fade' | 'cut' | 'dissolve'
  duration: number
  atTime: number
}

export interface LowerThird {
  name: string
  firstAppearance: number
  displayDuration: number
}

export interface GraphicOverlay {
  type: string
  text: string
  atTime: number
  duration: number
  label?: string
}

export interface BRollPlacement {
  outputTimestamp: number // Where in output to insert
  duration: number
  assetIndex: number     // Index into assets.brollClips
  keepAudio: boolean     // Keep presenter audio under B-Roll
}

export interface GeneratedAsset {
  localPath: string
  url: string
  type: 'video' | 'image'
  duration: number
  width: number
  height: number
}

export interface SubtitleSegment {
  start: number          // In output timeline
  end: number
  text: string
  words?: { word: string; start: number; end: number }[]
}

export interface PlatformExport {
  name: string           // 'reels', 'linkedin', 'youtube'
  ratio: string          // '9:16', '1:1', '16:9'
  maxDuration?: number
}

export interface PlatformFile {
  platform: string
  ratio: string
  url: string
  sizeMB: number
}

export function createEmptyEditJob(sourceFile: string, sourceUrl: string): EditJob {
  return {
    id: `job_${Date.now()}`,
    sourceFile,
    sourceUrl,
    sourceDuration: 0,
    sourceWidth: 0,
    sourceHeight: 0,
    sourceFps: 30,
    transcript: null,
    visualAnalysis: null,
    plan: null,
    assets: {
      brollClips: [],
      backgroundImage: null,
      musicTrack: null,
      musicVolume: 0.15,
    },
    subtitles: {
      enabled: true,
      style: 'auto',
      animated: false,
      segments: [],
    },
    output: {
      platforms: [{ name: 'reels', ratio: '9:16' }],
      skipPlatformExport: true,
      version: 'A',
    },
    results: {
      processedFile: null,
      platformFiles: [],
      qualityScore: 0,
      processingTime: 0,
      brainVersion: 0,
    },
  }
}
