import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Schedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  projectId: string;

  @Column()
  name: string;

  @Column()
  cron: string;

  @Column()
  type: 'suite' | 'scenario';

  @Column()
  targetId: string;

  @Column()
  environmentId: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  lastExecutedAt: Date;

  @Column({ nullable: true })
  nextExecutedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
