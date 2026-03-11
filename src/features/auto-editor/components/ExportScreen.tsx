import { useState, useRef } from 'react'
import { Download, Play, PartyPopper, X } from 'lucide-react'
import { useAutoEditorStore, type VideoResult, type PlatformFile } from '../store/autoEditorStore'

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

  const [previewFile, setPreviewFile] = useState<{ file: PlatformFile; videoIndex: number } | null>(null)
  const [selectedVideoIdx, setSelectedVideoIdx] = useState(0)

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
            {videos.length} סרטונים | {totalFiles} קבצים | {input?.targetDuration} שניות כל אחד
          </p>
        </div>

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

        {/* Export buttons */}
        <div className="flex items-center gap-3 pt-2 flex-wrap justify-center">
          <button
            onClick={handleDownloadSelected}
            className="flex items-center gap-2 px-5 py-3 bg-accent-purple hover:bg-accent-purple/90 rounded-xl text-sm font-medium transition-all shadow-lg shadow-accent-purple/20"
          >
            <Download size={16} />
            ייצא סרטון נבחר ({videos[selectedVideoIdx]?.files.length || 0} קבצים)
          </button>
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 px-5 py-3 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.06] rounded-xl text-sm font-medium text-text-secondary transition-colors"
          >
            <Download size={16} />
            ייצא הכל ({totalFiles} קבצים)
          </button>
        </div>

        {/* Start over */}
        <div className="text-center pt-2 pb-8">
          <button
            onClick={onReset}
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            ← התחל מחדש
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
