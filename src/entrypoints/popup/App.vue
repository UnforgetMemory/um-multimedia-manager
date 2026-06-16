<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useLocaleSync } from '@/composables/useLocaleSync'

useThemeStore()
useLocaleSync()
</script>

<template>
  <RouterView />
</template>
