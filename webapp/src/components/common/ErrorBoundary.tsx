// Keeps one broken panel from taking the whole app down.
//
// React unmounts the entire tree when a render throws, so before this existed
// a single bad row anywhere left the user staring at the page background with
// no message and nothing to click — which is exactly what a spell whose
// effect Type was a list rather than a string did to the Spells tab.
//
// Now the failure stays inside the panel that caused it: the rest of the app
// keeps working, the user is told what broke, and "Try again" re-renders the
// panel rather than forcing a reload.

import React from 'react'
import styles from './ErrorBoundary.module.css'

interface Props {
  /** Named in the message, e.g. "Spells". */
  label?: string
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The console trace is the only record of this in production, so keep the
    // component stack with it.
    console.error('Panel crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const what = this.props.label ? `The ${this.props.label} panel` : 'This panel'
    return (
      <div className={styles.wrap} role="alert">
        <div className={styles.title}>{what} hit an error</div>
        <p className={styles.body}>
          The rest of the app is still working. If it keeps happening, the bug
          reporter in the bottom-right corner sends this straight over.
        </p>
        <pre className={styles.detail}>{error.message}</pre>
        <button
          type="button"
          className={styles.retry}
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    )
  }
}
