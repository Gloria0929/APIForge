import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TestCase } from "./test-case.entity";
import { TestReport } from "./test-report.entity";
import { TestScenario } from "./test-scenario.entity";
import { Environment } from "../environment/environment.entity";
import { Project } from "../project/project.entity";
import { API } from "../api/api.entity";
import { TestController } from "./test.controller";
import { TestService } from "./test.service";
import { LocustService } from "./locust.service";
import { StressRunService } from "./stress-run.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TestCase,
      TestReport,
      TestScenario,
      Environment,
      Project,
      API,
    ]),
  ],
  controllers: [TestController],
  providers: [TestService, LocustService, StressRunService],
  exports: [TestService],
})
export class TestModule {}
