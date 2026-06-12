import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '@/styles/typography.css'
import '@/styles/design-tokens.css'
import '../../style.css'

const app = createApp(App)
app.use(router)
app.mount('#app')
