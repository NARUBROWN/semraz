import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { User } from '../../auth/entities/user.entity';

@Entity({ name: 'feedbacks' })
export class Feedback {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'char', length: 36, nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'user_email', type: 'varchar', length: 180 })
  userEmail!: string;

  @Column({ name: 'user_name', type: 'varchar', length: 80, default: '' })
  userName!: string;

  @Column({ type: 'varchar', length: 500 })
  page!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'mediumtext', nullable: true })
  logs!: string | null;

  @Column({ name: 'server_logs', type: 'mediumtext', nullable: true })
  serverLogs!: string | null;

  @Column({ type: 'longblob', nullable: true })
  screenshot!: Buffer | null;

  @Column({ name: 'screenshot_mime', type: 'varchar', length: 50, default: 'image/jpeg' })
  screenshotMime!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, default: '' })
  userAgent!: string;

  @Column({ type: 'varchar', length: 50, default: '' })
  viewport!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @BeforeInsert()
  setId() {
    this.id ||= uuidv7();
  }
}
