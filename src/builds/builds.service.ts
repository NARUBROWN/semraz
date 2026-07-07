import { Injectable } from '@nestjs/common';
import { BuildRequestDto } from './dto/build-request.dto';
import { ApplicationBuildGraph } from './graph/application-build.graph';
import { BuildProgressEvent } from './types/build.types';

@Injectable()
export class BuildService {
  constructor(private readonly graph: ApplicationBuildGraph) {}

  build(
    request: BuildRequestDto,
    onProgress?: (event: BuildProgressEvent) => void,
  ) {
    return this.graph.run(request, onProgress);
  }
}
