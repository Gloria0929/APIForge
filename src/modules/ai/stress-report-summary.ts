/** Build factual pressure-test evidence before asking a model for interpretation. */
const number = (value: unknown): number | null => {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const object = (value: any): any => {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};
const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));
const textList = (value: any, fallback: string[]): string[] => Array.isArray(value)
  ? value.filter(item => typeof item === "string" && item.trim()).slice(0, 8).map(item => item.trim().slice(0, 1000))
  : fallback;

export function parseSummaryObject(value: any) { return object(value); }

export function buildStressReportSummary(report: any) {
  const summary = object(report?.summary);
  const performance = object(report?.performance);
  const charts = object(report?.charts);
  let details = report?.details;
  if (typeof details === "string") { try { details = JSON.parse(details); } catch { details = []; } }
  details = Array.isArray(details) ? details.filter(item => item && typeof item === "object" && !Array.isArray(item)) : [];
  const total = number(summary.total);
  const failed = number(summary.failed);
  const errors = number(summary.error);
  const failures = failed != null && errors != null ? failed + errors : null;
  const failureRate = total && failures != null ? Number((failures / total * 100).toPrecision(6)) : null;
  const completedRuns = number(summary.completedRuns);
  const plannedRuns = number(summary.totalRequests);
  const reason = typeof summary.stopReason === "string" ? summary.stopReason : "unknown";
  const reasonLabels: Record<string, string> = { completed: "正常结束", manual: "手动停止", failure_rate: "达到失败率阈值", time_limit: "达到最长运行时间", unknown: "旧报告未记录停止原因" };
  const stopped = ["manual", "failure_rate", "time_limit"].includes(reason);
  const roundIncomplete = summary.executionMode === "requests" && plannedRuns != null && completedRuns != null && completedRuns < plannedRuns;
  const incomplete = stopped || roundIncomplete;
  const completion = !total ? "NO_DATA" : incomplete ? "PARTIAL" : reason === "completed" ? "COMPLETE" : "UNKNOWN";
  const completionLabels = { NO_DATA: "无有效请求样本", PARTIAL: "部分结果", COMPLETE: "测试已结束", UNKNOWN: "执行范围待确认" };
  const metrics = {
    totalRequests: total, failedRequests: failed, errorRequests: errors, failureRate,
    throughput: number(performance.throughput), avgResponseTime: number(performance.avgResponseTime),
    p95ResponseTime: number(performance.p95ResponseTime), p99ResponseTime: number(performance.p99ResponseTime),
    maxResponseTime: number(performance.maxResponseTime),
  };
  const load = {
    virtualUsers: number(summary.virtualUsers), executionMode: summary.executionMode || "unknown",
    durationSeconds: number(summary.durationSeconds), plannedRuns, completedRuns,
    rampUpSeconds: number(summary.rampUpSeconds), stepDelayMs: number(summary.stepDelayMs),
    timeoutMs: number(summary.timeoutMs), stopOnFailRate: number(summary.stopOnFailRate),
    actualDurationSeconds: number(summary.duration) == null ? null : rounded(Number(summary.duration) / 1000, 1),
  };

  // Endpoint rows contain aggregate failures; error-detail rows contain the same
  // failed requests again. Never add both kinds together or count rows as calls.
  const aggregates = details.filter((item: any) => number(item.failures) != null || number(item.requestsPerSecond) != null);
  const errorsByEndpoint = new Map<string, string[]>();
  const keyOf = (item: any) => `${item.request?.method || ""} ${item.stepName || item.name || "未命名接口"}`.trim();
  for (const item of details) {
    if (item.error && number(item.failures) == null && number(item.requestsPerSecond) == null) {
      const key = keyOf(item);
      const reasons = errorsByEndpoint.get(key) || [];
      if (reasons.length < 3 && !reasons.includes(String(item.error))) reasons.push(String(item.error).slice(0, 500));
      errorsByEndpoint.set(key, reasons);
    }
  }
  const failureMap = new Map<string, any>();
  const source = aggregates.length ? aggregates : details.filter((item: any) => ["FAILED", "ERROR"].includes(item.status));
  for (const item of source) {
    const count = aggregates.length ? number(item.failures) || 0 : number(item.requests) ?? 1;
    if (!count) continue;
    const name = keyOf(item);
    const current = failureMap.get(name) || { name, count: 0, requests: 0, reasons: errorsByEndpoint.get(name) || [] };
    current.count += count;
    current.requests += number(item.requests) || 0;
    failureMap.set(name, current);
  }
  const topFailures = [...failureMap.values()].sort((a, b) => b.count - a.count).slice(0, 5).map(item => ({ ...item, failureRate: item.requests ? rounded(item.count / item.requests * 100) : null }));
  const slowest = (aggregates.length ? aggregates : details).filter((item: any) => number(item.responseTime) != null && (number(item.responseTime)! > 0 || number(item.p95ResponseTime)! > 0))
    .sort((a: any, b: any) => (number(b.p95ResponseTime) ?? number(b.responseTime) ?? 0) - (number(a.p95ResponseTime) ?? number(a.responseTime) ?? 0))
    .slice(0, 5).map((item: any) => ({ name: keyOf(item), time: number(item.responseTime), p95ResponseTime: number(item.p95ResponseTime), requests: number(item.requests) }));

  const rawTrend = Array.isArray(charts.trend) ? charts.trend : [];
  const points = rawTrend.filter((point: any) => number(point?.rps) != null).map((point: any) => ({
    time: typeof point.time === "string" ? point.time : null, rps: number(point.rps),
    failuresPerSecond: number(point.failures), avgResponseTime: number(point.avgResponseTime),
  }));
  const sampled = points.length <= 60 ? points : Array.from({ length: 60 }, (_, index) => points[Math.round(index * (points.length - 1) / 59)]);
  const trend = {
    sampleCount: points.length, suppliedPointCount: sampled.length,
    peakRps: points.length ? Math.max(...points.map((point: any) => point.rps)) : null,
    firstRps: points[0]?.rps ?? null, lastRps: points[points.length - 1]?.rps ?? null,
    // A single run cannot establish a capacity limit or a historical regression.
    points: sampled,
  };
  const limitations = [
    "本报告未提供延迟、吞吐 SLA 或容量目标，不能据此判定性能达标、最大容量或是否可发布。",
    "未提供同环境、同负载的历史基线，不能确认性能退化或提升。",
    "缺少 CPU、内存、数据库和调用链监控；瓶颈原因需进一步验证。",
  ];
  if (incomplete) limitations.unshift("压测提前停止或未完成目标轮次，结论仅覆盖已采集的负载与时间范围。");
  if (!total) limitations.unshift("没有有效请求样本，不能评价吞吐、延迟稳定性或系统容量。");
  if (total != null && failures != null && failures > total) limitations.unshift("失败及错误计数大于请求总数，统计口径需先核对。");
  if (failed == null || errors == null) limitations.push("失败或错误计数缺失，无法准确计算请求失败率。");
  if (failures && !topFailures.length) limitations.push("报告记录了失败请求，但缺少可用的接口级失败明细，无法确定失败热点。");
  if (load.virtualUsers == null || load.executionMode === "unknown" || reason === "unknown") limitations.push("旧报告缺少部分负载配置或停止原因，不能假定本轮完整执行。");
  if (!points.length) limitations.push("缺少时间序列采样，无法判断压测期间的吞吐与延迟变化。");
  const missingMetrics = [metrics.throughput, metrics.avgResponseTime, metrics.p95ResponseTime, metrics.p99ResponseTime].some(value => value == null);
  if (missingMetrics) limitations.push("部分性能指标缺失，缺失值不能当作 0ms 或零吞吐进行评价。");
  if (points.length > 60) limitations.push(`趋势共 ${points.length} 个采样点，按时间均匀选取 60 点供分析，并单独保留吞吐峰值。`);

  const highRisk = reason === "failure_rate" || (failureRate != null && failureRate >= 5) || (total != null && failures != null && failures > total);
  const risk = highRisk ? "HIGH" : incomplete || !total || reason === "unknown" || missingMetrics || failureRate == null || failureRate > 0 ? "MEDIUM" : "LOW";
  const findings = [
    `${reasonLabels[reason] || reason}；${completionLabels[completion]}，实际请求 ${total ?? "未知"} 次，完成场景 ${completedRuns ?? "未知"} 轮。`,
    `吞吐 ${metrics.throughput ?? "未知"} req/s；平均 ${metrics.avgResponseTime ?? "未知"}ms，P95 ${metrics.p95ResponseTime ?? "未知"}ms，P99 ${metrics.p99ResponseTime ?? "未知"}ms。`,
    failureRate == null ? "请求失败率待核对。" : `按失败与错误请求重新计算，实际失败率为 ${failureRate}%。`,
  ];
  if (topFailures.length) findings.push(`${topFailures[0].name} 有 ${topFailures[0].count} 次失败，是本轮失败请求最多的步骤。`);
  if (slowest.length) findings.push(`尾延迟较高的步骤：${slowest[0].name}（P95 ${slowest[0].p95ResponseTime ?? "未记录"}ms，平均 ${slowest[0].time ?? "未记录"}ms）。`);
  const recommendations = [
    ...(topFailures.length ? [`优先按错误类型排查 ${topFailures[0].name} 的 ${topFailures[0].count} 次失败，再以相同负载复测。`] : []),
    ...(incomplete ? ["核对停止原因，在可控环境完成目标负载后再评价稳定性。"] : []),
    "明确 P95/P99 延迟、允许失败率和目标吞吐，再设计逐级升压与持续负载测试。",
    "保留本次配置，在相同环境复测并结合资源监控定位瓶颈。",
  ];
  return {
    analysis_type: "stress", schema_version: 2,
    summary: { short: `${completionLabels[completion]}：${total ?? 0} 次请求，失败率${failureRate == null ? "未知" : `${failureRate}%`}。`, detailed: findings.join(" ") },
    highlights: findings,
    risk_assessment: { level: risk, description: highRisk ? "已观察到失败率风险，应先定位失败请求；当前数据不构成发布或容量结论。" : "风险评估仅针对当前负载下的已观测结果，性能是否达标仍需明确目标与补充验证。", recommendations },
    top_failures: topFailures,
    slowest_apis: slowest,
    stress_analysis: {
      execution: { completion, label: completionLabels[completion], stopReason: reason, stopReasonLabel: reasonLabels[reason] || reason },
      load, metrics, trend, findings, limitations,
    },
  };
}

export function normalizeStressReportSummary(result: any, facts: ReturnType<typeof buildStressReportSummary>) {
  const levels: Record<string, string> = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", "低": "LOW", "中": "MEDIUM", "高": "HIGH" };
  const modelLevel = levels[result?.risk_assessment?.level];
  const order = ["LOW", "MEDIUM", "HIGH"];
  const level = order[Math.max(order.indexOf(facts.risk_assessment.level), order.indexOf(modelLevel))];
  const text = (value: any, fallback: string, limit: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
  return {
    ...facts,
    summary: { short: text(result?.summary?.short, facts.summary.short, 50), detailed: text(result?.summary?.detailed, facts.summary.detailed, 4000) },
    highlights: textList(result?.highlights, facts.highlights),
    risk_assessment: { level, description: text(result?.risk_assessment?.description, facts.risk_assessment.description, 2000), recommendations: textList(result?.risk_assessment?.recommendations, facts.risk_assessment.recommendations) },
    stress_analysis: {
      ...facts.stress_analysis,
      findings: textList(result?.stress_analysis?.findings, facts.stress_analysis.findings),
      limitations: [...new Set([...facts.stress_analysis.limitations, ...textList(result?.stress_analysis?.limitations, [])])].slice(0, 14),
    },
    __usage: result?.__usage || null,
  };
}
