import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      name: 'Semraz API',
      status: 'ok',
      tagline: 'Measure seven times, cut once.',
    };
  }
}
