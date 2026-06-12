import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/overview',
    },
    {
      path: '/overview',
      name: 'overview',
      component: () => import('./tabs/OverviewTab.vue'),
    },
    {
      path: '/rating',
      name: 'rating',
      component: () => import('./tabs/RatingTab.vue'),
    },
    {
      path: '/linked',
      name: 'linked',
      component: () => import('./tabs/LinkedTab.vue'),
    },
    {
      path: '/sync',
      name: 'sync',
      component: () => import('./tabs/SyncTab.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./tabs/SettingsTab.vue'),
    },
  ],
})

export default router
