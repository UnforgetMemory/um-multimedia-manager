import { createRoot } from 'react-dom/client'
import { OptionsApp } from './OptionsApp'
import { initReactI18n } from '@/shared/plugins/i18n-react'
import '@/shared/styles/style.css'

async function bootstrap() {
  await initReactI18n()
  const root = createRoot(document.getElementById('app')!)
  root.render(<OptionsApp />)
}

bootstrap()