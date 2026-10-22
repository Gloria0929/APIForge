<template>
  <div class="landing-page">
    <header class="landing-header">
      <div class="landing-header__inner">
        <router-link to="/landing" class="landing-logo">
          <img src="/logo.png?v=5" alt="APIForge" class="landing-logo__img" />
          <span class="landing-logo__text">APIForge</span>
        </router-link>
        <nav class="landing-nav">
          <ThemeToggle />
          <a href="#features" class="landing-nav__link">功能</a>
          <a href="/manual" target="_blank" rel="noopener" class="landing-nav__link">文档</a>
          <span v-if="authStore.isLoggedIn" class="landing-nav__user">{{ authStore.username }}</span>
          <router-link v-if="authStore.isLoggedIn" to="/projects" class="landing-nav__link">进入应用</router-link>
          <router-link v-else to="/login" class="landing-nav__link">登录</router-link>
        </nav>
      </div>
    </header>

    <main class="landing-main">
      <section class="landing-hero">
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
import { onMounted } from 'vue'
import { ArrowDown, Document, Connection, List, Share, Timer, CircleCheck, Lightning, User, Monitor, Upload, DataAnalysis, Setting, Cpu } from '@element-plus/icons-vue'
import { useAuthStore } from '../../store/auth'
import ThemeToggle from '../../components/layout/ThemeToggle.vue'

const authStore = useAuthStore()

onMounted(() => authStore.syncFromStorage())
</script>

<style scoped>
.landing-page { position: fixed; inset: var(--analysis-banner-height, 0px) 0 0; overflow-y: auto; overflow-x: hidden; background: var(--background-color); scroll-behavior: smooth; }
.landing-header { position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--border-color); background: var(--card-background); }
.landing-header__inner { max-width: 1120px; margin: 0 auto; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.landing-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text-primary); }
.landing-logo__img { width: 30px; height: 30px; }
.landing-logo__text { font-size: 20px; font-weight: 700; letter-spacing: -0.04em; }
.landing-nav { display: flex; align-items: center; gap: 24px; }
.landing-nav__link, .landing-nav__user { font-size: 14px; color: var(--text-secondary); text-decoration: none; }
.landing-nav__link:hover { color: var(--primary-color); }
.landing-main { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.landing-hero { min-height: 580px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 0 48px; }
.landing-hero__content { width: 100%; text-align: center; }
.landing-hero__title { display: flex; flex-direction: column; gap: 16px; margin: 0; }
.landing-hero__title-main { font-size: clamp(40px, 5vw, 64px); font-weight: 700; letter-spacing: -0.06em; color: var(--text-primary); }
.landing-hero__title-sub { font-size: clamp(20px, 2.8vw, 28px); font-weight: 500; color: var(--text-primary); }
.landing-hero__desc { max-width: 680px; margin: 24px auto; font-size: 16px; line-height: 1.8; color: var(--text-secondary); }
.landing-hero__badges { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin: 24px 0 32px; }
.landing-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-secondary); background: var(--card-background); }
.landing-badge .el-icon { color: var(--primary-color); }
.landing-hero__actions { display: flex; justify-content: center; gap: 12px; }
.landing-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 10px 22px; font-size: 14px; font-weight: 600; border-radius: var(--radius-md); text-decoration: none; transition: background-color 150ms, border-color 150ms; }
.landing-btn--primary { background: var(--primary-color); color: var(--on-primary); border: 1px solid var(--primary-color); }
.landing-btn--primary:hover { background: var(--secondary-color); border-color: var(--secondary-color); }
.landing-btn--outline { background: var(--card-background); color: var(--text-primary); border: 1px solid var(--border-color); }
.landing-btn--outline:hover { background: var(--surface-hover); border-color: var(--border-color-hover); }
.landing-btn--lg { min-height: 46px; padding-inline: 28px; }
.landing-hero__scroll-hint { display: flex; align-items: center; gap: 8px; margin-top: 48px; color: var(--text-muted); font-size: 12px; }
.landing-section { padding: 64px 0; border-top: 1px solid var(--border-color); }
.landing-section__title { font-size: 26px; text-align: center; margin-bottom: 32px; letter-spacing: -0.03em; }
.landing-why__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.landing-why__item, .landing-feature { padding: 24px; border-radius: var(--radius-lg); border: 1px solid var(--border-color); background: var(--card-background); }
.landing-why__num { font-family: var(--font-mono); font-size: 18px; color: var(--primary-color); margin-bottom: 20px; }
.landing-why__title, .landing-feature__title { font-size: 16px; font-weight: 600; margin-bottom: 10px; }
.landing-why__desc, .landing-feature__desc { font-size: 14px; line-height: 1.75; color: var(--text-secondary); }
.landing-features__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.landing-feature__icon { display: inline-flex; color: var(--primary-color); margin-bottom: 20px; }
.landing-cta__card { text-align: center; padding: 48px 24px; border: 1px solid var(--border-color); border-radius: var(--radius-lg); background: var(--card-background); }
.landing-cta__title { font-size: 26px; margin-bottom: 12px; }
.landing-cta__desc { font-size: 14px; color: var(--text-secondary); margin-bottom: 24px; }
.landing-footer { padding: 24px; text-align: center; border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted); }
@media (max-width: 900px) { .landing-features__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) {
  .landing-header__inner { flex-wrap: wrap; padding: 12px 16px; }
  .landing-nav { gap: 16px; flex-wrap: wrap; }
  .landing-nav__link, .landing-nav__user { font-size: 12px; }
  .landing-main { padding: 0 16px; }
  .landing-hero { min-height: auto; padding: 56px 0 40px; }
  .landing-hero__desc { font-size: 14px; }
  .landing-why__grid, .landing-features__grid { grid-template-columns: 1fr; }
  .landing-section { padding: 40px 0; }
}
</style>
