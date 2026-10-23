import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { Project } from '../project/project.entity';
import { AIProvider } from './ai-provider.entity';
import { jsonTextTransformer } from "../../common/typeorm-json.transformer";

@Entity()
export class ProjectAIConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  projectId: string;

  @Column({ default: false })
  aiEnabled: boolean;

  @Column({ nullable: true })
  providerId?: number;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<ProjectAIConfig["features"] | null>({
      defaultValue: null,
    }),
  })
  features: {
    testGeneration: boolean;
    assertionGeneration: boolean;
    errorAnalysis: boolean;
    reportSummary: boolean;
    semanticParse: boolean;
  };

  /**
   * 功能 → 提供商 id 的显式绑定。未列出的功能按「默认模型 → 任一承担该功能的启用模型」自动路由。
   */
  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<ProjectAIConfig["featureProviders"] | null>({
      defaultValue: null,
    }),
  })
  featureProviders?: Record<string, number> | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<ProjectAIConfig["modelConfig"] | null>({
      defaultValue: null,
    }),
  })
  modelConfig?: {
    temperature: number;
    maxTokens: number;
    timeout: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.aiConfigs, {
    onDelete: "CASCADE",
  })
  project: Project;

  @ManyToOne(() => AIProvider, (provider) => provider.projectConfigs, {
    onDelete: "SET NULL",
    nullable: true,
  })
  provider: AIProvider;
}
