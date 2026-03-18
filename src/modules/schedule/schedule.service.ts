import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Schedule } from './schedule.entity';
import { TestService } from '../test/test.service';
import * as cronParser from "cron-parser";

@Injectable()
export class ScheduleService implements OnModuleInit {
  constructor(
    @InjectRepository(Schedule)
    private scheduleRepository: Repository<Schedule>,
    private testService: TestService,
  ) {}

  onModuleInit() {
    this.scheduleTasks();
  }

  // 每分钟检查一次定时任务
  @Cron(CronExpression.EVERY_MINUTE)
  async checkSchedules() {
    const now = new Date();
    const schedules = await this.scheduleRepository.find({ where: { enabled: true } });

    for (const schedule of schedules) {
      if (this.shouldExecute(schedule, now)) {
        await this.executeSchedule(schedule);
        await this.updateNextExecution(schedule, now);
      }
    }
  }

  // 获取所有定时任务
  async getSchedules(projectId: string) {
    if (projectId) {
      return this.scheduleRepository.find({ where: { projectId } });
    }
    return this.scheduleRepository.find();
  }

  // 获取单个定时任务
  async getSchedule(id: number) {
    return this.scheduleRepository.findOne({ where: { id } });
  }

  // 创建定时任务
  async createSchedule(schedule: Partial<Schedule>) {
    const newSchedule = await this.scheduleRepository.save(schedule);
    await this.updateNextExecution(newSchedule, new Date());
    this.scheduleTasks();
    return newSchedule;
  }

  // 更新定时任务
  async updateSchedule(id: number, schedule: Partial<Schedule>) {
    await this.scheduleRepository.update(id, schedule);
    const updated = await this.getSchedule(id);
    if (updated) {
      await this.updateNextExecution(updated, new Date());
    }
    this.scheduleTasks();
    return this.getSchedule(id);
  }

  // 删除定时任务
  async deleteSchedule(id: number) {
    await this.scheduleRepository.delete(id);
  }

  // 批量删除定时任务
  async deleteSchedulesBatch(ids: number[]) {
    const validIds = ids.filter((id) => typeof id === "number" && !Number.isNaN(id));
    if (validIds.length === 0) return { deleted: 0 };
    const result = await this.scheduleRepository.delete(validIds);
    return { deleted: result.affected ?? 0 };
  }

  // 执行定时任务
  private async executeSchedule(schedule: Schedule) {
    try {
      if (schedule.type === 'suite') {
        const testCaseIds = this.parseTargetIds(schedule.targetId);
        await this.testService.executeTestSuite(
          testCaseIds,
          schedule.environmentId,
          schedule.projectId,
          `${schedule.name} - 定时执行`,
        );
      } else if (schedule.type === 'scenario') {
        await this.testService.executeScenario(
          schedule.targetId,
          schedule.environmentId,
          schedule.projectId,
          `${schedule.name} - 定时执行`,
        );
      }

      await this.scheduleRepository.update(schedule.id, {
        lastExecutedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to execute schedule:', error);
    }
  }

  // 检查是否应该执行定时任务
  private shouldExecute(schedule: Schedule, now: Date): boolean {
    try {
      // If nextExecutedAt is available, it's the most reliable gate.
      if (schedule.nextExecutedAt) {
        return schedule.nextExecutedAt.getTime() <= now.getTime();
      }

      // Fallback: compute the most recent occurrence and compare with lastExecutedAt.
      const interval = cronParser.parseExpression(schedule.cron, {
        currentDate: now,
      });
      const prev = interval.prev().toDate();
      const last = schedule.lastExecutedAt
        ? schedule.lastExecutedAt.getTime()
        : 0;
      return prev.getTime() > last && prev.getTime() <= now.getTime();
    } catch {
      // Invalid cron: do not execute.
      return false;
    }
  }

  // 调度所有任务
  private scheduleTasks() {
    // 实际项目中，这里应该动态创建Cron任务
    // 现在使用固定的每分钟检查
    // Ensure nextExecutedAt is populated for enabled schedules.
    this.scheduleRepository
      .find({ where: { enabled: true } })
      .then((schedules) =>
        Promise.all(
          schedules.map((s) => this.updateNextExecution(s, new Date())),
        ),
      )
      .catch(() => undefined);
  }

  private parseTargetIds(raw: string): string[] {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v));
      } catch {
        // fall through
      }
    }
    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [trimmed];
  }

  private async updateNextExecution(schedule: Schedule, now: Date) {
    try {
      const interval = cronParser.parseExpression(schedule.cron, {
        currentDate: now,
      });
      const next = interval.next().toDate();
      await this.scheduleRepository.update(schedule.id, {
        nextExecutedAt: next,
      });
    } catch {
      // ignore invalid cron
    }
  }
}
