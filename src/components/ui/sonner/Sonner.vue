<script lang="ts" setup>
import type { ToasterProps } from "vue-sonner"
import { reactiveOmit } from "@vueuse/core"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, XIcon } from "@lucide/vue"
import { Toaster as Sonner } from "vue-sonner"

const props = defineProps<ToasterProps>()
const delegatedProps = reactiveOmit(props, "toastOptions")
</script>

<template>
  <Sonner
    class="toaster group"
    :toast-options="{
      classes: {
        toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg',
        title: 'group-[.toast]:text-foreground font-semibold text-sm',
        description: 'group-[.toast]:text-muted-foreground text-xs mt-1',
        actionButton:
          'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton:
          'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        success: 'group-[.toaster]:!border-green-500/60 group-[.toaster]:!bg-green-500/10 dark:group-[.toaster]:!bg-green-500/20',
        error: 'group-[.toaster]:!border-red-500/60 group-[.toaster]:!bg-red-500/10 dark:group-[.toaster]:!bg-red-500/20',
        warning: 'group-[.toaster]:!border-yellow-500/60 group-[.toaster]:!bg-yellow-500/10 dark:group-[.toaster]:!bg-yellow-500/20',
        info: 'group-[.toaster]:!border-blue-500/60 group-[.toaster]:!bg-blue-500/10 dark:group-[.toaster]:!bg-blue-500/20',
      },
    }"
    v-bind="delegatedProps"
  >
    <template #success-icon>
      <CircleCheckIcon class="size-4" />
    </template>
    <template #info-icon>
      <InfoIcon class="size-4" />
    </template>
    <template #warning-icon>
      <TriangleAlertIcon class="size-4" />
    </template>
    <template #error-icon>
      <OctagonXIcon class="size-4" />
    </template>
    <template #loading-icon>
      <div>
        <Loader2Icon class="size-4 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <XIcon class="size-4" />
    </template>
  </Sonner>
</template>
