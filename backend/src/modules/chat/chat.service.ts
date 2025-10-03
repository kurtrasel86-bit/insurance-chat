import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto, Message, PostMessageDto, Session } from './chat.dtos';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(dto: CreateSessionDto): Promise<Session> {
    // First, find or create user
    let user = await this.prisma.user.findFirst({
      where: {
        channel: dto.channel,
        channelUserId: dto.channelUserId,
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          channel: dto.channel,
          channelUserId: dto.channelUserId,
          preferVoice: dto.preferVoice ?? false,
          email: dto.email,
        },
      });
    }

    // Create session
    const session = await this.prisma.chatSession.create({
      data: {
        userId: user.id,
        preferVoice: dto.preferVoice ?? false,
        email: dto.email,
      },
    });

    return {
      id: session.id,
      channel: dto.channel,
      channelUserId: dto.channelUserId,
      preferVoice: session.preferVoice,
      email: session.email ?? null,
      createdAt: session.createdAt.toISOString(),
    };
  }

  async getOrCreateSessionForChannel(channel: string, channelUserId: string): Promise<Session> {
    // Find user
    let user = await this.prisma.user.findFirst({
      where: {
        channel,
        channelUserId,
      },
      include: {
        sessions: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!user) {
      // Create user and session
      user = await this.prisma.user.create({
        data: {
          channel,
          channelUserId,
          sessions: {
            create: {},
          },
        },
        include: {
          sessions: true,
        },
      });
    }

    // Get or create active session
    let session = user.sessions[0];
    if (!session) {
      session = await this.prisma.chatSession.create({
        data: {
          userId: user.id,
        },
      });
    }

    return {
      id: session.id,
      channel: user.channel,
      channelUserId: user.channelUserId,
      preferVoice: session.preferVoice,
      email: session.email ?? null,
      createdAt: session.createdAt.toISOString(),
    };
  }

  async postMessage(dto: PostMessageDto): Promise<Message> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const message = await this.prisma.message.create({
      data: {
        sessionId: dto.sessionId,
        sender: dto.sender,
        text: dto.text,
        voiceUrl: dto.voiceUrl,
        fileUrl: dto.fileUrl,
      },
    });

    return {
      id: message.id,
      sessionId: message.sessionId,
      sender: message.sender as 'user' | 'agent' | 'ai' | 'system',
      text: message.text ?? null,
      voiceUrl: message.voiceUrl ?? null,
      fileUrl: message.fileUrl ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async getMessages(sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const messages = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      items: messages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        sender: m.sender,
        text: m.text ?? null,
        voiceUrl: m.voiceUrl ?? null,
        fileUrl: m.fileUrl ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}


