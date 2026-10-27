import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Project } from '../project/project.entity';
import { jsonTextTransformer } from "../../common/typeorm-json.transformer";

@Entity()
export class Environment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column()
  baseUrl: string;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<EnvironmentVariable[] | null>({
      defaultValue: null,
    }),
  })
  variables: EnvironmentVariable[] | null;

  /** 全局环境：执行场景前先执行该用例，提取结果供所有步骤使用 */
  @Column({ nullable: true })
  loginTestCaseId?: string | null;

  /** 登录用例的变量提取规则 { key: jsonPath }，如 { token: "$.data.token" } */
  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<Record<string, string> | null>({
      defaultValue: null,
    }),
  })
  loginExtractRules?: Record<string, string> | null;

  /**
   * 前置用例（按顺序执行），每个用例可从响应里提取变量注入所有请求。
   * 用来解决「除了 token 还需要 sessionId / kbId 等」的场景；
   * loginTestCaseId 是它的前身（只支持一个用例），没有 setupSteps 时仍兼容读取。
   */
  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<EnvironmentSetupStep[] | null>({
      defaultValue: null,
    }),
  })
  setupSteps?: EnvironmentSetupStep[] | null;

  @Column({ default: false })
  isActive?: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Project, (project) => project.environments, {
    onDelete: "CASCADE",
  })
  project: Project;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  description?: string;
}

/** 环境前置用例：执行请求前先跑一遍，把响应里的字段提取成变量 */
export interface EnvironmentSetupStep {
  testCaseId: string;
  /** 展示用名称，缺省时用用例名 */
  name?: string;
  /** { 变量名: JSONPath }，如 { sessionId: "$.data[0].id" } */
  extractRules: Record<string, string>;
}
