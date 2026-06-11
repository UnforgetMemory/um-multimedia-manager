import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'records', component: () => import('./pages/RecordsPage.vue') },
    { path: '/platforms', name: 'platforms', component: () => import('./pages/PlatformsPage.vue') },
    { path: '/ratings', name: 'ratings', component: () => import('./pages/RatingsPage.vue') },
    { path: '/linked', name: 'linked', component: () => import('./pages/LinkedPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('./pages/SettingsPage.vue') },
  ],
})

export default router
