# Task Prompt: תיקון 9 בעיות בעריכה האוטומטית

## הנחיות כלליות
- כל התיקונים בקבצים: `server/index.ts` ו-`src/features/auto-editor/orchestrator.ts` ו-`src/features/auto-editor/services/nanoBananaService.ts`
- חובה: `npm run build` → ZERO errors
- חובה: logging מפורט עם prefix ברור (כמו `[NANO BANANA]`, `[CLEAN]`, `[SUBTITLE]` וכו') לכל שלב
- חובה: fallback graceful אם משהו נכשל — לא לשבור את הפייפליין

---

## באג 1: Nano Banana תמונת רקע גנרית

**בעיה:** הפרומפט שנשלח ל-Gemini הוא גנרי ("Professional background image related to..."). ב-`server/index.ts:4059-4068` יש זיהוי generic patterns אבל ה-enrichment הוא שטחי — פשוט לוקח 200 תווים ראשונים מה-transcript ומדביק אותם.

**תיקון נדרש:**

1. **ב-`server/index.ts`** — ב-endpoint `/api/generate-background` (שורה ~4051):
   - במקום ה-enrichment הנוכחי (שורות 4059-4068), צור פונקציה `generateBackgroundImagePrompt(transcript, creativeBrief)` שמחזירה prompt ספציפי.
   - הפונקציה צריכה:
     - לנתח את ה-transcript ולמצוא את הנושא המרכזי (לא רק 200 תווים ראשונים)
     - להשתמש ב-creative brief (enrichment) אם הוא מגיע ב-body — שדות כמו `video_summary`, `enhanced_prompt`, `style.color_mood`
     - לבנות prompt באנגלית שמתאר: אובייקטים ספציפיים, סגנון תאורה, פלטת צבעים, זווית מצלמה, עומק שדה
     - דוגמה: אם הסרטון על אוטומציה עסקית → "clean minimal workspace with laptop showing automation dashboard, flowchart diagrams floating, soft blue-purple gradient lighting, shallow depth of field, photorealistic"
   - ה-endpoint צריך לקבל `creativeBrief` נוסף ב-body (אופציונלי)

2. **ב-`src/features/auto-editor/services/nanoBananaService.ts`** (שורה 5):
   - לשנות את `generateBackground` לקבל גם `transcript` ו-`creativeBrief` כפרמטרים אופציונליים
   - לשלוח אותם ב-body של ה-fetch ל-`/api/generate-background`

3. **ב-`src/features/auto-editor/orchestrator.ts`** (שורה ~1033):
   - לשנות את הקריאה ל-`generateBackgroundSafe` כך שתעביר גם את ה-transcript וה-enrichment
   - `generateBackgroundSafe(editingPlanA.prompts.backgroundImage, apis.gemini)` → `generateBackgroundSafe(editingPlanA.prompts.backgroundImage, apis.gemini, transcript, enrichment)`

**לוגים:** `[NANO BANANA] Generated content-specific prompt: <first 100 chars>`

---

## באג 2: כתוביות לא מסונכרנות לדיבור

**בעיה:** ב-`generateStyledSubtitles` (שורה ~4934) הפונקציה מחשבת timestamps יחסיים לפי `cuts` (keep_start/keep_end), אבל ה-segments שמגיעים עדיין עם timestamps מקוריים של הסרטון המלא, לא אחרי ה-cleaning. כשמורידים קטעים של דוברים אחרים, ה-timestamps צריכים להתעדכן.

**תיקון נדרש:**

1. **ב-`generateStyledSubtitles` (שורה ~4934)** — הפונקציה כבר מקבלת `cuts` ומחשבת `currentOffset`. הבעיה היא שה-comparison `segStart >= cut.keep_start && segEnd <= cut.keep_end` תופסת רק segments שנמצאים **לגמרי** בתוך cut range. צריך לתקן:
   - להתמודד עם segments שחופפים חלקית ל-cut range (segment שמתחיל לפני ה-cut ונגמר בתוכו, או להיפך)
   - לעשות clamp של ה-segment ל-cut range: `const clampedStart = Math.max(segStart, cut.keep_start)` ו-`const clampedEnd = Math.min(segEnd, cut.keep_end)`
   - להוסיף תנאי overlap: `if (segStart < cut.keep_end && segEnd > cut.keep_start)` במקום strict containment
   - לחשב את ה-relative time מה-clamped values

2. **באותה צורה ב-`buildAnimatedASS`** (שורה ~5014) — אותו fix

3. **לוודא** שה-subtitle segments שנשלחים לפונקציות אלו הם ה-`cleanedSegments` (אחרי ה-clean transcript) ולא ה-segments המקוריים. לבדוק ב-process endpoint (שורה ~6096) מאיפה ה-segments מגיעים.

**לוגים:** `[SUBTITLE] Synced ${count} subtitle segments to cut timeline. Offset adjustments applied.`

---

## באג 3: משפטים כפולים — עוזר הפקה vs פרזנטור

**בעיה:** ב-clean-transcript endpoint (שורה 3263), הפונקציה כבר מסננת רק `presenterSegments`. אבל היא לא מזהה מצב שבו עוזר הפקה מקריא משפט וה-presenter חוזר עליו — כי ה-segments של עוזר ההפקה כבר סוננו. הבעיה היא שה-presenter אומר את המשפט פעמיים (פעם כ-retake) וה-GPT prompt לא מקבל את ה-context של הדובר האחר.

**תיקון נדרש:**

1. **ב-endpoint `/api/auto-editor/clean-transcript` (שורה ~3285)** — לשנות את ה-prompt ל-GPT:
   - לשלוח גם את ה-segments של דוברים אחרים (כ-context בלבד, לא לשמור אותם) כדי ש-GPT יוכל לזהות retakes
   - להוסיף לפרומפט:
     ```
     OTHER SPEAKERS (context only — do NOT keep these, but use them to detect retakes):
     [list of non-presenter segments with timestamps]

     RETAKE DETECTION:
     8. When another speaker says a sentence and the presenter repeats it shortly after (within 10 seconds),
        this is a retake/prompt scenario. REMOVE the presenter's FIRST attempt and KEEP only the LAST/BEST version.
     9. If the presenter says the same idea multiple times in a row, keep only the last version.
     ```
   - לוודא שההוראה ברורה: "Remove the first version, keep the last"

2. **לוגים:** `[CLEAN] Detected ${retakeCount} retakes (presenter repeated after crew prompt)`

---

## באג 4: A/B Testing מייצר סרטון זהה

**בעיה:** ב-`orchestrator.ts` שורות 969-993, שתי הגרסאות מקבלות `userPrompt` שונה עם `גישת עריכה: X` שונה. אבל ה-`planWithChatGPT` מקבל את אותו transcript ואותו enrichment, וההבדל היחיד הוא שורה אחת ב-prompt. זה לא מספיק — GPT לרוב מתעלם מהשורה הזו ומייצר plan זהה.

**תיקון נדרש:**

1. **ב-`orchestrator.ts`** — לחזק את ההבדלים בין גרסה A ו-B:
   - ב-`inputB` להוסיף לא רק שורה אחת אלא הוראות ספציפיות יותר:
     ```typescript
     const inputB: AutoEditorInput = {
       ...finalInput,
       userPrompt: `${finalInput.userPrompt}\n\n=== VERSION B INSTRUCTIONS ===\nגישת עריכה: ${versionBStyle}\n\nIMPORTANT DIFFERENCES FROM VERSION A:\n- Use DIFFERENT cut points (start 2-3 seconds later or earlier)\n- Use DIFFERENT hook (pick a different strong moment)\n- Use DIFFERENT color grade\n- Use DIFFERENT subtitle style\n- Use DIFFERENT zoom timing\n- Pacing should be ${detectedType === 'ad_short' ? 'varied/dynamic' : 'different from standard'}\n- This MUST produce a noticeably different video from Version A`,
     }
     ```
   - גם ב-`inputA` לסמן בבירור: `=== VERSION A INSTRUCTIONS ===`

2. **ב-`server/index.ts`** — ב-`planWithChatGPT` endpoint (חפש "technical-plan" או "plan"):
   - לוודא שה-prompt ל-GPT מדגיש שגרסאות שונות צריכות להיות **באמת** שונות
   - אם אפשר, להוסיף `temperature: 1.0` לקריאה של Version B (לעומת 0.7 ל-A) כדי לקבל תוצאות מגוונות יותר

3. **Validation:** אחרי שמקבלים את שתי ה-plans, להשוות ביניהן. אם הן זהות מדי (>80% overlap ב-cut points), לרשום warning ולנסות לייצר plan B מחדש עם temperature גבוה יותר.

**לוגים:** `[A/B] Version A style: ${versionAStyle}, Version B style: ${versionBStyle}, Difference score: ${diffScore}%`

---

## באג 5: דוח איכות לא תואם

**בעיה:** ב-`calculateQualityScore` (שורה ~5963), הציון מבוסס על מה **תוכנן** (האם יש segments ב-array) ולא על מה **באמת נכנס** לסרטון. לדוגמה: `filteredSubtitleSegments.length > 0` נותן 15 נקודות גם אם ה-ASS file לא נוצר, או אם ה-FFmpeg command נכשל.

**תיקון נדרש:**

1. **ב-`calculateQualityScore` (שורה ~5963)** — להוסיף פרמטר `actualResults` שמגיע מה-process pipeline:
   ```typescript
   function calculateQualityScore(job: any, outputFile: string, extraInfo: {
     // ... existing params ...
     // NEW actual results:
     subtitlesActuallyApplied: boolean,
     musicActuallyApplied: boolean,
     brollActuallyApplied: number,
     logoActuallyApplied: boolean,
     colorGradeActuallyApplied: boolean,
     lowerThirdsActuallyApplied: boolean,
   })
   ```

2. **לשנות את הניקוד:**
   - כתוביות (15 נק'): לתת נקודות רק אם `subtitlesActuallyApplied === true`
   - מוזיקה (10 נק'): רק אם `musicActuallyApplied === true`
   - B-Roll (15 נק'): לפי `brollActuallyApplied` (מספר שבאמת נכנסו)
   - לוגו (5 נק'): רק אם `logoActuallyApplied === true`
   - להוסיף penalty: אם משהו תוכנן אבל לא נכנס, להוריד 5 נקודות ולרשום ב-report

3. **ב-process endpoint** — לאסוף flags של `actuallyApplied` לכל שלב ולהעביר ל-`calculateQualityScore`

**לוגים:** `[QUALITY] Score: ${score}/100. Planned vs Actual: subtitles=${planned}/${actual}, broll=${planned}/${actual}, music=${planned}/${actual}`

---

## באג 6: העריכה חותכת באמצע מילים

**בעיה:** ב-`buildPresenterCutRanges` (שורה 5678) יש padding של 0.15 שניות בלבד. זה לא מספיק — צריך padding שמבטיח שהחיתוך נעשה בנקודת שתיקה.

**תיקון נדרש:**

1. **ב-`buildPresenterCutRanges` (שורות 5700-5702):**
   - להגדיל padding ל-0.25 שניות: `const segStart = Math.max(0, seg.start - 0.25)` ו-`const segEnd = seg.end + 0.25`

2. **חיפוש נקודת שתיקה (silence detection):**
   - להוסיף לוגיקה שבודקת: אם ה-segment הבא מתחיל יותר מ-0.3 שניות אחרי ה-segment הנוכחי, הרחב את ה-end padding ל-0.4 שניות (כדי "לנשום" אחרי המילה האחרונה)
   - אם ה-segment הקודם נגמר פחות מ-0.2 שניות לפני ה-segment הנוכחי, צמצם את ה-start padding כדי לא לתפוס את הזנב של המילה הקודמת של דובר אחר

3. **ב-process endpoint** — בשלב בניית ה-FFmpeg cut command, לוודא ש-cut points מעוגלים לקרוב ל-keyframe (אם אפשר, להוסיף `-avoid_negative_ts make_zero` ל-FFmpeg)

**לוגים:** `[CUT] Segment ${i}: padded ${originalStart.toFixed(2)}→${paddedStart.toFixed(2)} to ${originalEnd.toFixed(2)}→${paddedEnd.toFixed(2)} (silence-aware)`

---

## באג 7: כתובית "דובר 1" מופיעה בסרטון

**בעיה:** ב-Step 6 (שורה ~7216), lower thirds מתווספים תמיד אם `speakers.length > 0`. אבל:
- אם יש רק דובר אחד (הפרזנטור), לא צריך lower third בכלל
- השם מגיע כ-`s.name || 'דובר'` (שורה 7226) — fallback גנרי

**תיקון נדרש:**

1. **ב-Step 6 (שורה ~7217)** — להוסיף תנאי:
   ```typescript
   // Skip lower thirds if only one speaker (the presenter)
   const uniqueSpeakers = speakers.filter((s: any) => {
     const name = (s.name || '').trim()
     return name && name !== 'דובר' && name !== 'דובר 1' && !name.match(/^דובר\s*\d*$/) && !name.match(/^speaker\s*\d*$/i)
   })

   if (speakers.length <= 1 || uniqueSpeakers.length === 0) {
     console.log('[LOWER THIRDS] Skipped: single speaker or no real names')
   } else {
     // existing lower third logic, but ONLY for uniqueSpeakers
   }
   ```

2. **סינון שמות גנריים:** לפני יצירת ה-ASS file, לסנן speakers שהשם שלהם הוא "דובר", "דובר 1", "Speaker 1" וכו'. רק אם יש שם אמיתי — להציג lower third.

3. **ב-plan stage** (חפש איפה speakers נבנים ב-technical plan) — להורות ל-GPT: "אם יש רק דובר אחד, אל תייצר lower thirds. אם אתה לא יודע את שם הדובר, אל תשתמש ב'דובר 1'."

**לוגים:** `[LOWER THIRDS] Filtered: ${speakers.length} planned → ${uniqueSpeakers.length} with real names. ${skipped ? 'Skipping lower thirds.' : ''}`

---

## באג 8: לוגו לא נכנס לסרטון

**בעיה:** ב-Step 7.5 (שורה ~7414), הלוגו אמור להיכנס אבל יש כמה נקודות כשל:
1. `job?.logo?.serverUrl` — ה-logo object לא מגיע נכון מה-orchestrator
2. הממרה `logoFile.startsWith('http://localhost')` → path conversion עלול להיכשל
3. FFmpeg overlay command עלול להיכשל בשקט

**תיקון נדרש:**

1. **ב-Step 7.5 (שורה ~7414)** — logging מפורט:
   ```typescript
   console.log('[LOGO] Checking logo:', JSON.stringify({
     hasLogo: !!job?.logo,
     serverUrl: job?.logo?.serverUrl,
     position: job?.logo?.position,
     size: job?.logo?.size,
   }))
   ```

2. **תיקון path conversion (שורה ~7423-7427):**
   - הנתיב הנוכחי: `logoFile.replace(/http:\/\/localhost:\d+\/uploads\//, path.join(uploadsDir, '/'))`
   - הבעיה: `path.join(uploadsDir, '/')` מחזיר `uploadsDir/` — צריך `path.join(uploadsDir, '')` או פשוט `uploadsDir + '/'`
   - תיקון: להשתמש ב-`path.join(uploadsDir, filename)` במקום regex:
     ```typescript
     if (logoFile.startsWith('http://localhost')) {
       const urlPath = new URL(logoFile).pathname  // e.g. /uploads/logo_123.png
       const filename = path.basename(urlPath)
       logoFile = path.join(uploadsDir, filename)
     }
     ```

3. **ב-orchestrator.ts** — לוודא שה-logo object מועבר נכון ב-`buildEditJobForProcessing`. חפש `logo` ב-function — אם הוא לא מועבר, להוסיף:
   ```typescript
   logo: {
     serverUrl: finalInput.logo?.serverUrl,
     position: finalInput.logo?.position || 'top-right',
     size: finalInput.logo?.size || 'medium',
     opacity: finalInput.logo?.opacity ?? 0.9,
   }
   ```

4. **FFmpeg fallback:** אם overlay נכשל, לנסות שוב עם `-filter_complex` פשוט יותר (ללא `colorchannelmixer`).

**לוגים:** `[LOGO] Path resolved: ${logoFile}, exists: ${fs.existsSync(logoFile)}, size: ${fileSize}bytes`

---

## באג 9: עריכת צבע בנאלית

**בעיה:** ב-`colorGrades` (שורה ~4908), כל ה-presets דומים מדי. `warm` הוא בקושי חם, `cold` בקושי קר, `cinematic` לא באמת קולנועי.

**תיקון נדרש:**

1. **להחליף את ה-`colorGrades` dictionary (שורה 4908-4917):**
   ```typescript
   const colorGrades: Record<string, string> = {
     cinematic: 'eq=brightness=-0.03:contrast=1.25:saturation=0.85,curves=m=0/0:0.15/0.05:0.5/0.5:0.85/0.95:1/1,colorbalance=rs=0.03:gs=-0.02:bs=0.05:rh=0.05:gh=-0.02:bh=0.02,vignette=PI/4',
     warm: 'eq=brightness=0.04:contrast=1.1:saturation=1.15,colorbalance=rs=0.15:gs=0.08:bs=-0.1:rm=0.1:gm=0.05:bm=-0.08:rh=0.08:gh=0.03:bh=-0.05,curves=r=0/0:0.5/0.55:1/1:b=0/0.05:0.5/0.45:1/0.9',
     cold: 'eq=brightness=0.01:contrast=1.12:saturation=0.9,colorbalance=rs=-0.1:gs=-0.03:bs=0.15:rm=-0.08:gm=0.02:bm=0.12:rh=-0.05:gh=0.01:bh=0.1,curves=b=0/0.05:0.5/0.58:1/1:r=0/0:0.5/0.45:1/0.92',
     vintage: 'eq=brightness=0.05:contrast=0.9:saturation=0.6,curves=r=0/0.12:0.5/0.52:1/0.88:g=0/0.08:0.5/0.48:1/0.9:b=0/0.05:0.5/0.4:1/0.8,vignette=PI/3.5',
     vibrant: 'eq=brightness=0.04:contrast=1.25:saturation=1.5,unsharp=5:5:1.2:5:5:0.0,curves=m=0/0:0.4/0.35:0.6/0.7:1/1',
     moody: 'eq=brightness=-0.05:contrast=1.3:saturation=0.7,curves=m=0/0:0.2/0.08:0.5/0.45:0.8/0.9:1/1,colorbalance=rs=0.02:gs=-0.03:bs=0.05,vignette=PI/3',
     clean: 'eq=brightness=0.04:contrast=1.08:saturation=1.08,unsharp=3:3:0.6',
     film: 'eq=brightness=0.0:contrast=1.15:saturation=0.9,curves=r=0/0.03:0.5/0.5:1/0.95:g=0/0.02:0.5/0.48:1/0.95:b=0/0.05:0.5/0.5:1/0.92,vignette=PI/4.5,colorbalance=rm=0.03:gm=-0.01:bm=-0.02',
   }
   ```

   ההבדלים העיקריים:
   - **cinematic:** crushed blacks (curves m=0.15/0.05), teal+orange (colorbalance), vignette חזק, contrast גבוה
   - **warm:** orange tint אמיתי (colorbalance rs=0.15, bs=-0.1), curves שמגבירים אדום ומחלישים כחול
   - **cold:** blue tint אמיתי (bs=0.15, rs=-0.1), curves שמגבירים כחול ומחלישים אדום
   - **vintage:** saturation נמוך מאוד (0.6), lifted blacks, vignette חזק, גוון חום
   - **moody:** brightness שלילי, contrast גבוה מאוד, crushed blacks אגרסיביים, vignette

2. **התאמה לסוג תוכן:** ב-process endpoint (שורה ~6832), אם ה-plan לא מציין color grade ספציפי, לבחור אוטומטית:
   ```typescript
   if (!planColorGrade || planColorGrade === 'clean') {
     const detectedType = job?.enrichment?.detected_type || ''
     if (detectedType === 'ad_short' || detectedType === 'social_reels') planColorGrade = 'vibrant'
     else if (detectedType === 'podcast_interview') planColorGrade = 'warm'
     else if (detectedType === 'testimonial') planColorGrade = 'film'
     else if (detectedType === 'marketing_product') planColorGrade = 'cinematic'
     console.log(`[COLOR] Auto-selected grade "${planColorGrade}" for content type "${detectedType}"`)
   }
   ```

**לוגים:** `[COLOR] Applying grade "${gradeName}": ${gradeFilter.substring(0, 80)}...`

---

## סדר ביצוע מומלץ

1. באג 9 (צבע) — הכי פשוט, רק החלפת dictionary + auto-select
2. באג 7 (lower thirds) — תנאי פשוט למניעת "דובר 1"
3. באג 6 (חיתוך באמצע מילים) — הגדלת padding + silence-aware
4. באג 8 (לוגו) — תיקון path + logging
5. באג 1 (רקע) — פונקציה חדשה + שינוי ב-3 קבצים
6. באג 3 (משפטים כפולים) — שינוי prompt ל-GPT
7. באג 2 (כתוביות) — תיקון sync logic
8. באג 5 (דוח איכות) — שינוי signature + actual flags
9. באג 4 (A/B testing) — חיזוק prompt + validation

## Validation

אחרי כל התיקונים:
```bash
npm run build  # ZERO errors
```

לוודא שאין TypeScript errors חדשים ושכל ה-fallbacks עובדים (אם API נכשל, הפייפליין ממשיך).
