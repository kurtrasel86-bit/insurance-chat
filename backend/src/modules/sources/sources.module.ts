import { Module } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { SourcesController } from './sources.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { KbModule } from '../kb/kb.module';
import { FileParserService } from '../file-upload/services/file-parser.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, KbModule, HttpModule],
  controllers: [SourcesController],
  providers: [SourcesService, FileParserService],
  exports: [SourcesService],
})
export class SourcesModule {}

