import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { appConfig } from "../common/config/app.config";
import { databaseConfig } from "../common/config/database.config";
import { DatabaseModule } from "../database/database.module";

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
    }),
    DatabaseModule,
  ],
  exports: [ConfigModule, DatabaseModule],
})
export class CoreModule {}

