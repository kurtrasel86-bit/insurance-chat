import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectedData } from '../data-collector.service';

export interface NotificationConfig {
  email: {
    enabled: boolean;
    recipients: string[];
  };
  telegram: {
    enabled: boolean;
    botToken?: string;
    chatId?: string;
  };
  webhook: {
    enabled: boolean;
    url?: string;
  };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly config: NotificationConfig;

  constructor(
    private readonly prisma: PrismaService,
  ) {
    // Загружаем конфигурацию из переменных окружения
    this.config = {
      email: {
        enabled: process.env.NOTIFICATION_EMAIL_ENABLED === 'true',
        recipients: process.env.NOTIFICATION_EMAIL_RECIPIENTS?.split(',') || [],
      },
      telegram: {
        enabled: process.env.NOTIFICATION_TELEGRAM_ENABLED === 'true',
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      },
      webhook: {
        enabled: process.env.NOTIFICATION_WEBHOOK_ENABLED === 'true',
        url: process.env.NOTIFICATION_WEBHOOK_URL,
      },
    };
  }

  /**
   * Уведомление о новых данных
   */
  async notifyNewData(companyCode: string, dataCount: number): Promise<void> {
    const message = `📊 Новые данные от ${companyCode}: собрано ${dataCount} элементов`;
    
    await this.sendNotification('new_data', {
      companyCode,
      dataCount,
      message,
    });

    // Сохраняем уведомление в базу данных
    await this.saveNotification({
      type: 'new_data',
      companyCode,
      title: 'Новые данные собраны',
      message,
      data: { dataCount },
    });
  }

  /**
   * Уведомление об ошибке
   */
  async notifyError(companyCode: string, errorMessage: string): Promise<void> {
    const message = `❌ Ошибка при сборе данных от ${companyCode}: ${errorMessage}`;
    
    await this.sendNotification('error', {
      companyCode,
      errorMessage,
      message,
    });

    // Сохраняем инцидент в базу данных
    await this.saveIncident({
      type: 'data_collection_error',
      details: `Company: ${companyCode}, Error: ${errorMessage}`,
    });

    await this.saveNotification({
      type: 'error',
      companyCode,
      title: 'Ошибка сбора данных',
      message,
      data: { errorMessage },
    });
  }

  /**
   * Уведомление об изменении данных
   */
  async notifyDataChange(companyCode: string, productCode: string, changeType: string): Promise<void> {
    const message = `🔄 Изменения в данных от ${companyCode} (${productCode}): ${changeType}`;
    
    await this.sendNotification('data_change', {
      companyCode,
      productCode,
      changeType,
      message,
    });

    await this.saveNotification({
      type: 'data_change',
      companyCode,
      title: 'Изменения в данных',
      message,
      data: { productCode, changeType },
    });
  }

  /**
   * Уведомление о завершении сбора данных
   */
  async notifyCollectionComplete(companyCode: string, stats: {
    totalItems: number;
    newItems: number;
    updatedItems: number;
    duration: number;
  }): Promise<void> {
    const message = `✅ Сбор данных от ${companyCode} завершен\n` +
      `📈 Всего элементов: ${stats.totalItems}\n` +
      `🆕 Новых: ${stats.newItems}\n` +
      `🔄 Обновлено: ${stats.updatedItems}\n` +
      `⏱️ Время выполнения: ${stats.duration}мс`;

    await this.sendNotification('collection_complete', {
      companyCode,
      stats,
      message,
    });

    await this.saveNotification({
      type: 'collection_complete',
      companyCode,
      title: 'Сбор данных завершен',
      message,
      data: stats,
    });
  }

  /**
   * Уведомление о проблемах с API
   */
  async notifyApiIssue(companyCode: string, issue: string): Promise<void> {
    const message = `⚠️ Проблема с API ${companyCode}: ${issue}`;
    
    await this.sendNotification('api_issue', {
      companyCode,
      issue,
      message,
    });

    await this.saveIncident({
      type: 'api_issue',
      details: `Company: ${companyCode}, Issue: ${issue}`,
    });
  }

  /**
   * Уведомление о недоступности сайта
   */
  async notifyWebsiteUnavailable(companyCode: string, website: string): Promise<void> {
    const message = `🌐 Сайт недоступен: ${companyCode} (${website})`;
    
    await this.sendNotification('website_unavailable', {
      companyCode,
      website,
      message,
    });

    await this.saveIncident({
      type: 'website_unavailable',
      details: `Company: ${companyCode}, Website: ${website}`,
    });
  }

  /**
   * Отправка уведомления через все настроенные каналы
   */
  private async sendNotification(type: string, data: any): Promise<void> {
    const promises: Promise<void>[] = [];

    // Email уведомления
    if (this.config.email.enabled) {
      promises.push(this.sendEmailNotification(data.message, type, data));
    }

    // Telegram уведомления
    if (this.config.telegram.enabled && this.config.telegram.botToken && this.config.telegram.chatId) {
      promises.push(this.sendTelegramNotification(data.message, type, data));
    }

    // Webhook уведомления
    if (this.config.webhook.enabled && this.config.webhook.url) {
      promises.push(this.sendWebhookNotification(type, data));
    }

    // Выполняем все уведомления параллельно
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      this.logger.error('Error sending notifications:', error);
    }
  }

  /**
   * Отправка email уведомления
   */
  private async sendEmailNotification(message: string, type: string, data: any): Promise<void> {
    try {
      // Здесь можно интегрировать с сервисом отправки email (например, SendGrid, Nodemailer)
      this.logger.log(`Email notification: ${message}`);
      
      // Заглушка для email отправки
      for (const recipient of this.config.email.recipients) {
        this.logger.debug(`Would send email to ${recipient}: ${message}`);
      }
      
    } catch (error) {
      this.logger.error('Failed to send email notification:', error);
    }
  }

  /**
   * Отправка Telegram уведомления
   */
  private async sendTelegramNotification(message: string, type: string, data: any): Promise<void> {
    try {
      const telegramApiUrl = `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`;
      
      const response = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.config.telegram.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status}`);
      }

      this.logger.log(`Telegram notification sent: ${message}`);
      
    } catch (error) {
      this.logger.error('Failed to send Telegram notification:', error);
    }
  }

  /**
   * Отправка webhook уведомления
   */
  private async sendWebhookNotification(type: string, data: any): Promise<void> {
    try {
      const payload = {
        type,
        timestamp: new Date().toISOString(),
        data,
      };

      const response = await fetch(this.config.webhook.url!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }

      this.logger.log(`Webhook notification sent: ${type}`);
      
    } catch (error) {
      this.logger.error('Failed to send webhook notification:', error);
    }
  }

  /**
   * Сохранение уведомления в базу данных
   */
  private async saveNotification(notification: {
    type: string;
    companyCode: string;
    title: string;
    message: string;
    data?: any;
  }): Promise<void> {
    try {
      // Здесь можно добавить таблицу для хранения уведомлений
      this.logger.debug(`Notification saved: ${notification.type} for ${notification.companyCode}`);
    } catch (error) {
      this.logger.error('Failed to save notification:', error);
    }
  }

  /**
   * Сохранение инцидента в базу данных
   */
  private async saveIncident(incident: {
    type: string;
    details: string;
  }): Promise<void> {
    try {
      await this.prisma.incident.create({
        data: {
          type: incident.type,
          details: incident.details,
        },
      });
      
      this.logger.debug(`Incident saved: ${incident.type}`);
    } catch (error) {
      this.logger.error('Failed to save incident:', error);
    }
  }

  /**
   * Получение истории уведомлений
   */
  async getNotificationHistory(limit: number = 50): Promise<any[]> {
    try {
      // Здесь можно добавить запрос к таблице уведомлений
      return [];
    } catch (error) {
      this.logger.error('Failed to get notification history:', error);
      return [];
    }
  }

  /**
   * Получение статистики уведомлений
   */
  async getNotificationStats(): Promise<{
    totalNotifications: number;
    notificationsByType: Record<string, number>;
    lastNotificationTime: Date | null;
  }> {
    try {
      // Здесь можно добавить запрос к таблице уведомлений
      return {
        totalNotifications: 0,
        notificationsByType: {},
        lastNotificationTime: null,
      };
    } catch (error) {
      this.logger.error('Failed to get notification stats:', error);
      return {
        totalNotifications: 0,
        notificationsByType: {},
        lastNotificationTime: null,
      };
    }
  }

  /**
   * Тестирование уведомлений
   */
  async testNotifications(): Promise<{
    email: boolean;
    telegram: boolean;
    webhook: boolean;
  }> {
    const testMessage = '🧪 Тестовое уведомление от системы сбора данных';
    const results = {
      email: false,
      telegram: false,
      webhook: false,
    };

    // Тестируем email
    if (this.config.email.enabled) {
      try {
        await this.sendEmailNotification(testMessage, 'test', {});
        results.email = true;
      } catch (error) {
        this.logger.error('Email test failed:', error);
      }
    }

    // Тестируем Telegram
    if (this.config.telegram.enabled) {
      try {
        await this.sendTelegramNotification(testMessage, 'test', {});
        results.telegram = true;
      } catch (error) {
        this.logger.error('Telegram test failed:', error);
      }
    }

    // Тестируем webhook
    if (this.config.webhook.enabled) {
      try {
        await this.sendWebhookNotification('test', { message: testMessage });
        results.webhook = true;
      } catch (error) {
        this.logger.error('Webhook test failed:', error);
      }
    }

    return results;
  }

  /**
   * Получение конфигурации уведомлений
   */
  getNotificationConfig(): NotificationConfig {
    return { ...this.config };
  }

  /**
   * Обновление конфигурации уведомлений
   */
  updateNotificationConfig(config: Partial<NotificationConfig>): void {
    Object.assign(this.config, config);
    this.logger.log('Notification configuration updated');
  }
}


