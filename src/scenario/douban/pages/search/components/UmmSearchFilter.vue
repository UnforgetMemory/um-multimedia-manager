<script setup lang="ts">
/**
 * UmmSearchFilter — search result filter bar with ALL/movie/TV toggle
 * and result count. Uses v-model for filter state.
 */
import { t } from '../../../shared/legacy-bridge';

export type FilterType = 'all' | 'movie' | 'tv';

interface Props {
  total: number;
  filtered: number;
  query: string;
}

defineProps<Props>();
const modelValue = defineModel<FilterType>('modelValue', { required: true });
</script>

<template vapor>
  <div class="umm-search-hd">
    <div class="umm-search-hd-left">
      <h1 class="umm-search-title">{{ t('douban.search.title') }}</h1>
      <div class="umm-search-type-group">
        <button
          class="umm-type-btn"
          :class="{ 'umm-type-btn--active': modelValue === 'all' }"
          @click="modelValue = 'all'"
        >
          {{ t('douban.search.filter_all') }}
        </button>
        <button
          class="umm-type-btn"
          :class="{ 'umm-type-btn--active': modelValue === 'movie' }"
          @click="modelValue = 'movie'"
        >
          {{ t('douban.search.filter_movie') }}
        </button>
        <button
          class="umm-type-btn"
          :class="{ 'umm-type-btn--active': modelValue === 'tv' }"
          @click="modelValue = 'tv'"
        >
          {{ t('douban.search.filter_tv') }}
        </button>
      </div>
    </div>
    <span class="umm-search-hd-meta">
      "{{ query }}" · <strong>{{ filtered }}</strong
      ><span v-if="filtered !== total">/{{ total }}</span> {{ t('douban.search.result_suffix') }}
    </span>
  </div>
</template>
