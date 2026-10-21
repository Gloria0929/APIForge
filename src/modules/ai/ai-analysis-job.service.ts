import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AiService } from "./ai.service";
import { AIAnalysisJob } from "./ai-analysis-job.entity";

@Injectable()
export class AIAnalysisJobService implements OnModuleInit {
  private readonly logger = new Logger(AIAnalysisJobService.name);
  private starting = false;
  constructor(
    @InjectRepository(AIAnalysisJob)
    private readonly jobs: Repository<AIAnalysisJob>,
    private readonly ai: AiService,
  ) {}

  async onModuleInit() {
    // A server restart cannot determine whether an in-flight provider call was billed.
    // Preserve progress, but require an explicit retry instead of replaying that call.
    await this.jobs.update(
      { status: "running" },
      {
        status: "failed",
        errors: [
          "服务已重启，分析任务中断。已完成的接口结果已保存，请重新选择未完成的接口。",
        ],
      },
    );
  }

  async active() {
    const job = await this.jobs.findOne({
      where: { status: "running" },
      order: { createdAt: "DESC" },
    });
    return job ? this.snapshot(job) : null;
  }

  async get(id: string) {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NotFoundException("分析任务不存在");
    return this.snapshot(job);
  }

  async start(projectId: string, apiIds: string[], persist = true) {
    if (this.starting) throw new ConflictException("已有分析任务正在启动");
    this.starting = true;
    try {
      if (await this.active())
        throw new ConflictException("已有 AI 批量分析任务正在进行，请等待完成");
      const ids = await this.ai.validateAnalysisJob(projectId, apiIds);
      const job = await this.jobs.save(
        this.jobs.create({
          projectId,
          apiIds: ids,
          persist,
          status: "running",
          processed: 0,
          completed: 0,
          failed: 0,
          results: [],
          errors: [],
        }),
      );
      void this.run(job).catch((error) =>
        this.logger.error("分析任务状态写入失败", error?.stack),
      );
      return this.snapshot(job);
    } finally {
      this.starting = false;
    }
  }

  private snapshot(job: AIAnalysisJob) {
    const { apiIds, ...rest } = job;
    return { ...rest, total: apiIds.length };
  }

  private async run(job: AIAnalysisJob) {
    try {
      for (const apiId of job.apiIds) {
        try {
          const result = await this.ai.semanticParseApi(
            job.projectId,
            apiId,
            job.persist,
          );
          job.results.push({ apiId, tags: result.tags || [] });
          job.completed++;
        } catch (error: any) {
          job.failed++;
          job.errors.push(`${apiId}: ${error?.message || "分析失败"}`);
        }
        job.processed++;
        const updated = await this.jobs.update(job.id, {
          processed: job.processed,
          completed: job.completed,
          failed: job.failed,
          results: job.results,
          errors: job.errors,
        });
        if (!updated.affected) return;
      }
      await this.jobs.update(job.id, {
        status: job.completed > 0 ? "completed" : "failed",
      });
    } catch (error: any) {
      await this.jobs.update(job.id, {
        status: "failed",
        errors: [...job.errors, error?.message || "分析任务失败"],
      });
    }
  }
}
