<template>
  <div class="login-page">
    <div class="login-bg" aria-hidden="true">
      <div class="login-bg__gradient" />
      <div class="login-bg__rays" />
      <div class="login-bg__particles">
        <span v-for="i in 36" :key="i" class="login-bg__particle" :style="{ '--i': i }" />
      </div>
      <div class="login-bg__grid" />
      <div class="login-bg__noise" />
    </div>

    <main class="login-main">
      <div class="login-card" :class="{ 'login-card--shake': loginError }">
        <div class="login-card__brand">
          <img src="/favicon.svg" alt="APIForge" class="login-card__logo" />
          <h1 class="login-card__title">APIForge</h1>
          <p class="login-card__subtitle">API 测试与文档一体化平台</p>
        </div>

        <form class="login-form" @submit.prevent="handleSubmit">
          <el-form-item label="账号">
            <el-input
              v-model="form.account"
              placeholder="admin"
              size="large"
              :prefix-icon="User"
              clearable
              autocomplete="username"
            />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              size="large"
              :prefix-icon="Lock"
              show-password
              clearable
              autocomplete="current-password"
            />
          </el-form-item>
          <el-form-item class="login-form__actions">
            <el-button
              type="primary"
              native-type="submit"
              size="large"
              :loading="submitting"
              class="login-btn login-btn--primary"
            >
              登录
            </el-button>
          </el-form-item>
        </form>

        <div class="login-footer">
          <router-link to="/landing" class="login-link">
            <el-icon><View /></el-icon>
            浏览产品介绍
          </router-link>
        </div>
      </div>

      <p class="login-hint">默认账号：admin，初始密码见服务端启动日志</p>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { User, Lock, View } from '@element-plus/icons-vue'
import { message } from '../../utils/message'
import { useAuthStore } from '../../store/auth'

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
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

.login-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #08080a;
}

.login-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login-bg__gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.2) 0%, transparent 55%),
    radial-gradient(ellipse 60% 40% at 100% 50%, rgba(129, 140, 248, 0.12) 0%, transparent 50%),
    radial-gradient(ellipse 50% 30% at 0% 80%, rgba(99, 102, 241, 0.08) 0%, transparent 50%);
}

.login-bg__rays {
  position: absolute;
  inset: -50%;
  background: conic-gradient(
    from 0deg at 50% 50%,
    transparent 0deg,
    rgba(99, 102, 241, 0.12) 25deg,
    transparent 55deg,
    rgba(129, 140, 248, 0.1) 115deg,
    transparent 145deg,
    rgba(99, 102, 241, 0.11) 205deg,
    transparent 235deg,
    rgba(129, 140, 248, 0.09) 295deg
  );
  animation: loginRays 20s linear infinite;
  opacity: 0.9;
}

@keyframes loginRays {
  to { transform: rotate(360deg); }
}

.login-bg__particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.login-bg__particle {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.75);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
  left: calc(var(--i) * 2.78%);
  top: calc(var(--i) * 2.5%);
  animation: loginParticle 6s ease-in-out infinite;
  animation-delay: calc(var(--i) * -0.2s);
}

.login-bg__particle:nth-child(odd) {
  width: 5px;
  height: 5px;
  background: rgba(129, 140, 248, 0.7);
  box-shadow: 0 0 10px rgba(129, 140, 248, 0.45);
  animation-duration: 8s;
}

.login-bg__particle:nth-child(3n) {
  width: 4px;
  height: 4px;
  background: rgba(165, 180, 252, 0.8);
  box-shadow: 0 0 8px rgba(165, 180, 252, 0.5);
  animation-duration: 7s;
}

@keyframes loginParticle {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.7;
  }
  25% {
    transform: translate(25px, -35px) scale(1.3);
    opacity: 1;
  }
  50% {
    transform: translate(-20px, 28px) scale(0.9);
    opacity: 0.85;
  }
  75% {
    transform: translate(30px, 15px) scale(1.2);
    opacity: 0.95;
  }
}

.login-bg__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.08) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 75%);
}

.login-bg__noise {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.6;
  mix-blend-mode: overlay;
}

.login-main {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  padding: 24px;
  animation: loginReveal 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes loginReveal {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-card--shake {
  animation: loginShake 0.5s ease-in-out;
}

@keyframes loginShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

.login-card {
  background: rgba(14, 14, 17, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 24px;
  padding: 44px 40px;
  backdrop-filter: blur(24px);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 1px 0 rgba(255, 255, 255, 0.03);
}

.login-card__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 32px;
}

.login-card__logo {
  display: block;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  filter: drop-shadow(0 2px 8px rgba(99, 102, 241, 0.25));
}

.login-card__title {
  font-family: 'Plus Jakarta Sans', var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0 0 8px;
  background: linear-gradient(135deg, #fff 0%, rgba(129, 140, 248, 0.9) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.login-card__subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-form-item__label) {
  color: var(--text-secondary);
  font-weight: 500;
}

.login-form :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.login-form :deep(.el-input__wrapper:hover),
.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.login-form__actions {
  margin-bottom: 0 !important;
  margin-top: 28px;
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 12px;
}

.login-btn--primary {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%) !important;
  border: none !important;
  color: #fff !important;
  transition: transform 0.2s, box-shadow 0.2s;
}

.login-btn--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.4);
}

.login-btn--primary:active {
  transform: translateY(0);
}

.login-footer {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.login-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.2s;
}

.login-link:hover {
  color: var(--primary-color);
}

.login-link .el-icon {
  font-size: 16px;
}

.login-hint {
  margin-top: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
</style>
