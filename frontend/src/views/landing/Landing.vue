<template>
  <div class="landing-page">
    <Transition name="confetti-fade">
      <div v-if="showConfetti" class="landing-confetti" aria-hidden="true">
        <div
          v-for="(c, i) in confettiPieces"
          :key="i"
          class="landing-confetti__piece"
          :style="{
            left: c.x + '%',
            top: '-24px',
            width: c.size + 'px',
            height: (c.size * (c.rect ? 1.2 : 0.6)) + 'px',
            backgroundColor: c.color,
            '--rotation': c.rotation + 'deg',
            '--drift': c.drift + 'px',
            animationDelay: c.delay + 's',
            animationDuration: c.duration + 's',
          }"
        />
      </div>
    </Transition>
    <header class="landing-header">
      <div class="landing-header__inner">
        <router-link to="/landing" class="landing-logo">
          <img src="/favicon.svg" alt="APIForge" class="landing-logo__img" />
          <span class="landing-logo__text">APIForge</span>
        </router-link>
        <nav class="landing-nav">
          <a href="#features" class="landing-nav__link">功能</a>
          <a href="/manual" target="_blank" rel="noopener" class="landing-nav__link">文档</a>
          <span v-if="authStore.isLoggedIn" class="landing-nav__user">{{ authStore.username }}</span>
          <router-link v-if="authStore.isLoggedIn" to="/projects" class="landing-nav__link">进入应用</router-link>
          <router-link v-else to="/login" class="landing-nav__link">登录</router-link>
        </nav>
      </div>
    </header>

    <main class="landing-main">
      <div class="landing-bg-grid" aria-hidden="true" />
      <section class="landing-hero">
        <div class="landing-hero__glow" />
        <div class="landing-hero__orb landing-hero__orb--1" />
        <div class="landing-hero__orb landing-hero__orb--2" />
        <div class="landing-hero__content">
          <h1 class="landing-hero__title">
            <span class="landing-hero__title-main">APIForge</span>
            <span class="landing-hero__title-sub">API 测试与文档一体化平台</span>
          </h1>
          <p class="landing-hero__desc">
            从 Swagger/Postman 导入、接口调试、测试用例、场景编排到定时任务，一站式完成 API 全生命周期管理。
          </p>
          <div class="landing-hero__badges">
            <span class="landing-badge"><el-icon><CircleCheck /></el-icon>完全免费</span>
            <span class="landing-badge"><el-icon><Lightning /></el-icon>即开即用</span>
            <span class="landing-badge"><el-icon><User /></el-icon>安全登录</span>
            <span class="landing-badge"><el-icon><Monitor /></el-icon>本地部署</span>
            <span class="landing-badge"><el-icon><Upload /></el-icon>一键更新</span>
          </div>
          <div class="landing-hero__actions">
            <router-link v-if="authStore.isLoggedIn" to="/projects" class="landing-btn landing-btn--primary">进入应用</router-link>
            <router-link v-else to="/login" class="landing-btn landing-btn--primary">开始使用</router-link>
            <a href="/manual" target="_blank" rel="noopener" class="landing-btn landing-btn--outline">文档教程</a>
          </div>
        </div>
        <div class="landing-hero__scroll-hint">
          <span>向下滚动了解更多</span>
          <el-icon class="landing-hero__scroll-icon"><ArrowDown /></el-icon>
        </div>
      </section>

      <section class="landing-section landing-why">
        <h2 class="landing-section__title">为什么选择 APIForge</h2>
        <div class="landing-why__grid">
          <div class="landing-why__item" style="--i: 0">
            <div class="landing-why__num">01</div>
            <h3 class="landing-why__title">登录即用</h3>
            <p class="landing-why__desc">简单登录即可开始。数据存储在本地，隐私完全由你掌控。</p>
          </div>
          <div class="landing-why__item" style="--i: 1">
            <div class="landing-why__num">02</div>
            <h3 class="landing-why__title">一站式工作流</h3>
            <p class="landing-why__desc">从接口导入、调试、用例编写、场景编排到定时执行，全流程打通，告别多工具切换。</p>
          </div>
          <div class="landing-why__item" style="--i: 2">
            <div class="landing-why__num">03</div>
            <h3 class="landing-why__title">AI 加持</h3>
            <p class="landing-why__desc">接入 OpenAI 等大模型，自动生成断言、分析失败原因、总结报告，提升测试效率。</p>
          </div>
        </div>
      </section>

      <section id="features" class="landing-section landing-features">
        <h2 class="landing-section__title">核心能力</h2>
        <div class="landing-features__grid">
          <article class="landing-feature" style="--i: 0">
            <div class="landing-feature__icon">
              <el-icon :size="28"><Document /></el-icon>
            </div>
            <h3 class="landing-feature__title">接口文档</h3>
            <p class="landing-feature__desc">支持 Swagger、OpenAPI、Postman 导入，AI 批量分析补全业务标签。</p>
          </article>
          <article class="landing-feature" style="--i: 1">
            <div class="landing-feature__icon">
              <el-icon :size="28"><Connection /></el-icon>
            </div>
            <h3 class="landing-feature__title">接口调试</h3>
            <p class="landing-feature__desc">类似 Postman 调试体验，环境变量、请求体、断言一键保存为测试用例。</p>
          </article>
          <article class="landing-feature" style="--i: 2">
            <div class="landing-feature__icon">
              <el-icon :size="28"><List /></el-icon>
            </div>
            <h3 class="landing-feature__title">测试用例</h3>
            <p class="landing-feature__desc">批量执行、AI 生成断言与失败分析，一键保存为用例。</p>
          </article>
          <article class="landing-feature" style="--i: 3">
            <div class="landing-feature__icon">
              <el-icon :size="28"><DataAnalysis /></el-icon>
            </div>
            <h3 class="landing-feature__title">测试报告</h3>
            <p class="landing-feature__desc">执行历史、通过率统计、报告对比，支持导出与 AI 总结。</p>
          </article>
          <article class="landing-feature" style="--i: 4">
            <div class="landing-feature__icon">
              <el-icon :size="28"><Share /></el-icon>
            </div>
            <h3 class="landing-feature__title">场景测试</h3>
            <p class="landing-feature__desc">多步骤编排、变量传递，支持复杂业务流程回归。</p>
          </article>
          <article class="landing-feature" style="--i: 5">
            <div class="landing-feature__icon">
              <el-icon :size="28"><Setting /></el-icon>
            </div>
            <h3 class="landing-feature__title">环境管理</h3>
            <p class="landing-feature__desc">多环境配置（开发/测试/预发），变量复用，切换灵活。</p>
          </article>
          <article class="landing-feature" style="--i: 6">
            <div class="landing-feature__icon">
              <el-icon :size="28"><Cpu /></el-icon>
            </div>
            <h3 class="landing-feature__title">模型配置</h3>
            <p class="landing-feature__desc">接入 OpenAI 等大模型，自动生成断言、分析失败、总结报告。</p>
          </article>
          <article class="landing-feature" style="--i: 7">
            <div class="landing-feature__icon">
              <el-icon :size="28"><Timer /></el-icon>
            </div>
            <h3 class="landing-feature__title">定时任务</h3>
            <p class="landing-feature__desc">Cron 定时执行测试套件或场景，持续保障接口质量。</p>
          </article>
        </div>
      </section>

      <section class="landing-section landing-cta">
        <div id="enter" class="landing-cta__card">
          <h2 class="landing-cta__title">准备好开始了吗？</h2>
          <p class="landing-cta__desc">免费使用。登录后创建项目，导入 Swagger/Postman，开启 API 测试之旅。</p>
          <router-link
            :to="authStore.isLoggedIn ? '/projects' : '/login'"
            class="landing-btn landing-btn--primary landing-btn--lg"
          >
            {{ authStore.isLoggedIn ? '进入应用' : '登录开始' }}
          </router-link>
        </div>
      </section>
    </main>

    <footer class="landing-footer">
      <p>APIForge · API 测试与文档一体化平台</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ArrowDown, Document, Connection, List, Share, Timer, CircleCheck, Lightning, User, Monitor, Upload, DataAnalysis, Setting, Cpu } from '@element-plus/icons-vue'
import { useAuthStore } from '../../store/auth'

const authStore = useAuthStore()

const COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c4b5fd', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

function random(min: number, max: number) {
  return min + Math.random() * (max - min)
}

const showConfetti = ref(true)
const confettiPieces = ref<Array<{
  x: number
  delay: number
  duration: number
  rotation: number
  drift: number
  size: number
  color: string
  rect: boolean
}>>([])

onMounted(() => {
  authStore.syncFromStorage()
  const pieces: typeof confettiPieces.value = []
  for (let i = 0; i < 200; i++) {
    pieces.push({
      x: random(0, 100),
      delay: random(0, 0.8),
      duration: random(2.5, 4),
      rotation: random(-180, 180),
      drift: random(-40, 40),
      size: random(6, 14),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rect: Math.random() > 0.5,
    })
  }
  confettiPieces.value = pieces
  setTimeout(() => {
    showConfetti.value = false
  }, 4500)
})
</script>

<style scoped>
.landing-confetti {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
}

.landing-confetti__piece {
  position: absolute;
  border-radius: 2px;
  animation: confettiFall linear forwards;
  will-change: transform;
}

.confetti-fade-enter-active,
.confetti-fade-leave-active {
  transition: opacity 0.6s ease;
}

.confetti-fade-leave-to {
  opacity: 0;
}

@keyframes confettiFall {
  0% {
    transform: translate(0, 0) rotate(var(--rotation, 0deg));
    opacity: 1;
  }
  100% {
    transform: translate(var(--drift, 0px), 100vh) rotate(calc(var(--rotation, 0deg) + 720deg));
    opacity: 0.2;
  }
}

.landing-page {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--background-color);
  scroll-behavior: smooth;
}

.landing-bg-grid {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 70%);
}

.landing-bg-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
  opacity: 0.5;
  mix-blend-mode: overlay;
}

.landing-header {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-color);
  background: rgba(10, 10, 12, 0.85);
  backdrop-filter: blur(12px);
}

.landing-header__inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.landing-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  transition: opacity 0.2s;
}

.landing-logo:hover {
  opacity: 0.9;
}

.landing-logo__img {
  width: 28px;
  height: 28px;
}

.landing-logo__text {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}

.landing-nav {
  display: flex;
  gap: 24px;
}

.landing-nav__link {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.2s;
}

.landing-nav__link:hover {
  color: var(--primary-color);
}

.landing-nav__user {
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-color);
  margin-right: 8px;
}

.landing-main {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px;
}

.landing-hero {
  position: relative;
  min-height: 75vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0 120px;
  overflow: hidden;
  z-index: 1;
}

.landing-hero__glow {
  position: absolute;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 400px;
  background: radial-gradient(ellipse, rgba(99, 102, 241, 0.25) 0%, rgba(99, 102, 241, 0.08) 40%, transparent 70%);
  pointer-events: none;
  animation: glowPulse 4s ease-in-out infinite;
}

.landing-hero__orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(60px);
  opacity: 0.4;
}

.landing-hero__orb--1 {
  width: 200px;
  height: 200px;
  background: rgba(99, 102, 241, 0.3);
  top: 20%;
  left: 10%;
  animation: orbFloat1 8s ease-in-out infinite;
}

.landing-hero__orb--2 {
  width: 150px;
  height: 150px;
  background: rgba(129, 140, 248, 0.25);
  top: 60%;
  right: 15%;
  animation: orbFloat2 10s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.7; transform: translateX(-50%) scale(1.05); }
}

@keyframes orbFloat1 {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(20px, -15px); }
  66% { transform: translate(-10px, 10px); }
}

@keyframes orbFloat2 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-25px, -20px); }
}

.landing-hero__content {
  position: relative;
  text-align: center;
  z-index: 1;
}

.landing-hero__content > * {
  animation: fadeInUp 0.8s ease-out both;
}

.landing-hero__title { animation-delay: 0.1s; }
.landing-hero__desc { animation-delay: 0.25s; }
.landing-hero__badges { animation-delay: 0.4s; }
.landing-hero__actions { animation-delay: 0.55s; }

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.landing-hero__title {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.landing-hero__title-main {
  font-size: clamp(2.5rem, 6vw, 4rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  background: linear-gradient(135deg, #fff 0%, rgba(129, 140, 248, 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.landing-hero__title-sub {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.landing-hero__desc {
  max-width: 520px;
  margin: 0 auto 24px;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.landing-hero__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  justify-content: center;
  margin-bottom: 32px;
}

.landing-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(129, 140, 248, 0.95);
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 999px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.landing-badge:hover {
  transform: translateY(-2px) scale(1.02);
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.2);
}

.landing-badge .el-icon {
  font-size: 16px;
}

.landing-hero__actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.landing-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: all 0.2s;
  cursor: pointer;
}

.landing-btn--primary {
  background: var(--primary-color);
  color: #fff;
  border: none;
  position: relative;
  overflow: hidden;
}

.landing-btn--primary::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent, rgba(255,255,255,0.15), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}

.landing-btn--primary:hover {
  background: var(--secondary-color);
  color: #fff;
  box-shadow: 0 4px 24px rgba(99, 102, 241, 0.4);
}

.landing-btn--primary:hover::before {
  transform: translateX(100%);
}

.landing-btn--outline {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  transition: border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease;
}

.landing-btn--outline:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.15);
}

.landing-btn--sm {
  padding: 8px 16px;
  font-size: 14px;
}

.landing-btn--lg {
  padding: 16px 32px;
  font-size: 16px;
}

.landing-hero__scroll-hint {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  animation: bounce 2s ease-in-out infinite;
}

.landing-hero__scroll-icon {
  font-size: 20px;
}

@keyframes bounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(6px); }
}

.landing-section {
  padding: 80px 0;
  position: relative;
  z-index: 1;
}

.landing-section__title {
  animation: fadeInUp 0.7s ease-out both;
}

.landing-why__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 32px;
}

.landing-why__item {
  padding: 32px 28px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--card-background);
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
  animation: fadeInUp 0.7s ease-out both;
  animation-delay: calc(0.2s + var(--i, 0) * 0.12s);
}

.landing-why__item:hover {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.12);
  transform: translateY(-4px);
}

.landing-why__num {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #fff 0%, rgba(129, 140, 248, 0.8) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 12px;
}

.landing-why__title {
  font-size: 1.15rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.landing-why__desc {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.landing-section__title {
  font-size: 1.75rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 48px;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.landing-features__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
}

.landing-feature {
  padding: 28px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--card-background);
  transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
  animation: fadeInUp 0.7s ease-out both;
  animation-delay: calc(0.15s + var(--i, 0) * 0.1s);
}

.landing-feature:hover {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.12);
  transform: translateY(-4px);
}

.landing-feature:hover .landing-feature__icon {
  transform: scale(1.08);
}

.landing-feature__icon {
  transition: transform 0.3s ease;
}

.landing-feature__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary-color);
  margin-bottom: 16px;
}

.landing-feature__title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.landing-feature__desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.landing-cta {
  padding: 100px 0 120px;
}

.landing-cta__card {
  text-align: center;
  padding: 64px 48px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-color);
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%);
  animation: fadeInUp 0.8s ease-out 0.2s both;
  transition: box-shadow 0.4s ease, border-color 0.4s ease;
}

.landing-cta__card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 0 60px rgba(99, 102, 241, 0.08);
}

.landing-cta__title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.landing-cta__desc {
  font-size: 1rem;
  color: var(--text-secondary);
  margin-bottom: 32px;
}

.landing-footer {
  padding: 32px 24px;
  text-align: center;
  border-top: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-muted);
}
</style>
