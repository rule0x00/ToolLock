import { Module } from '@nestjs/common';
import { UpstreamService } from './upstream.service.js';

@Module({
  providers: [UpstreamService],
  exports: [UpstreamService],
})
export class UpstreamModule {}
