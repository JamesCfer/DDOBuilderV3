import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './styles/themes.css'
import { applyTheme, readStoredTheme } from './lib/theme'

// Before the first render, so a reload never flashes the default palette.
applyTheme(readStoredTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
