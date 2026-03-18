<template>
  <PageContainerLayout
    title="历史报告对比"
    description="对比两份回归报告的通过率、耗时与状态变化，快速定位回归波动。"
    :breadcrumbs="[{ label: '测试报告', to: `/projects/${projectId}/tests/reports` }, { label: '报告对比' }]"
  >
    <template #toolbar>
      <el-button @click="goBack">返回列表</el-button>
    </template>
    <el-card class="app-panel">
      <template #header>
        <div class="app-panel-header">
          <div>
            <div class="app-panel-title">报告选择</div>
            <div class="app-panel-subtitle">任意切换两份报告，查看关键指标与状态变化明细。</div>
          </div>
        </div>
      </template>

      <el-form label-width="120px">
        <el-form-item label="报告 A">
          <el-select v-model="leftId" filterable placeholder="选择报告" style="width: 100%">
            <el-option v-for="r in reports" :key="r.id" :label="`${r.name} (${formatDate(r.createdAt)})`" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="报告 B">
          <el-select v-model="rightId" filterable placeholder="选择报告" style="width: 100%">
            <el-option v-for="r in reports" :key="r.id" :label="`${r.name} (${formatDate(r.createdAt)})`" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-alert v-if="!leftId || !rightId" title="请选择两份报告后查看对比结果" type="info" :closable="false" class="mt-3" />

      <div v-if="left && right" class="mt-6 space-y-6">
        <div class="grid gap-4 xl:grid-cols-3">
          <div class="app-data-card">
            <div class="mt-2 font-display text-2xl text-slate-100">{{ left.name }}</div>
            <div class="mt-4 space-y-2 text-sm text-slate-300">
              <div>通过率：{{ left.summary.passRate }}%</div>
              <div>通过/失败/错误：{{ left.summary.passed }}/{{ left.summary.failed }}/{{ left.summary.error }}</div>
              <div>总耗时：{{ left.summary.duration }}ms</div>
            </div>
          </div>
          <div class="app-data-card">
            <div class="mt-2 font-display text-2xl text-slate-100">{{ right.name }}</div>
            <div class="mt-4 space-y-2 text-sm text-slate-300">
              <div>通过率：{{ right.summary.passRate }}%</div>
              <div>通过/失败/错误：{{ right.summary.passed }}/{{ right.summary.failed }}/{{ right.summary.error }}</div>
              <div>总耗时：{{ right.summary.duration }}ms</div>
            </div>
          </div>
          <div class="app-data-card border-teal-300/20 bg-teal-300/5">
            <div class="mt-2 font-display text-2xl text-slate-100">A → B</div>
            <div class="mt-4 space-y-2 text-sm text-slate-300">
              <div>通过率：{{ left.summary.passRate }}% → {{ right.summary.passRate }}%</div>
              <div>总耗时：{{ left.summary.duration }}ms → {{ right.summary.duration }}ms</div>
              <div>状态变化：{{ changed.length }} 条</div>
            </div>
          </div>
        </div>

        <div class="app-data-card">
          <div class="mb-4 flex items-center justify-between gap-4">
            <div>
              <div class="text-xl font-semibold text-slate-100">状态变化列表</div>
            </div>
          </div>
          <el-table :data="pagedChanged" size="small" style="width: 100%">
            <el-table-column prop="name" label="用例/步骤" min-width="220" />
            <el-table-column prop="key" label="键" min-width="260" />
            <el-table-column prop="from" label="A 状态" width="110" />
            <el-table-column prop="to" label="B 状态" width="110" />
          </el-table>
          <el-empty v-if="changed.length === 0" class="app-empty" description="两份报告未发现状态变化" />
          <div v-else class="app-pagination">
            <div class="app-pagination-copy">变化行数 {{ changed.length }}</div>
            <el-pagination
              background
              layout="total, sizes, prev, pager, next"
              :total="total"
              :current-page="currentPage"
              :page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              @current-change="handleCurrentChange"
              @size-change="handleSizeChange"
            />
          </div>
        </div>
      </div>
    </el-card>
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import PageContainerLayout from '../../components/layout/PageContainerLayout.vue'
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import { usePagination } from '../../composables/usePagination'
import { message } from "../../utils/message";
import { formatDateTime } from "../../utils/date";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.id as string);

const reports = ref<any[]>([]);
const leftId = ref<string>(String(route.query.a || ""));
const rightId = ref<string>(String(route.query.b || ""));
const left = ref<any | null>(null);
const right = ref<any | null>(null);

const formatDate = (dateString: string) => formatDateTime(dateString);

const fetchReports = async () => {
  try {
    const res = await axios.get(`/api/tests/reports?projectId=${projectId.value}`);
    reports.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    console.error("Failed to fetch reports:", e);
    reports.value = [];
  }
};

const fetchOne = async (id: string) => {
  const rid = String(id || "").trim();
  if (!rid) return null;
  try {
    const res = await axios.get(`/api/tests/reports/${rid}`);
    return res.data;
  } catch (e) {
    console.error("Failed to fetch report:", e);
    message.error(e, "加载报告失败");
    return null;
  }
};

onMounted(async () => {
  await fetchReports();
  if (leftId.value) left.value = await fetchOne(leftId.value);
  if (rightId.value) right.value = await fetchOne(rightId.value);
});

watch(
  () => [leftId.value, rightId.value],
  async ([a, b]) => {
    router.replace({
      query: {
        ...(a ? { a } : {}),
        ...(b ? { b } : {}),
      },
    });
    left.value = a ? await fetchOne(a) : null;
    right.value = b ? await fetchOne(b) : null;
  },
);

const keyOf = (r: any) => {
  const id = String(r?.testCaseId || "");
  const step = String(r?.stepName || "");
  const name = String(r?.name || "");
  if (id) return `${id}|${step || name}`;
  return `${name}|${step}`;
};

const labelOf = (r: any) => {
  const step = String(r?.stepName || "");
  return step || String(r?.name || r?.testCaseId || "");
};

const changed = computed(() => {
  if (!left.value || !right.value) return [];
  const a = Array.isArray(left.value.details) ? left.value.details : [];
  const b = Array.isArray(right.value.details) ? right.value.details : [];

  const mapA = new Map<string, any>();
  for (const r of a) mapA.set(keyOf(r), r);

  const out: any[] = [];
  for (const r of b) {
    const k = keyOf(r);
    const prev = mapA.get(k);
    const from = String(prev?.status || "N/A");
    const to = String(r?.status || "N/A");
    if (from !== to) {
      out.push({ key: k, name: labelOf(r), from, to });
    }
  }

  const mapB = new Map<string, any>();
  for (const r of b) mapB.set(keyOf(r), r);
  for (const [k, r] of mapA.entries()) {
    if (!mapB.has(k)) {
      out.push({ key: k, name: labelOf(r), from: String(r?.status || "N/A"), to: "MISSING" });
    }
  }

  return out;
});

const { currentPage, pageSize, total, pagedItems: pagedChanged, handleCurrentChange, handleSizeChange, resetPage } = usePagination(changed, 10)
watch(changed, () => resetPage())

const goBack = () => {
  router.push(`/projects/${projectId.value}/tests/reports`);
};
</script>
