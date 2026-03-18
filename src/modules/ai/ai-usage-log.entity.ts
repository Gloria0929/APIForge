import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class AIUsageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  projectId: string;

  @Column()
  feature: string; // 'generate_tests', 'analyze_error', etc.

  @Column({ nullable: true })
  tokensUsed?: number;

  @Column({ nullable: true })
  responseTimeMs?: number;

  @Column()
  success: boolean;

  @Column({ nullable: true })
  errorMessage?: string;

  @CreateDateColumn()
  createdAt: Date;
}