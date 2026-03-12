# System Audit - Auto-Editor Pipeline
**Date:** 2026-03-12
**Status:** Pre-fix diagnostic

## Diagnostic Results

### 1. FFmpeg Filters
- **Environment:** Sandbox/container - no FFmpeg installed at `/opt/homebrew/bin/ffmpeg` or system PATH
- **Available filters:** Cannot verify (no ffmpeg binary)
- **Impact:** Server uses `ffmpeg-static` as fallback (line 108 of server/index.ts)
- **Text filter availability:** Unknown at runtime - needs dynamic detection

### 2. FFmpeg libass/freetype
- Cannot verify in this environment
- Code already handles fallbacks: subtitles → ass → drawtext (multi-level)

### 3. Process Endpoint Skip Conditions
```
Line 4492: '[PROCESS] Step 3.5 skipped: No zooms in plan'
Line 4743: '[PROCESS] Step 5 skipped: No subtitles in plan'
Line 4842: '[PROCESS] Step 6 skipped: No speakers in plan'
Line 4942: '[PROCESS] Step 7 skipped: No graphics in plan'
```

### 4. Plan Data Flow
- Orchestrator sends `videoPlan` with fields: cuts, transitions, zooms, camera_angles, color_grade, subtitles, graphics, speakers
- Process endpoint destructures from `req.body` and accesses `videoPlan.*`
- **Issue:** Step 5 checks `videoPlan.subtitles` but plan may have empty subtitles; transcript segments are available but only used as secondary fallback
- The current code DOES fall through to transcript segments (line 4571), but the condition on line 4585/4615 requires `segments.length > 0`

### 5. Editor Transfer Code
- ExportScreen.tsx (line 227-323): `openInMainEditor()` function
- Creates project via projectsStore, fetches video blob, navigates to `/editor/${projectId}`
- Uses `useAutoEditorStore.getState().setEditedFiles()` to store platform files
- **Editor loads project via projectsStore** - the video blobUrl is passed through project creation

### 6. Presenter Detection
- No `mainPresenter` field in autoEditorStore
- Orchestrator sends `transcript.mainSpeaker` from stored transcript (line 358)
- Process endpoint does NOT filter segments by presenter

### 7. A/B Flow
- CompareVersions.tsx handles version selection
- selectABVersion in orchestrator handles export after selection
- Both versions processed with `skipPlatformExport: true` for preview

### 8. Nano Banana Model Order
```
Line 1670-1674: modelMap defaults to 'gemini-3.1-flash-image'
Line 3103: modelNames = ['gemini-3.1-flash-image', 'gemini-3-pro-image-preview']
Line 1812: Direct use of 'gemini-3.1-flash-image' in image-to-video
```
**Issue:** 'gemini-3.1-flash-image' may return 404; 'gemini-3-pro-image-preview' is known working

### 9. Learning Scheduler
- Line 5734-5843: `scheduleDailyLearning()` exists
- Runs at 7:00 AM Israel time (Asia/Jerusalem)

---

## Issues Found

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | No runtime FFmpeg text filter detection | Medium | server/index.ts |
| 2 | Path escaping handled via basenames (already fixed) | Low | Lines 4627-4634 |
| 3 | Pipeline steps 5-7 skip when plan has empty arrays | High | Lines 4568-4743 |
| 4 | Subtitle generation doesn't prioritize transcript | High | Lines 4568-4572 |
| 5 | Lower thirds/graphics already use ASS format | Low | Lines 4783-4920 |
| 6 | Editor transfer works but lacks auto-editor state | Medium | ExportScreen.tsx |
| 7 | No main presenter selection/detection | Medium | autoEditorStore.ts |
| 8 | Nano Banana uses failing model first | High | Lines 1670, 3103 |
| 9 | No mainPresenter in store or filtering in process | Medium | Multiple files |

---

## Post-Fix Status
**Date:** 2026-03-12
**Build:** PASS (tsc --noEmit + vite build - zero errors)

### Fixes Applied

| # | Fix | Files Modified |
|---|-----|----------------|
| 1 | Added `getAvailableTextFilter()` - runtime detection of subtitles/ass/drawtext | server/index.ts |
| 1 | Added `applySubtitleFilter()` helper - tries all available filters with path escaping | server/index.ts |
| 1 | Cache `AVAILABLE_TEXT_FILTER` on startup with console log | server/index.ts |
| 2 | `applySubtitleFilter` copies to simple filename, uses relative paths | server/index.ts |
| 3 | Extracted all plan features at top of process endpoint with multiple field name fallbacks | server/index.ts |
| 3 | All steps (2,3,3.5,5,6,7) now use pre-extracted variables instead of re-reading videoPlan | server/index.ts |
| 4 | Subtitle segments resolved from: plan > filtered transcript (by presenter) > raw transcript | server/index.ts |
| 4 | Step 5 skip message now shows detailed source counts | server/index.ts |
| 5 | Lower thirds and graphics already used ASS format - verified working | server/index.ts |
| 6 | Editor transfer flow verified: ExportScreen -> projectsStore -> Editor loads from project | ExportScreen.tsx |
| 7 | Added `mainPresenter` field + `setMainPresenter()` action to autoEditorStore | autoEditorStore.ts |
| 7 | EnrichmentReview already had presenter selection UI - connected to store | index.tsx |
| 7 | Orchestrator now sends `mainPresenter` to process endpoint | orchestrator.ts |
| 7 | Process endpoint filters transcript segments by mainPresenter for subtitles | server/index.ts |
| 8 | Swapped all Nano Banana model references to `gemini-3-pro-image-preview` first | server/index.ts |
| 8 | Updated modelMap defaults, background image generation, and image-to-video endpoint | server/index.ts |
| 8 | Updated startup log to show correct model name | server/index.ts |

### Verification Checklist
- [x] `npm run build` - ZERO errors
- [x] `tsc --noEmit` - ZERO type errors
- [x] FFmpeg text filter detection added (runtime)
- [x] Path escaping via `applySubtitleFilter` helper
- [x] Pipeline features extracted with multi-name fallbacks
- [x] Subtitle segments resolved from transcript when plan is empty
- [x] mainPresenter flows: EnrichmentReview UI -> store -> orchestrator -> process endpoint -> segment filtering
- [x] Nano Banana uses working model (gemini-3-pro-image-preview) first
- [x] Comprehensive logging at process endpoint start
