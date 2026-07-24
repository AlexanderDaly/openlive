import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hydrateFromStorage, startAutosave } from '@/store/persistence'
import { startHistory } from '@/store/history'

// Restore the autosaved project (if any) before the first render, then
// begin autosaving content changes and recording undo/redo history.
hydrateFromStorage()
startAutosave()
startHistory()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
