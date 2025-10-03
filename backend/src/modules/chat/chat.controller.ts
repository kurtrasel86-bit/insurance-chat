import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { CreateSessionDto, PostMessageDto } from './chat.dtos';
import { AuthGuard } from '@nestjs/passport';

@Controller('v1/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  createSession(@Body() dto: CreateSessionDto) {
    return this.chatService.createSession(dto);
  }

  @Post('messages')
  postMessage(@Body() dto: PostMessageDto) {
    return this.chatService.postMessage(dto);
  }

  @Get('sessions/:id/messages')
  getMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }
}


