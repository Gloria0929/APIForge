import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TestCase } from "./test-case.entity";
import { TestReport } from "./test-report.entity";
import { TestScenario } from "./test-scenario.entity";
import { Environment } from "../environment/environment.entity";
import { Project } from "../project/project.entity";
import { TestController } from "./test.controller";
import { TestService } from "./test.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TestCase,
      TestReport,
      TestScenario,
      Environment,
      Project,
    ]),
  ],
  controllers: [TestController],
  providers: [TestService],
  exports: [TestService],
})
export class TestModule {}
