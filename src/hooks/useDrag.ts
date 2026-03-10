import { useState, useCallback, useRef, useEffect } from 'react'

// ─── Snap System ───
export interface SnapPoint {
  time: number
  label?: string
}

export function snapToGrid(
  time: number,
  snapPoints: SnapPoint[],
  threshold: number = 0.15,
  altPressed: boolean = false
): { time: number; snapped: boolean; snapPoint?: SnapPoint } {
  if (altPressed) return { time, snapped: false }
  for (const point of snapPoints) {
    if (Math.abs(time - point.time) < threshold) {
      return { time: point.time, snapped: true, snapPoint: point }
    }
  }
  return { time, snapped: false }
}

export function generateSnapPoints(
  duration: number,
  playheadTime: number,
  clipEdges: number[],
  chapterTimes: number[],
  step: number = 5
): SnapPoint[] {
  const points: SnapPoint[] = []
  // Playhead
  points.push({ time: playheadTime, label: 'playhead' })
  // Clip edges
  for (const edge of clipEdges) {
    points.push({ time: edge, label: 'clip' })
  }
  // Chapter markers
  for (const ct of chapterTimes) {
    points.push({ time: ct, label: 'chapter' })
  }
  // Time ruler marks
  for (let t = 0; t <= duration; t += step) {
    points.push({ time: t, label: 'ruler' })
  }
  return points
}

// ─── Format Time ───
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── Timeline Drag Hook ───
export type TimelineDragType = 'move' | 'trim-start' | 'trim-end'

interface UseTimelineDragOptions {
  pixelsPerSecond: number
  duration: number
  snapPoints: SnapPoint[]
  onMove?: (id: string, newStartTime: number) => void
  onTrim?: (id: string, edge: 'start' | 'end', newTime: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  locked?: boolean
}

export function useTimelineDrag(options: UseTimelineDragOptions) {
  const { pixelsPerSecond, duration, snapPoints, onMove, onTrim, onDragStart, onDragEnd, locked } = options
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState<TimelineDragType | null>(null)
  const [tooltipTime, setTooltipTime] = useState<{ start: number; end: number } | null>(null)
  const [isSnapping, setIsSnapping] = useState(false)
  const dragRef = useRef<{
    itemId: string
    startX: number
    originalStart: number
    originalEnd: number
    altPressed: boolean
  } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, itemId: string, type: TimelineDragType, startTime: number, endTime: number) => {
      if (locked) return
      e.stopPropagation()
      e.preventDefault()
      setIsDragging(true)
      setDragType(type)
      dragRef.current = {
        itemId,
        startX: e.clientX,
        originalStart: startTime,
        originalEnd: endTime,
        altPressed: e.altKey,
      }
      onDragStart?.()

      const handleMouseMove = (moveE: MouseEvent) => {
        if (!dragRef.current) return
        const deltaX = moveE.clientX - dragRef.current.startX
        const deltaTime = deltaX / pixelsPerSecond
        dragRef.current.altPressed = moveE.altKey

        if (type === 'move') {
          const rawTime = Math.max(0, dragRef.current.originalStart + deltaTime)
          const itemDuration = dragRef.current.originalEnd - dragRef.current.originalStart
          const clampedTime = Math.min(rawTime, duration - itemDuration)
          const { time: snappedTime, snapped } = snapToGrid(
            clampedTime, snapPoints, 0.15, moveE.altKey
          )
          setIsSnapping(snapped)
          setTooltipTime({ start: snappedTime, end: snappedTime + itemDuration })
          onMove?.(dragRef.current.itemId, snappedTime)
        } else if (type === 'trim-start') {
          const rawTime = Math.max(0, dragRef.current.originalStart + deltaTime)
          const clampedTime = Math.min(rawTime, dragRef.current.originalEnd - 0.1)
          const { time: snappedTime, snapped } = snapToGrid(
            clampedTime, snapPoints, 0.15, moveE.altKey
          )
          setIsSnapping(snapped)
          setTooltipTime({ start: snappedTime, end: dragRef.current.originalEnd })
          onTrim?.(dragRef.current.itemId, 'start', snappedTime)
        } else if (type === 'trim-end') {
          const rawTime = Math.min(duration, dragRef.current.originalEnd + deltaTime)
          const clampedTime = Math.max(rawTime, dragRef.current.originalStart + 0.1)
          const { time: snappedTime, snapped } = snapToGrid(
            clampedTime, snapPoints, 0.15, moveE.altKey
          )
          setIsSnapping(snapped)
          setTooltipTime({ start: dragRef.current.originalStart, end: snappedTime })
          onTrim?.(dragRef.current.itemId, 'end', snappedTime)
        }
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        setDragType(null)
        setTooltipTime(null)
        setIsSnapping(false)
        dragRef.current = null
        onDragEnd?.()
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [pixelsPerSecond, duration, snapPoints, onMove, onTrim, onDragStart, onDragEnd, locked]
  )

  return { isDragging, dragType, tooltipTime, isSnapping, handleMouseDown }
}

// ─── Canvas Overlay Drag Hook ───
interface UseOverlayDragOptions {
  canvasWidth: number
  canvasHeight: number
  onUpdate: (updates: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void
  locked?: boolean
}

export function useOverlayDrag(options: UseOverlayDragOptions) {
  const { canvasWidth, canvasHeight, onUpdate, locked } = options
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [guides, setGuides] = useState<{ vertical: boolean; horizontal: boolean }>({ vertical: false, horizontal: false })

  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
    origRotation: number
    handle?: string
    shiftKey: boolean
    centerX: number
    centerY: number
  } | null>(null)

  const handleDragStart = useCallback((e: React.MouseEvent, x: number, y: number) => {
    if (locked) return
    e.stopPropagation()
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: x, origY: y,
      origW: 0, origH: 0, origRotation: 0,
      shiftKey: e.shiftKey, centerX: 0, centerY: 0,
    }

    const handleMove = (moveE: MouseEvent) => {
      if (!dragRef.current) return
      const dx = moveE.clientX - dragRef.current.startX
      const dy = moveE.clientY - dragRef.current.startY
      let newX = dragRef.current.origX + (dx / canvasWidth) * 100
      let newY = dragRef.current.origY + (dy / canvasHeight) * 100

      // Snap to center
      const newGuides = { vertical: false, horizontal: false }
      if (Math.abs(newX + dragRef.current.origW / 2 - 50) < 2) {
        newX = 50 - dragRef.current.origW / 2
        newGuides.vertical = true
      }
      if (Math.abs(newY + dragRef.current.origH / 2 - 50) < 2) {
        newY = 50 - dragRef.current.origH / 2
        newGuides.horizontal = true
      }
      setGuides(newGuides)

      onUpdate({ x: Math.max(0, Math.min(100, newX)), y: Math.max(0, Math.min(100, newY)) })
    }

    const handleUp = () => {
      setIsDragging(false)
      setGuides({ vertical: false, horizontal: false })
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [canvasWidth, canvasHeight, onUpdate, locked])

  const handleResizeStart = useCallback((
    e: React.MouseEvent, handle: string,
    x: number, y: number, w: number, h: number, lockAspectRatio: boolean
  ) => {
    if (locked) return
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(true)
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: x, origY: y, origW: w, origH: h,
      origRotation: 0, handle,
      shiftKey: e.shiftKey || lockAspectRatio,
      centerX: 0, centerY: 0,
    }

    const handleMove = (moveE: MouseEvent) => {
      if (!dragRef.current) return
      const dx = (moveE.clientX - dragRef.current.startX) / canvasWidth * 100
      const dy = (moveE.clientY - dragRef.current.startY) / canvasHeight * 100
      const shift = moveE.shiftKey || lockAspectRatio
      const h = dragRef.current.handle!
      let newX = dragRef.current.origX
      let newY = dragRef.current.origY
      let newW = dragRef.current.origW
      let newH = dragRef.current.origH

      if (h.includes('e')) newW = Math.max(5, dragRef.current.origW + dx)
      if (h.includes('w')) { newW = Math.max(5, dragRef.current.origW - dx); newX = dragRef.current.origX + dx }
      if (h.includes('s')) newH = Math.max(5, dragRef.current.origH + dy)
      if (h.includes('n')) { newH = Math.max(5, dragRef.current.origH - dy); newY = dragRef.current.origY + dy }

      if (shift) {
        const aspect = dragRef.current.origW / dragRef.current.origH
        if (h === 'e' || h === 'w') newH = newW / aspect
        else if (h === 'n' || h === 's') newW = newH * aspect
        else { newH = newW / aspect }
      }

      onUpdate({ x: newX, y: newY, width: newW, height: newH })
    }

    const handleUp = () => {
      setIsResizing(false)
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [canvasWidth, canvasHeight, onUpdate, locked])

  const handleRotateStart = useCallback((
    e: React.MouseEvent, centerX: number, centerY: number, currentRotation: number
  ) => {
    if (locked) return
    e.stopPropagation()
    e.preventDefault()
    setIsRotating(true)
    const rect = (e.target as HTMLElement).closest('.overlay-container')?.getBoundingClientRect()
    const cx = rect ? rect.left + rect.width / 2 : centerX
    const cy = rect ? rect.top + rect.height / 2 : centerY
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)

    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: 0, origY: 0, origW: 0, origH: 0,
      origRotation: currentRotation,
      shiftKey: false, centerX: cx, centerY: cy,
    }

    const handleMove = (moveE: MouseEvent) => {
      if (!dragRef.current) return
      const currentAngle = Math.atan2(moveE.clientY - dragRef.current.centerY, moveE.clientX - dragRef.current.centerX) * (180 / Math.PI)
      const deltaAngle = currentAngle - startAngle
      let newRotation = (dragRef.current.origRotation + deltaAngle) % 360
      if (newRotation < 0) newRotation += 360
      // Snap to 0, 90, 180, 270
      for (const snap of [0, 90, 180, 270, 360]) {
        if (Math.abs(newRotation - snap) < 5) { newRotation = snap % 360; break }
      }
      onUpdate({ rotation: newRotation })
    }

    const handleUp = () => {
      setIsRotating(false)
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [onUpdate, locked])

  return { isDragging, isResizing, isRotating, guides, handleDragStart, handleResizeStart, handleRotateStart }
}

// ─── List Reorder Hook ───
interface UseListReorderOptions<T> {
  items: T[]
  onReorder: (items: T[]) => void
  getId: (item: T) => string
}

export function useListReorder<T>(options: UseListReorderOptions<T>) {
  const { items, onReorder } = options
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setOverIndex(index)
  }, [])

  const handleDrop = useCallback(() => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      const newOrder = [...items]
      const [moved] = newOrder.splice(dragIndex, 1)
      newOrder.splice(overIndex, 0, moved)
      onReorder(newOrder)
    }
    setDragIndex(null)
    setOverIndex(null)
  }, [dragIndex, overIndex, items, onReorder])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setOverIndex(null)
  }, [])

  return { dragIndex, overIndex, handleDragStart, handleDragOver, handleDrop, handleDragEnd }
}

// ─── Keyboard support for drag ───
export function useDragKeyboard(
  isDragging: boolean,
  onNudge: (dx: number, dy: number) => void,
  onCancel: () => void,
  onConfirm: () => void
) {
  useEffect(() => {
    if (!isDragging) return
    const handler = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); onNudge(-step, 0); break
        case 'ArrowRight': e.preventDefault(); onNudge(step, 0); break
        case 'ArrowUp': e.preventDefault(); onNudge(0, -step); break
        case 'ArrowDown': e.preventDefault(); onNudge(0, step); break
        case 'Escape': e.preventDefault(); onCancel(); break
        case 'Enter': e.preventDefault(); onConfirm(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDragging, onNudge, onCancel, onConfirm])
}
