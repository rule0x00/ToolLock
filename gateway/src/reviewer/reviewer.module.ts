import { Module } from '@nestjs/common';
import { ReviewerClientService } from './reviewer-client.service.js';

@Module({
  providers: [ReviewerClientService],
  exports: [ReviewerClientService],
})
export class ReviewerModule {}
