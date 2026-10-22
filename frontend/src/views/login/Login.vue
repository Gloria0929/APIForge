<template>
  <div class="login-page">
    <ThemeToggle class="login-theme" />

    <main class="login-main">
      <div class="login-card" :class="{ 'login-card--shake': loginError }">
        <div class="login-card__brand">
          <img src="/logo.png?v=5" alt="APIForge" class="login-card__logo" />
          <h1 class="login-card__title">APIForge</h1>
          <p class="login-card__subtitle">API 测试与文档一体化平台</p>
        </div>

        <form class="login-form" @submit.prevent="handleSubmit">
          <el-form-item>
            <el-input
              v-model="form.account"
              size="large"
              :prefix-icon="User"
              clearable
              autocomplete="username"
              aria-label="账号"
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              type="password"
              size="large"
              :prefix-icon="Lock"
              show-password
              clearable
              autocomplete="current-password"
              aria-label="密码"
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
  background: var(--background-color);
}
.login-theme { position: absolute; top: 24px; right: 24px; }
.login-main { width: 100%; max-width: 440px; padding: 24px; }
.login-card {
  padding: 36px 32px;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}
.login-card__brand { text-align: center; margin-bottom: 32px; }
.login-card__logo { display: block; width: 44px; height: 44px; margin: 0 auto 16px; }
.login-card__title { font-size: 25px; font-weight: 700; letter-spacing: -0.04em; margin: 0 0 8px; }
.login-card__subtitle { font-size: 14px; color: var(--text-secondary); margin: 0; }
.login-form :deep(.el-form-item) { margin-bottom: 18px; }
.login-form__actions { margin-bottom: 0 !important; margin-top: 24px; }
.login-btn { width: 100%; height: 42px; font-size: 14px; font-weight: 600; }
.login-footer { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-color); text-align: center; }
.login-link { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); text-decoration: none; }
.login-link:hover { color: var(--primary-color); }
.login-hint { margin-top: 20px; text-align: center; font-size: 12px; color: var(--text-muted); }
.login-card--shake { animation: loginShake 300ms ease-in-out; }
@keyframes loginShake { 25%, 75% { transform: translateX(-4px); } 50% { transform: translateX(4px); } }
@media (max-height: 600px) { .login-page { align-items: flex-start; } .login-main { margin-top: 64px; } }
</style>
