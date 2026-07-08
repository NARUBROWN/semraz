import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth.controller';
import { AiWizardController } from './ai-wizard.controller';
import { BuildsModule } from './builds/builds.module';
import { GenerateController } from './generate.controller';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', 'semraz-engine/.env'],
      isGlobal: true,
    }),
    BuildsModule,
  ],
  controllers: [AppController, AuthController, AiWizardController, GenerateController, ProjectsController],
  providers: [AppService],
})
export class AppModule {}
