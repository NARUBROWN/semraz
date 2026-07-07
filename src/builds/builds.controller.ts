import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BuildRequestDto } from './dto/build-request.dto';
import { BuildService } from './builds.service';

@ApiTags('builds')
@Controller('builds')
export class BuildController {
  constructor(private readonly buildService: BuildService) {}

  @Post()
  @ApiOperation({
    summary: 'Build an application from markdown design documents',
    description:
      'Runs the LangGraph application generation flow immediately and returns the generated artifact summary.',
  })
  @ApiBody({ type: BuildRequestDto })
  @ApiResponse({
    status: 201,
    description: 'The application was generated and build verification was attempted.',
  })
  build(@Body() request: BuildRequestDto) {
    return this.buildService.build(request);
  }
}
