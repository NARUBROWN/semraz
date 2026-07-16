import { Module } from '@nestjs/common';
import { DesignConsistencyService } from './design-consistency.service';

@Module({
  providers: [DesignConsistencyService],
  exports: [DesignConsistencyService],
})
export class DesignConsistencyModule {}
