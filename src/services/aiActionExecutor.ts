import { api } from './api'
import { useEditorStore } from '../stores/editorStore'
import { useUsageStore } from '../stores/usageStore'

export interface AIAction {
  action: string
  params: Record<string, any>
}

export interface ActionResult {
  action: string
  success: boolean
  detail?: string
  count?: number
  content?: string
  clips?: any[]
  error?: string
}

function getTranscriptText(): string {
  const { transcript } = useEditorStore.getState()
  return transcript.flatMap(s => s.words).map(w => w.text).join(' ')
}

function getSegments() {
  return useEditorStore.getState().transcript
}

export async function executeAiActions(
  actions: AIAction[],
  onProgress?: (step: number, total: number, desc: string) => void
): Promise<ActionResult[]> {
  const results: ActionResult[] = []
  const store = useEditorStore.getState()
  const addDalleUsage = useUsageStore.getState().addDalleUsage

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    onProgress?.(i + 1, actions.length, getActionDescription(action))

    try {
      switch (action.action) {
        case 'add_broll': {
          const prompt = action.params.prompt || 'professional business image'
          try {
            const image = await api.generateImage(prompt, '1792x1024')
            addDalleUsage()
            store.addBRollItem({
              id: `broll-${Date.now()}-${i}`,
              imageUrl: image.url,
              startTime: action.params.start || 0,
              duration: (action.params.end || 5) - (action.params.start || 0),
              source: 'ai',
              prompt,
              displayMode: action.params.position || 'fullscreen',
            })
            results.push({ action: 'add_broll', success: true, detail: prompt })
          } catch {
            results.push({ action: 'add_broll', success: false, error: 'שגיאה ביצירת תמונה' })
          }
          break
        }

        case 'auto_broll': {
          const text = getTranscriptText()
          if (!text) {
            results.push({ action: 'auto_broll', success: false, error: 'אין תמלול זמין' })
            break
          }
          try {
            const suggestions = await api.suggestBRoll(text, getSegments())
            const items = suggestions.suggestions || []
            let generated = 0
            for (const s of items) {
              try {
                onProgress?.(i + 1, actions.length, `מייצר B-Roll ${generated + 1}/${items.length}...`)
                const image = await api.generateImage(s.prompt, '1792x1024')
                addDalleUsage()
                store.addBRollItem({
                  id: `broll-${Date.now()}-auto-${generated}`,
                  imageUrl: image.url,
                  startTime: s.timestamp || 0,
                  duration: s.duration || 5,
                  source: 'ai',
                  prompt: s.prompt,
                  displayMode: s.position || 'fullscreen',
                })
                generated++
              } catch { /* skip failed ones */ }
            }
            results.push({ action: 'auto_broll', success: true, count: generated, detail: `נוספו ${generated} תמונות B-Roll` })
          } catch {
            results.push({ action: 'auto_broll', success: false, error: 'שגיאה ביצירת הצעות B-Roll' })
          }
          break
        }

        case 'add_captions': {
          const style = action.params.style || 'modern'
          store.setCaptionStyle({ preset: style as any })
          store.generateCaptionsFromTranscript()
          store.setShowCaptions(true)
          results.push({ action: 'add_captions', success: true })
          break
        }

        case 'change_caption_style': {
          store.setCaptionStyle({ preset: action.params.style as any })
          results.push({ action: 'change_caption_style', success: true })
          break
        }

        case 'delete_range': {
          store.removeTimeRange(action.params.start, action.params.end)
          results.push({ action: 'delete_range', success: true })
          break
        }

        case 'remove_filler_words': {
          const result = store.removeFillerWords()
          results.push({ action: 'remove_filler_words', success: true, count: result.totalRemoved })
          break
        }

        case 'generate_content': {
          const text = getTranscriptText()
          try {
            const content = await api.generateContent(text, action.params.type)
            results.push({ action: 'generate_content', success: true, content: content.content })
          } catch {
            results.push({ action: 'generate_content', success: false, error: 'שגיאה ביצירת תוכן' })
          }
          break
        }

        case 'translate': {
          try {
            const segments = getSegments()
            const translated = await api.translateBatch(
              segments.map(s => ({ text: s.words.map(w => w.text).join(' '), startTime: s.segStart || 0, endTime: s.segEnd || 0 })),
              'he',
              action.params.targetLang || 'en'
            )
            store.setTranslatedCaptions(
              translated.translatedSegments.map((t: any) => ({
                text: t.translatedText,
                startTime: t.startTime,
                endTime: t.endTime,
              })),
              action.params.targetLang || 'en'
            )
            results.push({ action: 'translate', success: true })
          } catch {
            results.push({ action: 'translate', success: false, error: 'שגיאה בתרגום' })
          }
          break
        }

        case 'mute_range': {
          store.addMutedRegion(action.params.start, action.params.end)
          results.push({ action: 'mute_range', success: true })
          break
        }

        case 'suggest_clips': {
          try {
            const clips = await api.suggestClips(getTranscriptText(), getSegments(), action.params.count || 3)
            results.push({ action: 'suggest_clips', success: true, clips })
          } catch {
            results.push({ action: 'suggest_clips', success: false, error: 'שגיאה ביצירת קליפים' })
          }
          break
        }

        case 'move_broll': {
          const items = store.bRollItems
          const item = items.find(b => b.startTime <= (action.params.fromTime || 0) && b.startTime + b.duration >= (action.params.fromTime || 0))
          if (item) {
            store.updateBRollItem(item.id, { startTime: action.params.toTime || 0 })
            results.push({ action: 'move_broll', success: true })
          } else {
            results.push({ action: 'move_broll', success: false, error: 'לא נמצא B-Roll בזמן שצוין' })
          }
          break
        }

        case 'resize_broll': {
          const items2 = store.bRollItems
          const item2 = items2.find(b => b.startTime <= (action.params.time || 0) && b.startTime + b.duration >= (action.params.time || 0))
          if (item2) {
            store.updateBRollItem(item2.id, { displayMode: action.params.position || 'fullscreen' })
            results.push({ action: 'resize_broll', success: true })
          } else {
            results.push({ action: 'resize_broll', success: false, error: 'לא נמצא B-Roll בזמן שצוין' })
          }
          break
        }

        case 'delete_all_broll': {
          store.removeAllBRollItems()
          results.push({ action: 'delete_all_broll', success: true })
          break
        }

        case 'add_animation': {
          const allItems = store.bRollItems
          const animType = action.params.type || 'fadeIn'
          allItems.forEach(item => {
            store.updateBRollItem(item.id, {
              entranceAnimation: animType as any,
              exitAnimation: (animType === 'fadeIn' ? 'fadeOut' : 'none') as any,
            })
          })
          results.push({ action: 'add_animation', success: true, count: allItems.length })
          break
        }

        default:
          results.push({ action: action.action, success: false, error: `פעולה לא מוכרת: ${action.action}` })
      }
    } catch (err: any) {
      results.push({ action: action.action, success: false, error: err.message || 'שגיאה לא ידועה' })
    }
  }

  return results
}

function getActionDescription(action: AIAction): string {
  const descriptions: Record<string, string> = {
    add_broll: '🖼️ מוסיף B-Roll...',
    auto_broll: '🖼️ מייצר B-Roll אוטומטי...',
    add_captions: '📝 מוסיף כתוביות...',
    change_caption_style: '🎨 משנה סגנון כתוביות...',
    delete_range: '✂️ מוחק קטע...',
    remove_filler_words: '✂️ מסיר מילות מילוי...',
    generate_content: '📝 מייצר תוכן...',
    translate: '🌐 מתרגם...',
    mute_range: '🔇 משתיק קטע...',
    suggest_clips: '🎬 מציע קליפים...',
    move_broll: '↔️ מזיז B-Roll...',
    resize_broll: '📐 משנה גודל B-Roll...',
    delete_all_broll: '🗑️ מוחק כל B-Roll...',
    add_animation: '✨ מוסיף אנימציה...',
  }
  return descriptions[action.action] || `מבצע ${action.action}...`
}

export function formatActionResults(results: ActionResult[]): string {
  const lines: string[] = []

  for (const r of results) {
    if (r.success) {
      switch (r.action) {
        case 'add_broll':
          lines.push(`🖼️ נוסף B-Roll: ${r.detail}`)
          break
        case 'auto_broll':
          lines.push(`🖼️ ${r.detail}`)
          break
        case 'add_captions':
          lines.push('📝 נוספו כתוביות')
          break
        case 'change_caption_style':
          lines.push('🎨 סגנון הכתוביות שונה')
          break
        case 'delete_range':
          lines.push('✂️ נמחק קטע')
          break
        case 'remove_filler_words':
          lines.push(`✂️ הוסרו ${r.count} מילות מילוי`)
          break
        case 'generate_content':
          lines.push(`📝 נוצר תוכן`)
          if (r.content) lines.push(r.content)
          break
        case 'translate':
          lines.push('🌐 התוכן תורגם')
          break
        case 'mute_range':
          lines.push('🔇 קטע הושתק')
          break
        case 'suggest_clips':
          lines.push('🎬 קליפים מוצעים:')
          if (r.clips) {
            r.clips.forEach((c: any, i: number) => {
              lines.push(`  ${i + 1}. ${c.title || 'קליפ'} (${c.startTime}s-${c.endTime}s) ${'⭐'.repeat(c.viralScore || 3)}`)
            })
          }
          break
        case 'delete_all_broll':
          lines.push('🗑️ הוסרו כל תמונות ה-B-Roll')
          break
        case 'add_animation':
          lines.push(`✨ נוספה אנימציה ל-${r.count} פריטים`)
          break
        default:
          lines.push(`✅ ${r.action} בוצע`)
      }
    } else {
      lines.push(`❌ ${r.error || r.action + ' נכשל'}`)
    }
  }

  return lines.join('\n')
}
