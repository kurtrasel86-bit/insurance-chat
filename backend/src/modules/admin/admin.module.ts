import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { KbModule } from '../kb/kb.module';
import { DataCollectorModule } from '../data-collector/data-collector.module';
import { SourcesModule } from '../sources/sources.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [KbModule, DataCollectorModule, SourcesModule, AgentsModule],
  controllers: [AdminController],
})
export class AdminModule {}

