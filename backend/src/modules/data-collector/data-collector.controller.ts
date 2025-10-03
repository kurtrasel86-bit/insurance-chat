import { Controller, Get, Post, Put, Delete, Param, Body, Query, Logger } from '@nestjs/common';
import { DataCollectorService } from './data-collector.service';
import { NotificationService } from './services/notification.service';
import { ApiIntegrationService } from './services/api-integration.service';

@Controller('data-collector')
export class DataCollectorController {
  private readonly logger = new Logger(DataCollectorController.name);

  constructor(
    private readonly dataCollector: DataCollectorService,
    private readonly notification: NotificationService,
    private readonly apiIntegration: ApiIntegrationService,
  ) {}

  /**
   * Получение списка всех страховых компаний
   */
  @Get('companies')
  async getCompanies() {
    return {
      success: true,
      data: this.dataCollector.getInsuranceCompanies(),
    };
  }

  /**
   * Получение статуса сбора данных
   */
  @Get('status')
  getCollectionStatus() {
    return {
      success: true,
      data: this.dataCollector.getCollectionStatus(),
    };
  }

  /**
   * Получение статистики производительности
   */
  @Get('performance')
  getPerformanceStats() {
    return {
      success: true,
      data: this.dataCollector.getPerformanceStats(),
    };
  }

  /**
   * Остановка сбора данных
   */
  @Post('stop')
  async stopCollection() {
    await this.dataCollector.stopCollection();
    return { success: true, message: 'Collection stop requested' };
  }

  /**
   * Получение конфигурации конкретной компании
   */
  @Get('companies/:companyId')
  async getCompanyConfig(@Param('companyId') companyId: string) {
    const company = this.dataCollector.getCompanyConfig(companyId);
    
    if (!company) {
      return {
        success: false,
        error: 'Company not found',
      };
    }

    return {
      success: true,
      data: company,
    };
  }

  /**
   * Запуск сбора данных для всех компаний
   */
  @Post('collect/all')
  async collectAllData() {
    try {
      this.logger.log('Manual collection triggered for all companies');
      await this.dataCollector.collectAllData();
      
      return {
        success: true,
        message: 'Data collection started for all companies',
      };
    } catch (error) {
      this.logger.error('Failed to collect data for all companies:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Запуск сбора данных для конкретной компании
   */
  @Post('collect/company/:companyId')
  async collectCompanyData(@Param('companyId') companyId: string) {
    try {
      const company = this.dataCollector.getCompanyConfig(companyId);
      
      if (!company) {
        return {
          success: false,
          error: 'Company not found',
        };
      }

      this.logger.log(`Manual collection triggered for company: ${companyId}`);
      await this.dataCollector.collectCompanyData(company);
      
      return {
        success: true,
        message: `Data collection completed for ${company.name}`,
      };
    } catch (error) {
      this.logger.error(`Failed to collect data for company ${companyId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }


  /**
   * Тестирование API подключения
   */
  @Post('test/api/:companyId')
  async testApiConnection(@Param('companyId') companyId: string) {
    try {
      const company = this.dataCollector.getCompanyConfig(companyId);
      
      if (!company) {
        return {
          success: false,
          error: 'Company not found',
        };
      }

      const result = await this.apiIntegration.testConnection(company);
      
      return {
        success: true,
        data: {
          company: company.name,
          ...result,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to test API connection for ${companyId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Получение конфигурации уведомлений
   */
  @Get('notifications/config')
  async getNotificationConfig() {
    try {
      const config = this.notification.getNotificationConfig();
      
      return {
        success: true,
        data: config,
      };
    } catch (error) {
      this.logger.error('Failed to get notification config:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Обновление конфигурации уведомлений
   */
  @Put('notifications/config')
  async updateNotificationConfig(@Body() config: any) {
    try {
      this.notification.updateNotificationConfig(config);
      
      return {
        success: true,
        message: 'Notification configuration updated',
      };
    } catch (error) {
      this.logger.error('Failed to update notification config:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Тестирование уведомлений
   */
  @Post('notifications/test')
  async testNotifications() {
    try {
      const results = await this.notification.testNotifications();
      
      return {
        success: true,
        data: results,
      };
    } catch (error) {
      this.logger.error('Failed to test notifications:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Получение истории уведомлений
   */
  @Get('notifications/history')
  async getNotificationHistory(@Query('limit') limit?: number) {
    try {
      const history = await this.notification.getNotificationHistory(limit);
      
      return {
        success: true,
        data: history,
      };
    } catch (error) {
      this.logger.error('Failed to get notification history:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Получение статистики уведомлений
   */
  @Get('notifications/stats')
  async getNotificationStats() {
    try {
      const stats = await this.notification.getNotificationStats();
      
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error('Failed to get notification stats:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

}

