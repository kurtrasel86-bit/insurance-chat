import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './modules/chat/chat.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { KbModule } from './modules/kb/kb.module';
import { DataCollectorModule } from './modules/data-collector/data-collector.module';
import { AdminModule } from './modules/admin/admin.module';
import { FileUploadModule } from './modules/file-upload/file-upload.module';
import { SourcesModule } from './modules/sources/sources.module';
import { WebModule } from './modules/web/web.module';
import { AiModule } from './modules/ai/ai.module';
import { AgentsModule } from './modules/agents/agents.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule, 
    ChatModule, 
    AuthModule, 
    ChannelsModule, 
    KbModule, 
    DataCollectorModule, 
    AdminModule,
    FileUploadModule,
    SourcesModule,
    WebModule,
    AiModule,
    AgentsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
