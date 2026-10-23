<template>
  <div ref="chartElement" class="stress-trend-chart" role="img" :aria-label="label" />
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { init, use, type ECharts } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useThemeStore } from '../../store/theme'
use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])
const props = withDefaults(defineProps<{ points: any[]; metric?: 'throughput' | 'latency' | 'users'; targetUsers?: number }>(), { metric: 'throughput', targetUsers: 0 })
const theme = useThemeStore()
const chartElement = ref<HTMLElement>()
let chart: ECharts | undefined
let observer: ResizeObserver | undefined
const label = computed(() => ({ throughput: '每秒请求量与失败量趋势', latency: '累计平均响应时间与 P95 趋势', users: '活跃用户数与目标用户数趋势' }[props.metric]))
function render() {
  if (!chart || !chartElement.value) return
  const style = getComputedStyle(document.documentElement)
  const color = (name: string) => style.getPropertyValue(name).trim()
  const line = (name: string, data: number[], tone: string, dashed = false) => ({ name, type: 'line' as const, data, smooth: false, showSymbol: props.points.length < 2, symbolSize: 5, lineStyle: { width: 2, type: dashed ? 'dashed' as const : 'solid' as const }, itemStyle: { color: tone } })
  let series
  let unit
  if (props.metric === 'latency') {
    unit = 'ms'
    series = [line('平均响应', props.points.map(p => p.avgResponseTime || 0), color('--primary-color'))]
    if (props.points.some(p => Number.isFinite(p.p95ResponseTime))) series.push(line('P95', props.points.map(p => p.p95ResponseTime || 0), color('--warning-color')))
  } else if (props.metric === 'users') {
    unit = '用户'
    series = [line('活跃用户', props.points.map(p => p.users || 0), color('--primary-color')), line('目标用户', props.points.map(() => props.targetUsers), color('--text-muted'), true)]
  } else {
    unit = 'req/s'
    const failures = props.points.map((point, index) => {
      if (Number.isFinite(point.failures)) return point.failures
      const previous = props.points[index - 1]
      const seconds = point.elapsedSeconds - (previous?.elapsedSeconds || 0)
      return seconds > 0 ? Number((Math.max(0, point.failed - (previous?.failed || 0)) / seconds).toFixed(1)) : 0
    })
    series = [line('请求 / 秒', props.points.map(p => p.rps || 0), color('--primary-color')), line('失败 / 秒', failures, color('--error-color'))]
  }
  chart.setOption({
    animation: false, backgroundColor: 'transparent',
    textStyle: { fontFamily: 'inherit', color: color('--text-secondary') },
    tooltip: { trigger: 'axis', confine: true, backgroundColor: color('--card-background-strong'), borderColor: color('--border-color'), textStyle: { color: color('--text-primary') } },
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 4, textStyle: { color: color('--text-secondary'), fontSize: 11 } },
    grid: { top: 43, left: 50, right: 20, bottom: 32 },
    xAxis: { type: 'category', boundaryGap: false, data: props.points.map(p => `${p.elapsedSeconds}s`), axisLine: { lineStyle: { color: color('--border-color') } }, axisTick: { show: false }, axisLabel: { color: color('--text-muted'), fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', name: unit, min: 0, nameTextStyle: { color: color('--text-muted'), fontSize: 10 }, axisLabel: { color: color('--text-muted'), fontSize: 11 }, splitLine: { lineStyle: { color: color('--border-color'), type: 'dashed' } } },
    series,
  }, { notMerge: true })
}
onMounted(() => {
  if (!chartElement.value) return
  chart = init(chartElement.value)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(chartElement.value)
  render()
})
watch(() => [props.points, props.metric, props.targetUsers, theme.mode], render, { deep: true })
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose() })
</script>
<style scoped>
.stress-trend-chart { width: 100%; height: 270px; min-width: 0; }
</style>
