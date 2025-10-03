import { Module } from '@nestjs/common';
import { DataCollectorService } from './data-collector.service';
import { DataCollectorController } from './data-collector.controller';
import { WebScraperService } from './services/web-scraper.service';
import { SimpleScraperService } from './services/simple-scraper.service';
import { ApiIntegrationService } from './services/api-integration.service';
import { DataParserService } from './services/data-parser.service';
import { NotificationService } from './services/notification.service';
import { CollectionStatusService } from './services/collection-status.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DataCollectorController],
  providers: [
    DataCollectorService,
    WebScraperService,
    SimpleScraperService,
    ApiIntegrationService,
    DataParserService,
    NotificationService,
    CollectionStatusService,
  ],
  exports: [DataCollectorService],
})
export class DataCollectorModule {}

