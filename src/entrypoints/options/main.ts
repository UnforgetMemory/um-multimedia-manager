import { createApp, vaporInteropPlugin } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { createAppI18n } from '@/libraries/plugins/i18n'
import '@/libraries/styles/style.css'

async function bootstrap() {
  // 根保持 VDOM（createApp）。vue-tsc 3.3.11 不为 `<template vapor>` SFC
  // 生成 VaporComponent 类型，createVaporApp 需要类型断言，故根走 VDOM。
  const app = createApp(App)
  const i18n = await createAppI18n()
  // 必需项：树内 VDOM 组件（reka-ui 包装层、<Suspense>、vue-router 的
  // RouterLink）依赖此插件渲染；遗漏则静默不渲染且零报错。
  app.use(vaporInteropPlugin)
  app.use(createPinia())
  app.use(i18n)
  app.use(router)
  app.mount('#app')
}

bootstrap()
