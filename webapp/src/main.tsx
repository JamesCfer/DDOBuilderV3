import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './styles/themes.css'
import { applyChoice, readStoredChoice } from './lib/theme'

// Before the first render, so a reload never flashes the default palette.
// A custom palette is restored here too, not just the preset under it.
applyChoice(readStoredChoice())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
