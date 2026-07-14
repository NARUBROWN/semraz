import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiWizardController } from './ai-wizard.controller';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BuildsModule } from './builds/builds.module';
import { FeedbackModule } from './feedback/feedback.module';
import { GenerateController } from './generate.controller';
import { TestsModule } from './tests/tests.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', 'semraz-engine/.env'],
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST') ?? 'localhost',
        port: Number(configService.get('DB_PORT') ?? 3306),
        username: configService.get<string>('DB_USERNAME') ?? 'root',
        password: configService.get<string>('DB_PASSWORD') ?? '',
        database: configService.get<string>('DB_DATABASE') ?? 'semraz',
        autoLoadEntities: true,
        synchronize: configService.get('DB_SYNCHRONIZE') !== 'false',
      }),
    }),
    AdminModule,
    AuthModule,
    FeedbackModule,
    WorkspacesModule,
    BuildsModule,
    TestsModule,
  ],
  controllers: [AppController, AiWizardController, GenerateController],
  providers: [AppService],
})
export class AppModule {}
