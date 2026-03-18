import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { ApiService } from "./api.service";
import { API } from "./api.entity";

@Controller("apis")
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get()
  findAll(@Query("projectId") projectId: string) {
    return this.apiService.findAll(projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.apiService.findOne(id);
  }

  @Post()
  create(@Body() api: Partial<API>) {
    return this.apiService.create(api);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() api: Partial<API>) {
    return this.apiService.update(id, api);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.apiService.remove(id);
  }

  @Post("bulk-delete")
  bulkDelete(@Body() data: { projectId: string; apiIds: string[] }) {
    return this.apiService.removeBatch(data.projectId, data.apiIds);
  }

  @Post("import")
  importApi(@Body() data: { projectId: string; spec: any }) {
    return this.apiService.importApi(data.projectId, data.spec);
  }
}
