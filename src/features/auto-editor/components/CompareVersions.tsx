import { useState } from 'react'
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

  const [selected, setSelected] = useState<'A' | 'B' | null>(null)

  if (!versionA || !versionB) return null

  const handleConfirm = () => {
    if (!selected) return
    selectABVersion(selected)
  }

  const versionAUrl = versionA[0]?.files[0]?.url ? ensureFullUrl(versionA[0].files[0].url) : ''
  const versionBUrl = versionB[0]?.files[0]?.url ? ensureFullUrl(versionB[0].files[0].url) : ''

  console.log('[COMPARE] Version A URL:', versionAUrl)
  console.log('[COMPARE] Version B URL:', versionBUrl)

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-5xl mx-auto space-y-6 animate-fade-in" dir="rtl">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">איזו גרסה עדיפה?</h2>
          <p className="text-gray-400 text-sm">
            צפה בשתי הגרסאות ובחר את המועדפת. הבחירה שלך עוזרת ל-AI להשתפר.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {/* Version A */}
          <div
            className={`rounded-xl border-2 p-4 transition cursor-pointer ${
              selected === 'A' ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
            onClick={() => setSelected('A')}
          >
            <h3 className="text-white font-medium mb-2">גרסה A</h3>
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
            <button
              onClick={(e) => { e.stopPropagation(); setSelected('A') }}
              className={`w-full py-2 rounded-lg font-medium transition ${
                selected === 'A' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'
              }`}
            >
              {selected === 'A' ? 'נבחרה' : 'בחר גרסה A'}
            </button>
          </div>

          {/* Version B */}
          <div
            className={`rounded-xl border-2 p-4 transition cursor-pointer ${
              selected === 'B' ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
            }`}
            onClick={() => setSelected('B')}
          >
            <h3 className="text-white font-medium mb-2">גרסה B</h3>
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
            <button
              onClick={(e) => { e.stopPropagation(); setSelected('B') }}
              className={`w-full py-2 rounded-lg font-medium transition ${
                selected === 'B' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'
              }`}
            >
              {selected === 'B' ? 'נבחרה' : 'בחר גרסה B'}
            </button>
          </div>
        </div>

        {/* Quality Report */}
        {qualityReport && (
          <QualityReportDisplay report={qualityReport} />
        )}

        <button
          onClick={handleConfirm}
          disabled={!selected}
          className="w-full max-w-md bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition"
        >
          המשך עם הגרסה הנבחרת
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
          {issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '!' : 'i'} {issue.message}
        </div>
      ))}
    </div>
  )
}
