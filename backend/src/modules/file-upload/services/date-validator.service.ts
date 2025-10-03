import { Injectable, Logger } from '@nestjs/common';

export interface DateValidationResult {
  isValid: boolean;
  foundDates: Array<{
    date: string;
    context: string;
    type: 'expiry' | 'effective' | 'version' | 'general';
    isExpired: boolean;
    daysUntilExpiry?: number;
  }>;
  warnings: string[];
  recommendations: string[];
}

@Injectable()
export class DateValidatorService {
  private readonly logger = new Logger(DateValidatorService.name);

  /**
   * Проверка актуальности дат в документе
   */
  async validateDocumentDates(params: {
    title: string;
    content: string;
    filename?: string;
  }): Promise<DateValidationResult> {
    const result: DateValidationResult = {
      isValid: true,
      foundDates: [],
      warnings: [],
      recommendations: [],
    };

    try {
      // Извлекаем даты из документа
      const extractedDates = this.extractDatesFromText(params.content, params.title);
      
      const currentDate = new Date();
      
      for (const dateInfo of extractedDates) {
        const parsedDate = this.parseDate(dateInfo.date);
        
        if (parsedDate) {
          const daysUntilExpiry = Math.ceil((parsedDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
          const isExpired = parsedDate < currentDate;
          
          result.foundDates.push({
            date: dateInfo.date,
            context: dateInfo.context,
            type: dateInfo.type,
            isExpired,
            daysUntilExpiry: isExpired ? undefined : daysUntilExpiry,
          });

          // Проверяем критичные даты
          if (dateInfo.type === 'expiry' || dateInfo.type === 'effective') {
            if (isExpired) {
              result.isValid = false;
              result.warnings.push(
                `⚠️ Документ содержит истекшую дату: ${dateInfo.date} (${dateInfo.context})`
              );
            } else if (daysUntilExpiry <= 30) {
              result.warnings.push(
                `⏰ Документ скоро потеряет актуальность: ${dateInfo.date} (через ${daysUntilExpiry} дней)`
              );
            }
          }

          // Проверяем версии документов
          if (dateInfo.type === 'version') {
            const monthsOld = (currentDate.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (monthsOld > 12) {
              result.warnings.push(
                `📅 Версия документа старше года: ${dateInfo.date} (${Math.round(monthsOld)} месяцев)`
              );
            }
          }
        }
      }

      // Генерируем рекомендации
      this.generateRecommendations(result);

      this.logger.log(`Date validation completed: ${result.foundDates.length} dates found, ${result.warnings.length} warnings`);

    } catch (error) {
      this.logger.error('Error validating document dates:', error);
      result.warnings.push('Ошибка при проверке дат в документе');
    }

    return result;
  }

  /**
   * Извлечение дат из текста
   */
  private extractDatesFromText(content: string, title?: string): Array<{
    date: string;
    context: string;
    type: 'expiry' | 'effective' | 'version' | 'general';
  }> {
    const dates: Array<{
      date: string;
      context: string;
      type: 'expiry' | 'effective' | 'version' | 'general';
    }> = [];

    // Паттерны для поиска дат
    const datePatterns = [
      // Российский формат: дд.мм.гггг
      {
        pattern: /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,
        format: 'dd.mm.yyyy'
      },
      // Формат: дд/мм/гггг
      {
        pattern: /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
        format: 'dd/mm/yyyy'
      },
      // Формат: гггг-мм-дд
      {
        pattern: /(\d{4})-(\d{1,2})-(\d{1,2})/g,
        format: 'yyyy-mm-dd'
      },
      // Текстовый формат: "1 января 2024"
      {
        pattern: /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/gi,
        format: 'dd month yyyy'
      }
    ];

    // Контекстные ключевые слова для определения типа даты
    const contextPatterns = {
      expiry: [
        /действует до/i,
        /срок действия/i,
        /истекает/i,
        /прекращает действие/i,
        /утрачивает силу/i,
        /действительно до/i
      ],
      effective: [
        /вступает в силу/i,
        /действует с/i,
        /начинает действовать/i,
        /введено в действие/i,
        /применяется с/i
      ],
      version: [
        /версия от/i,
        /редакция от/i,
        /утверждено/i,
        /принято/i,
        /издание/i
      ]
    };

    const textToSearch = title ? `${title} ${content}` : content;

    for (const { pattern, format } of datePatterns) {
      let match;
      while ((match = pattern.exec(textToSearch)) !== null) {
        const fullMatch = match[0];
        const matchIndex = match.index;
        
        // Извлекаем контекст вокруг даты (50 символов до и после)
        const contextStart = Math.max(0, matchIndex - 50);
        const contextEnd = Math.min(textToSearch.length, matchIndex + fullMatch.length + 50);
        const context = textToSearch.substring(contextStart, contextEnd).trim();

        // Определяем тип даты по контексту
        let dateType: 'expiry' | 'effective' | 'version' | 'general' = 'general';
        
        for (const [type, patterns] of Object.entries(contextPatterns)) {
          if (patterns.some(p => p.test(context))) {
            dateType = type as any;
            break;
          }
        }

        dates.push({
          date: fullMatch,
          context,
          type: dateType,
        });
      }
    }

    return dates;
  }

  /**
   * Парсинг даты в объект Date
   */
  private parseDate(dateStr: string): Date | null {
    try {
      // Российский формат: дд.мм.гггг
      const ddmmyyyy = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      // Формат: дд/мм/гггг
      const ddmmyyyy2 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (ddmmyyyy2) {
        const [, day, month, year] = ddmmyyyy2;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      // Формат: гггг-мм-дд
      const yyyymmdd = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (yyyymmdd) {
        const [, year, month, day] = yyyymmdd;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      // Текстовый формат
      const textDate = dateStr.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i);
      if (textDate) {
        const [, day, monthName, year] = textDate;
        const monthNames = {
          'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3,
          'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7,
          'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
        };
        const month = monthNames[monthName.toLowerCase() as keyof typeof monthNames];
        if (month !== undefined) {
          return new Date(parseInt(year), month, parseInt(day));
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Генерация рекомендаций
   */
  private generateRecommendations(result: DateValidationResult): void {
    if (result.foundDates.length === 0) {
      result.recommendations.push('📅 В документе не найдено дат. Рекомендуется проверить актуальность вручную.');
      return;
    }

    const expiredDates = result.foundDates.filter(d => d.isExpired);
    const soonToExpire = result.foundDates.filter(d => !d.isExpired && d.daysUntilExpiry && d.daysUntilExpiry <= 90);

    if (expiredDates.length > 0) {
      result.recommendations.push('🔄 Рекомендуется найти более актуальную версию документа.');
    }

    if (soonToExpire.length > 0) {
      result.recommendations.push('⏰ Следите за обновлениями документа - некоторые даты скоро истекут.');
    }

    const versionDates = result.foundDates.filter(d => d.type === 'version');
    if (versionDates.length > 0) {
      result.recommendations.push('📋 Проверьте, не вышла ли новая версия документа на официальном сайте.');
    }
  }
}
