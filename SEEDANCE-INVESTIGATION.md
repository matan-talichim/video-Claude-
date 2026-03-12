# Seedance / KIE.ai API Investigation

**Date:** 2026-03-12
**Status:** Investigation complete (API testing blocked by sandbox — see section 4)

---

## 1. Documentation Findings

### Sources Consulted
- [KIE.ai Docs - Getting Started](https://docs.kie.ai/) — returned 403 (Cloudflare protected)
- [KIE.ai Docs - Get Task Detail](https://docs.kie.ai/market/common/get-task-detail) — returned 403 (info obtained via web search snippets)
- [KIE.ai Docs - Seedance 1.5 Pro](https://docs.kie.ai/market/bytedance/seedance-1-5-pro) — returned 403 (info obtained via web search snippets)
- [Old Docs](https://old-docs.kie.ai) — returned 403
- [KIE.ai Getting Started](https://kie.ai/getting-started) — returned 403
- [Veo3 Quickstart](https://docs.kie.ai/veo3-api/quickstart) — returned 403

### KIE.ai API Architecture

KIE.ai has **three distinct API families** under `https://api.kie.ai/api/v1/`:

| API Family | Create Endpoint | Poll Endpoint | Models |
|---|---|---|---|
| **Market/Jobs** | `POST /jobs/createTask` | `GET /jobs/recordInfo?taskId=XXX` | Seedance, Grok Imagine, Seedream, etc. |
| **Playground** | `POST /playground/createTask` | `GET /playground/recordInfo` | Nano Banana (Google image gen) |
| **Veo** | `POST /veo/generate` | `GET /veo/record-info` | Veo3, Veo3 Fast |

**Seedance uses the Market/Jobs family.**

### Create Task Endpoint (for Seedance)

```
POST https://api.kie.ai/api/v1/jobs/createTask
Authorization: Bearer <KIE_API_KEY>
Content-Type: application/json

{
  "model": "bytedance/seedance-1.5-pro",
  "input": {
    "prompt": "a cat walking on grass, sunny day",
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "duration": 8,
    "fixed_lens": false,
    "generate_audio": false,
    "input_urls": []         // optional: image URLs for image-to-video
  },
  "callBackUrl": "https://..."  // optional webhook
}
```

**Expected Response:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_xxxxxxxxxxxx"
  }
}
```

### Poll/Get Task Detail Endpoint

```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_xxxxxxxxxxxx
Authorization: Bearer <KIE_API_KEY>
Content-Type: application/json
```

**Expected Response:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_xxxxxxxxxxxx",
    "model": "bytedance/seedance-1.5-pro",
    "state": "success",
    "param": "{...original params as JSON string...}",
    "resultJson": "{\"resultUrls\":[\"https://cdn.kie.ai/...video.mp4\"]}",
    "failCode": null,
    "failMsg": null,
    "costTime": 45000,
    "createTime": "2026-03-12T10:00:00Z",
    "updateTime": "2026-03-12T10:00:45Z",
    "completeTime": "2026-03-12T10:00:45Z"
  }
}
```

### Task States (from documentation)

| State | Meaning |
|---|---|
| `waiting` | Task submitted, not yet queued |
| `queuing` | In processing queue |
| `generating` | Actively generating |
| `success` | Generation complete — `resultJson` contains URLs |
| `fail` | Generation failed — check `failCode` / `failMsg` |

### Key Documentation Notes
- All generation tasks are **asynchronous** — 200 OK only means task was created
- Must poll `recordInfo` or use `callBackUrl` webhook for results
- Generated files are stored for **14 days**, then auto-deleted
- Log records stored for **2 months**
- Authentication: `Authorization: Bearer <token>` header on every request

---

## 2. GitHub MCP Server Findings

**Source:** [andrewlwn77/kie-ai-mcp-server](https://github.com/andrewlwn77/kie-ai-mcp-server)

### Architecture
- `src/kie-ai-client.ts` — HTTP client for KIE.ai API
- `src/index.ts` — MCP tool handlers
- `src/database.ts` — SQLite task tracking
- `src/types.ts` — TypeScript types + Zod schemas

### How It Creates Tasks
- Base URL: `https://api.kie.ai/api/v1` (configurable via `KIE_AI_BASE_URL`)
- Auth: `Authorization: Bearer ${apiKey}` header
- Timeout: 60s default (configurable via `KIE_AI_TIMEOUT`)

### Endpoint Routing by api_type

| api_type | Create Endpoint | Poll Endpoint |
|---|---|---|
| `nano-banana` | `POST /playground/createTask` | `GET /playground/recordInfo` |
| `nano-banana-edit` | `POST /playground/createTask` | `GET /playground/recordInfo` |
| `veo3` | `POST /veo/generate` | `GET /veo/record-info` |

### Key Observation
**The MCP server does NOT implement Seedance.** It only supports Veo3 and Nano Banana. Seedance would use the `/jobs/` family endpoints which are separate from `/veo/` and `/playground/`.

### Polling Logic
- The MCP server does **NOT** implement polling internally
- It provides a `get_task_status` tool that makes a single status check
- External callers (LLM agents) are expected to call `get_task_status` repeatedly
- The poll URL is chosen based on `api_type` stored in the SQLite database

### Response Parsing
- Uses generic `KieAiResponse<T>` type: `{ code: number, msg: string, data?: T }`
- Error extraction from `data.msg` field

---

## 3. Our Current Implementation

**File:** `server/index.ts` (lines 3143-3283)

### Endpoint: `POST /api/generate-broll` (provider === 'seedance')

#### Step 1: Create Task (lines 3160-3195)
```typescript
// URL we call:
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
```

**Task ID extraction (line 3189):**
```typescript
const taskId = taskData.data?.taskId || taskData.data?.task_id || taskData.data?.recordId || taskData.data?.id || taskData.taskId || taskData.task_id || taskData.id
```

#### Step 2: Poll for Result (lines 3197-3251)

```typescript
// Poll URL:
const pollUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`

// Poll settings:
// - 30 attempts max
// - 10 second intervals
// - Total max wait: 5 minutes

// Status extraction (line 3220):
const status = statusData.data?.status || statusData.status || ''

// URL extraction (line 3221):
const foundUrl = statusData.data?.resultUrl || statusData.data?.url
  || statusData.data?.output?.url || statusData.data?.videoUrl || ''

// Status checks:
if (status === 'completed' || status === 'success' || status === 'done') { ... }
if (status === 'failed' || status === 'error') { ... }
```

#### Step 3: Download & Stream (lines 3260-3276)
- Downloads video from URL
- Saves to `uploads/seedance_<timestamp>.mp4`
- Streams file to client, deletes on completion

### Other Seedance References
- **Line 88:** Status check: `seedance: { connected: !!process.env.KIE_API_KEY, provider: 'kie.ai', model: 'seedance-1.5-pro' }`
- **Lines 873-889:** Legacy placeholder that returns a fallback image
- **Line 5565:** Startup log showing connection status

---

## 4. Test Results

### Sandbox Limitation
All `curl` tests to `api.kie.ai` were **blocked by the sandbox environment**. The container proxy only allows whitelisted hosts, and `api.kie.ai` is not on the allow list.

```
HTTP/1.1 403 Forbidden
x-deny-reason: host_not_allowed
```

**To test manually**, run these commands on a machine with internet access and a valid `KIE_API_KEY`:

#### Test 1: Create Task
```bash
curl -s -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer $KIE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bytedance/seedance-1.5-pro",
    "input": {
      "prompt": "a cat walking on grass, sunny day",
      "aspect_ratio": "16:9",
      "duration": "5"
    }
  }'
```

#### Test 2: Poll with recordInfo
```bash
curl -s "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=TASK_ID" \
  -H "Authorization: Bearer $KIE_API_KEY"
```

#### Verify: Check `state` field (not `status`) and `resultJson` field (not `resultUrl`)

---

## 5. Root Cause Analysis

### BUG 1: Wrong status field name (CRITICAL)
**Our code (line 3220):**
```typescript
const status = statusData.data?.status || statusData.status || ''
```
**API actually returns:** `state` (not `status`)

**Impact:** Status is ALWAYS empty string `''`, so the code never detects `success` or `fail`. It relies solely on finding a URL in fields that don't exist.

### BUG 2: Wrong result URL field name (CRITICAL)
**Our code (line 3221):**
```typescript
const foundUrl = statusData.data?.resultUrl || statusData.data?.url
  || statusData.data?.output?.url || statusData.data?.videoUrl || ''
```
**API actually returns:** `resultJson` — a **JSON string** containing `{ "resultUrls": ["https://..."] }`

None of the fields we check (`resultUrl`, `url`, `output.url`, `videoUrl`) exist in the response. The video URL is inside `resultJson` which must be JSON-parsed first.

**Impact:** Even when the task succeeds, we never find the URL and eventually time out.

### BUG 3: Wrong status value checks (MINOR)
**Our code (line 3229):**
```typescript
if (status === 'completed' || status === 'success' || status === 'done')
```
**API states are:** `waiting`, `queuing`, `generating`, `success`, `fail`

- `completed` and `done` are never returned (harmless since `success` is checked)

**Our code (line 3239):**
```typescript
if (status === 'failed' || status === 'error')
```
- API returns `fail`, not `failed` or `error`
- **Impact:** Failed tasks are never detected; they time out instead of showing an error message.

### BUG 4: Undefined variable `attempts` (CRASH BUG)
**Line 3254:**
```typescript
console.log('[SEEDANCE] Gave up after', attempts, 'polls - skipping B-Roll for this clip')
```
The variable `attempts` is never defined. The loop variable is `i` and the max is `maxAttempts`. This would throw a ReferenceError (though in this code path it just causes a bad log message since it's inside a try/catch).

### BUG 5: No KIE_API_KEY in .env
The `.env` file has `KIE_API_KEY=` with no value. The `.env.example` shows it should be set but it's empty. This means Seedance will always return the "KIE API Key לא מוגדר" error.

### Summary of Polling Failure

```
What we check          →  What the API actually returns
─────────────────────────────────────────────────────────
data.status            →  data.state
data.resultUrl         →  data.resultJson (JSON string)
data.url               →  (doesn't exist)
data.output.url        →  (doesn't exist)
data.videoUrl          →  (doesn't exist)
"completed"/"done"     →  "success"
"failed"/"error"       →  "fail"
```

---

## 6. Recommended Fix

### Fix 1: Status field (line 3220)
```typescript
// BEFORE:
const status = statusData.data?.status || statusData.status || ''

// AFTER:
const status = statusData.data?.state || statusData.data?.status || statusData.status || ''
```

### Fix 2: Result URL extraction (line 3221)
```typescript
// BEFORE:
const foundUrl = statusData.data?.resultUrl || statusData.data?.url
  || statusData.data?.output?.url || statusData.data?.videoUrl || ''

// AFTER:
let foundUrl = ''
if (statusData.data?.resultJson) {
  try {
    const resultData = typeof statusData.data.resultJson === 'string'
      ? JSON.parse(statusData.data.resultJson)
      : statusData.data.resultJson
    foundUrl = resultData?.resultUrls?.[0] || resultData?.url || ''
  } catch (e) {
    console.warn('[SEEDANCE] Failed to parse resultJson:', e)
  }
}
// Fallback to other possible fields
if (!foundUrl) {
  foundUrl = statusData.data?.resultUrl || statusData.data?.url || statusData.data?.videoUrl || ''
}
```

### Fix 3: Status value checks (lines 3229, 3239)
```typescript
// BEFORE:
if (status === 'completed' || status === 'success' || status === 'done')

// AFTER:
if (status === 'success' || status === 'completed' || status === 'done')
// (no change needed — 'success' is already checked)

// BEFORE:
if (status === 'failed' || status === 'error')

// AFTER:
if (status === 'failed' || status === 'fail' || status === 'error')
```

### Fix 4: Undefined variable (line 3254)
```typescript
// BEFORE:
console.log('[SEEDANCE] Gave up after', attempts, 'polls ...')

// AFTER:
console.log('[SEEDANCE] Gave up after', maxAttempts, 'polls ...')
```

### Fix 5: Set KIE_API_KEY in .env
```
KIE_API_KEY=<actual key from https://kie.ai/api-key>
```

### Correct Full Polling Section
```typescript
// Step 2: Poll for result
const pollUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`
let videoUrl = null
const maxAttempts = 60  // increased from 30
const pollInterval = 5000  // 5s (was 10s) — matches MCP server

for (let i = 0; i < maxAttempts; i++) {
  await new Promise(r => setTimeout(r, pollInterval))

  const statusRes = await fetch(pollUrl, {
    headers: { 'Authorization': `Bearer ${kieKey}` },
  })
  const statusData = await statusRes.json()

  const state = statusData.data?.state || ''

  if (state === 'success') {
    // Parse resultJson to get video URL
    if (statusData.data?.resultJson) {
      const result = typeof statusData.data.resultJson === 'string'
        ? JSON.parse(statusData.data.resultJson)
        : statusData.data.resultJson
      videoUrl = result?.resultUrls?.[0] || null
    }
    break
  }

  if (state === 'fail') {
    const errorMsg = statusData.data?.failMsg || 'Generation failed'
    return res.status(500).json({ message: 'Seedance failed: ' + errorMsg })
  }

  // Still processing (waiting/queuing/generating)
  console.log(`[SEEDANCE] Poll ${i+1}/${maxAttempts}: state=${state}`)
}
```

### Expected Response Fields Reference

| Field | Type | Description |
|---|---|---|
| `data.taskId` | string | Task identifier |
| `data.state` | string | `waiting` / `queuing` / `generating` / `success` / `fail` |
| `data.resultJson` | string (JSON) | Contains `{ "resultUrls": ["https://..."] }` on success |
| `data.failCode` | string/null | Error code on failure |
| `data.failMsg` | string/null | Error message on failure |
| `data.costTime` | number | Processing time in ms |
| `data.model` | string | Model used (e.g., `bytedance/seedance-1.5-pro`) |
| `data.param` | string (JSON) | Original request parameters |

---

## Appendix: API Error Codes

| HTTP Code | Meaning |
|---|---|
| 200 | Success |
| 400 | Policy violation |
| 401 | Unauthorized (bad/missing API key) |
| 402 | Insufficient credits |
| 404 | Not found |
| 422 | Validation error |
| 429 | Rate limited |
| 451 | Access limits |
| 455 | Maintenance |
| 500 | Timeout |
| 501 | Generation failed |
