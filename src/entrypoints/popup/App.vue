<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/store/theme'
import { useLocaleSync } from '@/feature/composables/useLocaleSync'
import ConfirmDialog from '@/feature/ConfirmDialog.vue'
import ToastContainer from '@/feature/ToastContainer.vue'

useThemeStore()
useLocaleSync()
</script>

<template>
  <RouterView />
  <ConfirmDialog />
  <ToastContainer />
</template>
