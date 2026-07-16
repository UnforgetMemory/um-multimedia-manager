import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { createAppI18n } from '@/shared/plugins/i18n'
import '@/shared/styles/style.css'

async function bootstrap() {
  const app = createApp(App)
  const i18n = await createAppI18n()
  app.use(createPinia())
  app.use(i18n)
  app.use(router)
  app.mount('#app')
}

bootstrap()
