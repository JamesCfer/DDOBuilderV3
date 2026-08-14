// Floating bug-report button (bottom right) and its report dialog. The report
// is posted to /api/bug-report, which relays it to the maintainer on Discord —
// the browser never sees any credentials.
//
// The button hides itself when the server has no Discord bot configured
// (/api/bug-report/config → { enabled: false }), so a fork without one simply
// has no bug button.

import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import styles from './BugReportWidget.module.css'

type Status = 'idle' | 'sending' | 'sent' | 'error'

interface BugReportWidgetProps {
  /** Current page name, sent along so a report says where it happened. */
  page?: string
}

export default function BugReportWidget({ page }: BugReportWidgetProps) {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [version, setVersion] = useState<string | undefined>()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.bugReportConfig()
      .then(cfg => setEnabled(cfg.enabled))
      .catch(() => setEnabled(false))
    api.version().then(v => setVersion(v.version)).catch(() => { /* optional context */ })
  }, [])

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  // Escape closes the dialog from anywhere inside it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
    setStatus('idle')
    setError('')
  }

  async function submit() {
    const body = text.trim()
    if (!body || status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      await api.sendBugReport({ text: body, page, version })
      setStatus('sent')
      setText('')
      // Leave the confirmation up briefly, then get out of the way.
      window.setTimeout(() => { setOpen(false); setStatus('idle') }, 1600)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not send the report')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter starts a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  if (!enabled) return null

  return (
    <>
      <button
        className={styles.fab}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Click to report a bug"
      >
        <BugIcon />
        <span className={styles.tooltip} role="tooltip">Click to report a bug</span>
      </button>

      {open && (
        <div className={styles.overlay} onClick={close}>
          <div
            className={styles.dialog}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Report a bug"
          >
            <div className={styles.header}>
              <span><BugIcon /> Report a bug</span>
              <button className={styles.closeBtn} type="button" onClick={close} aria-label="Close">✕</button>
            </div>

            {status === 'sent' ? (
              <div className={styles.sent}>Thanks — your report was sent.</div>
            ) : (
              <>
                <p className={styles.hint}>
                  What went wrong? Include what you were doing and what you expected.
                </p>
                <textarea
                  ref={textareaRef}
                  className={styles.textarea}
                  value={text}
                  maxLength={1500}
                  placeholder="Describe the bug…"
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {error && <div className={styles.error}>{error}</div>}
                <div className={styles.footer}>
                  <span className={styles.footerHint}>Enter to send · Shift+Enter for a new line</span>
                  <button
                    className={styles.sendBtn}
                    type="button"
                    onClick={() => void submit()}
                    disabled={!text.trim() || status === 'sending'}
                  >
                    {status === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function BugIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M9 6.5a3 3 0 0 1 6 0" />
        <path d="M4.5 10h2M17.5 10h2M3.5 14.5h3M17.5 14.5h3M5 19l2.2-1.8M19 19l-2.2-1.8" />
        <rect x="7.5" y="6.5" width="9" height="12" rx="4.5" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}
