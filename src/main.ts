import { ConsoleLogger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { AuthService } from "./modules/auth/auth.service";
import { join } from "path";
import * as fs from "fs";

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const SKIP_CONTEXTS = ["RoutesResolver", "RouterExplorer", "InstanceLoader"];

class FilteredLogger extends ConsoleLogger {
  protected getTimestamp(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  }

  private shouldSkip(context?: string): boolean {
    if (!context) return false;
    return SKIP_CONTEXTS.some((c) => context.includes(c));
  }

  private getContextFromParams(optionalParams: any[]): string | undefined {
    const last = optionalParams[optionalParams.length - 1];
    return typeof last === "string" ? last : undefined;
  }

  log(message: any, ...optionalParams: any[]) {
    const ctx = this.context ?? this.getContextFromParams(optionalParams);
    if (this.shouldSkip(ctx)) return;
    super.log(message, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    const ctx =
      (this as any).context ?? this.getContextFromParams(optionalParams);
    if (this.shouldSkip(ctx)) return;
    super.debug?.(message, ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    const ctx =
      (this as any).context ?? this.getContextFromParams(optionalParams);
    if (this.shouldSkip(ctx)) return;
    super.verbose?.(message, ...optionalParams);
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new FilteredLogger(),
  });
  // 提高请求体限制，支持导入大型 OpenAPI/Swagger/Postman 文档（默认约 100KB 会触发 413）
  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));
  app.enableCors();

  // 前端统一通过 `/api/*` 发起请求，这里设置后端全局路由前缀进行对齐
  app.setGlobalPrefix("api");

  // 文档图片（Manual 页面 README 中的截图）
  const docsImagePath = join(__dirname, "..", "image");
  if (fs.existsSync(docsImagePath)) {
    app.use("/image", require("serve-static")(docsImagePath));
  }

  // 如果存在已构建的 Vue 前端资源，则进行静态托管，使 `npm start` 可作为单体服务运行
  const frontendDist = join(__dirname, "..", "frontend", "dist");
  if (fs.existsSync(frontendDist)) {
    // 静态资源托管
    app.useStaticAssets(frontendDist);

    // SPA 回退：非 API 路由统一返回 index.html
    const expressApp = app.getHttpAdapter().getInstance();
    // Express 5 / path-to-regexp v6 不再支持使用 "*" 作为路由匹配规则
    expressApp.get(/^\/(?!api)(.*)/, (req: any, res: any, next: any) => {
      res.sendFile(join(frontendDist, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  const authService = app.get(AuthService);
  const initialPassword = await authService.ensureAdminExists();
  if (initialPassword) {
    console.log(
      `${RED}[APIForge] 首次启动已创建 admin 账号，初始密码（请登录后立即修改密码）：${initialPassword}${RESET}`,
    );
  }
}

bootstrap();
