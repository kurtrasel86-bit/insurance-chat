import { Body, Controller, Get, Post, Query, Param } from '@nestjs/common';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  /**
   * GET /agents/available - Получить доступных агентов
   */
  @Get('available')
  async getAvailableAgents() {
    return this.agentsService.getAvailableAgents();
  }

  /**
   * GET /agents/stats - Статистика агентов
   */
  @Get('stats')
  async getAgentsStats() {
    return this.agentsService.getAgentsStats();
  }

  /**
   * POST /agents/request - Запросить подключение агента
   */
  @Post('request')
  async requestAgent(
    @Body()
    body: {
      sessionId: string;
      channel: string;
      channelUserId: string;
      reason?: string;
    },
  ) {
    return this.agentsService.requestAgent(body);
  }

  /**
   * POST /agents/accept - Агент принимает запрос
   */
  @Post('accept')
  async acceptRequest(
    @Body()
    body: {
      agentId: string;
      requestId: string;
    },
  ) {
    return this.agentsService.acceptRequest(body.agentId, body.requestId);
  }

  /**
   * POST /agents/reject - Агент отклоняет запрос
   */
  @Post('reject')
  async rejectRequest(
    @Body()
    body: {
      agentId: string;
      requestId: string;
    },
  ) {
    return this.agentsService.rejectRequest(body.agentId, body.requestId);
  }

  /**
   * GET /agents/requests/:agentId - Получить запросы агента
   */
  @Get('requests/:agentId')
  async getAgentRequests(@Param('agentId') agentId: string) {
    return this.agentsService.getAgentRequests(agentId);
  }

  /**
   * GET /agents/request/:requestId - Получить информацию о запросе
   */
  @Get('request/:requestId')
  async getRequestInfo(@Param('requestId') requestId: string) {
    return this.agentsService.getRequestInfo(requestId);
  }

  /**
   * POST /agents/end-session - Завершить сессию агента
   */
  @Post('end-session')
  async endAgentSession(
    @Body()
    body: {
      sessionId: string;
      agentId: string;
    },
  ) {
    return this.agentsService.endAgentSession(body.sessionId, body.agentId);
  }
}
