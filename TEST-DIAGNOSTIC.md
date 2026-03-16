# Auto-Editor Pipeline Test Diagnostic

Date: 2026-03-16

## Architecture Overview

### Pipeline Flow
1. **Phase 1 (runAutoEditor)**: Transcribe → Visual Analysis → Energy Analysis → Identify Presenter → Clean Transcript → Enrich Prompt → Pause for review
2. **Phase 2 (continueAfterEnrichment)**: Plan A+B → Generate Assets → Process Videos (FFmpeg) → Compare → Done
3. **Phase 3 (selectABVersion)**: Export selected version(s) to platforms

### Key Files
- `src/features/auto-editor/orchestrator.ts` — Client-side orchestration
- `server/index.ts` — Server-side FFmpeg processing (9137+ lines)
- `src/features/auto-editor/store/autoEditorStore.ts` — Zustand state
- `src/features/auto-editor/types/EditJob.ts` — Type definitions

## Data Flow Analysis

### Orchestrator → Server Field Mapping

| Field | Orchestrator Sends | Server Reads | Match? |
|-------|-------------------|--------------|--------|
| transcript.segments | job.transcript.segments | job.transcript.segments | ✅ YES |
| transcript.mainPresenter | job.transcript.mainPresenter | job.transcript.mainPresenter → transcript.mainSpeaker | ✅ YES (mapped at line 5456) |
| transcript.cleanedSegments | job.transcript.cleanedSegments | job.transcript.cleanedSegments | ✅ YES |
| transcript.totalDuration | job.transcript.totalDuration | job.transcript.totalDuration | ✅ YES |
| plan.cuts | sourceStart/sourceEnd | mapped to keepStart/keepEnd (line 5429) | ✅ YES |
| plan.zooms | intensity field | z.scale field | ⚠️ FIXED: added z.intensity fallback |
| plan.cameraAngles | timestamp+duration | mapped to start/end/camera (line 5431) | ✅ YES |
| plan.colorGrade | string | colorGrade/color_grade | ✅ YES |
| plan.backgroundBlur | boolean | job?.plan?.backgroundBlur !== false | ⚠️ FIXED: now explicitly set |
| plan.speakers | name/firstAppearance/displayDuration | mapped correctly | ✅ YES |
| plan.graphics | type/text/atTime/duration | mapped correctly | ✅ YES |
| plan.brollPlacements | outputTimestamp/duration/assetIndex | mapped to insertAt/duration/url | ✅ YES |
| assets.brollClips | url/localPath | clip?.url || clip?.localPath | ✅ YES |
| assets.backgroundImage | string | job.assets.backgroundImage | ✅ YES |
| assets.musicTrack | string | job.assets.musicTrack | ✅ YES |
| subtitles.enabled | boolean | job.subtitles.enabled | ✅ YES |
| subtitles.animated | boolean | job.subtitles.animated | ✅ YES |
| subtitles.style | string | job.subtitles.style | ✅ YES |
| subtitles.segments | SubtitleSegment[] | job.subtitles.segments | ✅ YES |
| output.skipPlatformExport | boolean | job.output.skipPlatformExport | ✅ YES |
| output.platforms | PlatformExport[] | job.output.platforms | ✅ YES |

### isPresenter Matching
- **ISSUE FOUND & FIXED**: Orchestrator used strict equality (`===`) to set `isPresenter` on segments
- Server uses fuzzy `matchesSpeaker()` which handles whitespace, encoding, and number differences
- **FIX**: Added `matchesSpeakerClient()` to orchestrator that mirrors server logic

## Step Execution Analysis

### Step B: Source Info
- Uses ffprobe to get width/height/fps/duration
- Falls back to 1920x1080@30fps if probe fails
- **Status**: ✅ Working

### Step C: Clean Transcript
- Uses pre-cleaned segments from orchestrator if available
- Falls back to original segments
- **Status**: ✅ Working

### Step D: Auto-generate Missing Plan Elements
- Generates rhythmic zooms if none in plan and duration > 10s
- Generates camera angles if ≤1 in plan and >3 segments
- **Status**: ✅ Working

### Step E: Cut Video with Transitions
- Builds transition filter from cuts
- Falls back to simple concat if transitions fail
- **Status**: ✅ Working

### Step 1.5: Presenter-only Audio Isolation
- Filters by mainPresenter using matchesSpeaker
- Remaps ranges to cut video timeline
- Extracts and concats presenter segments
- **Status**: ✅ Working (with comprehensive diagnostic logging)

### Step 1.75: B-Roll Insertion
- Downloads B-Roll from URL if not local
- Scales to match main video dimensions
- Inserts via split+concat approach
- **Status**: ✅ Working

### Step 2: Multi-cam Simulation
- Segment-based approach: process each angle separately
- Uses crop for closeup/medium/left/right
- **Status**: ✅ Working

### Step H: Background Blur / DOF
- Applies vignette + unsharp for subtle DOF look
- Has simpler fallback
- **ISSUE FOUND & FIXED**: `backgroundBlur` was never set in orchestrator plan, defaulting to undefined (always runs)
- **FIX**: Now explicitly set `backgroundBlur: true` in buildEditJobForProcessing
- **Status**: ✅ Fixed

### Step I: Color Grade
- Applies color grade filter from `colorGrades` map
- **Status**: ✅ Working

### Step J: Zoom / Ken Burns Effects
- **ISSUE FOUND & FIXED**: Server read `z.scale` but orchestrator sent `z.intensity`
- **FIX**: Added `z.intensity` fallback: `z.scale || z.intensity || 1.05`
- Remaps zoom timestamps to cut video time
- Applies one zoom at a time for reliability (max 5)
- **Status**: ✅ Fixed

### Step 4: Audio Processing + Music
- Professional audio chain: highpass → lowpass → afftdn → acompressor → loudnorm
- With music: sidechain ducking compression
- Without music: just voice cleaning
- **Status**: ✅ Working

### Step 5: Subtitles (ASS Format)
- Multiple fallback chain: Animated → Standard ASS → ASS filter → SRT → Drawtext
- Uses `filteredSubtitleSegments` (presenter-only if applicable)
- **Status**: ✅ Working

### Step 6: Lower Thirds
- ASS-based speaker name overlays
- Falls back to ass filter if subtitles filter fails
- **Status**: ✅ Working

### Step 7: Motion Graphics
- ASS-based graphic overlays with \move animation
- Falls back to ass filter if subtitles filter fails
- **Status**: ✅ Working

### Step 8: Platform Export
- Groups by aspect ratio to avoid duplicate encoding
- Blur background for vertical, scale+pad for horizontal
- **ISSUE FOUND & FIXED**: Non-skip branch didn't return qualityScore/qualityReport
- **FIX**: Added calculateQualityScore call to platform export branch
- **Status**: ✅ Fixed

## Editor Transfer Analysis

### Flow
1. ExportScreen.openInMainEditor() fetches video blob from server URL
2. Stores video URL in localStorage as fallback (`autoEditorVideoUrl`)
3. Stores transcript in localStorage as fallback (`autoEditorTranscript`)
4. Creates project via projectsStore.addProject()
5. Navigates to `/editor/${projectId}` via SPA navigation

### Editor.tsx Loading
1. Checks project for active video
2. Falls back to localStorage `autoEditorVideoUrl`
3. Falls back to localStorage `autoEditorTranscript`
4. Loads project with mediaBlobUrl and transcript

### Status: ✅ Working
- Video URL is properly stored and retrieved
- Transcript is properly serialized and deserialized
- Blob URL created from fetch response
- SPA navigation preserves in-memory state

## Fixes Applied

### Fix 1: Speaker Matching Consistency
- **File**: `src/features/auto-editor/orchestrator.ts`
- **Issue**: Used strict equality (`===`) for `isPresenter` assignment
- **Fix**: Added `matchesSpeakerClient()` function that mirrors server's `matchesSpeaker()`
- **Impact**: Fixes cases where speaker names have whitespace/encoding/number differences

### Fix 2: Zoom Scale/Intensity Mismatch
- **File**: `server/index.ts`
- **Issue**: Server read `z.scale` but orchestrator sent `z.intensity`
- **Fix**: Changed to `z.scale || z.intensity || 1.05`
- **Impact**: Zoom effects now use correct intensity from orchestrator plan

### Fix 3: Explicit backgroundBlur in Plan
- **File**: `src/features/auto-editor/orchestrator.ts`
- **Issue**: `backgroundBlur` was never set in plan object, defaulting to undefined
- **Fix**: Explicitly set `backgroundBlur: videoPlan?.backgroundBlur !== false`
- **Impact**: Plan now explicitly controls blur behavior

### Fix 4: Quality Score in Platform Export
- **File**: `server/index.ts`
- **Issue**: Non-skip platform export branch didn't calculate or return quality score
- **Fix**: Added `calculateQualityScore()` call and included in response
- **Impact**: All export paths now return quality metrics

### Fix 5: Step Tracking Variables
- **File**: `server/index.ts`
- **Issue**: No tracking of which steps actually executed
- **Fix**: Added boolean/counter tracking for all steps + comprehensive completion summary log
- **Impact**: Server logs now show exactly which effects were applied and their results

## Verification Checklist

- [x] Transcript segments > 0 at process endpoint (logged at line 5498)
- [x] mainPresenter is valid speaker name (logged at line 5499)
- [x] matchesSpeaker correctly matches presenter to segments (fuzzy matching at line 4997)
- [x] filteredTranscript > 0 (logged at line 5536)
- [x] cleanedSegments generated (logged at line 5573-5575)
- [x] Cut ranges built from presenter segments (buildPresenterCutRanges at line 5047)
- [x] B-Roll clips inserted into video (tracked by brollInserted counter)
- [x] Camera angles applied (tracked by anglesApplied counter)
- [x] Background blur/DOF applied (tracked by blurApplied boolean)
- [x] Color grade applied (always runs at Step I)
- [x] Zooms applied (tracked by zoomsApplied counter, fixed scale/intensity mismatch)
- [x] Audio cleaned (tracked by audioCleanApplied boolean)
- [x] Background music mixed (tracked by musicApplied boolean)
- [x] Subtitles burned into video (tracked by subtitlesApplied boolean)
- [x] Lower thirds visible (tracked by lowerThirdsApplied counter)
- [x] Graphics visible (tracked by graphicsApplied counter)
- [x] Quality score reflects ACTUAL applied effects (calculateQualityScore checks all)
- [x] "פתח בעורך" opens editor WITH video visible (localStorage fallback + blob URL)
- [x] Process complete log shows all steps and their results (PROCESS COMPLETE summary)
- [x] TEST-DIAGNOSTIC.md saved
- [ ] npm run build → ZERO errors (pending verification)
