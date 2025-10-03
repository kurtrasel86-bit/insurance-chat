import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KbService } from '../kb/kb.service';
import { FileParserService } from '../file-upload/services/file-parser.service';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import { Observable } from 'rxjs';

export interface SourceChangeDetailed {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  changeType: string;
  description: string;
  oldContent?: string;
  newContent?: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);
  private sourcesProgressStreams = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly kbService: KbService,
    private readonly fileParser: FileParserService,
  ) {}

  /**
   * Добавление нового источника
   */
  async addSource(params: {
    url: string;
    checkFrequency?: 'hourly' | 'daily' | 'weekly' | 'manual';
  }) {
    // Автоматическое определение типа источника
    const type = this.detectSourceType(params.url);
    
    // Автоматическое определение компании из URL
    const companyCode = this.detectCompanyFromUrl(params.url);
    
    // Генерация названия
    const name = this.generateSourceName(params.url, companyCode, type);

    return this.prisma.source.create({
      data: {
        name,
        url: params.url,
        type,
        companyCode,
        productCode: null, // Не указываем продукт - на странице могут быть разные
        checkFrequency: params.checkFrequency || 'daily',
      },
    });
  }

  /**
   * Определение типа источника по URL
   */
  private detectSourceType(url: string): string {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf?')) {
      return 'pdf';
    }
    if (lowerUrl.includes('/news') || lowerUrl.includes('/novosti') || lowerUrl.includes('/article')) {
      return 'news';
    }
    
    return 'webpage';
  }

  /**
   * Определение компании из URL
   */
  private detectCompanyFromUrl(url: string): string | undefined {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('sogaz.ru')) return 'SOGAZ';
    if (lowerUrl.includes('ingos.ru')) return 'INGOSSTRAH';
    if (lowerUrl.includes('reso.ru')) return 'RESOGARANTIA';
    if (lowerUrl.includes('vsk.ru')) return 'VSK';
    if (lowerUrl.includes('rgs.ru')) return 'ROSGOSSTRAH';
    if (lowerUrl.includes('tinkoff')) return 'TINKOFF';
    if (lowerUrl.includes('sberbank')) return 'SBERBANK';
    if (lowerUrl.includes('alfastrah.ru') || lowerUrl.includes('alfainsurance')) return 'ALFA';

    return undefined;
  }

  /**
   * Генерация названия источника
   */
  private generateSourceName(url: string, companyCode?: string, type?: string): string {
    const companyNames: Record<string, string> = {
      'SOGAZ': 'СОГАЗ',
      'INGOSSTRAH': 'Ингосстрах',
      'RESOGARANTIA': 'Ресо-Гарантия',
      'VSK': 'ВСК',
      'ROSGOSSTRAH': 'Росгосстрах',
      'TINKOFF': 'Тинькофф',
      'SBERBANK': 'Сбербанк',
      'ALFA': 'АльфаСтрахование',
    };

    const typeNames: Record<string, string> = {
      'pdf': 'PDF документ',
      'news': 'Новости',
      'webpage': 'Страница',
    };

    const company = companyCode ? companyNames[companyCode] : 'Неизвестная компания';
    const typeName = type ? typeNames[type] : 'Источник';

    // Пытаемся извлечь описание из URL
    const urlParts = url.split('/').filter(p => p && p !== 'https:' && p !== 'http:');
    const lastPart = urlParts[urlParts.length - 1] || '';
    
    if (lastPart.endsWith('.pdf')) {
      const pdfName = lastPart.replace('.pdf', '').replace(/_/g, ' ').replace(/-/g, ' ');
      return `${company} - ${pdfName}`;
    }

    return `${typeName} - ${company}`;
  }

  /**
   * Получение всех источников
   */
  async listSources(filters?: { type?: string; companyCode?: string; isActive?: boolean }) {
    return this.prisma.source.findMany({
      where: {
        ...(filters?.type && { type: filters.type }),
        ...(filters?.companyCode && { companyCode: filters.companyCode }),
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
      },
      include: {
        _count: {
          select: { changes: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Удаление источника
   */
  async deleteSource(sourceId: string) {
    return this.prisma.source.delete({
      where: { id: sourceId },
    });
  }

  /**
   * Обновление источника
   */
  async updateSource(sourceId: string, updates: {
    name?: string;
    url?: string;
    isActive?: boolean;
    checkFrequency?: string;
  }) {
    return this.prisma.source.update({
      where: { id: sourceId },
      data: updates,
    });
  }

  /**
   * Проверка всех активных источников на изменения
   */
  async checkAllSources(): Promise<{ checked: number; changesFound: number }> {
    this.logger.log('Checking all active sources for changes');

    const sources = await this.prisma.source.findMany({
      where: { isActive: true },
    });

    let checked = 0;
    let changesFound = 0;

    for (const source of sources) {
      try {
        const changes = await this.checkSourceForChanges(source.id);
        checked++;
        changesFound += changes.length;
      } catch (error) {
        this.logger.error(`Error checking source ${source.name}:`, error.message);
      }
    }

    this.logger.log(`Checked ${checked} sources, found ${changesFound} changes`);
    return { checked, changesFound };
  }

  /**
   * Проверка конкретного источника на изменения
   */
  async checkSourceForChanges(sourceId: string): Promise<SourceChangeDetailed[]> {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new Error('Source not found');
    }

    this.logger.log(`Checking source: ${source.name} (${source.url})`);

    let changes: SourceChangeDetailed[] = [];

    try {
      if (source.type === 'pdf') {
        changes = await this.checkPDFSource(source);
      } else if (source.type === 'news') {
        changes = await this.checkNewsSource(source);
      } else if (source.type === 'webpage') {
        changes = await this.checkWebPageSource(source);
      }

      // Обновляем время последней проверки
      await this.prisma.source.update({
        where: { id: sourceId },
        data: { lastChecked: new Date() },
      });

    } catch (error) {
      this.logger.error(`Error checking source ${source.name}:`, error.message);
    }

    return changes;
  }

  /**
   * Проверка PDF источника
   */
  private async checkPDFSource(source: any): Promise<SourceChangeDetailed[]> {
    const changes: SourceChangeDetailed[] = [];

    try {
      // Проверяем доступность PDF
      const response = await axios.head(source.url, { timeout: 10000 });
      const lastModified = response.headers['last-modified'];
      const contentLength = response.headers['content-length'];

      // Создаём hash для отслеживания изменений
      const currentHash = crypto.createHash('md5')
        .update(`${lastModified}-${contentLength}`)
        .digest('hex');

      // Если hash изменился - PDF обновился
      if (source.contentHash && currentHash !== source.contentHash) {
        const change = await this.prisma.sourceChange.create({
          data: {
            sourceId: source.id,
            changeType: 'pdf_updated',
            description: `PDF файл обновлён. Новая версия доступна по ссылке: ${source.url}`,
            newContent: `Last-Modified: ${lastModified}`,
            oldContent: source.lastModified?.toISOString(),
            status: 'pending',
          },
        });

        changes.push({
          id: change.id,
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: source.url,
          changeType: change.changeType,
          description: change.description,
          oldContent: change.oldContent || undefined,
          newContent: change.newContent || undefined,
          status: change.status,
          createdAt: change.createdAt,
        });

        // Обновляем hash
        await this.prisma.source.update({
          where: { id: source.id },
          data: {
            contentHash: currentHash,
            lastModified: lastModified ? new Date(lastModified) : new Date(),
          },
        });
      }

    } catch (error) {
      this.logger.error(`Error checking PDF source:`, error.message);
    }

    return changes;
  }

  /**
   * Проверка новостного источника
   */
  private async checkNewsSource(source: any): Promise<SourceChangeDetailed[]> {
    const changes: SourceChangeDetailed[] = [];

    try {
      const response = await axios.get(source.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);

      // Ищем новости (расширенные селекторы для разных сайтов)
      const newsSelectors = [
        'article',
        '.news-item',
        '.article',
        '.news-card',
        '.article-card',
        '.post',
        '.entry',
        '[class*="news"]',
        '[class*="article"]',
        '[class*="post"]',
        '[class*="entry"]',
        '.item',
        '.list-item',
        'li[class*="news"]',
        'li[class*="article"]',
        '.content-item',
        '.news-list .item',
        '.article-list .item'
      ];

      const newsItems: Array<{ title: string; link: string; content: string }> = [];

      for (const selector of newsSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          elements.each((_, el) => {
            const $el = $(el);
            
            // Ищем заголовок в различных элементах
            const titleSelectors = [
              'h1', 'h2', 'h3', 'h4',
              '.title', '.heading', '.headline',
              '.news-title', '.article-title',
              '.post-title', '.entry-title',
              'a[title]', 'a'
            ];
            
            let title = '';
            let link = '';
            
            for (const titleSelector of titleSelectors) {
              const titleEl = $el.find(titleSelector).first();
              if (titleEl.length > 0) {
                title = titleEl.text().trim();
                // Если это ссылка, берем и href
                if (titleEl.is('a')) {
                  link = titleEl.attr('href') || '';
                }
                break;
              }
            }
            
            // Если не нашли заголовок, ищем в ссылках
            if (!title) {
              const linkEl = $el.find('a').first();
              if (linkEl.length > 0) {
                title = linkEl.text().trim();
                link = linkEl.attr('href') || '';
              }
            }
            
            // Если все еще нет ссылки, ищем любую ссылку в элементе
            if (!link) {
              link = $el.find('a').first().attr('href') || '';
            }
            
            // Извлекаем контент (исключаем навигацию и рекламу)
            $el.find('nav, .menu, .sidebar, .advertisement, .ads').remove();
            const content = $el.text().trim().substring(0, 500);

            if (title && title.length > 10 && !title.includes('©') && !title.includes('Все права')) {
              newsItems.push({
                title,
                link: link ? new URL(link, source.url).href : source.url,
                content,
              });
            }
          });

          if (newsItems.length > 0) break;
        }
      }

      // Если не нашли новости напрямую, ищем ссылки на новости
      if (newsItems.length === 0) {
        this.logger.log('No direct news found, looking for news links...');
        const newsLinks = this.findNewsLinks($, source.url);
        this.logger.log(`Found ${newsLinks.length} news links`);
        
        // Обрабатываем каждую ссылку на новость
        for (const newsLink of newsLinks.slice(0, 10)) {
          try {
            const newsContent = await this.fetchNewsContent(newsLink.url);
            if (newsContent) {
              newsItems.push({
                title: newsContent.title,
                link: newsLink.url,
                content: newsContent.content
              });
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch news from ${newsLink.url}: ${error.message}`);
          }
        }
      }

      // Проверяем каждую новость на новизну (увеличиваем лимит)
      this.logger.log(`Found ${newsItems.length} news items, processing up to 20`);
      for (const news of newsItems.slice(0, 20)) {
        const newsHash = crypto.createHash('md5').update(news.title).digest('hex');

        // Проверяем, видели ли мы эту новость раньше
        const existingChange = await this.prisma.sourceChange.findFirst({
          where: {
            sourceId: source.id,
            newContent: { contains: newsHash },
          },
        });

        if (!existingChange) {
          const change = await this.prisma.sourceChange.create({
            data: {
              sourceId: source.id,
              changeType: 'new_article',
              description: `Новая статья: ${news.title}`,
              newContent: `${newsHash}|${news.link}|${news.content}`,
              status: 'pending',
            },
          });

          changes.push({
            id: change.id,
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            changeType: change.changeType,
            description: change.description,
            newContent: change.newContent || undefined,
            status: change.status,
            createdAt: change.createdAt,
          });
        }
      }

    } catch (error) {
      this.logger.error(`Error checking news source:`, error.message);
    }

    return changes;
  }

  /**
   * Проверка веб-страницы (может содержать PDF и статьи)
   */
  private async checkWebPageSource(source: any): Promise<SourceChangeDetailed[]> {
    const changes: SourceChangeDetailed[] = [];

    try {
      const response = await axios.get(source.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);

      // 1. Ищем PDF файлы на странице (БЕЗ ОГРАНИЧЕНИЙ)
      const pdfLinks = $('a[href$=".pdf"], a[href*=".pdf?"]');
      
      this.logger.log(`Found ${pdfLinks.length} PDF links on page`);
      
      for (let i = 0; i < pdfLinks.length; i++) {
        const link = $(pdfLinks[i]).attr('href');
        if (!link) continue;

        const fullUrl = new URL(link, source.url).href;
        const linkText = $(pdfLinks[i]).text().trim() || 'PDF документ';

        // Проверяем, видели ли мы этот PDF раньше
        const pdfHash = crypto.createHash('md5').update(fullUrl).digest('hex');
        const existingChange = await this.prisma.sourceChange.findFirst({
          where: {
            sourceId: source.id,
            newContent: { contains: pdfHash },
          },
        });

        if (!existingChange) {
          const change = await this.prisma.sourceChange.create({
            data: {
              sourceId: source.id,
              changeType: 'pdf_found',
              description: `Найден PDF: ${linkText}`,
              newContent: `${pdfHash}|${fullUrl}|${linkText}`,
              status: 'pending',
            },
          });

          changes.push({
            id: change.id,
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            changeType: change.changeType,
            description: change.description,
            newContent: change.newContent || undefined,
            status: change.status,
            createdAt: change.createdAt,
          });
        }
      }

      // 2. Ищем статьи/новости на странице (БЕЗ ОГРАНИЧЕНИЙ)
      const articleSelectors = [
        'article',
        '.news-item',
        '.article-item',
        '.news-card',
        '.article-card',
        '.post',
        '.entry',
        '[class*="news"]',
        '[class*="article"]',
        '[class*="post"]',
        '[class*="entry"]',
        '.item',
        '.list-item',
        'li[class*="news"]',
        'li[class*="article"]',
        '.content-item',
        '.news-list .item',
        '.article-list .item'
      ];

      for (const selector of articleSelectors) {
        const articles = $(selector);
        
        if (articles.length > 0) {
          this.logger.log(`Found ${articles.length} articles on page`);
          
          for (let i = 0; i < articles.length; i++) {
            const $article = $(articles[i]);
            
            // Ищем заголовок в различных элементах
            const titleSelectors = [
              'h1', 'h2', 'h3', 'h4',
              '.title', '.heading', '.headline',
              '.news-title', '.article-title',
              '.post-title', '.entry-title',
              'a[title]', 'a'
            ];
            
            let title = '';
            let link = '';
            
            for (const titleSelector of titleSelectors) {
              const titleEl = $article.find(titleSelector).first();
              if (titleEl.length > 0) {
                title = titleEl.text().trim();
                // Если это ссылка, берем и href
                if (titleEl.is('a')) {
                  link = titleEl.attr('href') || '';
                }
                break;
              }
            }
            
            // Если не нашли заголовок, ищем в ссылках
            if (!title) {
              const linkEl = $article.find('a').first();
              if (linkEl.length > 0) {
                title = linkEl.text().trim();
                link = linkEl.attr('href') || '';
              }
            }
            
            // Если все еще нет ссылки, ищем любую ссылку в элементе
            if (!link) {
              link = $article.find('a').first().attr('href') || '';
            }
            
            // Извлекаем контент (исключаем навигацию и рекламу)
            $article.find('nav, .menu, .sidebar, .advertisement, .ads').remove();
            const content = $article.text().trim().substring(0, 500);

            if (title && title.length > 10 && !title.includes('©') && !title.includes('Все права')) {
              const articleHash = crypto.createHash('md5').update(title).digest('hex');
              const existingChange = await this.prisma.sourceChange.findFirst({
                where: {
                  sourceId: source.id,
                  newContent: { contains: articleHash },
                },
              });

              if (!existingChange) {
                const fullLink = link ? new URL(link, source.url).href : source.url;
                
                const change = await this.prisma.sourceChange.create({
                  data: {
                    sourceId: source.id,
                    changeType: 'article_found',
                    description: `Найдена статья: ${title}`,
                    newContent: `${articleHash}|${fullLink}|${content}`,
                    status: 'pending',
                  },
                });

                changes.push({
                  id: change.id,
                  sourceId: source.id,
                  sourceName: source.name,
                  sourceUrl: source.url,
                  changeType: change.changeType,
                  description: change.description,
                  newContent: change.newContent || undefined,
                  status: change.status,
                  createdAt: change.createdAt,
                });
              }
            }
          }
          break; // Нашли статьи, прекращаем поиск
        }
      }
      
      // Если не нашли статьи напрямую, ищем ссылки на новости
      if (changes.length === 0) {
        this.logger.log('No direct articles found, looking for news links...');
        const newsLinks = this.findNewsLinks($, source.url);
        this.logger.log(`Found ${newsLinks.length} news links on webpage`);
        
        // Обрабатываем каждую ссылку на новость
        for (const newsLink of newsLinks.slice(0, 10)) {
          try {
            const newsContent = await this.fetchNewsContent(newsLink.url);
            if (newsContent) {
              const articleHash = crypto.createHash('md5').update(newsContent.title).digest('hex');
              const existingChange = await this.prisma.sourceChange.findFirst({
                where: {
                  sourceId: source.id,
                  newContent: { contains: articleHash },
                },
              });

              if (!existingChange) {
                const change = await this.prisma.sourceChange.create({
                  data: {
                    sourceId: source.id,
                    changeType: 'article_found',
                    description: `Найдена статья: ${newsContent.title}`,
                    newContent: `${articleHash}|${newsLink.url}|${newsContent.content}`,
                    status: 'pending',
                  },
                });

                changes.push({
                  id: change.id,
                  sourceId: source.id,
                  sourceName: source.name,
                  sourceUrl: source.url,
                  changeType: change.changeType,
                  description: change.description,
                  newContent: change.newContent || undefined,
                  status: change.status,
                  createdAt: change.createdAt,
                });
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch news from ${newsLink.url}: ${error.message}`);
          }
        }
      }

    } catch (error) {
      this.logger.error(`Error checking webpage source:`, error.message);
    }

    return changes;
  }

  /**
   * Получение всех изменений (ожидающих проверки)
   */
  async getPendingChanges(): Promise<SourceChangeDetailed[]> {
    const changes = await this.prisma.sourceChange.findMany({
      where: { status: 'pending' },
      include: {
        source: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return changes.map(change => ({
      id: change.id,
      sourceId: change.sourceId,
      sourceName: change.source.name,
      sourceUrl: change.source.url,
      changeType: change.changeType,
      description: change.description,
      oldContent: change.oldContent || undefined,
      newContent: change.newContent || undefined,
      status: change.status,
      createdAt: change.createdAt,
    }));
  }

  /**
   * Одобрение изменения и скачивание/обработка
   */
  async approveChange(changeId: string): Promise<{ success: boolean; message: string }> {
    const change = await this.prisma.sourceChange.findUnique({
      where: { id: changeId },
      include: { source: true },
    });

    if (!change) {
      throw new Error('Change not found');
    }

    const source = change.source;

    try {
      // Обрабатываем в зависимости от типа изменения
      if (change.changeType === 'pdf_found') {
        // Извлекаем URL PDF из newContent
        const parts = change.newContent?.split('|') || [];
        const pdfUrl = parts[1];
        const pdfTitle = parts[2] || 'PDF документ';
        
        if (pdfUrl) {
          await this.downloadAndProcessPDF(pdfUrl, pdfTitle, source);
        }
      } else if (change.changeType === 'article_found') {
        await this.processNewsArticle(change, source);
      } else if (source.type === 'pdf') {
        // Прямая ссылка на PDF
        await this.downloadAndProcessPDF(source.url, source.name, source);
      } else if (source.type === 'webpage') {
        await this.processWebPage(source);
      }

      // Обновляем статус изменения
      await this.prisma.sourceChange.update({
        where: { id: changeId },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          appliedAt: new Date(),
        },
      });

      return { success: true, message: 'Change approved and processed' };

    } catch (error) {
      this.logger.error(`Error approving change:`, error.message);
      throw error;
    }
  }

  /**
   * Массовое одобрение всех ожидающих изменений
   */
  async approveAllPendingChanges(): Promise<{ approved: number; failed: number }> {
    const pendingChanges = await this.prisma.sourceChange.findMany({
      where: { status: 'pending' },
      include: { source: true },
    });

    let approved = 0;
    let failed = 0;

    for (const change of pendingChanges) {
      try {
        await this.approveChange(change.id);
        approved++;
        this.logger.log(`Approved change ${change.id}: ${change.description}`);
      } catch (error) {
        failed++;
        this.logger.error(`Failed to approve change ${change.id}: ${error.message}`);
      }
    }

    return { approved, failed };
  }

  /**
   * Массовое одобрение с детальным прогрессом
   */
  async approveAllPendingChangesWithProgress(changeIds?: string[]): Promise<{
    total: number;
    approved: number;
    failed: number;
    results: Array<{
      id: string;
      description: string;
      status: 'success' | 'error';
      message?: string;
      progress: number;
    }>;
  }> {
    // Получаем изменения для обработки
    const whereClause = changeIds && changeIds.length > 0 
      ? { status: 'pending' as const, id: { in: changeIds } }
      : { status: 'pending' as const };

    const pendingChanges = await this.prisma.sourceChange.findMany({
      where: whereClause,
      include: { source: true },
    });

    const total = pendingChanges.length;
    let approved = 0;
    let failed = 0;
    const results: Array<{
      id: string;
      description: string;
      status: 'success' | 'error';
      message?: string;
      progress: number;
    }> = [];

    this.logger.log(`Starting batch approval of ${total} changes`);

    for (let i = 0; i < pendingChanges.length; i++) {
      const change = pendingChanges[i];
      const progress = Math.round(((i + 1) / total) * 100);

      try {
        await this.approveChange(change.id);
        approved++;
        
        results.push({
          id: change.id,
          description: change.description,
          status: 'success',
          message: 'Успешно обработано',
          progress,
        });

        this.logger.log(`✅ [${i + 1}/${total}] Approved: ${change.description}`);
      } catch (error) {
        failed++;
        
        results.push({
          id: change.id,
          description: change.description,
          status: 'error',
          message: error.message,
          progress,
        });

        this.logger.error(`❌ [${i + 1}/${total}] Failed: ${change.description} - ${error.message}`);
      }
    }

    this.logger.log(`Batch approval completed: ${approved} approved, ${failed} failed`);

    return { total, approved, failed, results };
  }

  /**
   * Отклонение изменения
   */
  async rejectChange(changeId: string): Promise<{ success: boolean }> {
    await this.prisma.sourceChange.update({
      where: { id: changeId },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Скачивание и обработка PDF
   */
  private async downloadAndProcessPDF(pdfUrl: string, pdfTitle: string, source: any): Promise<void> {
    try {
      this.logger.log(`Downloading PDF from: ${pdfUrl}`);
      
      const response = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      // Создаём папку если её нет
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Сохраняем PDF
      const filename = `source-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;
      const filepath = path.join(uploadsDir, filename);
      const buffer = Buffer.from(response.data);
      fs.writeFileSync(filepath, buffer);

      this.logger.log(`PDF saved: ${filepath}`);

      // Извлекаем текст из PDF
      const pdfData = await pdfParse(buffer);
      const extractedText = pdfData.text;

      this.logger.log(`PDF text extracted: ${extractedText.length} chars`);

      // Определяем компанию и продукт
      const detectedData = this.fileParser.detectCompanyAndProduct(extractedText, pdfTitle);
      const companyCode = detectedData.companyCode || source.companyCode || 'UNKNOWN';
      const productCode = detectedData.productCode || 'GENERAL';

      // Генерируем русское название
      const russianTitle = this.fileParser.generateRussianTitle({
        originalFilename: pdfTitle,
        extractedText,
        companyCode,
        productCode,
        documentType: this.fileParser.detectDocumentType(extractedText, pdfTitle),
      });

      this.logger.log(`Generated title: ${russianTitle}`);

      // Добавляем в KB
      await this.kbService.addDocument({
        companyCode,
        productCode,
        title: russianTitle,
        content: extractedText,
        sourceUrl: pdfUrl,
        fileUrl: `/admin/files/download/${filename}`,
        version: new Date().toISOString(),
      });

      this.logger.log(`✅ PDF added to KB: ${russianTitle}`);

    } catch (error) {
      this.logger.error(`Error downloading/processing PDF:`, error.message);
      throw error;
    }
  }

  /**
   * Обработка новостной статьи
   */
  private async processNewsArticle(change: any, source: any): Promise<void> {
    try {
      // Парсим данные из newContent
      const parts = change.newContent?.split('|') || [];
      const link = parts[1] || source.url;
      const preview = parts[2] || '';

      this.logger.log(`Processing article from: ${link}`);

      // Загружаем полный текст статьи
      const response = await axios.get(link, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);
      
      // Извлекаем контент статьи
      $('script, style, nav, header, footer, aside, .menu, .sidebar').remove();
      const title = $('h1').first().text().trim() || change.description.replace('Найдена статья: ', '');
      const content = $('article, .article-content, .news-content, main, .content').first().text()
        .replace(/\s+/g, ' ')
        .trim();

      if (!content || content.length < 100) {
        throw new Error('Article content too short or empty');
      }

      this.logger.log(`Article extracted: ${title} (${content.length} chars)`);

      // Определяем компанию и продукт
      const detectedData = this.fileParser.detectCompanyAndProduct(content, title);
      const companyCode = detectedData.companyCode || source.companyCode || 'UNKNOWN';
      const productCode = detectedData.productCode || 'GENERAL';

      // Добавляем в KB
      await this.kbService.addDocument({
        companyCode,
        productCode,
        title,
        content,
        sourceUrl: link,
        version: new Date().toISOString(),
      });

      this.logger.log(`✅ Article added to KB: ${title}`);

    } catch (error) {
      this.logger.error(`Error processing news article:`, error.message);
      throw error;
    }
  }

  /**
   * Обработка веб-страницы
   */
  private async processWebPage(source: any): Promise<void> {
    try {
      const response = await axios.get(source.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);
      
      $('script, style, nav, header, footer').remove();
      const content = $('main, .content, body').first().text()
        .replace(/\s+/g, ' ')
        .trim();

      this.logger.log(`Processed webpage: ${source.url}`);

    } catch (error) {
      this.logger.error(`Error processing webpage:`, error.message);
    }
  }

  /**
   * Поиск ссылок на новости на странице
   */
  private findNewsLinks($: cheerio.Root, baseUrl: string): Array<{ title: string; url: string }> {
    const newsLinks: Array<{ title: string; url: string }> = [];
    
    // Ищем ссылки, которые могут вести на новости
    const linkSelectors = [
      'a[href*="/news/"]',
      'a[href*="/novosti/"]',
      'a[href*="/article/"]',
      'a[href*="/press/"]',
      'a[href*="/media/"]',
      'a[href*="/about/news/"]',
      'a[href*="/company/news/"]',
      'a[href*="/press-center/"]',
      'a[href*="/pressroom/"]',
      'a[href*="/press-releases/"]',
      'a[href*="/press-releases"]',
      'a[href*="/press_releases/"]',
      'a[href*="/press_releases"]',
      'a[href*="/announcements/"]',
      'a[href*="/announcements"]',
      'a[class*="news"]',
      'a[class*="article"]',
      'a[class*="press"]',
      'a[title*="новост"]',
      'a[title*="стать"]',
      'a[title*="пресс"]',
      'a[title*="анонс"]',
      'a[title*="объявлен"]'
    ];
    
    for (const selector of linkSelectors) {
      const links = $(selector);
      links.each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = $el.text().trim() || $el.attr('title') || '';
        
        if (href && title && title.length > 5) {
          try {
            const fullUrl = new URL(href, baseUrl).href;
            // Проверяем, что это действительно ссылка на новость
            if (this.isNewsUrl(fullUrl, title)) {
              newsLinks.push({ title, url: fullUrl });
            }
          } catch (error) {
            // Игнорируем невалидные URL
          }
        }
      });
    }
    
    // Если не нашли ссылки по специальным селекторам, ищем все ссылки
    if (newsLinks.length === 0) {
      this.logger.log('No news links found with specific selectors, searching all links...');
      
      const allLinks = $('a[href]');
      allLinks.each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = $el.text().trim() || $el.attr('title') || '';
        
        if (href && title && title.length > 5) {
          try {
            const fullUrl = new URL(href, baseUrl).href;
            // Проверяем, что это внутренняя ссылка и может быть новостью
            if (this.isInternalNewsUrl(fullUrl, baseUrl, title)) {
              newsLinks.push({ title, url: fullUrl });
            }
          } catch (error) {
            // Игнорируем невалидные URL
          }
        }
      });
    }
    
    // Убираем дубликаты
    const uniqueLinks = newsLinks.filter((link, index, self) => 
      index === self.findIndex(l => l.url === link.url)
    );
    
    return uniqueLinks;
  }
  
  /**
   * Проверка, является ли внутренняя ссылка потенциальной новостью
   */
  private isInternalNewsUrl(url: string, baseUrl: string, title: string): boolean {
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(baseUrl);
      
      // Проверяем, что это внутренняя ссылка
      if (urlObj.hostname !== baseUrlObj.hostname) {
        return false;
      }
      
      // Исключаем служебные страницы
      const excludePaths = [
        '/about/', '/contact/', '/offices/', '/careers/', '/jobs/',
        '/privacy/', '/terms/', '/cookies/', '/sitemap/', '/search/',
        '/login/', '/register/', '/profile/', '/account/', '/cart/',
        '/checkout/', '/payment/', '/order/', '/support/', '/help/',
        '/faq/', '/documents/', '/files/', '/downloads/', '/legal/'
      ];
      
      if (excludePaths.some(path => urlObj.pathname.startsWith(path))) {
        return false;
      }
      
      // Проверяем по ключевым словам в URL и заголовке
      const lowerUrl = url.toLowerCase();
      const lowerTitle = title.toLowerCase();
      
      const newsKeywords = [
        'news', 'novosti', 'article', 'press', 'media',
        'новост', 'стать', 'пресс', 'медиа', 'анонс',
        'объявлен', 'press-release', 'press_release',
        'announcement', 'announcements', '2024', '2025'
      ];
      
      return newsKeywords.some(keyword => 
        lowerUrl.includes(keyword) || lowerTitle.includes(keyword)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Проверка, является ли URL ссылкой на новость
   */
  private isNewsUrl(url: string, title: string): boolean {
    const lowerUrl = url.toLowerCase();
    const lowerTitle = title.toLowerCase();
    
    const newsKeywords = [
      'news', 'novosti', 'article', 'press', 'media',
      'новост', 'стать', 'пресс', 'медиа', 'анонс',
      'объявлен', 'press-release', 'press_release',
      'announcement', 'announcements'
    ];
    
    return newsKeywords.some(keyword => 
      lowerUrl.includes(keyword) || lowerTitle.includes(keyword)
    );
  }
  
  /**
   * Загрузка контента новости по URL
   */
  private async fetchNewsContent(url: string): Promise<{ title: string; content: string } | null> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      const $ = cheerio.load(response.data);
      
      // Удаляем ненужные элементы
      $('script, style, nav, header, footer, aside, .menu, .sidebar, .advertisement, .ads').remove();
      
      // Ищем заголовок
      const titleSelectors = [
        'h1', 'h2', '.title', '.heading', '.headline',
        '.news-title', '.article-title', '.post-title'
      ];
      
      let title = '';
      for (const selector of titleSelectors) {
        const titleEl = $(selector).first();
        if (titleEl.length > 0) {
          title = titleEl.text().trim();
          if (title && title.length > 5) break;
        }
      }
      
      // Ищем контент
      const contentSelectors = [
        'article', '.article-content', '.news-content', 
        '.post-content', '.entry-content', 'main', '.content'
      ];
      
      let content = '';
      for (const selector of contentSelectors) {
        const contentEl = $(selector).first();
        if (contentEl.length > 0) {
          content = contentEl.text().replace(/\s+/g, ' ').trim();
          if (content && content.length > 100) break;
        }
      }
      
      // Если не нашли контент в специальных селекторах, берем весь body
      if (!content) {
        content = $('body').text().replace(/\s+/g, ' ').trim();
      }
      
      if (title && content && content.length > 100) {
        return { title, content: content.substring(0, 2000) };
      }
      
      return null;
    } catch (error) {
      this.logger.warn(`Error fetching news content from ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * Создание SSE потока для детального прогресса источников
   */
  getSourcesProgressStream(progressId: string): Observable<any> {
    this.logger.log(`Creating sources progress stream for: ${progressId}`);
    return new Observable(observer => {
      this.sourcesProgressStreams.set(progressId, observer);
      observer.next({
        data: JSON.stringify({
          step: 'waiting',
          progress: 0,
          message: 'Ожидание начала скачивания...',
          details: { progressId }
        })
      });
      return () => {
        this.sourcesProgressStreams.delete(progressId);
        this.logger.log(`Cleaned up sources SSE stream for: ${progressId}`);
      };
    });
  }

  /**
   * Отправка прогресса источников
   */
  private sendSourcesProgress(progressId: string, data: {
    step: string;
    progress: number;
    message: string;
    details?: any;
  }): void {
    const observer = this.sourcesProgressStreams.get(progressId);
    if (observer) {
      const sseData = {
        data: JSON.stringify(data)
      };
      this.logger.log(`Sending sources progress for ${progressId}:`, sseData);
      observer.next(sseData);
    } else {
      this.logger.warn(`No active sources SSE stream found for: ${progressId}`);
    }
  }

  /**
   * Одобрение изменений с детальным прогрессом
   */
  async approveChangesWithDetailedProgress(progressId: string, changeIds: string[]): Promise<void> {
    this.logger.log(`Starting detailed sources approval for ${progressId} with ${changeIds.length} changes`);

    try {
      // Получаем изменения для обработки
      const pendingChanges = await this.prisma.sourceChange.findMany({
        where: { 
          status: 'pending',
          id: { in: changeIds }
        },
        include: { source: true },
      });

      this.sendSourcesProgress(progressId, {
        step: 'start',
        progress: 0,
        message: `Начинаем обработку ${pendingChanges.length} источников...`,
        details: { 
          total: pendingChanges.length,
          current: 0
        }
      });

      let processed = 0;
      let downloaded = 0;
      let errors = 0;

      for (let i = 0; i < pendingChanges.length; i++) {
        const change = pendingChanges[i];
        const progress = Math.round(((i + 1) / pendingChanges.length) * 100);

        this.sendSourcesProgress(progressId, {
          step: 'downloading',
          progress,
          message: `Скачиваем: ${change.description}`,
          details: {
            currentSource: change.description,
            status: 'Скачивание...',
            current: i + 1,
            total: pendingChanges.length,
            downloaded,
            processed,
            errors
          }
        });

        try {
          // Обрабатываем изменение
          await this.approveChange(change.id);
          downloaded++;
          processed++;

          this.sendSourcesProgress(progressId, {
            step: 'processing',
            progress,
            message: `Обработано: ${change.description}`,
            details: {
              currentSource: change.description,
              status: 'Обработано успешно',
              current: i + 1,
              total: pendingChanges.length,
              downloaded,
              processed,
              errors
            }
          });

        } catch (error) {
          errors++;
          this.logger.error(`Error processing change ${change.id}:`, error);

          this.sendSourcesProgress(progressId, {
            step: 'processing',
            progress,
            message: `Ошибка: ${change.description}`,
            details: {
              currentSource: change.description,
              status: `Ошибка: ${error.message}`,
              current: i + 1,
              total: pendingChanges.length,
              downloaded,
              processed,
              errors
            }
          });
        }

        // Небольшая пауза для визуализации прогресса
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Завершение
      this.sendSourcesProgress(progressId, {
        step: 'complete',
        progress: 100,
        message: `Завершено! Обработано: ${processed}, ошибок: ${errors}`,
        details: {
          total: pendingChanges.length,
          downloaded,
          processed,
          errors,
          finished: true
        }
      });

      // Закрываем поток через 3 секунды
      setTimeout(() => {
        const observer = this.sourcesProgressStreams.get(progressId);
        if (observer) {
          observer.complete();
          this.sourcesProgressStreams.delete(progressId);
        }
      }, 3000);

    } catch (error) {
      this.logger.error(`Error in detailed sources approval:`, error);
      this.sendSourcesProgress(progressId, {
        step: 'error',
        progress: 0,
        message: `Ошибка: ${error.message}`,
        details: { error: error.message }
      });
    }
  }
}
