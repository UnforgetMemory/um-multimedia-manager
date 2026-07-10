<script setup lang="ts">
/**
 * UmmUserBar — shared user bar component for Douban user pages.
 *
 * Renders avatar + display name + navigation links row.
 * Uses var(--umm-*) CSS custom properties for Shadow DOM theme compatibility.
 * Appears when displayName is truthy.
 *
 * Props:
 * - avatarUrl: optional avatar URL (rendered as background-image on a circle)
 * - displayName: user's display name (linked to /people/{userId}/)
 * - userId: used for the display name link href
 * - navLinks: array of { label, url }
 */
defineProps<{
  avatarUrl?: string
  displayName: string
  userId: string
  navLinks: { label: string; url: string }[]
}>()
</script>

<template>
  <div v-if="displayName" class="umm-userbar">
    <div
      v-if="avatarUrl"
      class="umm-userbar-avatar"
      :style="{ backgroundImage: `url(${avatarUrl})` }"
    />
    <div class="umm-userbar-info">
      <a
        :href="`/people/${userId}/`"
        class="umm-userbar-name"
        target="_blank"
      >{{ displayName }}</a>
      <div v-if="navLinks.length > 0" class="umm-userbar-nav">
        <a
          v-for="link in navLinks"
          :key="link.url"
          :href="link.url"
          class="umm-userbar-navlink"
          target="_blank"
        >{{ link.label }}</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== Shared User Bar — Shadow-DOM friendly ===== */
.umm-userbar {
  display: flex;
  align-items: center;
  gap: var(--umm-space-sm, 12px);
  margin-bottom: var(--umm-space-md, 16px);
  padding-bottom: var(--umm-space-sm, 10px);
  border-bottom: 1px solid var(--umm-border, #e5e7eb);
}
.umm-userbar-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  background-color: var(--umm-bg-secondary, #f3f4f6);
  flex-shrink: 0;
}
.umm-userbar-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.umm-userbar-name {
  font-size: var(--umm-font-sm, 0.85rem);
  font-weight: 600;
  color: var(--umm-text-primary, #111827);
  text-decoration: none;
}
.umm-userbar-name:hover {
  color: var(--umm-link, #6366f1);
}
.umm-userbar-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
}
.umm-userbar-navlink {
  font-size: var(--umm-font-xs, 0.65rem);
  color: var(--umm-text-muted, #9ca3af);
  text-decoration: none;
  white-space: nowrap;
  padding: 1px 4px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.umm-userbar-navlink:hover {
  color: var(--umm-link, #6366f1);
  background: var(--umm-bg-secondary, #f3f4f6);
}
</style>
