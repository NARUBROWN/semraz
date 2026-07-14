import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';

@Entity({ name: 'llm_usage_logs' })
export class LlmUsageLog {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'char', length: 36, nullable: true })
  userId!: string | null;

  @Index()
  @Column({ name: 'workspace_id', type: 'char', length: 36, nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'varchar', length: 60 })
  model!: string;

  @Column({ type: 'varchar', length: 80 })
  caller!: string;

  @Column({ name: 'prompt_tokens', type: 'int', default: 0 })
  promptTokens!: number;

  @Column({ name: 'completion_tokens', type: 'int', default: 0 })
  completionTokens!: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens!: number;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @BeforeInsert()
  setId() {
    this.id ||= uuidv7();
  }
}
