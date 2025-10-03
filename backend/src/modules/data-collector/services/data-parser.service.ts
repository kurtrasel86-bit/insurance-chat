import { Injectable, Logger } from '@nestjs/common';
import { CollectedData } from '../data-collector.service';

@Injectable()
export class DataParserService {
  private readonly logger = new Logger(DataParserService.name);

  constructor() {}

  /**
   * Основной метод обработки данных
   */
  async processData(data: CollectedData): Promise<CollectedData> {
    this.logger.debug(`Processing data: ${data.companyCode}/${data.productCode}`);

    // Очистка и нормализация текста
    const cleanedContent = this.cleanText(data.content);
    
    // Извлечение ключевой информации
    const extractedInfo = this.extractKeyInformation(cleanedContent, data.dataType);
    
    // Обогащение данных
    const enrichedData = this.enrichData(data, extractedInfo);
    
    // Валидация данных
    const validatedData = this.validateData(enrichedData);

    return validatedData;
  }

  /**
   * Очистка и нормализация текста
   */
  private cleanText(text: string): string {
    if (!text) return '';

    return text
      // Удаляем HTML теги
      .replace(/<[^>]*>/g, '')
      // Удаляем лишние пробелы и переносы строк
      .replace(/\s+/g, ' ')
      // Удаляем специальные символы, но оставляем пунктуацию
      .replace(/[^\w\s\u0400-\u04FF.,!?;:()\-]/g, '')
      // Нормализуем пробелы
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Извлечение ключевой информации в зависимости от типа данных
   */
  private extractKeyInformation(content: string, dataType: string): any {
    switch (dataType) {
      case 'product_info':
        return this.extractProductInfo(content);
      case 'pricing':
        return this.extractPricingInfo(content);
      case 'terms':
        return this.extractTermsInfo(content);
      case 'documents':
        return this.extractDocumentInfo(content);
      default:
        return this.extractGeneralInfo(content);
    }
  }

  /**
   * Извлечение информации о продукте
   */
  private extractProductInfo(content: string): any {
    const info: any = {
      features: [],
      benefits: [],
      conditions: [],
      coverage: [],
      exclusions: [],
    };

    // Поиск особенностей продукта
    const featuresRegex = /(?:особенности?|features?|характеристики?)[:：]\s*([^\n]+)/gi;
    let match;
    while ((match = featuresRegex.exec(content)) !== null) {
      info.features.push(match[1].trim());
    }

    // Поиск преимуществ
    const benefitsRegex = /(?:преимущества?|benefits?|плюсы?)[:：]\s*([^\n]+)/gi;
    while ((match = benefitsRegex.exec(content)) !== null) {
      info.benefits.push(match[1].trim());
    }

    // Поиск условий
    const conditionsRegex = /(?:условия?|conditions?|требования?)[:：]\s*([^\n]+)/gi;
    while ((match = conditionsRegex.exec(content)) !== null) {
      info.conditions.push(match[1].trim());
    }

    // Поиск покрытия
    const coverageRegex = /(?:покрытие|coverage|страховое покрытие)[:：]\s*([^\n]+)/gi;
    while ((match = coverageRegex.exec(content)) !== null) {
      info.coverage.push(match[1].trim());
    }

    // Поиск исключений
    const exclusionsRegex = /(?:исключения?|exclusions?|не покрывается)[:：]\s*([^\n]+)/gi;
    while ((match = exclusionsRegex.exec(content)) !== null) {
      info.exclusions.push(match[1].trim());
    }

    // Поиск страховой суммы
    const sumRegex = /(?:страховая сумма|sum|лимит)[:：]?\s*(\d+(?:\s*\d+)*)\s*(?:руб|₽|rur)?/gi;
    while ((match = sumRegex.exec(content)) !== null) {
      info.insuranceSum = match[1].replace(/\s/g, '');
    }

    // Поиск франшизы
    const franchiseRegex = /(?:франшиза|franchise)[:：]?\s*(\d+(?:\s*\d+)*)\s*(?:руб|₽|rur)?/gi;
    while ((match = franchiseRegex.exec(content)) !== null) {
      info.franchise = match[1].replace(/\s/g, '');
    }

    return info;
  }

  /**
   * Извлечение информации о тарифах
   */
  private extractPricingInfo(content: string): any {
    const info: any = {
      tariffs: [],
      baseRates: [],
      discounts: [],
    };

    // Поиск тарифов
    const tariffRegex = /(?:тариф|tariff|ставка)[:：]?\s*([^\n]+)/gi;
    let match;
    while ((match = tariffRegex.exec(content)) !== null) {
      info.tariffs.push(match[1].trim());
    }

    // Поиск базовых ставок
    const rateRegex = /(?:базовая ставка|base rate|минимальная)[:：]?\s*(\d+(?:\.\d+)?)\s*(?:%|процент)/gi;
    while ((match = rateRegex.exec(content)) !== null) {
      info.baseRates.push(match[1]);
    }

    // Поиск скидок
    const discountRegex = /(?:скидка|discount|льгота)[:：]?\s*(\d+(?:\.\d+)?)\s*(?:%|процент)/gi;
    while ((match = discountRegex.exec(content)) !== null) {
      info.discounts.push(match[1]);
    }

    // Поиск цен
    const priceRegex = /(?:цена|price|стоимость)[:：]?\s*(\d+(?:\s*\d+)*)\s*(?:руб|₽|rur)/gi;
    while ((match = priceRegex.exec(content)) !== null) {
      info.prices = info.prices || [];
      info.prices.push(match[1].replace(/\s/g, ''));
    }

    return info;
  }

  /**
   * Извлечение информации об условиях
   */
  private extractTermsInfo(content: string): any {
    const info: any = {
      terms: [],
      requirements: [],
      restrictions: [],
    };

    // Поиск условий
    const termsRegex = /(?:условие|term|правило)[:：]\s*([^\n]+)/gi;
    let match;
    while ((match = termsRegex.exec(content)) !== null) {
      info.terms.push(match[1].trim());
    }

    // Поиск требований
    const requirementsRegex = /(?:требование|requirement|необходимо)[:：]\s*([^\n]+)/gi;
    while ((match = requirementsRegex.exec(content)) !== null) {
      info.requirements.push(match[1].trim());
    }

    // Поиск ограничений
    const restrictionsRegex = /(?:ограничение|restriction|запрещено)[:：]\s*([^\n]+)/gi;
    while ((match = restrictionsRegex.exec(content)) !== null) {
      info.restrictions.push(match[1].trim());
    }

    // Поиск сроков
    const periodRegex = /(?:срок|period|время)[:：]?\s*(\d+)\s*(?:дн|день|дня|дней|мес|месяц|месяца|месяцев|год|года|лет)/gi;
    while ((match = periodRegex.exec(content)) !== null) {
      info.periods = info.periods || [];
      info.periods.push({
        value: match[1],
        unit: match[2]
      });
    }

    return info;
  }

  /**
   * Извлечение информации из документов
   */
  private extractDocumentInfo(content: string): any {
    const info: any = {
      sections: [],
      clauses: [],
      definitions: [],
    };

    // Поиск разделов
    const sectionRegex = /(?:раздел|section|глава)[:：]?\s*(\d+)[\.\s]*([^\n]+)/gi;
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
      info.sections.push({
        number: match[1],
        title: match[2].trim()
      });
    }

    // Поиск пунктов
    const clauseRegex = /(?:пункт|clause|статья)[:：]?\s*(\d+)[\.\s]*([^\n]+)/gi;
    while ((match = clauseRegex.exec(content)) !== null) {
      info.clauses.push({
        number: match[1],
        text: match[2].trim()
      });
    }

    // Поиск определений
    const definitionRegex = /(?:определение|definition|термин)[:：]\s*([^\n]+)/gi;
    while ((match = definitionRegex.exec(content)) !== null) {
      info.definitions.push(match[1].trim());
    }

    return info;
  }

  /**
   * Извлечение общей информации
   */
  private extractGeneralInfo(content: string): any {
    const info: any = {
      keywords: [],
      entities: [],
    };

    // Поиск ключевых слов
    const keywords = content.toLowerCase().match(/\b(?:страхование|insurance|полис|policy|риск|risk|покрытие|coverage|тариф|tariff|премия|premium)\b/g);
    if (keywords) {
      info.keywords = [...new Set(keywords)];
    }

    // Поиск дат
    const dates = content.match(/\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}/g);
    if (dates) {
      info.dates = dates;
    }

    // Поиск телефонных номеров
    const phones = content.match(/(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g);
    if (phones) {
      info.phones = phones;
    }

    // Поиск email адресов
    const emails = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (emails) {
      info.emails = emails;
    }

    return info;
  }

  /**
   * Обогащение данных извлеченной информацией
   */
  private enrichData(data: CollectedData, extractedInfo: any): CollectedData {
    const enrichedContent = this.buildEnrichedContent(data.content, extractedInfo, data.dataType);
    
    return {
      ...data,
      content: enrichedContent,
      // Добавляем метаданные в заголовок
      title: this.enrichTitle(data.title, extractedInfo, data.dataType),
    };
  }

  /**
   * Построение обогащенного контента
   */
  private buildEnrichedContent(originalContent: string, extractedInfo: any, dataType: string): string {
    let enrichedContent = originalContent;

    // Добавляем структурированную информацию в зависимости от типа данных
    if (dataType === 'product_info' && extractedInfo.features?.length > 0) {
      enrichedContent += '\n\n=== АВТОМАТИЧЕСКИ ИЗВЛЕЧЕННЫЕ ОСОБЕННОСТИ ===\n';
      enrichedContent += extractedInfo.features.map((feature: string) => `• ${feature}`).join('\n');
    }

    if (dataType === 'product_info' && extractedInfo.benefits?.length > 0) {
      enrichedContent += '\n\n=== ПРЕИМУЩЕСТВА ===\n';
      enrichedContent += extractedInfo.benefits.map((benefit: string) => `• ${benefit}`).join('\n');
    }

    if (dataType === 'pricing' && extractedInfo.tariffs?.length > 0) {
      enrichedContent += '\n\n=== ТАРИФЫ ===\n';
      enrichedContent += extractedInfo.tariffs.map((tariff: string) => `• ${tariff}`).join('\n');
    }

    if (dataType === 'terms' && extractedInfo.terms?.length > 0) {
      enrichedContent += '\n\n=== УСЛОВИЯ ===\n';
      enrichedContent += extractedInfo.terms.map((term: string) => `• ${term}`).join('\n');
    }

    // Добавляем ключевые слова
    if (extractedInfo.keywords?.length > 0) {
      enrichedContent += '\n\n=== КЛЮЧЕВЫЕ СЛОВА ===\n';
      enrichedContent += extractedInfo.keywords.join(', ');
    }

    return enrichedContent;
  }

  /**
   * Обогащение заголовка
   */
  private enrichTitle(originalTitle: string, extractedInfo: any, dataType: string): string {
    let enrichedTitle = originalTitle;

    // Добавляем информацию о страховой сумме в заголовок
    if (extractedInfo.insuranceSum) {
      enrichedTitle += ` (Сумма: ${extractedInfo.insuranceSum} руб.)`;
    }

    // Добавляем информацию о франшизе
    if (extractedInfo.franchise) {
      enrichedTitle += ` (Франшиза: ${extractedInfo.franchise} руб.)`;
    }

    return enrichedTitle;
  }

  /**
   * Валидация данных
   */
  private validateData(data: CollectedData): CollectedData {
    // Проверяем обязательные поля
    if (!data.companyCode || !data.productCode || !data.title || !data.content) {
      throw new Error('Missing required fields in collected data');
    }

    // Проверяем минимальную длину контента
    if (data.content.length < 50) {
      this.logger.warn(`Content too short for ${data.companyCode}/${data.productCode}: ${data.content.length} chars`);
    }

    // Проверяем валидность URL
    if (data.sourceUrl) {
      try {
        new URL(data.sourceUrl);
      } catch (error) {
        this.logger.warn(`Invalid source URL: ${data.sourceUrl}`);
        data.sourceUrl = '';
      }
    }

    // Ограничиваем длину контента
    if (data.content.length > 50000) {
      this.logger.warn(`Content too long for ${data.companyCode}/${data.productCode}, truncating`);
      data.content = data.content.substring(0, 50000) + '...';
    }

    return data;
  }

  /**
   * Анализ качества данных
   */
  analyzeDataQuality(data: CollectedData): {
    score: number;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Проверка длины контента
    if (data.content.length < 100) {
      issues.push('Слишком короткий контент');
      score -= 30;
    } else if (data.content.length > 10000) {
      suggestions.push('Рассмотрите разбиение на несколько документов');
    }

    // Проверка структурированности
    if (!data.content.includes('\n') && data.content.length > 500) {
      issues.push('Отсутствует структурирование текста');
      score -= 20;
    }

    // Проверка наличия ключевых слов
    const keywords = ['страхование', 'полис', 'риск', 'покрытие', 'тариф'];
    const hasKeywords = keywords.some(keyword => 
      data.content.toLowerCase().includes(keyword)
    );
    
    if (!hasKeywords) {
      issues.push('Отсутствуют ключевые слова страхования');
      score -= 15;
    }

    // Проверка URL источника
    if (!data.sourceUrl) {
      issues.push('Отсутствует URL источника');
      score -= 10;
    }

    // Проверка версии
    if (!data.version) {
      issues.push('Отсутствует версия документа');
      score -= 5;
    }

    return {
      score: Math.max(0, score),
      issues,
      suggestions
    };
  }
}


