import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { ChatModule } from '../chat/chat.module';
import { KbModule } from '../kb/kb.module';
import { AiService } from '../ai/ai.service';

@Module({
  imports: [ChatModule, KbModule],
  controllers: [TelegramController],
  providers: [AiService],
})
export class ChannelsModule {}


