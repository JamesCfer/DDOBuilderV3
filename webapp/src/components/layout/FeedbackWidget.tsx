// Floating feedback button (bottom right) and its feedback dialog. What is
// sent is posted to /api/bug-report, which relays it to the maintainer on
// Discord — the browser never sees any credentials.
//
// The button says "Feedback" in words rather than being a lone bug glyph:
// people did not recognise the icon-only button and so never pressed it. It
// also takes ideas and questions, not only bugs, which is why the dialog
// leads with what kind of message this is.
//
// The button hides itself when the server has no Discord bot configured
// (/api/bug-report/config → { enabled: false }), so a fork without one simply
// has no feedback button.

import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import styles from './FeedbackWidget.module.css'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/** What the message is about — sets the tone of the relayed message. */
export type FeedbackKind = 'bug' | 'idea' | 'other'

const KINDS: Array<{ kind: FeedbackKind; label: string; icon: string; hint: string; placeholder: string }> = [
  {
    kind: 'bug',
    label: 'Something is broken',
    icon: '🐞',
    hint: 'What went wrong? Include what you were doing and what you expected.',
    placeholder: 'Describe the bug…',
  },
  {
    kind: 'idea',
    label: 'I have an idea',
    icon: '💡',
    hint: 'What would you like the builder to do? Tell us what it would help you with.',
    placeholder: 'Describe your idea…',
  },
  {
    kind: 'other',
    label: 'Something else',
    icon: '💬',
    hint: 'A question, a data mistake, or anything else — it all reaches the maintainer.',
    placeholder: 'Type your message…',
  },
]

interface FeedbackWidgetProps {
  /** Current page name, sent along so a message says where it came from. */
  page?: string
}

export default function FeedbackWidget({ page }: FeedbackWidgetProps) {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [version, setVersion] = useState<string | undefined>()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const active = KINDS.find(k => k.kind === kind) ?? KINDS[0]

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
      await api.sendBugReport({ text: body, page, version, kind })
      setStatus('sent')
      setText('')
      // Leave the confirmation up briefly, then get out of the way.
      window.setTimeout(() => { setOpen(false); setStatus('idle') }, 1600)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not send your feedback')
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
        aria-label="Send feedback — report a bug or suggest an idea"
        title="Send feedback — report a bug or suggest an idea"
      >
        <FeedbackIcon />
        <span className={styles.fabLabel}>Feedback</span>
      </button>

      {open && (
        <div className={styles.overlay} onClick={close}>
          <div
            className={styles.dialog}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Send feedback"
          >
            <div className={styles.header}>
              <span><FeedbackIcon /> Send feedback</span>
              <button className={styles.closeBtn} type="button" onClick={close} aria-label="Close">✕</button>
            </div>

            {status === 'sent' ? (
              <div className={styles.sent}>Thanks — your feedback was sent.</div>
            ) : (
              <>
                <div className={styles.kinds} role="radiogroup" aria-label="What is this about?">
                  {KINDS.map(k => (
                    <button
                      key={k.kind}
                      type="button"
                      role="radio"
                      aria-checked={kind === k.kind}
                      className={`${styles.kindBtn} ${kind === k.kind ? styles.kindBtnActive : ''}`}
                      onClick={() => setKind(k.kind)}
                    >
                      <span aria-hidden="true">{k.icon}</span> {k.label}
                    </button>
                  ))}
                </div>
                <p className={styles.hint}>{active.hint}</p>
                <textarea
                  ref={textareaRef}
                  className={styles.textarea}
                  value={text}
                  maxLength={1500}
                  placeholder={active.placeholder}
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

/** Speech bubble — read as "say something" far more readily than a bug does. */
function FeedbackIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.5 12.6c0 3.7-3.6 6.7-8.1 6.7-.9 0-1.8-.1-2.6-.35L4.7 20.6l1.3-3.2C4.4 16.2 3.5 14.5 3.5 12.6c0-3.7 3.6-6.7 8.1-6.7s8.9 3 8.9 6.7Z" />
        <path d="M8.6 11.6h6.8M8.6 14.4h4.4" />
      </g>
    </svg>
  )
}
