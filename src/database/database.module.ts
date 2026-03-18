import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { buildTypeOrmOptions } from "./typeorm-options.factory";

@Global()
@Module({
  imports: [TypeOrmModule.forRoot(buildTypeOrmOptions())],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
