import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import { configureUpdater, markUpdateAvailable } from './lib/pwaUpdate'

const updateSW = registerSW({ immediate: true, onNeedRefresh: markUpdateAvailable })
configureUpdater(() => updateSW(true))

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
