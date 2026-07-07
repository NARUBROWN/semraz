import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TargetFramework } from '../types/build.types';

export class BuildRequestDto {
  @ApiProperty({
    enum: TargetFramework,
    example: TargetFramework.NestJS,
    description: 'Application framework to generate.',
  })
  @IsEnum(TargetFramework)
  target!: TargetFramework;

  @ApiPropertyOptional({
    example: 'docs',
    description:
      'Project design directory containing markdown files. It must stay inside the server workspace.',
  })
  @IsOptional()
  @IsString()
  projectDir?: string;

  @ApiPropertyOptional({
    example: 'backend',
    description:
      'Application folder name to create inside projectDir. The generated backend is written to projectDir/outputName.',
  })
  @IsOptional()
  @IsString()
  outputName?: string;
}
