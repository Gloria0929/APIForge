import { Controller, Get, Post } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { VersionService } from "./version.service";

@Controller("version")
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get("check")
  @Public()
  check() {
    return this.versionService.checkUpdate();
  }

  @Post("update")
  update() {
    return this.versionService.triggerDockerUpdate();
  }
}
