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
