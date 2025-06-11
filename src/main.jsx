import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Register service worker for offline functionality
const updateSW = registerSW({
  onNeedRefresh() {
    // Optional: You can prompt users to update when new content is available
    if (confirm('New content available. Reload?')) {
      updateSW(true)
    }
  },
  // Removed leftover debug log for offline readiness
})

// Suppress console logs and errors in production
if (import.meta.env.PROD) {
  console.log = () => {};
  console.error = () => {};
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
