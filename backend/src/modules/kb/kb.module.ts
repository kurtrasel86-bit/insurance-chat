import { Module } from '@nestjs/common';
import { KbService } from './kb.service';
import { KbController } from './kb.controller';
import { DocumentAnalyzerService } from './document-analyzer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DuplicateDetectorService } from '../file-upload/services/duplicate-detector.service';
import { DateValidatorService } from '../file-upload/services/date-validator.service';

@Module({
  imports: [PrismaModule],
  providers: [KbService, DocumentAnalyzerService, DuplicateDetectorService, DateValidatorService],
  controllers: [KbController],
  exports: [KbService, DocumentAnalyzerService],
})
export class KbModule {}


