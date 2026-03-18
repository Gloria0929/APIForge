import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { Project } from '../project/project.entity';

@Entity()
export class TestScenario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column('text')
  steps: string;

  @Column('text', { nullable: true })
  variables?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Project, (project) => project.id, {
    onDelete: "CASCADE",
  })
  project: Project;
}
