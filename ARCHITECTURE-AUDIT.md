# Architecture Audit - Auto-Editor Pipeline

Generated: 2026-03-13

## FFmpeg Capabilities
- FFmpeg not found in system PATH (may be installed at `/opt/homebrew/bin/ffmpeg` on macOS)

## Current Process Endpoint
- Legacy redirect: `server/index.ts:4650` - `/api/auto-editor/process-video` → forwards to `/api/auto-editor/process`
- Main endpoint: `server/index.ts:4666` - `/api/auto-editor/process`
- Server total lines: 7938

## Current Orchestrator
- `processVideosWithPlan` defined at line 314 in `src/features/auto-editor/orchestrator.ts`
- Calls `/api/auto-editor/process` at line 412
- Main presenter captured from store at line 849
- Version A processed at line 861
- Version B processed at line 868
- Platform export re-process at line 1000

## Store Fields (autoEditorStore.ts)
- `transcript: any | null` (line 95)
- `mainPresenter: string | null` (line 102)
- `cachedAssets: { backgroundImage: string; brollClips: string[]; music: string } | null` (line 123)
- `brollGenerator: 'seedance' | 'veo'` (line 50 in AutoEditorInput)

## Architecture Issues Identified

### 1. Data Loss Through Zustand
- Transcript, presenter, and assets pass through Zustand store between orchestrator phases
- Data can be lost between `runAutoEditor()` (Phase 1) and `continueAfterEnrichment()` (Phase 2)
- Multiple fallback chains in `processVideosWithPlan` trying to recover lost data

### 2. Multiple Re-encodes
- Server endpoint performs 7+ sequential FFmpeg passes:
  1. Cut with transitions (line 4808)
  2. Presenter isolation (line 4843)
  3. B-Roll insertion (line 4961) - per clip
  4. Multi-cam simulation (line 5088)
  5. Color grading (line 5207)
  6. Zoom effects (line 5226) - per zoom
  7. Audio processing + music (line 5326)
  8. Subtitles (line 5396)
  9. Lower thirds (line 5575)
  10. Graphics overlays (line 5676)
  11. Platform export (line 5773)
- Each pass re-encodes the video, degrading quality

### 3. Effects Not Appearing
- Complex data transformation between orchestrator and server loses field names
- Multiple camelCase/snake_case fallbacks indicate unreliable data passing
- Diagnostic logging suggests frequent data loss

### 4. Editor Transfer Issues
- ExportScreen.tsx fetches video via HTTP, creates File objects
- Can produce empty blobs on fetch failure
- Complex project creation flow can lose video data
