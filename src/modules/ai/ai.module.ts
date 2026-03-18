import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AIProvider } from "./ai-provider.entity";
import { ProjectAIConfig } from "./project-ai-config.entity";
import { AIUsageLog } from "./ai-usage-log.entity";
import { API } from "../api/api.entity";
import { TestReport } from "../test/test-report.entity";
import { TestCase } from "../test/test-case.entity";
import { Environment } from "../environment/environment.entity";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { TestModule } from "../test/test.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AIProvider,
      ProjectAIConfig,
      AIUsageLog,
      API,
      TestReport,
      TestCase,
      Environment,
    ]),
    TestModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
