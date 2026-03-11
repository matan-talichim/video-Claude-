import { useState, useRef } from 'react'
import { Download, Play, PartyPopper, X } from 'lucide-react'
import { useAutoEditorStore, type VideoResult, type PlatformFile } from '../store/autoEditorStore'
import { useProjectsStore } from '../../../stores/projectsStore'
import { QualityReportDisplay } from './CompareVersions'

interface ExportScreenProps {
  onReset: () => void
}

function forceDownload(url: string, filename: string) {
  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    })
}

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  reels: 'Instagram Reels',
  shorts: 'YouTube Shorts',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
  story: 'Story',
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: '📱',
  reels: '📸',
  shorts: '🎬',
  youtube: '▶️',
  linkedin: '💼',
  facebook: '👤',
  twitter: '🐦',
  story: '📲',
}

interface VideoPreviewModalProps {
  file: PlatformFile
  videoIndex: number
  onClose: () => void
}

function VideoPreviewModal({ file, videoIndex, onClose }: VideoPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div className="max-w-3xl w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4" dir="rtl">
          <h3 className="text-white font-bold">
            סרטון {videoIndex} - {PLATFORM_LABELS[file.platform] || file.platform}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <video
          ref={videoRef}
          src={file.url}
          className="w-full rounded-xl"
          controls
          autoPlay
        />
        <div className="flex gap-3 mt-4" dir="rtl">
          <button
            onClick={() => forceDownload(file.url, `סרטון_${videoIndex}_${file.platform}.mp4`)}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Download size={16} />
            הורד
          </button>
        </div>
      </div>
    </div>
  )
}

interface VideoCardProps {
  video: VideoResult
  file: PlatformFile
  onPreview: () => void
}

function VideoCard({ video, file, onPreview }: VideoCardProps) {
  return (
    <div className="bg-white/5 rounded-xl p-4">
      {/* Video info */}
      <div className="flex justify-between items-center mb-3" dir="rtl">
        <div>
          <h4 className="text-white font-medium text-sm">
            {PLATFORM_ICONS[file.platform] || ''} {PLATFORM_LABELS[file.platform] || file.platform}
          </h4>
          <span className="text-gray-400 text-xs">{file.ratio} | {file.resolution} | {file.sizeMB}MB</span>
        </div>
      </div>

      {/* AI duration info */}
      {video.optimalDuration && (
        <div className="text-xs text-gray-400 mb-2">
          {video.optimalDuration}שנ {video.recommendedPlatform && `• ${video.recommendedPlatform}`}
          {video.durationReasoning && (
            <span className="text-gray-600 block mt-0.5">💡 {video.durationReasoning}</span>
          )}
        </div>
      )}

      {/* Thumbnail with play overlay */}
      <div
        className="relative rounded-lg overflow-hidden bg-black aspect-video mb-3 cursor-pointer group"
        onClick={onPreview}
      >
        <video
          src={file.url}
          className="w-full h-full object-contain"
          preload="metadata"
          muted
          onLoadedMetadata={(e) => {
            (e.target as HTMLVideoElement).currentTime = 1
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition">
          <div className="w-12 h-12 bg-purple-600/80 group-hover:bg-purple-600 rounded-full flex items-center justify-center transition">
            <Play size={20} className="text-white mr-[-2px]" fill="white" />
          </div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={() => forceDownload(file.url, `סרטון_${video.videoIndex}_${file.platform}.mp4`)}
        className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
      >
        <Download size={14} />
        הורד
      </button>
    </div>
  )
}

export default function ExportScreen({ onReset }: ExportScreenProps) {
  const processedVideos = useAutoEditorStore((s) => s.processedVideos)
  const results = useAutoEditorStore((s) => s.results)
  const input = useAutoEditorStore((s) => s.input)
  const qualityReport = useAutoEditorStore((s) => s.qualityReport)
  const selectedVersion = useAutoEditorStore((s) => s.selectedVersion)

  const [previewFile, setPreviewFile] = useState<{ file: PlatformFile; videoIndex: number } | null>(null)
  const [selectedVideoIdx, setSelectedVideoIdx] = useState(0)
  const [openingEditor, setOpeningEditor] = useState(false)

  // Use processedVideos (new format) if available, otherwise fallback to legacy results
  const videos: VideoResult[] = processedVideos || []

  // If we only have legacy results, convert them
  if (videos.length === 0 && results && results.length > 0) {
    const grouped = results.reduce<Record<number, VideoResult>>((acc, r) => {
      if (!acc[r.videoIndex]) {
        acc[r.videoIndex] = { videoIndex: r.videoIndex, files: [] }
      }
      acc[r.videoIndex].files.push({
        platform: r.platform,
        ratio: r.width > r.height ? '16:9' : r.width === r.height ? '1:1' : '9:16',
        resolution: `${r.width}x${r.height}`,
        filename: r.fileName,
        url: r.url,
        sizeMB: 0,
      })
      return acc
    }, {})
    videos.push(...Object.values(grouped))
  }

  if (videos.length === 0) return null

  const totalFiles = videos.reduce((sum, v) => sum + v.files.length, 0)
  const isAiDuration = input?.targetDuration === -1

  const handleDownloadSelected = () => {
    const selectedVideo = videos[selectedVideoIdx]
    if (!selectedVideo) return
    selectedVideo.files.forEach((file, i) => {
      setTimeout(() => {
        forceDownload(file.url, `סרטון_${selectedVideo.videoIndex}_${file.platform}.mp4`)
      }, i * 500)
    })
  }

  const handleDownloadAll = () => {
    let delay = 0
    videos.forEach(video => {
      video.files.forEach(file => {
        setTimeout(() => {
          forceDownload(file.url, `סרטון_${video.videoIndex}_${file.platform}.mp4`)
        }, delay)
        delay += 500
      })
    })
  }

  const openInMainEditor = async () => {
    setOpeningEditor(true)

    try {
      const projectName = `עריכה אוטומטית - ${new Date().toLocaleDateString('he-IL')}`
      const videoFiles: Array<{ file: File; blobUrl: string; mediaType: 'video' | 'audio' }> = []

      for (const videoResult of videos) {
        const mainFile = videoResult.files[0]
        if (!mainFile) continue

        const response = await fetch(mainFile.url)
        const blob = await response.blob()
        const file = new File([blob], `סרטון_${videoResult.videoIndex}.mp4`, { type: 'video/mp4' })
        const blobUrl = URL.createObjectURL(blob)

        videoFiles.push({
          file,
          blobUrl,
          mediaType: 'video',
        })
      }

      const projectsStore = useProjectsStore.getState()
      const projectId = projectsStore.addProject({
        name: projectName,
        source: 'upload',
        videos: videoFiles,
      })

      // Store all platform versions as edited files
      const editedFiles = videos.flatMap(video =>
        video.files.map(file => ({
          id: crypto.randomUUID(),
          name: `סרטון ${video.videoIndex} - ${PLATFORM_LABELS[file.platform] || file.platform}`,
          format: file.ratio,
          platform: file.platform,
          blobUrl: file.url,
          createdAt: new Date(),
          appliedEdits: ['עריכה אוטומטית'],
        }))
      )
      const editorStore = useAutoEditorStore.getState()
      editorStore.setEditedFiles(editedFiles)

      window.location.href = `/editor/${projectId}`
    } catch (error) {
      console.error('Failed to open in editor:', error)
    }

    setOpeningEditor(false)
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0A0A0F]/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-screen flex flex-col items-center py-8 px-4 max-w-4xl mx-auto space-y-6 animate-fade-in" dir="rtl">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center border border-green-500/20">
            <PartyPopper size={28} className="text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-text-primary">
            הסרטונים מוכנים!
          </h2>
          <p className="text-sm text-text-muted">
            {videos.length} סרטונים | {totalFiles} קבצים{isAiDuration ? '' : ` | ${input?.targetDuration} שניות כל אחד`}
          </p>
        </div>

        {/* AI Duration reasoning */}
        {isAiDuration && videos.some(v => v.optimalDuration) && (
          <div className="w-full bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
            <h4 className="text-purple-300 text-sm font-medium mb-2">🤖 AI בחר את האורך:</h4>
            {videos.map(v => (
              <div key={v.videoIndex} className="text-xs text-gray-400 mb-1">
                <span className="text-white">סרטון {v.videoIndex}: {v.optimalDuration} שניות</span>
                {v.durationReasoning && (
                  <span className="text-gray-500"> — {v.durationReasoning}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Selected version info */}
        {selectedVersion && (
          <div className="w-full bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <p className="text-green-300 text-sm font-medium">
              נבחרה גרסה {selectedVersion}
            </p>
          </div>
        )}

        {/* Quality Report */}
        {qualityReport && (
          <div className="w-full">
            <QualityReportDisplay report={qualityReport} />
          </div>
        )}

        {/* Video tabs */}
        {videos.length > 1 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {videos.map((video, i) => (
              <button
                key={video.videoIndex}
                onClick={() => setSelectedVideoIdx(i)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedVideoIdx === i
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                    : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
              >
                סרטון {video.videoIndex}
              </button>
            ))}
          </div>
        )}

        {/* Video cards grid for selected video */}
        {videos[selectedVideoIdx] && (
          <div className="w-full">
            <h3 className="text-lg font-bold text-white mb-3">
              סרטון {videos[selectedVideoIdx].videoIndex}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {videos[selectedVideoIdx].files.map((file, j) => (
                <VideoCard
                  key={j}
                  video={videos[selectedVideoIdx]}
                  file={file}
                  onPreview={() => setPreviewFile({ file, videoIndex: videos[selectedVideoIdx].videoIndex })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="w-full space-y-3 mt-6">
          {/* Primary: Open in editor */}
          <button
            onClick={openInMainEditor}
            disabled={openingEditor}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {openingEditor ? '⏳ פותח...' : '✏️ פתח בעורך להמשך עריכה'}
          </button>
          <p className="text-xs text-gray-500 text-center">
            פתח את הסרטון הערוך בעורך הראשי כדי לבצע התאמות, להוסיף אלמנטים, ולייצא
          </p>

          {/* Secondary: Downloads */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              onClick={handleDownloadSelected}
              className="flex items-center gap-2 px-5 py-3 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] rounded-xl text-sm font-medium text-text-secondary transition-colors"
            >
              <Download size={16} />
              הורד סרטון נבחר ({videos[selectedVideoIdx]?.files.length || 0} קבצים)
            </button>
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 px-5 py-3 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] rounded-xl text-sm font-medium text-text-secondary transition-colors"
            >
              <Download size={16} />
              הורד הכל ({totalFiles} קבצים)
            </button>
          </div>

          {/* Tertiary: Start over */}
          <button
            onClick={onReset}
            className="text-gray-500 hover:text-white text-sm text-center w-full py-2 transition-colors"
          >
            ← התחל עריכה חדשה
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {previewFile && (
        <VideoPreviewModal
          file={previewFile.file}
          videoIndex={previewFile.videoIndex}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}
