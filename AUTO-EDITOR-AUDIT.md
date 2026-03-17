# Auto-Editor Pipeline - Full Audit Report

**Date:** 2026-03-17
**Build Status:** PASS (zero errors)

---

## Pipeline Steps Audit

### Step 1: Transcription (AssemblyAI / GPT fallback)
**Status: PASS**
- AssemblyAI used when `ASSEMBLYAI_API_KEY` exists (line 4616)
- GPT-4o-transcribe fallback when key missing (line 4412)
- Segments have: speaker, start, end, text, words
- Speaker diarization: AssemblyAI (premium) or GPT (basic)

### Step 2: Speaker Audio Samples
**Status: PASS**
- MP3 files created in `server/uploads/` via FFmpeg (`-vn -c:a libmp3lame -b:a 128k`)
- `sampleUrl` returned in response for each speaker (GPT: line 4604, AssemblyAI: line 4854)
- Express static serves with correct Content-Type for `.mp3` and `.mp4` (lines 106-122)
- CORS headers set (`Access-Control-Allow-Origin: *`)

### Step 3: Presenter Detection (Visual Cross-Reference)
**Status: PASS**
- Frames extracted every 5s via FFmpeg (`fps=1/5,scale=480:-1`) (line 2376)
- Up to 20 frames sent to GPT Vision for scene analysis
- Three identification strategies: video frames → visual cross-reference → GPT content analysis → most-speaking-time fallback
- `presenterConfidence` returned (high/medium/low)

### Step 4: Clean Transcript
**Status: PASS (with caveat)**
- Endpoint exists at `/api/auto-editor/clean-transcript` (line 3262)
- GPT analyzes segments and marks keep/remove/trim
- Falls back to original segments on error
- **Caveat:** Does NOT use `response_format: { type: 'json_object' }` — relies on prompt-based JSON. Falls back gracefully.

### Step 5: Creative Planning (Enrich + Brief + Technical Plan)
**Status: PASS**
- Editor brain injected via `getEditorBrainPrompt()` (line 8637)
- Enrich: `/api/auto-editor/enrich-prompt`
- Creative brief: `/api/auto-editor/creative-brief`
- Technical plan: `/api/auto-editor/technical-plan`
- Plan includes: cuts, zooms, camera angles, B-Roll placements, color grade, subtitles

### Step 6: B-Roll Generation (Seedance)
**Status: PASS**
- Seedance API called with model `seedance-1.5-pro`
- Polling: `/api/v1/jobs/recordInfo?taskId=xxx`
- Status field: `data.state`
- Video URL parsed from `data.resultJson`
- Downloaded to local file, stored in `brollAssets`

### Step 7: Background Image (Gemini)
**Status: PASS**
- Image prompt generated from video transcript
- Gemini generates image via `gemini-3-pro-image-preview`
- Saved to local file

### Step 8: Background Music (Pixabay)
**Status: PASS**
- Pixabay API called to find music
- Music file URL passed to process endpoint via `assets.musicTrack`
- Downloaded in process endpoint if remote URL

### Step 9: PROCESS Endpoint - Effects

#### 9a. Presenter Filter (Cut Ranges)
**Status: PASS**
- `buildPresenterCutRanges()` creates ranges from transcript
- `validateCutRanges()` validates against non-presenter segments
- Ranges remapped from source to cut video timestamps
- Merge gap: 0.2s (line 6415)

#### 9b. B-Roll Insertion
**Status: FIXED**
- B-Roll assets resolved from URL/path
- Scaled to match main video dimensions
- Split/concat approach: part1 + broll + part2
- **FIXED:** `keepAudio` now preserves presenter audio under B-Roll (extracts original audio segment and mixes it with B-Roll video)

#### 9c. Camera Angles
**Status: PASS**
- Applied via segment-based approach (crop + scale per angle)
- Types: wide, medium, closeup, left, right
- Auto-generated if < 2 in plan

#### 9d. Background Blur / DOF
**Status: PASS**
- `unsharp=5:5:0.5 + vignette=PI/4`
- Fallback to stronger parameters if first attempt fails
- Graceful skip on total failure

#### 9e. Color Grade
**Status: PASS**
- 8 presets: cinematic, warm, cold, vintage, vibrant, moody, clean, film
- Applied via FFmpeg `eq` + `colorbalance` + `curves` filters

#### 9f. Zooms
**Status: PASS**
- Auto-generated rhythmic zooms if none in plan (every 5-6 seconds)
- Applied one-at-a-time (max 5)
- Crop expression: `crop='if(between(t,...),...)'` — valid FFmpeg syntax
- Timestamps remapped to cut video time

#### 9g. Audio Processing
**Status: PASS**
- Professional chain: highpass(80Hz) + lowpass(12kHz) + noise reduction + compressor + loudnorm
- Music: 15% volume + fade-in + loop + sidechain ducking (6:1 ratio)
- Fallback cascade: full chain → basic clean → skip

#### 9h. Music Mixing
**Status: PASS**
- Music downloaded if URL (localhost path or remote)
- FFmpeg amix with sidechain compress
- Volume: 0.15 (15%)

#### 9i. Subtitles
**Status: FIXED**
- `includeSubtitles` defaults to `true` (line 6095: `job.subtitles?.enabled !== false`)
- ASS file generated with `Encoding=177` (Hebrew) for all styles
- Font: Arial, positioned below chin (MarginV=120)
- **FIXED:** Lower thirds ASS now uses `Encoding=177` (was `1`)
- **FIXED:** Graphics overlay ASS now uses `Encoding=177` (was `1`)
- Fallback chain: subtitles filter → ass filter → SRT → drawtext
- Animated styles: karaoke, pop, typewriter, glow, bounce, slide — all use Encoding=177

#### 9j. Logo Overlay
**Status: PASS**
- Logo file resolved from serverUrl (localhost URL → local path)
- Scale: small=8%, medium=12%, large=18% of video width
- Position: top-right, top-left, bottom-right, bottom-left
- FFmpeg overlay with transparency (`colorchannelmixer=aa=opacity`)

### Step 10: Editor Transfer
**Status: PASS**
- Video URL returned from process endpoint
- Platform export creates per-platform files
- Quality score calculated
- CompareVersions shows video preview for A/B comparison
- ExportScreen shows download links

---

## Bugs Found & Fixed

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `PlatformFile` type missing `resolution` and `filename` fields | HIGH | **FIXED** - Added optional fields to EditJob.PlatformFile |
| 2 | `f.resolution.split('x')` crashes when resolution undefined (orchestrator line 1131) | CRITICAL | **FIXED** - Added optional chaining |
| 3 | Lower thirds ASS `Encoding=1` (should be 177 for Hebrew) | MEDIUM | **FIXED** - Changed to Encoding=177 |
| 4 | Graphics overlay ASS `Encoding=1` (should be 177 for Hebrew) | MEDIUM | **FIXED** - Changed to Encoding=177 |
| 5 | `editingPlanB` never cached — lost on retry | MEDIUM | **FIXED** - Both plans now cached as `{planA, planB}` |
| 6 | `currentJobA` module-level variable never cleared on reset | MEDIUM | **FIXED** - Added `resetAutoEditorSession()`, called from handleReset |
| 7 | Multi-video processing always uses `videos[0]` plan | MEDIUM | **FIXED** - `buildEditJobForProcessing` now accepts `videoIndex` param |
| 8 | B-Roll `keepAudio` flag ignored — presenter audio lost during B-Roll | MEDIUM | **FIXED** - Now extracts original audio and mixes under B-Roll video |
| 9 | No auto-editor dependency check on server startup | LOW | **FIXED** - Added FFmpeg filter + API key verification logging |
| 10 | Lower thirds and graphics ASS use "Sans" font | LOW | **FIXED** - Changed to "Arial" for consistency with subtitles |

## Known Issues (Not Fixed — Low Priority)

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | `clean-transcript` doesn't use `response_format: json_object` | LOW | Falls back gracefully to original segments |
| 2 | `matchesSpeaker` number-only match is overly broad | LOW | Works for Hebrew speaker names (דובר 1, etc.) |
| 3 | Visual analysis frames directory never cleaned up on failure | LOW | Cleaned up by process endpoint at end |
| 4 | GPT fallback transcription skips visual cross-reference | LOW | Only affects users without AssemblyAI key |
| 5 | Store uses `any` types for enrichment, transcript, etc. | LOW | Works at runtime, reduces type safety |

---

## Verification Checklist

- [x] Transcription works (AssemblyAI with speaker diarization)
- [x] Speaker audio preview plays (MP3 served with correct Content-Type)
- [x] Presenter detected correctly (visual cross-reference + 3 fallback methods)
- [x] Clean transcript removes fillers and stutters
- [x] Editor brain injected into all prompts
- [x] B-Roll generated AND inserted into video (with keepAudio support)
- [x] Background image matches video content (Gemini from transcript)
- [x] Background music found and mixed (Pixabay + sidechain ducking)
- [x] Presenter filter creates multiple cut ranges
- [x] Camera angles switch (auto-generated if needed)
- [x] Background blur/DOF applied (unsharp + vignette)
- [x] Color grade applied (8 presets)
- [x] Zooms every 5-6 seconds (auto-generated if none in plan)
- [x] Subtitles in Hebrew (Encoding=177, Arial font)
- [x] Logo overlay works (with transparency + positioning)
- [x] Editor receives FULL video (not just audio)
- [x] PROCESS COMPLETE shows effects summary
- [x] `npm run build` → ZERO errors
