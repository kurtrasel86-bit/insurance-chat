import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';

export interface AgentNotification {
  id: string;
  sessionId: string;
  channel: string;
  channelUserId: string;
  reason?: string;
  createdAt: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  acceptedBy?: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  login: string;
  status: 'online' | 'offline' | 'busy';
  companies: string[];
  currentSessions: number;
  maxSessions: number;
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private pendingRequests = new Map<string, AgentNotification>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Получить всех доступных агентов
   */
  async getAvailableAgents(): Promise<AgentStatus[]> {
    const agents = await this.prisma.agent.findMany({
      where: {
        status: 'online',
      },
    });

    return agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      login: agent.login,
      status: agent.status as 'online' | 'offline' | 'busy',
      companies: agent.companies.split(',').map(c => c.trim()),
      currentSessions: 0, // TODO: подсчитать активные сессии
      maxSessions: 5, // TODO: сделать настраиваемым
    }));
  }

  /**
   * Запросить подключение агента к чату
   */
  async requestAgent(params: {
    sessionId: string;
    channel: string;
    channelUserId: string;
    reason?: string;
  }): Promise<{ success: boolean; requestId: string; message: string }> {
    const { sessionId, channel, channelUserId, reason } = params;

    // Проверяем, есть ли уже активный запрос для этой сессии
    const existingRequest = Array.from(this.pendingRequests.values())
      .find(req => req.sessionId === sessionId && req.status === 'pending');

    if (existingRequest) {
      return {
        success: false,
        requestId: existingRequest.id,
        message: 'Запрос на подключение агента уже отправлен. Ожидайте ответа...',
      };
    }

    // Получаем доступных агентов
    const availableAgents = await this.getAvailableAgents();
    
    if (availableAgents.length === 0) {
      return {
        success: false,
        requestId: '',
        message: 'К сожалению, сейчас нет доступных агентов. Попробуйте позже или оставьте заявку.',
      };
    }

    // Создаем запрос
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const notification: AgentNotification = {
      id: requestId,
      sessionId,
      channel,
      channelUserId,
      reason,
      createdAt: new Date(),
      status: 'pending',
    };

    this.pendingRequests.set(requestId, notification);

    // Уведомляем всех доступных агентов
    await this.notifyAgents(availableAgents, notification);

    // Добавляем сообщение в чат
    await this.chatService.postMessage({
      sessionId,
      sender: 'system',
      text: `🔄 Запрос на подключение агента отправлен ${availableAgents.length} агентам. Ожидайте ответа...`,
    });

    // Устанавливаем таймаут (5 минут)
    setTimeout(() => {
      this.handleRequestTimeout(requestId);
    }, 5 * 60 * 1000);

    this.logger.log(`Agent request created: ${requestId} for session ${sessionId}`);

    return {
      success: true,
      requestId,
      message: `Запрос отправлен ${availableAgents.length} агентам. Ожидайте ответа...`,
    };
  }

  /**
   * Агент принимает запрос
   */
  async acceptRequest(agentId: string, requestId: string): Promise<{ success: boolean; message: string }> {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      return {
        success: false,
        message: 'Запрос не найден или уже обработан',
      };
    }

    if (request.status !== 'pending') {
      return {
        success: false,
        message: 'Запрос уже обработан другим агентом',
      };
    }

    // Проверяем, что агент существует и доступен
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent || agent.status !== 'online') {
      return {
        success: false,
        message: 'Агент недоступен',
      };
    }

    // Обновляем статус запроса
    request.status = 'accepted';
    request.acceptedBy = agentId;
    this.pendingRequests.set(requestId, request);

    // Обновляем сессию чата
    await this.prisma.chatSession.update({
      where: { id: request.sessionId },
      data: {
        agentId: agentId,
        state: 'agent', // Переключаем в режим агента
      },
    });

    // Уведомляем клиента
    await this.chatService.postMessage({
      sessionId: request.sessionId,
      sender: 'system',
      text: `✅ К чату подключился агент ${agent.name}. Теперь вы общаетесь с живым специалистом.`,
    });

    // Уведомляем остальных агентов, что заявка занята
    await this.notifyAgentsRequestAccepted(requestId, agent.name);

    this.logger.log(`Agent ${agent.name} (${agentId}) accepted request ${requestId}`);

    return {
      success: true,
      message: `Вы успешно подключились к чату с клиентом`,
    };
  }

  /**
   * Агент отклоняет запрос
   */
  async rejectRequest(agentId: string, requestId: string): Promise<{ success: boolean; message: string }> {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      return {
        success: false,
        message: 'Запрос не найден',
      };
    }

    if (request.status !== 'pending') {
      return {
        success: false,
        message: 'Запрос уже обработан',
      };
    }

    // Проверяем, что агент существует
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return {
        success: false,
        message: 'Агент не найден',
      };
    }

    this.logger.log(`Agent ${agent.name} (${agentId}) rejected request ${requestId}`);

    return {
      success: true,
      message: 'Запрос отклонен',
    };
  }

  /**
   * Получить активные запросы агента
   */
  async getAgentRequests(agentId: string): Promise<AgentNotification[]> {
    return Array.from(this.pendingRequests.values())
      .filter(req => req.status === 'pending');
  }

  /**
   * Получить информацию о запросе
   */
  async getRequestInfo(requestId: string): Promise<AgentNotification | null> {
    return this.pendingRequests.get(requestId) || null;
  }

  /**
   * Уведомить агентов о новом запросе
   */
  private async notifyAgents(agents: AgentStatus[], notification: AgentNotification): Promise<void> {
    // TODO: Реализовать уведомления через Telegram/WhatsApp/Email
    // Пока что просто логируем
    this.logger.log(`Notifying ${agents.length} agents about request ${notification.id}`);
    
    for (const agent of agents) {
      this.logger.log(`Agent ${agent.name} (${agent.login}) notified about session ${notification.sessionId}`);
      // Здесь будет отправка уведомления агенту
    }
  }

  /**
   * Уведомить агентов о том, что запрос принят
   */
  private async notifyAgentsRequestAccepted(requestId: string, acceptedBy: string): Promise<void> {
    // TODO: Реализовать уведомления остальных агентов
    this.logger.log(`Notifying other agents that request ${requestId} was accepted by ${acceptedBy}`);
  }

  /**
   * Обработка таймаута запроса
   */
  private async handleRequestTimeout(requestId: string): Promise<void> {
    const request = this.pendingRequests.get(requestId);
    
    if (request && request.status === 'pending') {
      request.status = 'expired';
      this.pendingRequests.set(requestId, request);

      // Уведомляем клиента о таймауте
      await this.chatService.postMessage({
        sessionId: request.sessionId,
        sender: 'system',
        text: '⏰ Время ожидания агента истекло. Вы можете попробовать снова или задать вопрос AI-ассистенту.',
      });

      this.logger.log(`Request ${requestId} expired`);
    }
  }

  /**
   * Агент завершает работу с чатом
   */
  async endAgentSession(sessionId: string, agentId: string): Promise<{ success: boolean; message: string }> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.agentId !== agentId) {
      return {
        success: false,
        message: 'Сессия не найдена или вы не являетесь агентом этой сессии',
      };
    }

    // Переключаем обратно на AI
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        agentId: null,
        state: 'qa',
      },
    });

    // Уведомляем клиента
    await this.chatService.postMessage({
      sessionId,
      sender: 'system',
      text: '👋 Агент завершил работу. Теперь вы снова общаетесь с AI-ассистентом.',
    });

    this.logger.log(`Agent ${agentId} ended session ${sessionId}`);

    return {
      success: true,
      message: 'Сессия завершена',
    };
  }

  /**
   * Получить статистику агентов
   */
  async getAgentsStats(): Promise<{
    total: number;
    online: number;
    busy: number;
    offline: number;
    pendingRequests: number;
  }> {
    const agents = await this.prisma.agent.findMany();
    const pendingRequests = Array.from(this.pendingRequests.values())
      .filter(req => req.status === 'pending').length;

    return {
      total: agents.length,
      online: agents.filter(a => a.status === 'online').length,
      busy: agents.filter(a => a.status === 'busy').length,
      offline: agents.filter(a => a.status === 'offline').length,
      pendingRequests,
    };
  }
}
