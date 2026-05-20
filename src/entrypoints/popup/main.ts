import { createApp } from 'vue'
import '../style.css'
import App from './App.vue'

const app = createApp(App)

// 注意：主题管理已移至 App.vue 中统一处理
// 这里不再初始化 useColorMode，避免创建多个实例

app.mount('#app')
