import { Injectable } from '@nestjs/common';
import { TestRequestDto } from './dto/test-request.dto';
import { ApplicationTestGraph } from './graph/application-test.graph';
import { TestProgressEvent } from './types/test.types';

@Injectable()
export class TestsService {
  constructor(private readonly graph: ApplicationTestGraph) {}

  test(
    request: TestRequestDto,
    onProgress?: (event: TestProgressEvent) => void,
  ) {
    return this.graph.run(request, onProgress);
  }
}
