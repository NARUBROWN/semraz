import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { AuthSession } from './auth-session.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 40, default: 'owner' })
  role!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'blocked';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => AuthSession, (session) => session.user)
  sessions!: AuthSession[];

  @OneToMany(() => Workspace, (workspace) => workspace.owner)
  workspaces!: Workspace[];

  @BeforeInsert()
  setId() {
    this.id ||= uuidv7();
  }
}
