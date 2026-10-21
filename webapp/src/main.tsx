import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './styles/themes.css'
import { applyChoice, readStoredChoice } from './lib/theme'
import { installStaleBundleHandler } from './lib/staleBundle'

// Before the first render, so a reload never flashes the default palette.
// A custom palette is restored here too, not just the preset under it.
applyChoice(readStoredChoice())

// A tab left open across a deploy reloads into the new build instead of
// failing every window it has not opened yet.
installStaleBundleHandler()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
