import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * POST /ai/generate - Генерация ответа AI
   */
  @Post('generate')
  async generateReply(
    @Body()
    body: {
      message: string;
      sessionId?: string;
      useRAG?: boolean;
    },
  ) {
    const { message, sessionId, useRAG = true } = body;
    
    const reply = await this.aiService.generateReply(message, {
      useRAG,
      sessionId,
    });

    return {
      reply,
      sessionId,
    };
  }
}
