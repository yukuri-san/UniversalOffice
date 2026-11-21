import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// 起動できたことを index.html のウォッチドッグへ知らせる（復旧画面を出さない／消す）
;(window as unknown as { __webxBooted?: boolean }).__webxBooted = true
document.getElementById('webx-boot-fallback')?.remove()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
