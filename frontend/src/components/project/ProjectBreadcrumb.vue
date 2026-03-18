<template>
  <el-breadcrumb separator="/">
    <el-breadcrumb-item to="/projects">项目</el-breadcrumb-item>
    <el-breadcrumb-item>{{ projectName || projectId }}</el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
defineProps<{
  projectId: string;
  projectName?: string;
}>();
</script>

