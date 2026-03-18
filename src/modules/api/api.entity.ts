import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Project } from "../project/project.entity";
import { TestCase } from "../test/test-case.entity";
import { jsonTextTransformer } from "../../common/typeorm-json.transformer";

@Entity()
export class API {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  projectId: string;

  @Column()
  path: string;

  @Column()
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

  @Column()
  summary: string;

  @Column({ nullable: true })
  description?: string;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<string[] | null>({ defaultValue: null }),
  })
  tags: string[] | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<Record<string, any> | null>({
      defaultValue: null,
    }),
  })
  aiInsights?: Record<string, any> | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<any[] | null>({ defaultValue: null }),
  })
  parameters: any[] | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<any | null>({ defaultValue: null }),
  })
  requestBody?: any | null;

  @Column("text", {
    nullable: true,
    transformer: jsonTextTransformer<Record<string, any> | null>({
      defaultValue: null,
    }),
  })
  responses: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.apis, { onDelete: "CASCADE" })
  project: Project;

  @OneToMany(() => TestCase, (testCase) => testCase.api)
  testCases: TestCase[];
}
