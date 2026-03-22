import { useAutoEditorStore, type QualityReport } from '../store/autoEditorStore'

// CompareVersions is no longer used (A/B testing removed).
// Kept as placeholder; QualityReportDisplay is still used by ExportScreen.
export default function CompareVersions() {
  const versionA = useAutoEditorStore((s) => s.versionA)
  if (!versionA) return null

  return null
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
