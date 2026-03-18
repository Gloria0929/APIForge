import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { API } from '../api/api.entity';
import { Environment } from '../environment/environment.entity';
import { TestCase } from '../test/test-case.entity';
import { ProjectAIConfig } from '../ai/project-ai-config.entity';

@Entity()
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  createdBy: string;

  @OneToMany(() => API, (api) => api.project)
  apis: API[];

  @OneToMany(() => Environment, (env) => env.project)
  environments: Environment[];

  @OneToMany(() => TestCase, (testCase) => testCase.project)
  testCases: TestCase[];

  @OneToMany(() => ProjectAIConfig, (config) => config.project)
  aiConfigs: ProjectAIConfig[];
}