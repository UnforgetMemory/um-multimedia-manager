<script setup lang="ts">
import { provide } from 'vue'
import { RouterView } from 'vue-router'

// Theme is initialized in index.html before Vue mounts
// (synchronous matchMedia check + async chrome.storage.local override)

provide('loadData', async () => {})
</script>

<template>
  <RouterView />
</template>
