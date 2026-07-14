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
import { User } from './user.entity';

@Entity({ name: 'signup_ip_events' })
export class SignupIpEvent {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Index()
  @Column({ name: 'ip_address', type: 'varchar', length: 64 })
  ipAddress!: string;

  @Index()
  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @BeforeInsert()
  setId() {
    this.id ||= uuidv7();
  }
}
