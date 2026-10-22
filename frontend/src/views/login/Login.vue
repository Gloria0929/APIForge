<template>
  <div class="login-page">
    <div class="login-atmosphere" aria-hidden="true">
      <span class="login-glow login-glow--cyan"></span>
      <span class="login-glow login-glow--magenta"></span>
      <span class="login-grid"></span>
    </div>

    <ThemeToggle class="login-theme" />

    <main class="login-shell" :class="{ 'login-shell--shake': loginError }">
      <aside class="login-brand">
        <div class="login-brand__top">
          <img src="/logo.png?v=5" alt="APIForge" class="login-brand__logo" />
          <span class="login-brand__wordmark">APIForge</span>
        </div>

        <div class="login-brand__copy">
          <p class="login-brand__eyebrow">
            <span class="login-brand__dot"></span>
            API QUALITY WORKBENCH
          </p>
          <h1 class="login-brand__title">把 API 质量<br /><span>锻造</span>出来。</h1>
          <p class="login-brand__desc">
            从接口导入、调试到场景编排与回归报告，一条流水线完成整条测试链路。
          </p>
        </div>

        <ul class="login-brand__features">
          <li>
            <span class="login-brand__num">01</span>
            <div>
              <strong>接口导入与调试</strong>
              <p>Swagger、OpenAPI、Postman 一键导入</p>
            </div>
          </li>
          <li>
            <span class="login-brand__num">02</span>
            <div>
              <strong>AI 分析与用例生成</strong>
              <p>自动补全标签、断言与边界场景</p>
            </div>
          </li>
          <li>
            <span class="login-brand__num">03</span>
            <div>
              <strong>场景编排与定时回归</strong>
              <p>变量传递、循环步骤、报告留档</p>
            </div>
          </li>
        </ul>

        <div class="login-brand__meta">
          <span class="login-brand__pulse"></span>
          LOCAL FIRST · 数据保存在你自己的机器上
        </div>
      </aside>

      <section class="login-panel">
        <div class="login-panel__mobile-brand">
          <img src="/logo.png?v=5" alt="APIForge" />
          <span>APIForge</span>
        </div>

        <header class="login-panel__head">
          <p class="login-panel__eyebrow">SIGN IN</p>
          <h2 class="login-panel__title">欢迎回来</h2>
          <p class="login-panel__subtitle">登录后继续你的 API 测试工作。</p>
        </header>

        <form class="login-form" @submit.prevent="handleSubmit">
          <div class="login-field">
            <label class="login-field__label" for="login-account">账号</label>
            <el-input
              id="login-account"
              v-model="form.account"
              size="large"
              :prefix-icon="User"
              clearable
              autocomplete="username"
              aria-label="账号"
            />
          </div>
          <div class="login-field">
            <label class="login-field__label" for="login-password">密码</label>
            <el-input
              id="login-password"
              v-model="form.password"
              type="password"
              size="large"
              :prefix-icon="Lock"
              show-password
              clearable
              autocomplete="current-password"
              aria-label="密码"
            />
          </div>
          <el-button
            type="primary"
            native-type="submit"
            size="large"
            :loading="submitting"
            class="login-submit"
          >
            <span>登录</span>
            <el-icon v-if="!submitting" class="login-submit__arrow"><Right /></el-icon>
          </el-button>
        </form>

        <div class="login-footer">
          <router-link to="/landing" class="login-link">
            <el-icon><View /></el-icon>
            浏览操作手册
          </router-link>
          <p class="login-hint">默认账号：admin，初始密码见服务端启动日志</p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { User, Lock, View, Right } from '@element-plus/icons-vue'
import { message } from '../../utils/message'
import { useAuthStore } from '../../store/auth'
import ThemeToggle from '../../components/layout/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const submitting = ref(false)
const loginError = ref(false)
const form = reactive({ account: 'admin', password: '' })

onMounted(() => {
  if (route.query.expired === '1') {
    message.warning('登录已失效，请重新登录')
  }
})

const handleSubmit = async () => {
  const account = String(form.account || '').trim()
  const password = String(form.password || '')
  if (!account || !password) {
    loginError.value = true
    message.error('请输入账号和密码')
    setTimeout(() => { loginError.value = false }, 600)
    return
  }
  submitting.value = true
  try {
    const res = await axios.post('/api/auth/login', {
      account,
      password,
    })
    const { username, token, mustChangePassword } = res.data || {}
    if (username && token) {
      authStore.setAuth(username, token, mustChangePassword)
      let redirect = (route.query.redirect as string) || '/projects'
      if (!redirect || redirect === '/' || redirect === '/login') {
        redirect = '/projects'
      }
      router.push(redirect)
    } else {
      message.error('登录响应异常')
    }
  } catch (err: any) {
    loginError.value = true
    message.error(err?.response?.data?.message || '账号或密码错误')
    setTimeout(() => { loginError.value = false }, 600)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: fixed;
  inset: var(--analysis-banner-height, 0px) 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 48px 24px;
  background: var(--background-color);
}

/* ── Atmosphere ───────────────────────────────────────────── */
.login-atmosphere {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.login-glow {
  position: absolute;
  width: 46vw;
  height: 46vw;
  min-width: 380px;
  min-height: 380px;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.5;
  animation: loginDrift 22s ease-in-out infinite alternate;
}
.login-glow--cyan {
  top: -18%;
  left: -10%;
  background: radial-gradient(circle, rgba(34, 211, 238, 0.42), transparent 68%);
}
.login-glow--magenta {
  right: -12%;
  bottom: -22%;
  background: radial-gradient(circle, rgba(232, 121, 249, 0.34), transparent 68%);
  animation-delay: -8s;
}
.login-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--border-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-color) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65), transparent 72%);
  -webkit-mask-image: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65), transparent 72%);
  opacity: 0.55;
}
:global(html[data-theme="light"]) .login-glow {
  opacity: 0.32;
}
:global(html[data-theme="light"]) .login-grid {
  opacity: 0.7;
}

@keyframes loginDrift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(32px, -28px, 0) scale(1.08); }
}

/* ── Shell ────────────────────────────────────────────────── */
.login-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
  width: min(1060px, 100%);
  min-height: 620px;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--card-background);
  overflow: hidden;
  box-shadow: 0 40px 100px -50px rgba(0, 0, 0, 0.65);
  animation: loginRise 0.65s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes loginRise {
  from { opacity: 0; transform: translateY(18px) scale(0.995); }
  to { opacity: 1; transform: none; }
}
.login-shell--shake { animation: loginShake 300ms ease-in-out; }
@keyframes loginShake {
  25%, 75% { transform: translateX(-4px); }
  50% { transform: translateX(4px); }
}

/* ── Brand panel ──────────────────────────────────────────── */
.login-brand {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 34px;
  padding: 52px 52px 44px;
  color: #f8fafc;
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(34, 211, 238, 0.16), transparent 58%),
    radial-gradient(110% 90% at 100% 100%, rgba(232, 121, 249, 0.18), transparent 58%),
    linear-gradient(160deg, #05070c 0%, #0a1018 52%, #130b19 100%);
  overflow: hidden;
}
.login-brand::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent 82%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent 82%);
  pointer-events: none;
}
.login-brand > * { position: relative; z-index: 1; }

.login-brand__top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.login-brand__logo {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  filter: drop-shadow(0 0 18px rgba(34, 211, 238, 0.35));
  box-shadow:
    0 0 0 1px rgba(226, 232, 240, 0.16),
    0 12px 30px -12px rgba(34, 211, 238, 0.6);
}
.login-brand__wordmark {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: #f8fafc;
}

.login-brand__copy {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: loginFadeUp 0.7s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.login-brand__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgba(226, 232, 240, 0.62);
}
.login-brand__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.9);
}
.login-brand__title {
  margin: 0;
  font-size: clamp(30px, 3.1vw, 40px);
  line-height: 1.16;
  font-weight: 700;
  letter-spacing: -0.045em;
  color: #f8fafc;
}
.login-brand__title span {
  background: linear-gradient(100deg, #22d3ee 10%, #a78bfa 55%, #e879f9 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.login-brand__desc {
  margin: 0;
  max-width: 340px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(203, 213, 225, 0.82);
}

.login-brand__features {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  animation: loginFadeUp 0.7s 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.login-brand__features li {
  display: flex;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}
.login-brand__features li:last-child {
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}
.login-brand__num {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #22d3ee;
  padding-top: 2px;
}
.login-brand__features strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}
.login-brand__features p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(148, 163, 184, 0.9);
}

.login-brand__meta {
  display: flex;
  align-items: center;
  gap: 9px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.75);
  animation: loginFadeUp 0.7s 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.login-brand__pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5);
  animation: loginPulse 2.4s ease-out infinite;
}
@keyframes loginPulse {
  0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.45); }
  70% { box-shadow: 0 0 0 7px rgba(74, 222, 128, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
}

@keyframes loginFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

/* ── Form panel ───────────────────────────────────────────── */
.login-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 52px 54px;
  background: var(--card-background);
}
.login-panel__mobile-brand { display: none; }

.login-panel__head {
  margin-bottom: 30px;
  animation: loginFadeUp 0.6s 0.12s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.login-panel__eyebrow {
  margin: 0 0 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--text-muted);
}
.login-panel__title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--text-primary);
}
.login-panel__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: loginFadeUp 0.6s 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.login-field__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}
.login-field :deep(.el-input__wrapper) {
  min-height: 44px;
  border-radius: 10px;
}
.login-field :deep(.el-input__prefix) {
  color: var(--text-muted);
}

.login-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 46px;
  margin-top: 6px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.login-submit__arrow {
  transition: transform 180ms ease;
}
.login-submit:hover .login-submit__arrow {
  transform: translateX(4px);
}

.login-footer {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  animation: loginFadeUp 0.6s 0.24s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.login-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 150ms ease;
}
.login-link:hover { color: var(--primary-color); }
.login-hint {
  margin: 0;
  text-align: center;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}

.login-theme {
  position: absolute;
  top: 26px;
  right: 26px;
  z-index: 5;
}

/* ── Responsive ───────────────────────────────────────────── */
@media (max-width: 900px) {
  .login-page { padding: 32px 18px; }
  .login-shell {
    grid-template-columns: 1fr;
    width: min(460px, 100%);
    min-height: 0;
  }
  .login-brand { display: none; }
  .login-panel { padding: 34px 28px 30px; }
  .login-panel__mobile-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 30px;
    font-family: var(--font-mono);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text-primary);
  }
  .login-panel__mobile-brand img {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    box-shadow: 0 0 0 1px var(--border-color), 0 8px 20px -10px rgba(34, 211, 238, 0.5);
  }
  .login-theme { top: 18px; right: 18px; }
}

@media (max-height: 720px) and (min-width: 901px) {
  .login-shell { min-height: 0; }
  .login-brand { padding: 40px 44px 34px; gap: 24px; }
  .login-brand__features li { padding: 10px 0; }
  .login-panel { padding: 40px 46px; }
}

@media (max-height: 700px) {
  .login-page { align-items: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  .login-shell,
  .login-brand__copy,
  .login-brand__features,
  .login-brand__meta,
  .login-panel__head,
  .login-form,
  .login-footer,
  .login-glow,
  .login-brand__pulse {
    animation: none;
  }
  .login-submit__arrow { transition: none; }
}
</style>
