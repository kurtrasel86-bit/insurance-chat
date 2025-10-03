import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [PrismaModule, ChatModule],
  providers: [AgentsService],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
