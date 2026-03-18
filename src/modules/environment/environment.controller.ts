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
import { EnvironmentService } from "./environment.service";
import { Environment } from "./environment.entity";

@Controller("environments")
export class EnvironmentController {
  constructor(private readonly environmentService: EnvironmentService) {}

  @Get("active")
  getActive(@Query("projectId") projectId: string) {
    return this.environmentService.getActive(projectId);
  }

  @Get("export")
  exportEnvironments(@Query("projectId") projectId: string) {
    return this.environmentService.exportEnvironments(projectId);
  }

  @Post("import")
  importEnvironments(
    @Body() data: { projectId: string; environments?: any[] },
  ) {
    return this.environmentService.importEnvironments(data.projectId, data);
  }

  @Get()
  findAll(@Query("projectId") projectId: string) {
    return this.environmentService.findAll(projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.environmentService.findOne(id);
  }

  @Post()
  create(@Body() environment: Partial<Environment>) {
    return this.environmentService.create(environment);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() environment: Partial<Environment>) {
    return this.environmentService.update(id, environment);
  }

  @Post("bulk-delete")
  removeBatch(@Body() data: { projectId: string; ids: string[] }) {
    return this.environmentService.removeBatch(data.projectId, data.ids || []);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.environmentService.remove(id);
  }

  @Put(":id/activate")
  activate(@Param("id") id: string) {
    return this.environmentService.activate(id);
  }

  @Post(":id/test")
  testConnection(@Param("id") id: string) {
    return this.environmentService.testConnection(id);
  }
}
