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
import { User } from './user.entity';

@Entity({ name: 'auth_sessions' })
export class AuthSession {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 100 })
  refreshTokenHash!: string;

  @Column({ name: 'refresh_token_version', type: 'int', default: 1 })
  refreshTokenVersion!: number;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @BeforeInsert()
  setId() {
    this.id ||= uuidv7();
  }
}
