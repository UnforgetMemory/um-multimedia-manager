<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { CelebritiesPageData } from './celebrities-data'

const props = defineProps<{ data: CelebritiesPageData }>()
const d = props.data

const totalCelebrities = computed(() =>
  d.groups.reduce((sum, g) => sum + g.celebrities.length, 0),
)

function openSubject(url: string, e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  window.open(url, '_blank')
}

function openPersonage(url: string): void {
  window.open(url, '_blank')
}
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-celebrities-root">
      <!-- Header -->
      <div class="umm-celebrities-header">
        <h1 class="umm-celebrities-title">{{ d.title }}</h1>
        <span class="umm-photos-count">共 {{ totalCelebrities }} 人</span>
      </div>

      <!-- Empty state -->
      <div v-if="d.groups.length === 0" class="umm-celebrity-empty">
        暂无演职员信息
      </div>

      <!-- Celebrity groups -->
      <div
        v-for="group in d.groups"
        :key="group.heading"
        class="umm-celebrity-group"
      >
        <h2 class="umm-celebrity-group-heading">{{ group.heading }}</h2>

        <div class="umm-celebrity-grid">
          <a
            v-for="celebrity in group.celebrities"
            :key="celebrity.personageId"
            :href="celebrity.personageUrl"
            class="umm-celebrity-card"
            :title="'查看' + celebrity.name + '影人主页'"
            @click.prevent="openPersonage(celebrity.personageUrl)"
          >
            <!-- Avatar -->
            <div
              class="umm-celebrity-avatar"
              :class="{ 'umm-celebrity-avatar--has-account': celebrity.hasDoubanAccount }"
              :style="{ backgroundImage: `url(${celebrity.avatar})` }"
            />

            <!-- Info -->
            <div class="umm-celebrity-body">
              <div class="umm-celebrity-name" :title="celebrity.name">
                {{ celebrity.name }}
              </div>
              <div class="umm-celebrity-role" :title="celebrity.roleDetail">
                {{ celebrity.role }}
              </div>
              <div v-if="celebrity.works.length" class="umm-celebrity-works">
                <a
                  v-for="work in celebrity.works"
                  :key="work.url"
                  class="umm-celebrity-work-tag"
                  :title="work.title"
                  @click.prevent="openSubject(work.url, $event)"
                >{{ work.title }}</a>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>