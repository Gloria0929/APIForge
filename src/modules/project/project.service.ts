import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Project } from "./project.entity";
import { API } from "../api/api.entity";
import { TestCase } from "../test/test-case.entity";
import { Environment } from "../environment/environment.entity";
import { TestScenario } from "../test/test-scenario.entity";
import { TestReport } from "../test/test-report.entity";
import { ProjectAIConfig } from "../ai/project-ai-config.entity";
import { AIUsageLog } from "../ai/ai-usage-log.entity";
import { Schedule } from "../schedule/schedule.entity";

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(API)
    private apiRepository: Repository<API>,
    @InjectRepository(TestCase)
    private testCaseRepository: Repository<TestCase>,
    @InjectRepository(Environment)
    private environmentRepository: Repository<Environment>,
    @InjectRepository(TestScenario)
    private testScenarioRepository: Repository<TestScenario>,
    @InjectRepository(TestReport)
    private testReportRepository: Repository<TestReport>,
    @InjectRepository(ProjectAIConfig)
    private projectAiConfigRepository: Repository<ProjectAIConfig>,
    @InjectRepository(AIUsageLog)
    private aiUsageLogRepository: Repository<AIUsageLog>,
    @InjectRepository(Schedule)
    private scheduleRepository: Repository<Schedule>,
  ) {}

  findAll() {
    return this.projectRepository.find();
  }

  findOne(id: string) {
    return this.projectRepository.findOne({ where: { id } });
  }

  create(project: Partial<Project>) {
    return this.projectRepository.save(project);
  }

  update(id: string, project: Partial<Project>) {
    return this.projectRepository.update(id, project);
  }

  async remove(id: string) {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    return this.projectRepository.manager.transaction(async (manager) => {
      // 删除顺序必须先子表后主表，否则 SQLite 会触发外键约束错误。
      await manager.getRepository(TestCase).delete({ projectId: id });
      await manager.getRepository(TestReport).delete({ projectId: id });
      await manager.getRepository(TestScenario).delete({ projectId: id });
      await manager.getRepository(Environment).delete({ projectId: id });
      await manager.getRepository(ProjectAIConfig).delete({ projectId: id });
      await manager.getRepository(AIUsageLog).delete({ projectId: id });
      await manager.getRepository(Schedule).delete({ projectId: id });
      await manager.getRepository(API).delete({ projectId: id });

      return manager.getRepository(Project).delete(id);
    });
  }

  // 导出项目
  async exportProject(id: string) {
    const project = await this.projectRepository.findOne({ where: { id } });
    if (!project) {
      throw new Error("Project not found");
    }

    const apis = await this.apiRepository.find({ where: { projectId: id } });
    const testCases = await this.testCaseRepository.find({
      where: { projectId: id },
    });
    const environments = await this.environmentRepository.find({
      where: { projectId: id },
    });
    const scenarios = await this.testScenarioRepository.find({
      where: { projectId: id },
    });

    return {
      project,
      apis,
      testCases,
      environments,
      scenarios,
    };
  }

  // 导入项目
  async importProject(projectData: any) {
    // 创建新项目（createdBy 必填，导入时使用导出数据或默认值）
    const newProject = await this.projectRepository.save({
      name: projectData.project.name,
      description: projectData.project.description,
      createdBy: projectData.project.createdBy ?? "import",
    });

    const apiIdMap = new Map<string, string>();
    const apis = projectData.apis || [];
    for (const api of apis) {
      const { id: _oldId, ...rest } = api;
      const saved = await this.apiRepository.save({
        ...rest,
        projectId: newProject.id,
      });
      if (_oldId && saved?.id) apiIdMap.set(_oldId, saved.id);
    }

    const envs = projectData.environments || [];
    for (const env of envs) {
      await this.environmentRepository.save({
        ...env,
        projectId: newProject.id,
      });
    }

    const testCases = projectData.testCases || [];
    for (const tc of testCases) {
      const apiId =
        tc.apiId && apiIdMap.has(tc.apiId) ? apiIdMap.get(tc.apiId) : null;
      await this.testCaseRepository.save({
        ...tc,
        projectId: newProject.id,
        apiId: apiId ?? null,
      });
    }

    const scenarios = projectData.scenarios || [];
    for (const scenario of scenarios) {
      await this.testScenarioRepository.save({
        ...scenario,
        projectId: newProject.id,
      });
    }

    return {
      project: newProject,
      apisCreated: apis.length,
      testCasesCreated: testCases.length,
      environmentsCreated: envs.length,
      scenariosCreated: scenarios.length,
    };
  }
}
