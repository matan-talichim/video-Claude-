import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface EditAction {
  type: string
  detail: string
  timestamp: number
}

export interface CompletedEdit {
  id: string
  projectId: string
  date: number
  aiActions: string[]
  aiSettings: Record<string, any>
  userChanges: EditAction[]
  satisfaction: number
}

interface UserEditingProfile {
  // === PREFERENCES (learned from behavior) ===
  fillerWordPreference: 'remove_all' | 'remove_most' | 'keep'
  fillerWordsKept: string[]
  silencePreference: 'aggressive' | 'moderate' | 'keep'
  silenceThreshold: number
  captionPreference: 'always' | 'sometimes' | 'never'
  preferredCaptionStyle: string
  preferredCaptionSize: number
  preferredCaptionPosition: string
  preferredCaptionLanguages: string[]
  brollPreference: 'lots' | 'some' | 'none'
  brollFrequency: number
  preferredBrollDuration: number
  preferredBrollProvider: string
  audioEnhancePreference: 'always' | 'sometimes' | 'never'
  preferredMusicVolume: number
  musicPreference: 'always' | 'sometimes' | 'never'
  preferredMusicMood: string
  duckingPreference: boolean
  eyeContactPreference: boolean
  centerSpeakerPreference: boolean
  preferredDesignStyle: string
  preferredFormat: string
  preferredCutSpeed: 'fast' | 'medium' | 'slow'
  preferredZoomFrequency: number

  // === RAW DATA ===
  editHistory: CompletedEdit[]
  totalEdits: number
  confidenceScore: number

  // === METHODS ===
  recordAutoEditResult: (projectId: string, aiActions: string[], aiSettings: Record<string, any>) => void
  recordUserChange: (projectId: string, action: EditAction) => void
  finalizeEdit: (projectId: string) => void
  getProfileForPrompt: () => string
  getConfidence: () => number
}

export const useUserProfileStore = create<UserEditingProfile>()(
  persist(
    (set, get) => ({
      fillerWordPreference: 'remove_all',
      fillerWordsKept: [],
      silencePreference: 'moderate',
      silenceThreshold: 1.0,
      captionPreference: 'always',
      preferredCaptionStyle: 'modern',
      preferredCaptionSize: 24,
      preferredCaptionPosition: 'bottom',
      preferredCaptionLanguages: ['he'],
      brollPreference: 'some',
      brollFrequency: 15,
      preferredBrollDuration: 4,
      preferredBrollProvider: 'seedance',
      audioEnhancePreference: 'always',
      preferredMusicVolume: 20,
      musicPreference: 'sometimes',
      preferredMusicMood: 'corporate',
      duckingPreference: true,
      eyeContactPreference: false,
      centerSpeakerPreference: false,
      preferredDesignStyle: 'minimalist',
      preferredFormat: '16:9',
      preferredCutSpeed: 'medium',
      preferredZoomFrequency: 6,
      editHistory: [],
      totalEdits: 0,
      confidenceScore: 0,

      recordAutoEditResult: (projectId, aiActions, aiSettings) => {
        const edit: CompletedEdit = {
          id: crypto.randomUUID(),
          projectId,
          date: Date.now(),
          aiActions,
          aiSettings,
          userChanges: [],
          satisfaction: 1.0,
        }
        set((state) => ({
          editHistory: [...state.editHistory.slice(-49), edit],
        }))
      },

      recordUserChange: (projectId, action) => {
        set((state) => {
          const history = [...state.editHistory]
          const editIndex = history.findIndex((e) => e.projectId === projectId)
          if (editIndex === -1) return state

          history[editIndex] = {
            ...history[editIndex],
            userChanges: [...history[editIndex].userChanges, action],
            satisfaction: Math.max(0, history[editIndex].satisfaction - 0.05),
          }

          return { editHistory: history }
        })
      },

      finalizeEdit: (projectId) => {
        const state = get()
        const edit = state.editHistory.find((e) => e.projectId === projectId)
        if (!edit) return

        const changes = edit.userChanges
        const updates: Partial<UserEditingProfile> = {}

        // Learn from filler word undos
        const undidFillers = changes.filter((c) => c.type === 'undo_filler_removal')
        if (undidFillers.length > 0) {
          const keptWords = undidFillers.map((c) => c.detail)
          updates.fillerWordsKept = [...new Set([...state.fillerWordsKept, ...keptWords])]
          if (undidFillers.length > 5) {
            updates.fillerWordPreference = 'keep'
          } else {
            updates.fillerWordPreference = 'remove_most'
          }
        }

        // Learn from silence undo
        const undidSilences = changes.filter((c) => c.type === 'undo_silence_shortening')
        if (undidSilences.length > 3) {
          updates.silencePreference = 'keep'
        }

        // Learn caption style
        const captionChanges = changes.filter((c) => c.type === 'changed_caption_style')
        if (captionChanges.length > 0) {
          updates.preferredCaptionStyle = captionChanges[captionChanges.length - 1].detail
        }

        // Learn caption removal
        if (changes.some((c) => c.type === 'removed_captions')) {
          updates.captionPreference = 'never'
        }

        // Learn B-Roll preference
        const removedBroll = changes.filter((c) => c.type === 'removed_broll').length
        const totalBroll = edit.aiSettings.brollCount || 0
        if (removedBroll > totalBroll * 0.5) {
          updates.brollPreference = 'none'
        } else if (removedBroll > 0) {
          updates.brollPreference = 'some'
        }
        const addedBroll = changes.filter((c) => c.type === 'added_broll').length
        if (addedBroll > 2) {
          updates.brollPreference = 'lots'
        }

        // Learn music volume
        const volumeChanges = changes.filter((c) => c.type === 'changed_music_volume')
        if (volumeChanges.length > 0) {
          const lastVolume = parseInt(volumeChanges[volumeChanges.length - 1].detail)
          if (!isNaN(lastVolume)) {
            updates.preferredMusicVolume = lastVolume
          }
        }

        // Learn music removal
        if (changes.some((c) => c.type === 'removed_music')) {
          updates.musicPreference = 'never'
        }

        // Learn format preference
        const formatChanges = changes.filter((c) => c.type === 'changed_format')
        if (formatChanges.length > 0) {
          updates.preferredFormat = formatChanges[formatChanges.length - 1].detail
        }

        // Learn eye contact preference
        if (changes.some((c) => c.type === 'enabled_eye_contact')) {
          updates.eyeContactPreference = true
        }
        if (changes.some((c) => c.type === 'disabled_eye_contact')) {
          updates.eyeContactPreference = false
        }

        // Update confidence
        const newTotalEdits = state.totalEdits + 1
        const confidence = Math.min(1, newTotalEdits / 10)

        set({
          ...updates,
          totalEdits: newTotalEdits,
          confidenceScore: confidence,
        })
      },

      getProfileForPrompt: () => {
        const s = get()
        if (s.confidenceScore < 0.1) return ''

        let profile = `\nפרופיל עריכה של המשתמש (רמת ביטחון: ${Math.round(s.confidenceScore * 100)}%):\n`

        if (s.confidenceScore >= 0.2) {
          profile += `- מילות מילוי: ${s.fillerWordPreference === 'keep' ? 'לא להסיר' : s.fillerWordPreference === 'remove_most' ? 'להסיר רוב, לשמור: ' + s.fillerWordsKept.join(', ') : 'להסיר הכל'}\n`
          profile += `- שתיקות: ${s.silencePreference === 'keep' ? 'לא לקצר' : s.silencePreference === 'aggressive' ? 'לקצר אגרסיבי' : 'לקצר מתון (סף: ' + s.silenceThreshold + 'שניות)'}\n`
        }

        if (s.confidenceScore >= 0.3) {
          profile += `- כתוביות: ${s.captionPreference === 'never' ? 'בלי' : 'סגנון ' + s.preferredCaptionStyle}\n`
          profile += `- B-Roll: ${s.brollPreference === 'none' ? 'בלי' : s.brollPreference === 'lots' ? 'הרבה' : 'מעט'}\n`
        }

        if (s.confidenceScore >= 0.5) {
          profile += `- מוזיקה: ${s.musicPreference === 'never' ? 'בלי' : 'עוצמה ' + s.preferredMusicVolume + '%, מצב רוח: ' + s.preferredMusicMood}\n`
          profile += `- קשר עין: ${s.eyeContactPreference ? 'כן' : 'לא'}\n`
          profile += `- פורמט מועדף: ${s.preferredFormat}\n`
          profile += `- קצב חיתוך: ${s.preferredCutSpeed}\n`
        }

        // High-satisfaction edits
        const goodEdits = s.editHistory.filter((e) => e.satisfaction >= 0.8).slice(-3)
        if (goodEdits.length > 0) {
          profile += `\nעריכות שהמשתמש היה מרוצה מהן:\n`
          goodEdits.forEach((e) => {
            profile += `- פעולות: ${e.aiActions.join(', ')} | שביעות רצון: ${Math.round(e.satisfaction * 100)}%\n`
          })
        }

        // Anti-patterns
        const badPatterns = s.editHistory
          .filter((e) => e.satisfaction < 0.5)
          .flatMap((e) => e.userChanges.map((c) => c.type))
        const commonUndos = findMostCommon(badPatterns, 3)
        if (commonUndos.length > 0) {
          profile += `\nדברים שהמשתמש לא אוהב (תמיד מבטל):\n`
          commonUndos.forEach((pattern) => {
            profile += `- ${translatePattern(pattern)}\n`
          })
        }

        return profile
      },

      getConfidence: () => get().confidenceScore,
    }),
    {
      name: 'user-editing-profile',
    }
  )
)

function findMostCommon(arr: string[], top: number): string[] {
  const counts: Record<string, number> = {}
  arr.forEach((item) => {
    counts[item] = (counts[item] || 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .filter(([, count]) => count >= 2)
    .map(([key]) => key)
}

function translatePattern(pattern: string): string {
  const translations: Record<string, string> = {
    undo_filler_removal: 'הסרת מילות מילוי',
    undo_silence_shortening: 'קיצור שתיקות',
    removed_captions: 'כתוביות',
    removed_broll: 'B-Roll',
    removed_music: 'מוזיקה',
    undo_audio_enhance: 'שיפור אודיו',
  }
  return translations[pattern] || pattern
}
