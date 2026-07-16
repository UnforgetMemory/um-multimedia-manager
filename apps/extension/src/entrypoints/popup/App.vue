<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useLocaleSync } from '@/composables/useLocaleSync'
import ConfirmDialog from '@/shared/ConfirmDialog.vue'
import ToastContainer from '@/shared/ToastContainer.vue'

useThemeStore()
useLocaleSync()
</script>

<template>
  <RouterView />
  <ConfirmDialog />
  <ToastContainer />
</template>
