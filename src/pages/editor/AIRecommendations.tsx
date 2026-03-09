import { useState, useCallback } from 'react'
import { executeAiActions, formatActionResults } from '../../services/aiActionExecutor'
import { useUIStore } from '../../stores/uiStore'
import type { AISuggestion } from '../../stores/aiStore'

interface AIRecommendationsProps {
  suggestions: AISuggestion[]
}

export default function AIRecommendations({ suggestions }: AIRecommendationsProps) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(suggestions.map((_, i) => i))
  )
  const [executing, setExecuting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentAction: '' })
  const [completed, setCompleted] = useState<number[]>([])
  const [done, setDone] = useState(false)
  const { addToast } = useUIStore()

  const toggleItem = (index: number) => {
    if (executing) return
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setSelected(next)
  }

  const selectAll = () => setSelected(new Set(suggestions.map((_, i) => i)))
  const selectNone = () => setSelected(new Set())

  const handleExecute = useCallback(async () => {
    const selectedSuggestions = suggestions.filter((_, i) => selected.has(i))
    if (selectedSuggestions.length === 0) return

    setExecuting(true)
    setProgress({ current: 0, total: selectedSuggestions.length, currentAction: '' })

    for (let i = 0; i < selectedSuggestions.length; i++) {
      const sug = selectedSuggestions[i]
      setProgress({
        current: i + 1,
        total: selectedSuggestions.length,
        currentAction: sug.text,
      })

      await executeAiActions([sug.action], (step, total, desc) => {
        setProgress(prev => ({ ...prev, currentAction: desc }))
      })

      const originalIndex = suggestions.indexOf(sug)
      setCompleted(prev => [...prev, originalIndex])

      // Small delay for visual feedback
      await new Promise(r => setTimeout(r, 400))
    }

    setExecuting(false)
    setDone(true)
    addToast(`בוצעו ${selectedSuggestions.length} פעולות בהצלחה!`, 'success')
  }, [suggestions, selected, addToast])

  const priorityConfig = {
    high: { label: 'חשוב', className: 'bg-red-500/20 text-red-400' },
    medium: { label: 'מומלץ', className: 'bg-yellow-500/20 text-yellow-400' },
    low: { label: 'אופציונלי', className: 'bg-green-500/20 text-green-400' },
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-sm text-white">המלצות לשיפור הסרטון</h4>
        {!executing && !done && (
          <div className="flex gap-2 text-[10px]">
            <button onClick={selectAll} className="text-purple-400 hover:text-purple-300 transition-colors">
              בחר הכל
            </button>
            <span className="text-gray-600">|</span>
            <button onClick={selectNone} className="text-purple-400 hover:text-purple-300 transition-colors">
              נקה הכל
            </button>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="space-y-1.5">
        {suggestions.map((sug, i) => {
          const priority = priorityConfig[sug.priority || 'medium']
          const isCompleted = completed.includes(i)

          return (
            <label
              key={i}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all
                ${selected.has(i) ? 'bg-purple-500/15 border border-purple-500/30' : 'bg-white/[0.03] border border-transparent'}
                ${isCompleted ? 'opacity-60' : ''}
                ${!executing ? 'hover:bg-purple-500/10' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggleItem(i)}
                disabled={executing || done}
                className="mt-0.5 accent-purple-500 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${priority.className}`}>
                    {priority.label}
                  </span>
                  {isCompleted && <span className="text-green-400 text-xs">&#10003;</span>}
                </div>
                <p className="text-xs text-gray-200 leading-relaxed">{sug.text}</p>
              </div>
            </label>
          )
        })}
      </div>

      {/* Selected count */}
      {!done && (
        <div className="text-[10px] text-gray-400">
          נבחרו {selected.size} מתוך {suggestions.length} המלצות
        </div>
      )}

      {/* Execute button */}
      {!executing && !done && (
        <button
          onClick={handleExecute}
          disabled={selected.size === 0}
          className={`w-full py-2.5 rounded-lg font-bold text-sm text-white transition-all
            ${selected.size > 0
              ? 'bg-purple-600 hover:bg-purple-500 cursor-pointer'
              : 'bg-gray-600 cursor-not-allowed opacity-50'}`}
        >
          בצע {selected.size} פעולות נבחרות
        </button>
      )}

      {/* Progress during execution */}
      {executing && (
        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="animate-spin w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full" />
            <span className="text-purple-300 text-xs font-medium">
              מבצע שינויים... ({progress.current}/{progress.total})
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 truncate">
            {progress.currentAction}
          </p>
        </div>
      )}

      {/* Completion summary */}
      {done && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-green-400 text-xs font-bold">כל הפעולות בוצעו בהצלחה!</p>
          <p className="text-[10px] text-gray-400 mt-1">
            בוצעו {completed.length} שיפורים. ניתן לבטל עם Cmd+Z
          </p>
        </div>
      )}
    </div>
  )
}
