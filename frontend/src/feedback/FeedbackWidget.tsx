import { useCallback, useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { getCollectedLogs } from './logCollector'
import './FeedbackWidget.css'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

const SPOTLIGHT_RADIUS = 150
const DIM_COLOR = 'rgba(8, 10, 18, 0.45)'
const RING_COLOR = '#f5490f'

type WidgetMode = 'idle' | 'targeting' | 'capturing' | 'form'

type Labels = {
  fab: string
  hint: string
  cancelHint: string
  formTitle: string
  screenshotAlt: string
  descriptionLabel: string
  descriptionPlaceholder: string
  logsNotice: string
  submit: string
  submitting: string
  cancel: string
  success: string
  error: string
}

const labelsByLanguage: Record<'en' | 'ko', Labels> = {
  ko: {
    fab: '피드백 남기기',
    hint: '문제가 있는 부분을 클릭하면 화면이 캡처됩니다',
    cancelHint: 'ESC 키로 취소',
    formTitle: '피드백 보내기',
    screenshotAlt: '하이라이트된 스크린샷',
    descriptionLabel: '문제 상황 설명',
    descriptionPlaceholder: '어떤 문제가 있었는지, 어떤 동작을 기대했는지 알려주세요.',
    logsNotice: '애플리케이션 로그가 함께 보내집니다.',
    submit: '피드백 보내기',
    submitting: '보내는 중...',
    cancel: '취소',
    success: '피드백이 접수되었습니다. 감사합니다!',
    error: '피드백 전송에 실패했습니다. 잠시 후 다시 시도해주세요.',
  },
  en: {
    fab: 'Leave feedback',
    hint: 'Click the area with the problem to capture the screen',
    cancelHint: 'Press ESC to cancel',
    formTitle: 'Send feedback',
    screenshotAlt: 'Highlighted screenshot',
    descriptionLabel: 'Describe the problem',
    descriptionPlaceholder: 'Tell us what went wrong and what you expected to happen.',
    logsNotice: 'Application logs are sent along with your feedback.',
    submit: 'Send feedback',
    submitting: 'Sending...',
    cancel: 'Cancel',
    success: 'Feedback submitted. Thank you!',
    error: 'Failed to send feedback. Please try again.',
  },
}

function spotlightBackground(x: number, y: number): string {
  return `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${x}px ${y}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 62%, ${DIM_COLOR} 100%)`
}

function viewportSize() {
  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  }
}

function cropToViewport(
  rendered: HTMLCanvasElement,
  viewportWidth: number,
  viewportHeight: number,
): HTMLCanvasElement {
  // rendered is the full document at scale 1 (CSS pixels), so the visible area
  // is the rectangle starting at the current scroll offset.
  const canvas = document.createElement('canvas')
  canvas.width = viewportWidth
  canvas.height = viewportHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return rendered

  ctx.drawImage(
    rendered,
    window.scrollX,
    window.scrollY,
    viewportWidth,
    viewportHeight,
    0,
    0,
    viewportWidth,
    viewportHeight,
  )
  return canvas
}

function drawSpotlightOnCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  viewportWidth: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const scale = canvas.width / viewportWidth
  if (!Number.isFinite(scale) || scale <= 0) return

  const x = clientX * scale
  const y = clientY * scale
  const radius = SPOTLIGHT_RADIUS * scale

  const gradient = ctx.createRadialGradient(x, y, radius * 0.62, x, y, radius)
  gradient.addColorStop(0, 'rgba(8, 10, 18, 0)')
  gradient.addColorStop(1, DIM_COLOR)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.strokeStyle = RING_COLOR
  ctx.lineWidth = 3 * scale
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, 5 * scale, 0, Math.PI * 2)
  ctx.fillStyle = RING_COLOR
  ctx.fill()
}

export default function FeedbackWidget({
  language,
  authFetch,
}: {
  language: 'en' | 'ko'
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}) {
  const labels = labelsByLanguage[language]
  const [mode, setMode] = useState<WidgetMode>('idle')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [capturedPage, setCapturedPage] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState<'success' | 'error' | null>(null)

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)

  const closeAll = useCallback(() => {
    setMode('idle')
    setScreenshot(null)
    setDescription('')
    setNotice(null)
  }, [])

  useEffect(() => {
    if (mode !== 'targeting') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, closeAll])

  useEffect(() => {
    if (notice !== 'success') return
    const timer = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  function handleSpotlightMove(event: React.MouseEvent<HTMLDivElement>) {
    const x = event.clientX
    const y = event.clientY
    if (overlayRef.current) {
      overlayRef.current.style.background = spotlightBackground(x, y)
    }
    if (ringRef.current) {
      ringRef.current.style.transform = `translate(${x - SPOTLIGHT_RADIUS}px, ${y - SPOTLIGHT_RADIUS}px)`
      ringRef.current.style.opacity = '1'
    }
  }

  async function handleSpotlightClick(event: React.MouseEvent<HTMLDivElement>) {
    const clientX = event.clientX
    const clientY = event.clientY
    // html2canvas renders transparent gradient stops as white, so the spotlight
    // overlay must be unmounted (mode 'capturing' does not render it) and the
    // React commit flushed before the capture starts.
    setMode('capturing')
    await new Promise((resolve) => setTimeout(resolve, 80))

    try {
      const viewport = viewportSize()
      const rendered = await html2canvas(document.body, {
        scale: 1,
        logging: false,
        useCORS: true,
        ignoreElements: (element) => element.classList?.contains('feedback-ui'),
      })

      // html2canvas renders the whole document; its crop options are unreliable,
      // so explicitly copy just the visible viewport rectangle (offset by the
      // current scroll position) into a viewport-sized canvas.
      const canvas = cropToViewport(rendered, viewport.width, viewport.height)
      drawSpotlightOnCanvas(canvas, clientX, clientY, viewport.width)
      setScreenshot(canvas.width > 0 ? canvas.toDataURL('image/jpeg', 0.82) : null)
      setCapturedPage(window.location.pathname)
      setMode('form')
    } catch (error) {
      console.warn('Feedback screenshot capture failed:', error)
      setCapturedPage(window.location.pathname)
      setScreenshot(null)
      setMode('form')
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!description.trim() || isSubmitting) return

    setIsSubmitting(true)
    setNotice(null)

    try {
      const response = await authFetch(`${apiBaseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: capturedPage || window.location.pathname,
          description: description.trim(),
          logs: getCollectedLogs() || null,
          screenshot,
          viewport: `${viewportSize().width}x${viewportSize().height}`,
        }),
      })

      if (!response.ok) {
        throw new Error('feedback submit failed')
      }

      closeAll()
      setNotice('success')
    } catch {
      setNotice('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button
        className="feedback-ui feedback-fab"
        type="button"
        onClick={() => {
          setNotice(null)
          setMode('targeting')
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M2.5 3.5h11v7h-6l-3 2.6v-2.6h-2v-7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        {labels.fab}
      </button>

      {mode === 'targeting' ? (
        <div
          className="feedback-ui feedback-spotlight"
          ref={overlayRef}
          style={{
            background: spotlightBackground(window.innerWidth / 2, window.innerHeight / 2),
          }}
          onMouseMove={handleSpotlightMove}
          onClick={handleSpotlightClick}
        >
          <div
            className="feedback-spotlight-ring"
            ref={ringRef}
            style={{ width: SPOTLIGHT_RADIUS * 2, height: SPOTLIGHT_RADIUS * 2 }}
          />
          <div className="feedback-spotlight-hint">
            <strong>{labels.hint}</strong>
            <span>{labels.cancelHint}</span>
          </div>
        </div>
      ) : null}

      {mode === 'form' ? (
        <div className="feedback-ui feedback-modal-backdrop" onClick={closeAll}>
          <div
            className="feedback-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{labels.formTitle}</h2>
            {screenshot ? (
              <img className="feedback-screenshot-preview" src={screenshot} alt={labels.screenshotAlt} />
            ) : null}
            <form onSubmit={handleSubmit}>
              <label className="feedback-field">
                {labels.descriptionLabel}
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={labels.descriptionPlaceholder}
                  rows={4}
                  autoFocus
                  required
                />
              </label>
              {notice === 'error' ? <p className="feedback-error">{labels.error}</p> : null}
              <div className="feedback-modal-actions">
                <span className="feedback-logs-notice">{labels.logsNotice}</span>
                <button type="button" className="feedback-btn-secondary" onClick={closeAll}>
                  {labels.cancel}
                </button>
                <button
                  type="submit"
                  className="feedback-btn-primary"
                  disabled={isSubmitting || !description.trim()}
                >
                  {isSubmitting ? labels.submitting : labels.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {notice === 'success' && mode === 'idle' ? (
        <div className="feedback-ui feedback-toast">{labels.success}</div>
      ) : null}
    </>
  )
}
