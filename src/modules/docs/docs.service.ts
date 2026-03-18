import { Injectable } from "@nestjs/common";
import { readFileSync } from "fs";
import { join } from "path";

@Injectable()
export class DocsService {
  getReadme(): { content: string } {
    const path = join(process.cwd(), "README.md");
    try {
      const content = readFileSync(path, "utf-8");
      return { content };
    } catch {
      return { content: "# 文档\n\n暂无内容。" };
    }
  }
}
