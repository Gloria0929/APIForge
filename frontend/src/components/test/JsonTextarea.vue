<template>
  <el-form-item :label="label">
    <el-input
      v-model="model"
      type="textarea"
      :rows="rows"
      :placeholder="placeholder"
    />
  </el-form-item>
</template>

<script setup lang="ts">
const model = defineModel<string>({ required: true });

withDefaults(
  defineProps<{
    label: string;
    rows?: number;
    placeholder?: string;
  }>(),
  {
    rows: 6,
    placeholder: "{}",
  },
);
</script>

