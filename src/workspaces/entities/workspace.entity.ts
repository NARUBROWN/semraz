import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { User } from '../../auth/entities/user.entity';

@Entity({ name: 'workspaces' })
export class Workspace {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'char', length: 36 })
  ownerId!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 40, default: 'NestJS' })
  framework!: string;

  @Column({ type: 'varchar', length: 40, default: 'PostgreSQL' })
  database!: string;

  @Column({ type: 'varchar', length: 40, default: 'planning' })
  status!: 'planning' | 'compile_failed' | 'verified';

  @Column({ name: 'current_step', type: 'varchar', length: 40, default: 'Project' })
  currentStep!: string;

  @Column({ name: 'flow_step', type: 'int', default: 0 })
  flowStep!: number;

  @Column({ name: 'generation_workspace_id', type: 'char', length: 36, nullable: true })
  generationWorkspaceId!: string | null;

  @Column({ name: 'generation_workspace_path', type: 'varchar', length: 500, nullable: true })
  generationWorkspacePath!: string | null;

  @Column({ name: 'nestjs_app_path', type: 'varchar', length: 500, nullable: true })
  nestJsAppPath!: string | null;

  @Column({ name: 'entities_count', type: 'int', default: 0 })
  entitiesCount!: number;

  @Column({ name: 'operations_count', type: 'int', default: 0 })
  operationsCount!: number;

  @Column({ name: 'tests_count', type: 'int', default: 0 })
  testsCount!: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  coverage!: string | null;

  @Column({ name: 'draft_project', type: 'json', nullable: true })
  draftProject!: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  entities!: unknown[] | null;

  @Column({ type: 'json', nullable: true })
  relations!: unknown[] | null;

  @Column({ type: 'json', nullable: true })
  operations!: unknown[] | null;

  @Column({ name: 'generated_workspace', type: 'json', nullable: true })
  generatedWorkspace!: Record<string, unknown> | null;

  @Column({ name: 'generated_nest_result', type: 'json', nullable: true })
  generatedNestResult!: Record<string, unknown> | null;

  @Column({ name: 'test_agent_result', type: 'json', nullable: true })
  testAgentResult!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.workspaces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @BeforeInsert()
  setId() {
    this.id ||= uuidv7();
  }
}
