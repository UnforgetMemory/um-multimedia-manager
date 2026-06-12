<script setup lang="ts">
import { inject, computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Settings, Film, Tv, Music, Layers, ArrowUpRight } from 'lucide-vue-next'
import { safeSendMessage } from '@/utils/context'

const loading = inject<boolean>('loading', false)
const loadData = inject<() => Promise<void>>('loadData', async () => {})

const records = ref<any[]>([])
const stats = computed(() => {
  let movie = 0, tv = 0, music = 0
  for (const r of records.value) {
    if (r.type === 'movie') movie++
    else if (r.type === 'tv') tv++
    else if (r.type === 'music') music++
  }
  return { total: records.value.length, movie, tv, music }
})

const appVersion = computed(() => { try { return chrome.runtime.getManifest().version } catch { return '3.0.0' } })

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function openOptionsPage() {
  window.open(chrome.runtime.getURL('options.html'), '_blank')
}

async function fetchData() {
  try {
    const response = await safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 })
    if (response?.success) records.value = response.records
  } catch { /* silent */ }
}

onMounted(() => { loadData(); fetchData() })
</script>

<template>
  <div style="width: 600px; height: 500px; overflow: hidden; position: relative; background: linear-gradient(145deg, #0f0f13 0%, #16161d 40%, #1a1a24 100%);">

    <!-- Ambient glow -->
    <div style="position: absolute; top: -60px; right: -40px; width: 240px; height: 240px; background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%); pointer-events: none;"></div>
    <div style="position: absolute; bottom: -40px; left: -30px; width: 200px; height: 200px; background: radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%); pointer-events: none;"></div>

    <!-- Content -->
    <div style="position: relative; z-index: 1; padding: 28px 32px 20px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">

      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px;">
        <div>
          <div style="font-size: 1.35rem; font-weight: 800; letter-spacing: -0.03em; background: linear-gradient(135deg, #e0e0e0 0%, #a0a0b0 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">UMM</div>
          <div style="font-size: 0.6rem; color: rgba(255,255,255,0.3); margin-top: 2px; letter-spacing: 0.08em; text-transform: uppercase;">Unified Multimedia Manager</div>
        </div>
        <div style="font-size: 0.6rem; color: rgba(255,255,255,0.2); font-family: monospace;">v{{ appVersion }}</div>
      </div>

      <!-- Loading -->
      <div v-if="loading" style="flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3);">
        <div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.1); border-top-color: rgba(255,255,255,0.4); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      </div>

      <template v-else>
        <!-- Hero stat -->
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="font-size: 3.5rem; font-weight: 800; line-height: 1; letter-spacing: -0.04em; background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.6) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            {{ stats.total.toLocaleString() }}
          </div>
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.35); margin-top: 6px; letter-spacing: 0.1em; text-transform: uppercase;">总记录</div>
        </div>

        <!-- Stats row -->
        <div style="display: flex; gap: 10px; margin-bottom: 24px;">
          <div style="flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 10px; text-align: center; backdrop-filter: blur(10px);">
            <Film style="width: 16px; height: 16px; color: rgba(99,102,241,0.7); margin: 0 auto 6px;" />
            <div style="font-size: 1.25rem; font-weight: 700; color: #fff; line-height: 1;">{{ stats.movie.toLocaleString() }}</div>
            <div style="font-size: 0.6rem; color: rgba(255,255,255,0.3); margin-top: 4px;">电影</div>
          </div>
          <div style="flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 10px; text-align: center; backdrop-filter: blur(10px);">
            <Tv style="width: 16px; height: 16px; color: rgba(16,185,129,0.7); margin: 0 auto 6px;" />
            <div style="font-size: 1.25rem; font-weight: 700; color: #fff; line-height: 1;">{{ stats.tv.toLocaleString() }}</div>
            <div style="font-size: 0.6rem; color: rgba(255,255,255,0.3); margin-top: 4px;">剧集</div>
          </div>
          <div style="flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px 10px; text-align: center; backdrop-filter: blur(10px);">
            <Music style="width: 16px; height: 16px; color: rgba(245,158,11,0.7); margin: 0 auto 6px;" />
            <div style="font-size: 1.25rem; font-weight: 700; color: #fff; line-height: 1;">{{ stats.music.toLocaleString() }}</div>
            <div style="font-size: 0.6rem; color: rgba(255,255,255,0.3); margin-top: 4px;">音乐</div>
          </div>
        </div>

        <!-- CTA -->
        <button
          @click="() => window.open(chrome.runtime.getURL('options.html'), '_blank')"
          style="margin-top: auto; width: 100%; padding: 12px 20px; background: linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(16,185,129,0.1) 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: rgba(255,255,255,0.7); font-size: 0.8rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease; backdrop-filter: blur(10px);"
          onmouseover="this.style.background='linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(16,185,129,0.18) 100%)'; this.style.borderColor='rgba(255,255,255,0.15)'; this.style.color='#fff'"
          onmouseout="this.style.background='linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(16,185,129,0.1) 100%)'; this.style.borderColor='rgba(255,255,255,0.08)'; this.style.color='rgba(255,255,255,0.7)'"
        >
          <Settings style="width: 14px; height: 14px;" />
          管理面板
          <ArrowUpRight style="width: 12px; height: 12px; opacity: 0.5;" />
        </button>
      </template>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.04);">
        <span style="font-size: 0.55rem; color: rgba(255,255,255,0.15); letter-spacing: 0.05em;">UMM · Unified Multimedia Manager</span>
      </div>
    </div>
  </div>
</template>
