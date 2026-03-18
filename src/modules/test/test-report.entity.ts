import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Project } from '../project/project.entity';

@Entity()
export class TestReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  name: string;

  @Column()
  environment: string;

  @Column('text')
  summary: string;

  @Column('text')
  details: string;

  @Column('text')
  performance: string;

  @Column('text', { nullable: true })
  charts?: string;

  @Column('text', { nullable: true })
  aiSummary?: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Project, (project) => project.id, {
    onDelete: "CASCADE",
  })
  project: Project;
}
