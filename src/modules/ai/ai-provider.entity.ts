import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { ProjectAIConfig } from "./project-ai-config.entity";
import { jsonTextTransformer } from "../../common/typeorm-json.transformer";

@Entity()
export class AIProvider {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  providerType: string; // 'openai', 'deepseek', 'custom'

  @Column()
  baseUrl: string;

  @Column()
  apiKey: string; // 加密存储

  @Column({ nullable: true })
  model?: string;

  @Column({ default: false })
  isActive: boolean;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<AIProvider["features"] | null>({
      defaultValue: null,
    }),
  })
  features?: {
    testGeneration: boolean;
    assertionGeneration: boolean;
    errorAnalysis: boolean;
    reportSummary: boolean;
    semanticParse: boolean;
  } | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<any | null>({ defaultValue: null }),
  })
  healthStatus?: any | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  lastCheck?: Date;

  @OneToMany(() => ProjectAIConfig, (config) => config.provider)
  projectConfigs: ProjectAIConfig[];
}
