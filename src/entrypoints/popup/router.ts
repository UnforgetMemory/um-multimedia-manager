import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/:pathMatch(.*)*', name: 'dashboard', component: () => import('./pages/DashboardPage.vue') },
  ],
})

export default router
