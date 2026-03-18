import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { Project } from "./project.entity";

@Controller("projects")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  findAll() {
    return this.projectService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectService.findOne(id);
  }

  @Post()
  create(@Body() project: Partial<Project>) {
    return this.projectService.create(project);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() project: Partial<Project>) {
    return this.projectService.update(id, project);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.projectService.remove(id);
  }

  @Get(":id/export")
  exportProject(@Param("id") id: string) {
    return this.projectService.exportProject(id);
  }

  @Post("import")
  importProject(@Body() projectData: any) {
    return this.projectService.importProject(projectData);
  }
}
