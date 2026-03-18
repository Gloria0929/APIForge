<template>
  <div class="body-type-editor">
    <el-form-item label="Body 类型">
      <el-radio-group :model-value="bodyType" @update:model-value="$emit('update:bodyType', $event)">
        <el-radio-button value="none">none</el-radio-button>
        <el-radio-button value="form-data">form-data</el-radio-button>
        <el-radio-button value="urlencoded">x-www-form-urlencoded</el-radio-button>
        <el-radio-button value="json">JSON</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <el-form-item v-if="bodyType === 'json'">
      <el-input :model-value="bodyJson" @update:model-value="$emit('update:bodyJson', $event)" type="textarea" :rows="6" />
    </el-form-item>

    <el-form-item v-else-if="bodyType === 'urlencoded'">
      <div class="body-type-editor__panel">
        <div class="body-type-editor__toolbar">
          <el-button size="small" @click="addBodyRow('urlencoded')">新增</el-button>
        </div>
        <el-table :data="bodyFormRowsUrlencoded" size="small" style="width: 100%">
          <el-table-column label="键" min-width="200">
            <template #default="scope">
              <el-input v-model="scope.row.key" placeholder="例如：username" />
            </template>
          </el-table-column>
          <el-table-column label="值" min-width="200">
            <template #default="scope">
              <el-input v-model="scope.row.value" placeholder="例如：tom 或 {{token}}" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="scope">
              <span class="table-action table-action--danger" @click="removeBodyRow('urlencoded', scope.$index)"><el-icon><Delete /></el-icon>删除</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="body-type-editor__hint">将以 application/x-www-form-urlencoded 发送。</div>
      </div>
    </el-form-item>

    <el-form-item v-else-if="bodyType === 'form-data'">
      <div class="body-type-editor__panel">
        <div class="body-type-editor__toolbar">
          <el-button size="small" @click="addBodyRow('form-data')">新增</el-button>
        </div>
        <el-table :data="bodyFormRowsFormData" size="small" style="width: 100%">
          <el-table-column label="键" min-width="280">
            <template #default="scope">
              <el-input
                v-model="scope.row.key"
                placeholder="例如：username"
                size="small"
                class="input-with-select form-data-key-input"
                clearable
              >
                <template #append>
                  <el-select v-model="scope.row.type" placeholder="类型" size="small" style="width: 82px" @click.stop>
                    <el-option label="文本" value="text" />
                    <el-option label="文件" value="file" />
                  </el-select>
                </template>
              </el-input>
            </template>
          </el-table-column>
          <el-table-column label="值" min-width="240">
            <template #default="scope">
              <div class="form-data-value-cell">
                <div
                  v-if="(scope.row.type || 'text') === 'file'"
                  class="form-data-file-cell"
                  @click="handleFormDataFileClick(scope.$index)"
                >
                  {{ scope.row.filename || (scope.row.value ? '已选择文件' : '点击选择文件') }}
                </div>
                <el-input
                  v-else
                  v-model="scope.row.value"
                  placeholder="例如：tom 或 {{token}}"
                  class="form-data-value-input"
                />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="scope">
              <span class="table-action table-action--danger" @click="removeBodyRow('form-data', scope.$index)"><el-icon><Delete /></el-icon>删除</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="body-type-editor__hint">将以 multipart/form-data 发送，支持 Text 和 File 类型。</div>
        <input
          ref="formDataFileInputRef"
          type="file"
          class="body-type-editor__file-input"
          @change="handleFormDataFileChange"
        />
      </div>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete } from '@element-plus/icons-vue'

export interface BodyFormRowUrlencoded {
  key: string
  value: string
}

export interface BodyFormRowFormData {
  key: string
  type?: 'text' | 'file'
  value: string
  filename?: string
}

const props = defineProps<{
  bodyType: 'none' | 'json' | 'urlencoded' | 'form-data'
  bodyJson: string
  bodyFormRowsUrlencoded: BodyFormRowUrlencoded[]
  bodyFormRowsFormData: BodyFormRowFormData[]
}>()

const emit = defineEmits<{
  (e: 'update:bodyType', v: 'none' | 'json' | 'urlencoded' | 'form-data'): void
  (e: 'update:bodyJson', v: string): void
  (e: 'update:bodyFormRowsUrlencoded', v: BodyFormRowUrlencoded[]): void
  (e: 'update:bodyFormRowsFormData', v: BodyFormRowFormData[]): void
}>()

const formDataFileInputRef = ref<HTMLInputElement | null>(null)
const formDataFileIndex = ref<number | null>(null)

const addBodyRow = (type: 'urlencoded' | 'form-data') => {
  if (type === 'urlencoded') {
    emit('update:bodyFormRowsUrlencoded', [...props.bodyFormRowsUrlencoded, { key: '', value: '' }])
  } else {
    emit('update:bodyFormRowsFormData', [...props.bodyFormRowsFormData, { key: '', type: 'text', value: '', filename: undefined }])
  }
}

const removeBodyRow = (type: 'urlencoded' | 'form-data', idx: number) => {
  if (type === 'urlencoded') {
    const next = [...props.bodyFormRowsUrlencoded]
    next.splice(idx, 1)
    emit('update:bodyFormRowsUrlencoded', next)
  } else {
    const next = [...props.bodyFormRowsFormData]
    next.splice(idx, 1)
    emit('update:bodyFormRowsFormData', next)
  }
}

const handleFormDataFileClick = (idx: number) => {
  formDataFileIndex.value = idx
  formDataFileInputRef.value?.click()
}

const handleFormDataFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file || formDataFileIndex.value === null) return
  const idx = formDataFileIndex.value
  formDataFileIndex.value = null
  input.value = ''
  const reader = new FileReader()
  reader.onload = () => {
    const base64 = (reader.result as string)?.split(',')[1] || ''
    const next = [...props.bodyFormRowsFormData]
    if (next[idx]) {
      next[idx] = { ...next[idx], value: base64, filename: file.name }
      emit('update:bodyFormRowsFormData', next)
    }
  }
  reader.readAsDataURL(file)
}
</script>

<style scoped>
.body-type-editor__panel {
  width: 100%;
}

.body-type-editor__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.body-type-editor__hint {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.body-type-editor__file-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

/* 键+类型合并：参考接口文档搜索样式 */
.input-with-select.form-data-key-input :deep(.el-input-group__append) {
  background-color: var(--el-fill-color-blank);
  padding: 0 16px 0 12px;
  text-align: center;
}
.input-with-select.form-data-key-input :deep(.el-input-group__append .el-select) {
  width: 82px !important;
  min-width: 82px;
}
.input-with-select.form-data-key-input :deep(.el-input-group__append .el-select .el-select__suffix) {
  right: 2px;
}
.input-with-select.form-data-key-input :deep(.el-input-group__append .el-select .el-select__wrapper),
.input-with-select.form-data-key-input :deep(.el-input-group__append .el-select .el-select__wrapper:hover),
.input-with-select.form-data-key-input :deep(.el-input-group__append .el-select .el-select__wrapper.is-focused) {
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  justify-content: center !important;
}
.input-with-select.form-data-key-input :deep(.el-input-group__append .el-select .el-select__selected-item),
.input-with-select.form-data-key-input :deep(.el-input-group__append .el-select .el-select__placeholder) {
  text-align: center;
}

.form-data-value-cell {
  width: 100%;
  min-width: 0;
}

.form-data-value-input {
  width: 100%;
}

.form-data-value-input :deep(.el-input__inner),
.form-data-value-input :deep(.el-input__wrapper) {
  width: 100% !important;
}

.form-data-file-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 11px;
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 14px;
  cursor: pointer;
}
.form-data-file-cell:hover {
  border-color: var(--el-color-primary);
}
</style>
