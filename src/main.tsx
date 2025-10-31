import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { ReactProvider } from './providers/react-provider.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReactProvider>
      <App />
    </ReactProvider>
  </StrictMode>,
)