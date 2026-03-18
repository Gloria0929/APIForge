import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Project } from "./project.entity";
import { API } from "../api/api.entity";
import { TestCase } from "../test/test-case.entity";
import { Environment } from "../environment/environment.entity";
import { TestScenario } from "../test/test-scenario.entity";
import { TestReport } from "../test/test-report.entity";
import { ProjectAIConfig } from "../ai/project-ai-config.entity";
import { AIUsageLog } from "../ai/ai-usage-log.entity";
import { Schedule } from "../schedule/schedule.entity";
import { ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      API,
      TestCase,
      Environment,
      TestScenario,
      TestReport,
      ProjectAIConfig,
      AIUsageLog,
      Schedule,
    ]),
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
