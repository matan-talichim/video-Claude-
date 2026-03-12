import { useState } from 'react'
import { Sparkles, CheckCircle, Users } from 'lucide-react'
import { useAutoEditorStore } from '../store/autoEditorStore'

interface EnrichmentReviewProps {
  enrichment: any
  onApprove: (editedPrompt: string, selectedBRoll: any[], mainPresenter?: string) => void
}

export default function EnrichmentReview({ enrichment, onApprove }: EnrichmentReviewProps) {
  const transcript = useAutoEditorStore((s) => s.transcript)
  const detectedPresenter = useAutoEditorStore((s) => s.detectedPresenter)
  const presenterConfidence = useAutoEditorStore((s) => s.presenterConfidence)
  const [editedPrompt, setEditedPrompt] = useState(enrichment.enhanced_prompt || '')
  const MAX_BROLL = 3
  const [selectedBRoll, setSelectedBRoll] = useState<Set<number>>(() => {
    // Auto-select only top 3 (AI already ordered by relevance)
    const initial = new Set<number>()
    const suggestions = enrichment.broll_suggestions || []
    for (let i = 0; i < Math.min(MAX_BROLL, suggestions.length); i++) {
      initial.add(i)
    }
    return initial
  })
  const [mainPresenter, setMainPresenter] = useState<string>(detectedPresenter || transcript?.mainSpeaker || '')

  const brollSuggestions = enrichment.broll_suggestions || []
  const sortedSpeakers = transcript?.sortedSpeakers || []

  const handleApprove = () => {
    const selected = [...selectedBRoll].map(i => brollSuggestions[i]).filter(Boolean)
    onApprove(editedPrompt, selected, mainPresenter || undefined)
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-2xl mx-auto space-y-5 animate-fade-in" dir="rtl">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/20">
            <Sparkles size={24} className="text-purple-400" />
          </div>
          <h2 className="text-xl font-bold text-white">AI ניתח את הסרטון</h2>
          <p className="text-sm text-gray-400">בדוק את ההצעות ואשר להמשך</p>
        </div>

        {/* Video Summary */}
        {enrichment.video_summary && (
          <div className="w-full bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <h3 className="text-blue-400 font-medium text-sm mb-2">סיכום הסרטון</h3>
            <p className="text-white text-sm">{enrichment.video_summary}</p>
            {enrichment.key_topics?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {enrichment.key_topics.map((topic: string, i: number) => (
                  <span key={i} className="bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-full">{topic}</span>
                ))}
              </div>
            )}
            {(enrichment.detected_type || enrichment.target_audience) && (
              <div className="flex gap-3 mt-2 text-xs text-gray-400">
                {enrichment.detected_type && <span>סוג: {enrichment.detected_type}</span>}
                {enrichment.target_audience && <span>קהל: {enrichment.target_audience}</span>}
              </div>
            )}
          </div>
        )}

        {/* Best Hook */}
        {enrichment.best_hook && (
          <div className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
            <h3 className="text-yellow-400 font-medium text-sm mb-2">פתיחה מומלצת (Hook)</h3>
            <p className="text-white text-sm font-bold">
              "{typeof enrichment.best_hook === 'string' ? enrichment.best_hook : enrichment.best_hook.text}"
            </p>
            {enrichment.best_hook.start != null && (
              <p className="text-gray-400 text-xs mt-1">
                בשנייה {enrichment.best_hook.start?.toFixed?.(1) || enrichment.best_hook.start}
              </p>
            )}
            {enrichment.best_hook.why && (
              <p className="text-gray-500 text-xs mt-1">{enrichment.best_hook.why}</p>
            )}
          </div>
        )}

        {/* Enhanced Prompt */}
        <div className="w-full bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-purple-400 font-medium text-sm">פרומפט משופר</h3>
            <span className="text-xs text-gray-500">מבוסס על ניתוח התמלול</span>
          </div>
          <textarea
            value={editedPrompt}
            onChange={e => setEditedPrompt(e.target.value)}
            className="w-full bg-black/30 text-white text-sm rounded-lg p-3 min-h-[100px] resize-none border border-white/5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
            dir="rtl"
          />
          <p className="text-xs text-gray-600 mt-1">אפשר לערוך את הפרומפט לפני שממשיכים</p>
        </div>

        {/* B-Roll Suggestions */}
        {brollSuggestions.length > 0 && (
          <div className="w-full bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-green-400 font-medium text-sm">B-Roll מוצע ({brollSuggestions.length})</h3>
              <span className="text-gray-400 text-xs">{selectedBRoll.size}/{MAX_BROLL} נבחרו</span>
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setSelectedBRoll(new Set([0, 1, 2].filter(i => i < brollSuggestions.length)))}
                className="text-xs text-purple-400 hover:text-purple-300">בחר מומלצים</button>
              <button onClick={() => setSelectedBRoll(new Set())}
                className="text-xs text-gray-400 hover:text-gray-300">נקה</button>
            </div>

            <div className="space-y-2">
              {brollSuggestions.map((broll: any, i: number) => (
                <div key={i} onClick={() => {
                  setSelectedBRoll(prev => {
                    const next = new Set(prev)
                    if (next.has(i)) {
                      next.delete(i)
                    } else if (next.size < MAX_BROLL) {
                      next.add(i)
                    }
                    return next
                  })
                }} className={`p-3 rounded-lg cursor-pointer transition border-2 ${
                  selectedBRoll.has(i)
                    ? 'border-green-500 bg-green-500/10'
                    : selectedBRoll.size >= MAX_BROLL
                      ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                      : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}>
                  {i < 3 && (
                    <span className="text-xs bg-purple-600/50 text-purple-200 px-2 py-0.5 rounded-full mb-1 inline-block">מומלץ</span>
                  )}
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs truncate">"{broll.at_text || broll.trigger_text}"</p>
                      <p className="text-green-300 text-xs mt-1">{broll.description_he || broll.prompt_he}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {broll.at_time != null && (
                          <span className="text-gray-500 text-[10px]">
                            {(broll.at_time?.toFixed?.(1) || broll.at_time)}s
                          </span>
                        )}
                        {broll.duration && (
                          <span className="text-gray-500 text-[10px]">{broll.duration}s</span>
                        )}
                        {broll.why && (
                          <span className="text-gray-600 text-[10px]">{broll.why}</span>
                        )}
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedBRoll.has(i) ? 'border-green-500 bg-green-500' : 'border-gray-600'
                    }`}>
                      {selectedBRoll.has(i) && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Style & Music */}
        {(enrichment.style || enrichment.music_suggestion) && (
          <div className="w-full grid grid-cols-2 gap-3">
            {enrichment.style && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                <h4 className="text-orange-400 text-sm mb-1">סגנון מומלץ</h4>
                <p className="text-white text-xs">
                  {enrichment.style.pacing} {enrichment.style.color && `\u00B7 ${enrichment.style.color}`}
                </p>
                {enrichment.style.reason && (
                  <p className="text-gray-400 text-[10px] mt-1">{enrichment.style.reason}</p>
                )}
              </div>
            )}
            {(enrichment.style?.music_mood || enrichment.music_suggestion) && (
              <div className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-3">
                <h4 className="text-pink-400 text-sm mb-1">מוזיקה מומלצת</h4>
                <p className="text-white text-xs">
                  {enrichment.style?.music_mood || enrichment.music_suggestion?.mood}
                </p>
                {(enrichment.music_suggestion?.reason || enrichment.style?.music_reason) && (
                  <p className="text-gray-400 text-[10px] mt-1">
                    {enrichment.music_suggestion?.reason || enrichment.style?.music_reason}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Editing Notes / Warnings */}
        {enrichment.editing_notes?.length > 0 && (
          <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <h4 className="text-red-400 text-sm mb-1">שים לב</h4>
            {enrichment.editing_notes.map((note: string, i: number) => (
              <p key={i} className="text-gray-300 text-xs">{note}</p>
            ))}
          </div>
        )}
        {enrichment.warnings?.length > 0 && (
          <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <h4 className="text-red-400 text-sm mb-1">אזהרות</h4>
            {enrichment.warnings.map((w: string, i: number) => (
              <p key={i} className="text-gray-300 text-xs">{w}</p>
            ))}
          </div>
        )}

        {/* Speaker Selection (when multiple speakers detected) */}
        {sortedSpeakers.length > 1 && (
          <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-purple-400" />
              <h4 className="text-white text-sm font-medium">פרזנטור ראשי</h4>
            </div>
            {detectedPresenter && (
              <p className="text-gray-400 text-xs">
                המערכת זיהתה את <span className="text-purple-400 font-bold">{detectedPresenter}</span> כפרזנטור הראשי
                {presenterConfidence === 'high'
                  ? ' (ביטחון גבוה)'
                  : presenterConfidence === 'medium'
                    ? ' (ביטחון בינוני - מומלץ לאשר)'
                    : ' (ביטחון נמוך - מומלץ לבחור ידנית)'}
              </p>
            )}
            {!detectedPresenter && (
              <p className="text-gray-400 text-xs">
                זוהו {sortedSpeakers.length} דוברים. בחר מי הפרזנטור הראשי (רק הסגמנטים שלו ישמשו לעריכה):
              </p>
            )}
            <div className="space-y-1.5 mt-2">
              {sortedSpeakers.map((s: { speaker: string; time: number }) => (
                <button
                  key={s.speaker}
                  onClick={() => setMainPresenter(s.speaker)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition ${
                    mainPresenter === s.speaker
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  <span>{s.speaker}</span>
                  <span className="text-xs opacity-70">{Math.round(s.time)} שניות</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action button */}
        <div className="w-full space-y-2 pt-2 pb-8">
          <button onClick={handleApprove}
            className="w-full bg-gradient-to-l from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white py-3.5 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/20">
            <CheckCircle size={20} />
            אשר והתחל עריכה
          </button>
          <p className="text-xs text-gray-600 text-center">
            נבחרו {selectedBRoll.size} מתוך {brollSuggestions.length} קטעי B-Roll
          </p>
        </div>
      </div>
    </div>
  )
}
