import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { API } from "./api.entity";
import { ApiController } from "./api.controller";
import { ApiService } from "./api.service";

@Module({
  imports: [TypeOrmModule.forFeature([API])],
  controllers: [ApiController],
  providers: [ApiService],
  exports: [ApiService],
})
export class ApiModule {}
