import { Controller, Get } from "@nestjs/common";
import { VersionService } from "./version.service";

@Controller("version")
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get("check")
  check() {
    return this.versionService.checkUpdate();
  }
}
