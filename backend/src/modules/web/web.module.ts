import { Module } from '@nestjs/common';
import { WebController } from './web.controller';
import { ChatModule } from '../chat/chat.module';
import { KbModule } from '../kb/kb.module';
import { AgentsModule } from '../agents/agents.module';
import { AiService } from '../ai/ai.service';

@Module({
  imports: [ChatModule, KbModule, AgentsModule],
  controllers: [WebController],
  providers: [AiService],
})
export class WebModule {}
