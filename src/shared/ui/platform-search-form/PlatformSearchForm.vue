<script setup lang="ts">
/**
 * PlatformSearchForm — reusable search form for RatingTab and LinkedTab
 *
 * Replaces the duplicated 4-field form (platform + media type + jav source + input)
 * that was hand-rolled in both RatingTab.vue and LinkedTab.vue.
 */
import { useI18n } from 'vue-i18n'
import FormField from '@/shared/ui/form-field/FormField.vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Input } from '@/shared/ui/input'
import type { Domain } from '@/config'

interface Option {
  value: string
  labelKey: string
}

const props = defineProps<{
  platform: string
  domain: Domain
  javSource: string
  search: string
  platformOptions: readonly Option[]
  javSourceOptions: readonly Option[]
  searchPlaceholder?: string
  searchDescription?: string
  inputLabel?: string
}>()

const emit = defineEmits<{
  'update:platform': [value: string]
  'update:domain': [value: Domain]
  'update:javSource': [value: string]
  'update:search': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="umm:flex umm:flex-col umm:gap-4 umm:p-[var(--umm-card-padding)] umm:border umm:border-border umm:rounded-lg"
  >
    <FormField :label="t('common.selectPlatform')">
      <Select :modelValue="platform" @update:modelValue="emit('update:platform', $event as string)">
        <SelectTrigger><SelectValue :placeholder="t('common.selectPlatform')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="p in platformOptions" :key="p.value" :value="p.value">
            {{ t(p.labelKey) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </FormField>

    <FormField :label="t('common.mediaType')">
      <Select
        :modelValue="domain"
        @update:modelValue="emit('update:domain', $event as Domain)"
        :disabled="platform === 'jav_ids'"
      >
        <SelectTrigger><SelectValue :placeholder="t('common.mediaType')" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="movie">{{ t('stats.movie') }}</SelectItem>
          <SelectItem value="tv">{{ t('stats.tv') }}</SelectItem>
          <SelectItem value="music">{{ t('stats.music') }}</SelectItem>
          <SelectItem value="book">{{ t('stats.book') }}</SelectItem>
          <SelectItem value="game">{{ t('stats.game') }}</SelectItem>
        </SelectContent>
      </Select>
    </FormField>

    <FormField v-if="platform === 'jav_ids'" :label="t('common.source')">
      <Select :modelValue="javSource" @update:modelValue="emit('update:javSource', $event as string)">
        <SelectTrigger><SelectValue :placeholder="t('common.source')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in javSourceOptions" :key="s.value" :value="s.value">
            {{ t(s.labelKey) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </FormField>

    <FormField :label="inputLabel || (platform === 'jav_ids' ? t('platform.jav') : t('common.search') + ' ID / URL')" :description="searchDescription">
      <Input
        :modelValue="search"
        @update:modelValue="emit('update:search', $event as string)"
        :placeholder="searchPlaceholder || (platform === 'jav_ids' ? 'FC2-PPV-1234567' : '35401245 / URL')"
      />
    </FormField>
  </div>
</template>
