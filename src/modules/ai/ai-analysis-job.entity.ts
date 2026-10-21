import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Project } from "../project/project.entity";
import { jsonTextTransformer } from "../../common/typeorm-json.transformer";

@Entity()
export class AIAnalysisJob {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column() projectId: string;
  @Column({ default: "running" }) status: string;
  @Column("text", {
    transformer: jsonTextTransformer<string[]>({ defaultValue: [] }),
  })
  apiIds: string[];
  @Column({ default: true }) persist: boolean;
  @Column({ default: 0 }) processed: number;
  @Column({ default: 0 }) completed: number;
  @Column({ default: 0 }) failed: number;
  @Column("text", {
    transformer: jsonTextTransformer<any[]>({ defaultValue: [] }),
  })
  results: any[];
  @Column("text", {
    transformer: jsonTextTransformer<string[]>({ defaultValue: [] }),
  })
  errors: string[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
  @ManyToOne(() => Project, { onDelete: "CASCADE" }) project: Project;
}
