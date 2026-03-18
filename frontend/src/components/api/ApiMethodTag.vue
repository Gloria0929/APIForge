<template>
  <el-tag :type="tagType" size="small" effect="dark">{{ method }}</el-tag>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  method: string;
}>();

const tagType = computed(() => {
  switch (props.method?.toUpperCase()) {
    case "GET":
      return "success";
    case "POST":
      return "primary";
    case "PUT":
      return "warning";
    case "DELETE":
      return "danger";
    default:
      return "info";
  }
});
</script>
