import { useState, useRef, useEffect } from 'react'
import { useAutoEditorStore, type QualityReport } from '../store/autoEditorStore'
import { selectABVersion } from '../orchestrator'

function ensureFullUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return `http://localhost:3001${url}`
  return `http://localhost:3001/uploads/${url}`
}

export default function CompareVersions() {
  const versionA = useAutoEditorStore((s) => s.versionA)
  const versionB = useAutoEditorStore((s) => s.versionB)
  const versionAApproach = useAutoEditorStore((s) => s.versionAApproach)
  const versionBApproach = useAutoEditorStore((s) => s.versionBApproach)
  const qualityReport = useAutoEditorStore((s) => s.qualityReport)

  const [selected, setSelected] = useState<Set<'A' | 'B'>>(new Set())
  const [preferredForDesign, setPreferredForDesign] = useState<'A' | 'B' | null>(null)
  const [exporting, setExporting] = useState(false)

  if (!versionA || !versionB) return null

  const toggleVersion = (v: 'A' | 'B') => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setSelected(next)
    if (next.size === 1) setPreferredForDesign([...next][0])
    if (next.size === 0) setPreferredForDesign(null)
  }

  const handleConfirm = async () => {
    if (selected.size === 0) return
    if (selected.size === 2 && !preferredForDesign) return
    setExporting(true)
    await selectABVersion([...selected], preferredForDesign)
    setExporting(false)
  }

  const versionAUrl = versionA[0]?.files[0]?.url ? ensureFullUrl(versionA[0].files[0].url) : ''
  const versionBUrl = versionB[0]?.files[0]?.url ? ensureFullUrl(versionB[0].files[0].url) : ''

  const hasLoggedRef = useRef(false)
  useEffect(() => {
    if (!hasLoggedRef.current && versionAUrl && versionBUrl) {
      console.log('[COMPARE] Version A URL:', versionAUrl)
      console.log('[COMPARE] Version B URL:', versionBUrl)
      hasLoggedRef.current = true
    }
  }, [versionAUrl, versionBUrl])

  const isDisabled = selected.size === 0 || (selected.size === 2 && !preferredForDesign) || exporting

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-5xl mx-auto space-y-6 animate-fade-in" dir="rtl">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">בחר גרסה</h2>
          <p className="text-gray-400 text-sm">
            צפה בשתי הגרסאות. אפשר לבחור אחת או שתיהן.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {/* Version A */}
          <div
            className={`rounded-xl border-2 p-4 transition cursor-pointer ${
              selected.has('A') ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
            onClick={() => toggleVersion('A')}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-medium">גרסה A</h3>
              {selected.has('A') && <span className="text-purple-400">נבחרה</span>}
            </div>
            <p className="text-gray-400 text-xs mb-3">{versionAApproach}</p>
            {versionAUrl && (
              <video
                src={versionAUrl}
                className="w-full rounded-lg mb-3"
                controls
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                onError={(e) => console.error('[COMPARE] Version A video error:', versionAUrl, e)}
              />
            )}
          </div>

          {/* Version B */}
          <div
            className={`rounded-xl border-2 p-4 transition cursor-pointer ${
              selected.has('B') ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
            onClick={() => toggleVersion('B')}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-medium">גרסה B</h3>
              {selected.has('B') && <span className="text-purple-400">נבחרה</span>}
            </div>
            <p className="text-gray-400 text-xs mb-3">{versionBApproach}</p>
            {versionBUrl && (
              <video
                src={versionBUrl}
                className="w-full rounded-lg mb-3"
                controls
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                onError={(e) => console.error('[COMPARE] Version B video error:', versionBUrl, e)}
              />
            )}
          </div>
        </div>

        {/* If BOTH selected - ask preference */}
        {selected.size === 2 && (
          <div className="w-full bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
            <h4 className="text-purple-300 text-sm mb-3">בחרת שתי גרסאות. איזו מתאימה יותר לצורך העיצוב שלך?</h4>
            <div className="flex gap-3">
              <button
                onClick={() => setPreferredForDesign('A')}
                className={`flex-1 py-2 rounded-lg text-sm transition ${preferredForDesign === 'A' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
              >
                גרסה A
              </button>
              <button
                onClick={() => setPreferredForDesign('B')}
                className={`flex-1 py-2 rounded-lg text-sm transition ${preferredForDesign === 'B' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
              >
                גרסה B
              </button>
            </div>
          </div>
        )}

        {/* Quality Report */}
        {qualityReport && (
          <QualityReportDisplay report={qualityReport} />
        )}

        {/* Continue button */}
        <button
          onClick={handleConfirm}
          disabled={isDisabled}
          className="w-full max-w-md bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition"
        >
          {exporting
            ? 'מייצא לפלטפורמות...'
            : selected.size === 2
              ? 'ייצא שתי הגרסאות'
              : selected.size === 1
                ? `ייצא גרסה ${[...selected][0]}`
                : 'בחר גרסה'}
        </button>
      </div>
    </div>
  )
}

export function QualityReportDisplay({ report }: { report: QualityReport }) {
  return (
    <div className="w-full bg-white/5 rounded-xl p-4" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-medium">דוח איכות</h4>
        <span className={`text-lg font-bold ${
          report.score >= 80 ? 'text-green-400' :
          report.score >= 60 ? 'text-yellow-400' :
          'text-red-400'
        }`}>
          {report.score}/100
        </span>
      </div>

      {report.passed.map((p, i) => (
        <div key={`p-${i}`} className="text-green-400 text-xs py-0.5">
          {p}
        </div>
      ))}

      {report.issues.map((issue, i) => (
        <div key={`i-${i}`} className={`text-xs py-0.5 ${
          issue.severity === 'error' ? 'text-red-400' :
          issue.severity === 'warning' ? 'text-yellow-400' :
          'text-gray-400'
        }`}>
          {issue.severity === 'error' ? 'x' : issue.severity === 'warning' ? '!' : 'i'} {issue.message}
        </div>
      ))}
    </div>
  )
}
