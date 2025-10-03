import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Observable, Subject } from 'rxjs';
import { DuplicateDetectorService } from '../file-upload/services/duplicate-detector.service';
import { DateValidatorService, DateValidationResult } from '../file-upload/services/date-validator.service';

export interface DocumentAnalysis {
  docId: string;
  title: string;
  companyCode: string;
  productCode: string;
  score: number; // 0-100
  issues: string[];
  recommendation: 'keep' | 'review' | 'delete';
  reason: string;
  details: {
    hasUsefulContent: boolean;
    hasSpecificInfo: boolean;
    isRelevant: boolean;
    isDuplicate: boolean;
    isOutdated: boolean;
    isTestData: boolean;
    contentLength: number;
    duplicates?: Array<{ docId: string; title: string; similarity: number; reason: string }>;
    dateValidation?: DateValidationResult;
    hasNewerVersion?: boolean;
    newerVersionInfo?: string;
    expiredInfo?: {
      expiredDate: string;
      context: string;
      source: string;
    };
    // Новые поля для проверки принадлежности и названия
    companyValidation?: {
      isCorrect: boolean;
      suggestedCompany?: string;
      confidence: number;
      reason: string;
    };
    titleValidation?: {
      isCorrect: boolean;
      suggestedTitle?: string;
      confidence: number;
      reason: string;
    };
  };
}

@Injectable()
export class DocumentAnalyzerService {
  private readonly logger = new Logger(DocumentAnalyzerService.name);
  private analysisStreams = new Map<string, any>();
  public lastAnalysisResults: DocumentAnalysis[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicateDetector: DuplicateDetectorService,
    private readonly dateValidator: DateValidatorService,
  ) {}

  /**
   * Анализ всех документов в базе знаний
   */
  async analyzeAllDocuments(options?: { includeApproved?: boolean }): Promise<DocumentAnalysis[]> {
    this.logger.log('Starting document analysis');

    const documents = await this.prisma.kBDoc.findMany({
      where: options?.includeApproved === false ? { isApproved: false } : undefined,
      include: {
        chunks: true,
      },
    });

    const analyses: DocumentAnalysis[] = [];

    for (const doc of documents) {
      const analysis = await this.analyzeDocument(doc);
      analyses.push(analysis);
    }

    // Сортируем по score (худшие первыми)
    return analyses.sort((a, b) => a.score - b.score);
  }

  /**
   * Анализ всех документов с отслеживанием прогресса
   */
  async analyzeAllDocumentsWithProgress(options?: { 
    includeApproved?: boolean;
    includeObsolete?: boolean;
    analysisId?: string;
    limit?: number;
    companyCode?: string;
  }): Promise<DocumentAnalysis[]> {
    const analysisId = options?.analysisId || `analysis-${Date.now()}`;
    const progressSubject = new Subject<any>();
    this.analysisStreams.set(analysisId, progressSubject);

    this.logger.log(`Starting document analysis with progress tracking: ${analysisId}`);

    try {
      // Получаем документы для анализа
      this.sendAnalysisProgress(analysisId, {
        step: 'loading',
        progress: 0,
        message: 'Загрузка документов для анализа...',
        details: {}
      });

      this.logger.log(`Loading documents with limit: ${options?.limit || 'no limit'}`);
      this.logger.log(`Limit type: ${typeof options?.limit}, value: ${JSON.stringify(options?.limit)}`);

      const whereConditions: any = {};
      
      if (options?.includeApproved === false) {
        whereConditions.isApproved = false;
      }
      
      if (options?.includeObsolete === false) {
        whereConditions.isObsolete = false;
      }
      
      if (options?.companyCode) {
        whereConditions.companyCode = options.companyCode;
      }

      const queryOptions: any = {
        where: Object.keys(whereConditions).length > 0 ? whereConditions : undefined,
        include: {
          chunks: {
            select: {
              text: true
            }
          },
        },
        orderBy: {
          createdAt: 'desc'
        }
      };

      // Добавляем take только если лимит указан
      if (options?.limit && options.limit > 0) {
        queryOptions.take = options.limit;
        this.logger.log(`Setting take limit to: ${options.limit}`);
      } else {
        this.logger.log(`No limit set - will fetch all documents`);
      }

      const documents = await this.prisma.kBDoc.findMany(queryOptions);

      this.logger.log(`Loaded ${documents.length} documents for analysis`);

      const totalDocs = documents.length;
      const analyses: DocumentAnalysis[] = [];

      this.sendAnalysisProgress(analysisId, {
        step: 'analyzing',
        progress: 5,
        message: `Найдено ${totalDocs} документов для анализа`,
        details: { totalDocuments: totalDocs }
      });

      // Анализируем каждый документ
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const progress = Math.round(((i + 1) / totalDocs) * 90) + 5; // 5-95%

        // Отправляем прогресс для каждого документа (начало анализа)
        this.sendAnalysisProgress(analysisId, {
          step: 'analyzing',
          progress: Math.round((i / totalDocs) * 90) + 5,
          message: `📄 Анализируем документ ${i + 1} из ${totalDocs}`,
          details: {
            current: i + 1,
            total: totalDocs,
            currentDocument: doc.title.length > 60 ? doc.title.substring(0, 60) + '...' : doc.title,
            companyCode: doc.companyCode,
            status: '🔍 Начинаем анализ...'
          }
        });

        try {
          const analysis = await this.analyzeDocument(doc, documents);
          analyses.push(analysis);
          
          // Отправляем прогресс после завершения анализа документа
          const statusParts = [`✅ Оценка: ${analysis.score}/100 (${analysis.recommendation})`];
          if (analysis.details.isDuplicate) {
            statusParts.push(`🔄 ${analysis.details.duplicates?.length || 0} дубликатов`);
          }
          if (analysis.details.isOutdated) {
            statusParts.push('⚠️ Устарел');
          }
          if (analysis.details.hasNewerVersion) {
            statusParts.push('🆕 Есть новая версия');
          }
          
          this.sendAnalysisProgress(analysisId, {
            step: 'analyzing',
            progress: Math.round(((i + 1) / totalDocs) * 90) + 5,
            message: `✅ Завершен анализ ${i + 1} из ${totalDocs}`,
            details: {
              current: i + 1,
              total: totalDocs,
              currentDocument: doc.title.length > 60 ? doc.title.substring(0, 60) + '...' : doc.title,
              companyCode: doc.companyCode,
              status: statusParts.join(' | '),
              score: analysis.score,
              recommendation: analysis.recommendation,
              isDuplicate: analysis.details.isDuplicate,
              isOutdated: analysis.details.isOutdated,
              duplicatesCount: analysis.details.duplicates?.length || 0
            }
          });
        } catch (error) {
          this.logger.error(`Error analyzing document ${doc.id}:`, error);
          // Добавляем базовый анализ при ошибке
          analyses.push({
            docId: doc.id,
            title: doc.title,
            companyCode: doc.companyCode,
            productCode: doc.productCode,
            score: 0,
            issues: ['Ошибка анализа'],
            recommendation: 'review',
            reason: 'Ошибка при анализе',
            details: {
              hasUsefulContent: false,
              hasSpecificInfo: false,
              isRelevant: false,
              isDuplicate: false,
              isOutdated: false,
              isTestData: false,
              contentLength: 0,
            }
          });
        }

        // Задержки убраны для максимальной скорости
      }

      // Завершение анализа
      const duplicatesCount = analyses.filter(a => a.details.isDuplicate).length;
      const outdatedCount = analyses.filter(a => a.details.isOutdated).length;
      const newerVersionsCount = analyses.filter(a => a.details.hasNewerVersion).length;
      const problemDocuments = analyses.filter(a => a.score < 70).length;
      
      this.sendAnalysisProgress(analysisId, {
        step: 'complete',
        progress: 100,
        message: 'Анализ завершен!',
        details: {
          totalAnalyzed: analyses.length,
          averageScore: Math.round(analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length),
          problemDocuments,
          duplicatesCount,
          outdatedCount,
          newerVersionsCount,
          summary: `Проблемных: ${problemDocuments}, Дубликатов: ${duplicatesCount}, Устаревших: ${outdatedCount}, Есть новые версии: ${newerVersionsCount}`
        }
      });

      // Сортируем по score (худшие первыми)
      const sortedAnalyses = analyses.sort((a, b) => a.score - b.score);

      // Сохраняем результаты в кэш
      this.lastAnalysisResults = sortedAnalyses;
      this.logger.log(`Cached ${sortedAnalyses.length} analysis results`);

      // Закрываем поток прогресса через 3 секунды после завершения
      setTimeout(() => {
        const observer = this.analysisStreams.get(analysisId);
        if (observer) {
          this.logger.log(`Closing SSE stream for analysis: ${analysisId}`);
          observer.complete();
        }
        this.analysisStreams.delete(analysisId);
        this.logger.log(`Deleted SSE stream for analysis: ${analysisId}`);
      }, 3000);

      return sortedAnalyses;

    } catch (error) {
      this.sendAnalysisProgress(analysisId, {
        step: 'error',
        progress: 0,
        message: `Ошибка анализа: ${error.message}`,
        details: { error: error.message }
      });

      setTimeout(() => {
        progressSubject.complete();
        this.analysisStreams.delete(analysisId);
      }, 1000);

      this.logger.error('Error during document analysis:', error);
      throw error;
    }
  }

  /**
   * Анализ конкретного документа (максимально упрощенная версия)
   */
  async analyzeDocument(doc: any, allDocuments?: any[]): Promise<DocumentAnalysis> {
    this.logger.debug(`Starting analysis of document: ${doc.title}`);

    try {
      // Получаем контент максимально безопасно
      let content = '';
      try {
        content = doc.chunks && doc.chunks.length > 0
          ? doc.chunks.map((chunk) => chunk.text || '').join(' ')
          : '';
      } catch (e) {
        this.logger.warn(`Error getting content for doc ${doc.id}:`, e);
        content = '';
      }

      this.logger.debug(`Content length: ${content.length}`);

      // Простейший анализ без сложных операций
      const issues: string[] = [];
      let score = 80; // Базовая оценка

      // Только базовые проверки
      const hasUsefulContent = content.length > 100;
      if (!hasUsefulContent) {
        issues.push('Мало содержимого');
      score -= 30;
    }

      const hasInsuranceWords = /страхов|полис|выплат/i.test(content);
      if (!hasInsuranceWords) {
        issues.push('Нет страховых терминов');
        score -= 20;
      }

      // Проверка дубликатов
      let duplicates: Array<{ docId: string; title: string; similarity: number; reason: string }> = [];
      let isDuplicate = false;
      
      if (allDocuments && allDocuments.length > 1) {
        try {
          duplicates = await this.duplicateDetector.findDuplicates({
            title: doc.title,
            content: content,
            companyCode: doc.companyCode,
            productCode: doc.productCode,
            excludeDocId: doc.id, // Исключаем текущий документ из поиска дубликатов
          });
          
          if (duplicates.length > 0) {
            isDuplicate = true;
            issues.push(`Найдено ${duplicates.length} дубликатов`);
            score -= 15; // Снижаем оценку за дубликаты
          }
        } catch (error) {
          this.logger.warn(`Error checking duplicates for doc ${doc.id}:`, error);
        }
      }

      // Проверка актуальности дат
      let dateValidation: DateValidationResult | undefined;
      let isOutdated = false;
      let expiredInfo: { expiredDate: string; context: string; source: string } | undefined;
      
      try {
        dateValidation = await this.dateValidator.validateDocumentDates({
          title: doc.title,
          content: content,
          filename: doc.filename
        });
        
        if (dateValidation && dateValidation.warnings.length > 0) {
          const outdatedWarnings = dateValidation.warnings.filter(w => 
            w.includes('устарел') || w.includes('истек') || w.includes('неактуален')
          );
          
          if (outdatedWarnings.length > 0) {
            isOutdated = true;
            issues.push(`Документ устарел: ${outdatedWarnings.length} предупреждений`);
            score -= 25; // Сильно снижаем оценку за устаревшие документы
            
            // Извлекаем детальную информацию об истечении
            const expiredDate = dateValidation.foundDates.find(d => d.isExpired);
            if (expiredDate) {
              expiredInfo = {
                expiredDate: expiredDate.date,
                context: expiredDate.context,
                source: `Документ "${doc.title}"`
              };
            }
          } else if (dateValidation.warnings.length > 0) {
            issues.push(`Проблемы с датами: ${dateValidation.warnings.length} предупреждений`);
            score -= 10;
          }
        }
      } catch (error) {
        this.logger.warn(`Error validating dates for doc ${doc.id}:`, error);
      }

      // Проверка на более актуальные документы по тому же продукту
      let hasNewerVersion = false;
      let newerVersionInfo = '';
      
      if (doc.productCode && allDocuments && allDocuments.length > 1) {
        try {
          // Ищем документы по тому же продукту
          const sameProductDocs = allDocuments.filter(otherDoc => 
            otherDoc.id !== doc.id && 
            otherDoc.productCode === doc.productCode &&
            otherDoc.companyCode === doc.companyCode
          );
          
          if (sameProductDocs.length > 0) {
            // Извлекаем даты из текущего документа
            const currentDocDates = this.extractEffectiveDates(content, doc.title);
            
            for (const otherDoc of sameProductDocs) {
              const otherContent = otherDoc.chunks && otherDoc.chunks.length > 0
                ? otherDoc.chunks.map((chunk) => chunk.text || '').join(' ')
                : '';
              const otherDocDates = this.extractEffectiveDates(otherContent, otherDoc.title);
              
              // Сравниваем даты начала действия
              if (currentDocDates.effectiveDate && otherDocDates.effectiveDate) {
                if (otherDocDates.effectiveDate > currentDocDates.effectiveDate) {
                  hasNewerVersion = true;
                  const currentDateStr = currentDocDates.effectiveDate.toLocaleDateString('ru-RU');
                  const newerDateStr = otherDocDates.effectiveDate.toLocaleDateString('ru-RU');
                  newerVersionInfo = `По данному продукту найдены более свежие документы: документ "${otherDoc.title}" (ID: ${otherDoc.id}) действует с ${newerDateStr}, текущий документ от ${currentDateStr}`;
                  issues.push(`Есть более актуальная версия: "${otherDoc.title}" от ${newerDateStr}, текущий от ${currentDateStr}`);
                  score -= 20;
                  break;
                }
              }
            }
          }
        } catch (error) {
          this.logger.warn(`Error checking for newer versions for doc ${doc.id}:`, error);
        }
      }

      // Определяем рекомендацию с учетом дубликатов, дат и новых версий
    let recommendation: 'keep' | 'review' | 'delete';
    let reason: string;

    if (isOutdated) {
      recommendation = 'delete';
      reason = 'Документ устарел и неактуален';
    } else if (hasNewerVersion) {
      recommendation = 'delete';
      reason = newerVersionInfo || 'Есть более актуальная версия документа';
    } else if (isDuplicate && score < 60) {
      recommendation = 'delete';
      reason = 'Дубликат с низкой оценкой';
    } else if (isDuplicate) {
      recommendation = 'review';
      reason = 'Возможный дубликат, требует проверки';
    } else if (score >= 70) {
      recommendation = 'keep';
      reason = 'Документ содержит полезную информацию';
    } else if (score >= 40) {
      recommendation = 'review';
      reason = 'Документ требует проверки';
    } else {
      recommendation = 'delete';
      reason = 'Документ не содержит полезной информации';
    }

    // Анализ принадлежности к компании
    const companyValidation = this.analyzeCompanyBelonging(content, doc.title, doc.companyCode);
    
    // Анализ правильности названия
    const titleValidation = this.analyzeTitleCorrectness(content, doc.title, doc.companyCode, doc.productCode);
    
    // Добавляем проблемы в список issues
    if (!companyValidation.isCorrect) {
      issues.push(`Неправильная принадлежность к компании: ${companyValidation.reason}`);
      score -= 10;
    }
    
    if (!titleValidation.isCorrect) {
      issues.push(`Неправильное название: ${titleValidation.reason}`);
      score -= 5;
    }

      const result = {
      docId: doc.id,
      title: doc.title,
        companyCode: doc.companyCode || 'UNKNOWN',
        productCode: doc.productCode || 'UNKNOWN',
      score: Math.max(0, score),
      issues,
      recommendation,
      reason,
      details: {
        hasUsefulContent,
          hasSpecificInfo: hasInsuranceWords,
          isRelevant: hasInsuranceWords,
        isDuplicate,
        isOutdated,
          isTestData: false,
        contentLength: content.length,
          duplicates: duplicates.length > 0 ? duplicates : undefined,
          dateValidation,
          hasNewerVersion,
          newerVersionInfo: hasNewerVersion ? newerVersionInfo : undefined,
          expiredInfo,
          companyValidation,
          titleValidation,
        },
      };

      this.logger.debug(`Completed analysis of document: ${doc.title}, score: ${result.score}, duplicates: ${duplicates.length}, outdated: ${isOutdated}`);
      return result;

    } catch (error) {
      this.logger.error(`Critical error analyzing document ${doc.id}:`, error);

      // Возвращаем базовый анализ в случае ошибки
      return {
        docId: doc.id,
        title: doc.title || 'Unknown',
        companyCode: doc.companyCode || 'UNKNOWN',
        productCode: doc.productCode || 'UNKNOWN',
        score: 50,
        issues: ['Ошибка при анализе документа'],
        recommendation: 'review',
        reason: 'Ошибка при анализе',
        details: {
          hasUsefulContent: false,
          hasSpecificInfo: false,
          isRelevant: false,
          isDuplicate: false,
          isOutdated: false,
          isTestData: false,
          contentLength: 0,
        },
      };
    }
  }

  /**
   * Проверка наличия конкретной информации
   */
  private checkSpecificInfo(content: string): boolean {
    const lowerContent = content.toLowerCase();

    // Проверяем наличие цен
    const hasPrices = /\d+[\s,.]?\d*\s*(руб|₽|рублей)/i.test(content);

    // Проверяем наличие сроков
    const hasTerms = /\d+\s*(месяц|год|лет|дн)/i.test(content);

    // Проверяем наличие процентов
    const hasPercents = /\d+[\s,.]?\d*\s*%/.test(content);

    // Проверяем наличие ключевых слов страхования
    const hasInsuranceKeywords =
      lowerContent.includes('страхов') ||
      lowerContent.includes('полис') ||
      lowerContent.includes('выплат') ||
      lowerContent.includes('возмещ') ||
      lowerContent.includes('покрыти') ||
      lowerContent.includes('риск');

    return (hasPrices || hasTerms || hasPercents) && hasInsuranceKeywords;
  }

  /**
   * Проверка релевантности для страхового агента
   */
  private checkRelevance(content: string, productCode: string): boolean {
    const lowerContent = content.toLowerCase();

    // Ключевые слова для разных продуктов
    const productKeywords: Record<string, string[]> = {
      OSAGO: ['осаго', 'автогражданка', 'дтп', 'водител', 'транспорт', 'автомобил'],
      KASKO: ['каско', 'ущерб', 'угон', 'авто', 'машин', 'транспорт'],
      HEALTH: ['здоровье', 'медицин', 'дмс', 'лечение', 'врач', 'клиник'],
      LIFE: ['жизнь', 'смерт', 'инвалидност', 'выгодоприобретател'],
      PROPERTY: ['имущество', 'недвижимост', 'квартир', 'дом', 'пожар'],
      TRAVEL: ['путешеств', 'туризм', 'заграниц', 'виз', 'медицинская помощь за рубежом'],
    };

    const keywords = productKeywords[productCode] || ['страхов', 'полис'];

    return keywords.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Проверка на дубликаты
   */
  private async checkForDuplicates(doc: any, content: string): Promise<boolean> {
    const similarDocs = await this.prisma.kBDoc.findMany({
      where: {
        companyCode: doc.companyCode,
        productCode: doc.productCode,
        NOT: {
          id: doc.id,
        },
      },
      include: {
        chunks: true,
      },
    });

    for (const otherDoc of similarDocs) {
      const otherContent = otherDoc.chunks.map((c) => c.text).join(' ');

      // Простая проверка на схожесть по длине и первым словам
      if (Math.abs(content.length - otherContent.length) < 100) {
        const firstWords = content.substring(0, 200).toLowerCase();
        const otherFirstWords = otherContent.substring(0, 200).toLowerCase();

        if (firstWords === otherFirstWords) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Проверка актуальности по году
   */
  private checkOutdated(content: string, title: string): boolean {
    const currentYear = new Date().getFullYear();
    const yearMatch = (content + ' ' + title).match(/20(2[0-9]|3[0-9])/g);

    if (!yearMatch) {
      return true; // Нет года - возможно устарело
    }

    const years = yearMatch.map((y) => parseInt(y));
    const maxYear = Math.max(...years);

    // Если год старше текущего на 2+ года - устарело
    return currentYear - maxYear >= 2;
  }

  /**
   * Проверка на базовые/тестовые данные
   */
  private isBasicData(content: string, title: string): boolean {
    const lowerContent = content.toLowerCase();
    const lowerTitle = title.toLowerCase();

    // Признаки базовых данных
    const basicPhrases = [
      'это тестовый документ',
      'тестовая компания',
      'одна из ведущих страховых компаний россии',
      'предоставляет широкий спектр',
      'базовый продукт',
      'базовая информация',
    ];

    for (const phrase of basicPhrases) {
      if (lowerContent.includes(phrase) || lowerTitle.includes(phrase)) {
        return true;
      }
    }

    // Проверка на очень короткий и общий текст
    if (content.length < 200 && !content.includes('руб') && !content.includes('₽')) {
      return true;
    }

    return false;
  }

  /**
   * Массовое удаление документов
   */
  async deleteDocuments(docIds: string[]): Promise<{ deleted: number }> {
    let deleted = 0;

    for (const docId of docIds) {
      try {
        // Удаляем чанки
        await this.prisma.kBChunk.deleteMany({
          where: { docId },
        });

        // Удаляем документ
        await this.prisma.kBDoc.delete({
          where: { id: docId },
        });

        deleted++;
      } catch (error) {
        this.logger.error(`Error deleting document ${docId}:`, error);
      }
    }

    this.logger.log(`Deleted ${deleted} documents`);
    return { deleted };
  }

  /**
   * Получение потока прогресса для анализа
   */
  getAnalysisProgressStream(analysisId: string): Observable<any> {
    this.logger.log(`Creating simple analysis progress stream for: ${analysisId}`);
    
    return new Observable(observer => {
      // Сохраняем observer для отправки сообщений
      this.analysisStreams.set(analysisId, observer);
      
      // Отправляем начальное сообщение
      observer.next({
        data: JSON.stringify({
          step: 'waiting',
          progress: 0,
          message: 'Ожидание начала анализа...',
          details: { analysisId }
        })
      });
      
      return () => {
        this.analysisStreams.delete(analysisId);
        this.logger.log(`Cleaned up SSE stream for analysis: ${analysisId}`);
      };
    });
  }

  /**
   * Отправка прогресса анализа
   */
  public sendAnalysisProgress(analysisId: string, data: {
    step: string;
    progress: number;
    message: string;
    details?: any;
  }): void {
    const observer = this.analysisStreams.get(analysisId);
    if (observer) {
      const sseData = {
        data: JSON.stringify(data)
      };
      this.logger.log(`Sending analysis progress for ${analysisId}:`, sseData);
      observer.next(sseData);
    } else {
      this.logger.warn(`No active SSE stream found for analysis: ${analysisId}`);
    }
  }

  /**
   * Извлечение дат начала действия документа
   */
  private extractEffectiveDates(content: string, title: string): {
    effectiveDate?: Date;
    versionDate?: Date;
  } {
    const result: { effectiveDate?: Date; versionDate?: Date } = {};

    try {
      // Паттерны для поиска дат начала действия
      const effectivePatterns = [
        /действует\s+с\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/gi,
        /вступает\s+в\s+силу\s+с\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/gi,
        /применяется\s+с\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/gi,
        /с\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})\s+года?\s+действует/gi,
      ];

      // Паттерны для версии документа
      const versionPatterns = [
        /версия\s+от\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/gi,
        /редакция\s+от\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/gi,
        /утверждено\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/gi,
      ];

      // Ищем в заголовке и содержимом
      const searchText = `${title} ${content}`;

      // Поиск даты начала действия
      for (const pattern of effectivePatterns) {
        const matches = searchText.match(pattern);
        if (matches && matches.length > 0) {
          const dateStr = matches[0].match(/(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/);
          if (dateStr) {
            const parsedDate = this.parseDate(dateStr[0]);
            if (parsedDate) {
              result.effectiveDate = parsedDate;
              break;
            }
          }
        }
      }

      // Поиск даты версии
      for (const pattern of versionPatterns) {
        const matches = searchText.match(pattern);
        if (matches && matches.length > 0) {
          const dateStr = matches[0].match(/(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/);
          if (dateStr) {
            const parsedDate = this.parseDate(dateStr[0]);
            if (parsedDate) {
              result.versionDate = parsedDate;
              break;
            }
          }
        }
      }

      // Если не нашли дату начала действия, но есть дата версии, используем её
      if (!result.effectiveDate && result.versionDate) {
        result.effectiveDate = result.versionDate;
      }

    } catch (error) {
      this.logger.warn('Error extracting effective dates:', error);
    }

    return result;
  }

  /**
   * Парсинг даты из строки
   */
  private parseDate(dateStr: string): Date | null {
    try {
      // Нормализуем разделители
      const normalized = dateStr.replace(/[-\/]/g, '.');
      const parts = normalized.split('.');
      
      if (parts.length === 3) {
        let day = parseInt(parts[0]);
        let month = parseInt(parts[1]);
        let year = parseInt(parts[2]);
        
        // Если год двузначный, добавляем 2000
        if (year < 100) {
          year += 2000;
        }
        
        // Проверяем валидность
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
          return new Date(year, month - 1, day);
        }
      }
    } catch (error) {
      this.logger.warn(`Error parsing date: ${dateStr}`, error);
    }
    
    return null;
  }

  /**
   * Анализ принадлежности документа к компании
   */
  private analyzeCompanyBelonging(content: string, title: string, currentCompany: string): {
    isCorrect: boolean;
    suggestedCompany?: string;
    confidence: number;
    reason: string;
  } {
    const companyKeywords = {
      'SOGAZ': ['согаз', 'согаз', 'СОГАЗ', 'sogaz', 'Sogaz'],
      'INGOSSTRAH': ['ингосстрах', 'ингос', 'ingosstrah', 'Ingosstrah', 'Ингосстрах'],
      'RESOGARANTIA': ['ресо', 'гарантия', 'ресо-гарантия', 'resogarantia', 'ResoGarantia', 'Ресо-Гарантия'],
      'VSK': ['вск', 'ВСК', 'vsk', 'VSK'],
      'ROSGOSSTRAH': ['росгосстрах', 'росгос', 'rosgosstrah', 'Rosgosstrah', 'Росгосстрах'],
      'TINKOFF': ['тинькофф', 'tinkoff', 'Tinkoff', 'Тинькофф'],
      'SBERBANK': ['сбербанк', 'сбер', 'sberbank', 'Sberbank', 'Сбербанк'],
      'ALFA': ['альфа', 'альфастрахование', 'alfa', 'Alfa', 'АльфаСтрахование'],
      'GENERAL': ['общие', 'правила', 'нормы', 'законодательство', 'федеральный', 'государственный']
    };

    const contentLower = content.toLowerCase();
    const titleLower = title.toLowerCase();
    
    // Подсчитываем упоминания каждой компании
    const companyMentions: { [key: string]: number } = {};
    
    for (const [company, keywords] of Object.entries(companyKeywords)) {
      let mentions = 0;
      for (const keyword of keywords) {
        const contentMatches = (contentLower.match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
        const titleMatches = (titleLower.match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
        mentions += contentMatches + titleMatches * 2; // Название важнее
      }
      companyMentions[company] = mentions;
    }

    // Находим компанию с наибольшим количеством упоминаний
    const bestMatch = Object.entries(companyMentions)
      .filter(([_, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)[0];

    if (!bestMatch) {
      return {
        isCorrect: currentCompany === 'GENERAL',
        suggestedCompany: 'GENERAL',
        confidence: 0.3,
        reason: 'Не найдено упоминаний конкретных страховых компаний'
      };
    }

    const [suggestedCompany, mentions] = bestMatch;
    const confidence = Math.min(0.9, mentions * 0.2);
    
    if (suggestedCompany === currentCompany) {
      return {
        isCorrect: true,
        confidence: confidence,
        reason: `Найдено ${mentions} упоминаний компании "${suggestedCompany}"`
      };
    } else {
      return {
        isCorrect: false,
        suggestedCompany: suggestedCompany,
        confidence: confidence,
        reason: `Найдено ${mentions} упоминаний "${suggestedCompany}", текущая: "${currentCompany}"`
      };
    }
  }

  /**
   * Анализ правильности названия документа
   */
  private analyzeTitleCorrectness(content: string, currentTitle: string, companyCode: string, productCode: string): {
    isCorrect: boolean;
    suggestedTitle?: string;
    confidence: number;
    reason: string;
  } {
    const titleLower = currentTitle.toLowerCase();
    
    // Проверяем, содержит ли название ключевые слова продукта
    const productKeywords = {
      'OSAGO': ['осаго', 'автогражданка', 'автострахование', 'автогражданская'],
      'KASKO': ['каско', 'добровольное', 'автострахование', 'автомобиль'],
      'MORTGAGE': ['ипотека', 'ипотечное', 'недвижимость', 'квартира'],
      'LIFE': ['жизнь', 'жизненное', 'смерть', 'инвалидность'],
      'HEALTH': ['здоровье', 'медицинское', 'дмс', 'лечение'],
      'TRAVEL': ['путешествие', 'туризм', 'выезд', 'заграница'],
      'PROPERTY': ['имущество', 'дом', 'квартира', 'недвижимость'],
      'LIABILITY': ['ответственность', 'ущерб', 'вред'],
      'COMPANY_INFO': ['компания', 'информация', 'о компании', 'услуги'],
      'PRICING': ['тарифы', 'цены', 'стоимость', 'расценки'],
      'GENERAL': ['правила', 'условия', 'общие', 'нормы']
    };

    const productKeywordsForCurrent = productKeywords[productCode] || [];
    const hasProductKeywords = productKeywordsForCurrent.some(keyword => 
      titleLower.includes(keyword.toLowerCase())
    );

    // Проверяем, содержит ли название ключевые слова компании
    const companyKeywords = {
      'SOGAZ': ['согаз'],
      'INGOSSTRAH': ['ингосстрах', 'ингос'],
      'RESOGARANTIA': ['ресо', 'гарантия'],
      'VSK': ['вск'],
      'ROSGOSSTRAH': ['росгосстрах', 'росгос'],
      'TINKOFF': ['тинькофф'],
      'SBERBANK': ['сбербанк', 'сбер'],
      'ALFA': ['альфа'],
      'GENERAL': ['общие', 'правила', 'нормы']
    };

    const companyKeywordsForCurrent = companyKeywords[companyCode] || [];
    const hasCompanyKeywords = companyKeywordsForCurrent.some(keyword => 
      titleLower.includes(keyword.toLowerCase())
    );

    // Генерируем предложенное название
    let suggestedTitle = currentTitle;
    
    if (!hasProductKeywords && productKeywordsForCurrent.length > 0) {
      const productKeyword = productKeywordsForCurrent[0];
      suggestedTitle = `${productKeyword.charAt(0).toUpperCase() + productKeyword.slice(1)} - ${currentTitle}`;
    }
    
    if (!hasCompanyKeywords && companyKeywordsForCurrent.length > 0 && companyCode !== 'GENERAL') {
      const companyKeyword = companyKeywordsForCurrent[0];
      suggestedTitle = `${companyKeyword.charAt(0).toUpperCase() + companyKeyword.slice(1)} ${suggestedTitle}`;
    }

    const issues: string[] = [];
    if (!hasProductKeywords) {
      issues.push('Название не содержит ключевых слов продукта');
    }
    if (!hasCompanyKeywords && companyCode !== 'GENERAL') {
      issues.push('Название не содержит ключевых слов компании');
    }

    const isCorrect = issues.length === 0;
    const confidence = isCorrect ? 0.9 : 0.6;

    return {
      isCorrect: isCorrect,
      suggestedTitle: suggestedTitle !== currentTitle ? suggestedTitle : undefined,
      confidence: confidence,
      reason: issues.length > 0 ? issues.join(', ') : 'Название соответствует содержанию'
    };
  }
}
