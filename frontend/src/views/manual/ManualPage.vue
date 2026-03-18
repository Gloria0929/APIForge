<template>
  <div class="manual-page">
    <header class="manual-header">
      <a href="/" class="manual-header__logo">
        <img src="/favicon.svg" alt="APIForge" class="manual-header__logo-img" />
        <span class="manual-header__logo-text">APIForge 文档</span>
      </a>
      <a href="/" class="manual-header__back">返回首页</a>
    </header>

    <div class="manual-body">
      <aside class="manual-toc">
        <nav class="manual-toc__nav">
          <a
            v-for="item in toc"
            :key="item.id"
            :href="`#${item.id}`"
            class="manual-toc__link"
            :class="{ 'manual-toc__link--h2': item.level === 2, 'manual-toc__link--h3': item.level === 3 }"
            @click.prevent="scrollToSection(item.id)"
          >
            {{ item.text }}
          </a>
        </nav>
      </aside>

      <main class="manual-main">
        <div v-if="loading" class="manual-loading">
          <el-icon class="is-loading" :size="32"><Loading /></el-icon>
          <span>加载中...</span>
        </div>
        <article
          v-else
          class="manual-content markdown-body"
          v-html="renderedHtml"
        />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { marked } from 'marked'
import { Loading } from '@element-plus/icons-vue'

interface TocItem {
  id: string
  text: string
  level: number
}

const rawContent = ref('')
const loading = ref(true)

function slugify(text: string): string {
  return text
    .replace(/[#*`]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .toLowerCase()
}

const renderedHtml = computed(() => {
  if (!rawContent.value) return ''
  let html = marked.parse(rawContent.value, { gfm: true }) as string
  html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim()
    const id = slugify(text)
    return `<h${level} id="${id}">${inner}</h${level}>`
  })
  return html
})

const toc = computed<TocItem[]>(() => {
  const items: TocItem[] = []
  const lines = rawContent.value.split('\n')
  let inCodeBlock = false
  let codeFence = ''

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeFence = line.slice(0, 3)
      } else if (line.startsWith(codeFence)) {
        inCodeBlock = false
      }
      continue
    }
    if (inCodeBlock) continue

    const h2 = /^##\s+(.+)$/.exec(line)
    const h3 = /^###\s+(.+)$/.exec(line)
    if (h2) {
      items.push({
        id: slugify(h2[1]),
        text: h2[1].replace(/#+\s*$/, '').trim(),
        level: 2
      })
    } else if (h3) {
      items.push({
        id: slugify(h3[1]),
        text: h3[1].replace(/#+\s*$/, '').trim(),
        level: 3
      })
    }
  }
  return items
})

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

onMounted(async () => {
  try {
    const res = await axios.get('/api/docs/readme')
    rawContent.value = res.data?.content || ''
  } catch {
    rawContent.value = '# 文档\n\n加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.manual-page {
  height: 100vh;
  min-height: 100vh;
  background: var(--background-color, #0a0a0c);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.manual-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(17, 17, 20, 0.95);
}

.manual-header__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #fff;
  font-weight: 600;
  font-size: 1.1rem;
}

.manual-header__logo-img {
  width: 28px;
  height: 28px;
}

.manual-header__back {
  color: #8b8b96;
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}

.manual-header__back:hover {
  color: #a5b4fc;
}

.manual-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.manual-toc {
  flex-shrink: 0;
  width: 240px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  overflow-y: auto;
  padding: 24px 16px;
}

.manual-toc__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manual-toc__link {
  display: block;
  padding: 8px 12px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 14px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
}

.manual-toc__link:hover {
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.08);
}

.manual-toc__link--h2 {
  font-weight: 600;
  color: #e2e8f0;
}

.manual-toc__link--h3 {
  padding-left: 24px;
  font-size: 13px;
}

.manual-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32px 48px 64px;
}

.manual-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #8b8b96;
  min-height: 200px;
}

.manual-content {
  max-width: 800px;
  margin: 0 auto;
}

/* Markdown 样式 */
.markdown-body :deep(h1) {
  font-size: 1.75rem;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.markdown-body :deep(h2) {
  font-size: 1.35rem;
  font-weight: 600;
  color: #e2e8f0;
  margin: 32px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.markdown-body :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  color: #cbd5e1;
  margin: 24px 0 12px;
}

.markdown-body :deep(p) {
  font-size: 15px;
  line-height: 1.75;
  color: #94a3b8;
  margin-bottom: 16px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 12px 0 20px;
  padding-left: 24px;
  color: #94a3b8;
  line-height: 1.8;
}

.markdown-body :deep(li) {
  margin-bottom: 6px;
}

.markdown-body :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  padding: 2px 6px;
  border-radius: 4px;
}

.markdown-body :deep(pre) {
  background: #111114;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  margin: 16px 0;
}

.markdown-body :deep(pre code) {
  background: none;
  color: #e2e8f0;
  padding: 0;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 14px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px 14px;
  text-align: left;
  color: #94a3b8;
}

.markdown-body :deep(th) {
  background: rgba(255, 255, 255, 0.04);
  color: #e2e8f0;
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin: 32px 0;
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid rgba(99, 102, 241, 0.5);
  padding-left: 16px;
  margin: 16px 0;
  color: #94a3b8;
}

@media (max-width: 768px) {
  .manual-body {
    flex-direction: column;
  }

  .manual-toc {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    max-height: 200px;
  }

  .manual-main {
    padding: 24px 20px 48px;
  }
}
</style>
