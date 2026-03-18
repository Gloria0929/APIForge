import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { AiService } from './ai.service';
import { AIProvider } from './ai-provider.entity';
import { ProjectAIConfig } from './project-ai-config.entity';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // AI 提供商管理
  @Get('providers')
  getProviders() {
    return this.aiService.getProviders();
  }

  @Post('providers')
  createProvider(@Body() provider: Partial<AIProvider>) {
    return this.aiService.createProvider(provider);
  }

  @Put('providers/:id')
  updateProvider(@Param('id', ParseIntPipe) id: number, @Body() provider: Partial<AIProvider>) {
    return this.aiService.updateProvider(id, provider);
  }

  @Delete('providers/:id')
  deleteProvider(@Param('id', ParseIntPipe) id: number) {
    return this.aiService.deleteProvider(id);
  }

  @Post('providers/:id/test')
  testProvider(@Param('id', ParseIntPipe) id: number) {
    return this.aiService.testProvider(id);
  }

  @Post('providers/test-all')
  testAllProviders() {
    return this.aiService.testAllProviders();
  }

  // 项目 AI 配置
  @Get('configs')
  getConfigs(@Query('projectId') projectId: string) {
    return this.aiService.getConfigs(projectId);
  }

  @Post('configs')
  createConfig(@Body() config: Partial<ProjectAIConfig>) {
    return this.aiService.createConfig(config);
  }

  @Put('configs/:id')
  updateConfig(@Param('id', ParseIntPipe) id: number, @Body() config: Partial<ProjectAIConfig>) {
    return this.aiService.updateConfig(id, config);
  }

  // AI 功能调用
  @Post('generate-tests')
  generateTests(@Body() data: { projectId: string; apiId: string }) {
    return this.aiService.generateTests(data.projectId, data.apiId);
  }

  /** 纯规则生成测试用例，不调用 AI */
  @Post('generate-tests-rule')
  generateTestsRule(@Body() data: { projectId: string; apiId: string }) {
    return this.aiService.generateTestsRuleBased(data.projectId, data.apiId);
  }

  @Post('generate-scenario')
  generateScenario(@Body() data: { projectId: string; prompt?: string }) {
    return this.aiService.generateScenario(data.projectId, data.prompt);
  }

  @Post('semantic-parse')
  semanticParse(@Body() data: { projectId: string; apiId: string; persist?: boolean }) {
    return this.aiService.semanticParseApi(data.projectId, data.apiId, data.persist);
  }

  @Post('analyze-import')
  analyzeImport(@Body() data: { projectId: string; apiIds: string[]; persist?: boolean }) {
    return this.aiService.analyzeImportedApis(data.projectId, data.apiIds, data.persist);
  }

  @Post('generate-assertions')
  generateAssertions(@Body() data: { projectId: string; response: any }) {
    return this.aiService.generateAssertions(data.projectId, data.response);
  }

  @Post('analyze-error')
  analyzeError(@Body() data: { projectId: string; error: any }) {
    return this.aiService.analyzeError(data.projectId, data.error);
  }

  @Post('summarize-report')
  async summarizeReport(@Body() data: { projectId: string; reportId: string; report: any }) {
    const result = await this.aiService.summarizeReport(data.projectId, data.report);
    if (data.reportId) {
      await this.aiService.saveReportAiSummary(data.reportId, result);
    }
    return result;
  }

  // 健康检查
  @Get('health')
  checkHealth() {
    return this.aiService.checkHealth();
  }

  /** 查询 AI 使用记录，用于诊断是否实际调用了 AI（token 额度变化） */
  @Get('usage')
  getUsage(@Query('projectId') projectId: string, @Query('limit') limit?: string) {
    return this.aiService.getUsageStats(projectId, limit ? parseInt(limit, 10) : 50);
  }

  /** 根据实际响应更新用例断言（执行用例 → 用实际值生成断言），供保存 AI 建议后调用 */
  @Post('enrich-assertions')
  enrichAssertions(@Body() data: { projectId: string; testCaseId?: string; testCaseIds?: string[] }) {
    return this.aiService.enrichAssertions(data);
  }
}
