import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule as NestScheduleModule } from "@nestjs/schedule";
import { Schedule } from "./schedule.entity";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";
import { TestModule } from "../test/test.module";

@Module({
  imports: [
    NestScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Schedule]),
    TestModule,
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
