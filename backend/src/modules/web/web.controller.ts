import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from '../chat/chat.service';
import { AiService } from '../ai/ai.service';
import { KbService } from '../kb/kb.service';
import { AgentsService } from '../agents/agents.service';
import * as path from 'path';

@Controller('web')
export class WebController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiService: AiService,
    private readonly kbService: KbService,
    private readonly agentsService: AgentsService,
  ) {}

  /**
   * GET /web - Веб-интерфейс чата
   */
  @Get()
  async getChatWidget(@Res() res: Response) {
    const filePath = path.join(process.cwd(), 'public', 'index.html');
    res.sendFile(filePath);
  }


  /**
   * GET /web/widget - Виджет для встраивания на сайт
   */
  @Get('widget')
  async getWidgetScript(@Res() res: Response) {
    const script = `
      (function() {
        // Создаем кнопку чата
        const chatButton = document.createElement('div');
        chatButton.id = 'insurance-chat-button';
        chatButton.innerHTML = '💬';
        chatButton.style.cssText = \`
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          transition: transform 0.2s;
        \`;
        
        chatButton.addEventListener('mouseenter', () => {
          chatButton.style.transform = 'scale(1.1)';
        });
        
        chatButton.addEventListener('mouseleave', () => {
          chatButton.style.transform = 'scale(1)';
        });
        
        // Создаем iframe для чата
        const chatFrame = document.createElement('iframe');
        chatFrame.id = 'insurance-chat-frame';
        chatFrame.src = '${process.env.WEB_BASE_URL || 'http://localhost:3000'}/web';
        chatFrame.style.cssText = \`
          position: fixed;
          bottom: 90px;
          right: 20px;
          width: 400px;
          height: 600px;
          border: none;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          z-index: 10001;
          display: none;
        \`;
        
        // Показываем/скрываем чат
        let isOpen = false;
        chatButton.addEventListener('click', () => {
          isOpen = !isOpen;
          chatFrame.style.display = isOpen ? 'block' : 'none';
          chatButton.innerHTML = isOpen ? '✕' : '💬';
        });
        
        // Добавляем элементы на страницу
        document.body.appendChild(chatButton);
        document.body.appendChild(chatFrame);
        
        // Закрытие по клику вне чата
        document.addEventListener('click', (e) => {
          if (isOpen && !chatFrame.contains(e.target) && !chatButton.contains(e.target)) {
            isOpen = false;
            chatFrame.style.display = 'none';
            chatButton.innerHTML = '💬';
          }
        });
      })();
    `;
    
    res.setHeader('Content-Type', 'application/javascript');
    res.send(script);
  }

  /**
   * POST /web/chat - Отправка сообщения через веб-чат
   */
  @Post('chat')
  async sendMessage(
    @Body()
    body: {
      sessionId: string;
      message: string;
      channelUserId?: string;
    },
  ) {
    const { sessionId, message, channelUserId } = body;

    // Если нет sessionId, создаем новую сессию
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const session = await this.chatService.createSession({
        channel: 'web',
        channelUserId: channelUserId || `web_${Date.now()}`,
        preferVoice: false,
      });
      currentSessionId = session.id;
    }

    // Сохраняем сообщение пользователя
    await this.chatService.postMessage({
      sessionId: currentSessionId,
      sender: 'user',
      text: message,
    });

    // Получаем ответ от AI
    const aiReply = await this.aiService.generateReply(message, {
      useRAG: true,
    });

    // Сохраняем ответ AI
    await this.chatService.postMessage({
      sessionId: currentSessionId,
      sender: 'ai',
      text: aiReply,
    });

    return {
      sessionId: currentSessionId,
      reply: aiReply,
    };
  }

  /**
   * GET /web/messages/:sessionId - Получить историю сообщений
   */
  @Get('messages/:sessionId')
  async getMessages(@Query('sessionId') sessionId: string) {
    return this.chatService.getMessages(sessionId);
  }

  /**
   * POST /web/search - Поиск по базе знаний
   */
  @Post('search')
  async searchKnowledgeBase(
    @Body()
    body: {
      query: string;
      companyCode?: string;
      productCode?: string;
      limit?: number;
    },
  ) {
    return this.kbService.search(body);
  }

  /**
   * GET /web/products - Получить список доступных продуктов
   */
  @Get('products')
  async getProducts(@Query('companyCode') companyCode?: string) {
    const documents = await this.kbService.listDocuments({
      companyCode,
    });

    // Группируем по компаниям и продуктам
    const products = documents.reduce((acc, doc) => {
      if (!acc[doc.companyCode]) {
        acc[doc.companyCode] = [];
      }
      
      if (!acc[doc.companyCode].find(p => p.productCode === doc.productCode)) {
        acc[doc.companyCode].push({
          productCode: doc.productCode,
          title: doc.title,
          version: doc.version,
          chunksCount: doc._count.chunks,
        });
      }
      
      return acc;
    }, {} as Record<string, any[]>);

    return products;
  }

  /**
   * POST /web/request-agent - Запрос подключения агента
   */
  @Post('request-agent')
  async requestAgent(
    @Body()
    body: {
      sessionId: string;
      reason?: string;
    },
  ) {
    // Получаем информацию о сессии
    const session = await this.chatService.getMessages(body.sessionId);
    if (!session) {
      return {
        success: false,
        message: 'Сессия не найдена',
      };
    }

    // Запрашиваем агента
    const result = await this.agentsService.requestAgent({
      sessionId: body.sessionId,
      channel: 'web',
      channelUserId: 'web_user', // TODO: получить из сессии
      reason: body.reason,
    });

    return result;
  }

  /**
   * GET /web/agents/available - Получить доступных агентов
   */
  @Get('agents/available')
  async getAvailableAgents() {
    return this.agentsService.getAvailableAgents();
  }

  /**
   * GET /web/agents/stats - Статистика агентов
   */
  @Get('agents/stats')
  async getAgentsStats() {
    return this.agentsService.getAgentsStats();
  }
}
