import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { CoreModule } from "./core/core.module";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

// 导入模块
import { AuthModule } from "./modules/auth/auth.module";
import { ProjectModule } from "./modules/project/project.module";
import { ApiModule } from "./modules/api/api.module";
import { TestModule } from "./modules/test/test.module";
import { EnvironmentModule } from "./modules/environment/environment.module";
import { AiModule } from "./modules/ai/ai.module";
import { ScheduleModule } from "./modules/schedule/schedule.module";
import { DocsModule } from "./modules/docs/docs.module";
import { VersionModule } from "./modules/version/version.module";

@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
  imports: [
    CoreModule,
    AuthModule,
    ProjectModule,
    ApiModule,
    TestModule,
    EnvironmentModule,
    AiModule,
    ScheduleModule,
    DocsModule,
    VersionModule,
  ],
})
export class AppModule {}
