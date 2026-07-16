<script setup lang="ts">
/**
 * UmmSearchFilter — search result filter bar with ALL/movie/TV toggle
 * and result count. Uses v-model for filter state.
 */
export type FilterType = 'all' | 'movie' | 'tv'

interface Props {
  modelValue: FilterType
  total: number
  filtered: number
  query: string
}

defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: FilterType]
}>()
</script>

<template>
  <div class="umm-search-hd">
    <div class="umm-search-hd-left">
      <h1 class="umm-search-title">搜索结果</h1>
      <div class="umm-search-type-group">
        <button
          class="umm-type-btn"
          :class="{ 'umm-type-btn--active': modelValue === 'all' }"
          @click="emit('update:modelValue', 'all')"
        >全部</button>
        <button
          class="umm-type-btn"
          :class="{ 'umm-type-btn--active': modelValue === 'movie' }"
          @click="emit('update:modelValue', 'movie')"
        >电影</button>
        <button
          class="umm-type-btn"
          :class="{ 'umm-type-btn--active': modelValue === 'tv' }"
          @click="emit('update:modelValue', 'tv')"
        >剧集</button>
      </div>
    </div>
    <span class="umm-search-hd-meta">
      "{{ query }}" · <strong>{{ filtered }}</strong><span v-if="filtered !== total">/{{ total }}</span> 个结果
    </span>
  </div>
</template>