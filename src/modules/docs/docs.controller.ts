import { Controller, Get } from "@nestjs/common";
import { DocsService } from "./docs.service";
import { Public } from "../auth/public.decorator";

@Controller("docs")
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Public()
  @Get("readme")
  getReadme() {
    return this.docsService.getReadme();
  }
}
