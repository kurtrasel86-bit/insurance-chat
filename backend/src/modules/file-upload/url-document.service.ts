import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KbService } from '../kb/kb.service';
import { FileParserService } from './services/file-parser.service';
import { DuplicateDetectorService } from './services/duplicate-detector.service';
import { ConflictResolverService, Conflict } from './services/conflict-resolver.service';
import { DateValidatorService, DateValidationResult } from './services/date-validator.service';
import * as axios from 'axios';
import * as cheerio from 'cheerio';

export interface UrlDocumentData {
  id: string;
  url: string;
  title: string;
  originalTitle: string;
  extractedText: string;
  companyCode?: string;
  productCode?: string;
  documentType?: string;
  status: string;
  duplicates?: Array<{ docId: string; title: string; similarity: number; reason: string }>;
  conflicts?: Conflict[];
  dateValidation?: DateValidationResult;
  createdAt: Date;
}

@Injectable()
export class UrlDocumentService {
  private readonly logger = new Logger(UrlDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kb: KbService,
    private readonly fileParser: FileParserService,
    private readonly duplicateDetector: DuplicateDetectorService,
    private readonly conflictResolver: ConflictResolverService,
    private readonly dateValidator: DateValidatorService,
  ) {}

  /**
   * Обработка документа по URL
   */
  async processUrlDocument(url: string, metadata?: {
    companyCode?: string;
    productCode?: string;
    documentType?: string;
  }): Promise<UrlDocumentData> {
    this.logger.log(`Processing URL document: ${url}`);

    try {
      // 1. Загружаем содержимое по URL
      const { content, title, contentType } = await this.fetchUrlContent(url);
      
      // 2. Извлекаем текст в зависимости от типа контента
      let extractedText: string;
      if (contentType.includes('pdf')) {
        // Для PDF файлов используем существующий парсер
        extractedText = await this.fileParser.extractTextFromBuffer(Buffer.from(content), 'application/pdf');
      } else if (contentType.includes('html')) {
        // Для HTML страниц извлекаем текст
        extractedText = this.extractTextFromHtml(content.toString());
      } else {
        // Для других типов пытаемся извлечь как текст
        extractedText = content.toString();
      }

      // 3. Автоматическое определение компании/продукта если не указано
      const detected = this.fileParser.detectCompanyAndProduct(extractedText, title);
      const companyCode = metadata?.companyCode || detected.companyCode;
      const productCode = metadata?.productCode || detected.productCode;
      const documentType = metadata?.documentType || this.fileParser.detectDocumentType(extractedText, title);

      // 4. Генерируем русское название
      const russianTitle = this.fileParser.generateRussianTitle({
        originalFilename: title,
        extractedText,
        companyCode,
        productCode,
        documentType,
      });

      // 5. Поиск дубликатов
      const duplicates = await this.duplicateDetector.findDuplicates({
        title: russianTitle,
        content: extractedText,
        companyCode,
        productCode,
      });

      // 6. Поиск конфликтов
      const conflicts = await this.conflictResolver.findConflicts({
        newText: extractedText,
        companyCode,
        productCode,
      });

      // 7. Проверка актуальности дат
      const dateValidation = await this.dateValidator.validateDocumentDates({
        title: russianTitle,
        content: extractedText,
        filename: title,
      });

      // 8. Создаем объект документа
      const documentData: UrlDocumentData = {
        id: `url-${Date.now()}`,
        url,
        title: russianTitle,
        originalTitle: title,
        extractedText,
        companyCode,
        productCode,
        documentType,
        status: 'pending',
        duplicates,
        conflicts,
        dateValidation,
        createdAt: new Date(),
      };

      this.logger.log(`URL document processed: ${duplicates.length} duplicates, ${conflicts.length} conflicts, ${dateValidation.foundDates.length} dates found (${dateValidation.warnings.length} warnings)`);
      
      return documentData;
    } catch (error) {
      this.logger.error(`Error processing URL document:`, error);
      throw error;
    }
  }

  /**
   * Загрузка содержимого по URL
   */
  private async fetchUrlContent(url: string): Promise<{ content: Buffer; title: string; contentType: string }> {
    try {
      const response = await axios.default.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const content = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'text/html';
      
      // Извлекаем заголовок из HTML если это веб-страница
      let title = url.split('/').pop() || 'Document';
      if (contentType.includes('html')) {
        const $ = cheerio.load(content.toString());
        const pageTitle = $('title').text().trim();
        if (pageTitle) {
          title = pageTitle;
        }
      }

      return { content, title, contentType };
    } catch (error) {
      this.logger.error(`Error fetching URL content: ${url}`, error);
      throw new Error(`Не удалось загрузить документ по ссылке: ${error.message}`);
    }
  }

  /**
   * Извлечение текста из HTML
   */
  private extractTextFromHtml(html: string): string {
    const $ = cheerio.load(html);
    
    // Удаляем скрипты и стили
    $('script, style, nav, header, footer, aside').remove();
    
    // Извлекаем основной контент
    const mainContent = $('main, article, .content, .main-content, #content').first();
    const content = mainContent.length > 0 ? mainContent : $('body');
    
    // Получаем текст и очищаем его
    let text = content.text();
    
    // Удаляем лишние пробелы и переносы строк
    text = text.replace(/\s+/g, ' ').trim();
    
    // Удаляем повторяющиеся переносы строк
    text = text.replace(/\n\s*\n/g, '\n');
    
    return text;
  }

  /**
   * Одобрение документа и добавление в базу знаний
   */
  async approveDocument(params: {
    url: string;
    title: string;
    extractedText: string;
    companyCode: string;
    productCode: string;
    documentType: string;
    duplicatesToReplace?: string[]; // ID документов для замены
  }): Promise<{ success: boolean; docId: string }> {
    try {
      // 1. Удаляем дубликаты если указано
      if (params.duplicatesToReplace && params.duplicatesToReplace.length > 0) {
        for (const docId of params.duplicatesToReplace) {
          await this.kb.deleteDocument(docId);
          this.logger.log(`Deleted duplicate document: ${docId}`);
        }
      }

      // 2. Добавляем новый документ в базу знаний
      const result = await this.kb.addDocument({
        title: params.title,
        content: params.extractedText,
        companyCode: params.companyCode,
        productCode: params.productCode,
        sourceUrl: params.url, // Сохраняем ссылку на оригинал
        documentType: params.documentType,
        isApproved: true,
        approvedAt: new Date(),
        approvedBy: 'admin'
      });

      this.logger.log(`Document approved and added to KB: ${result.docId}`);
      
      return { success: true, docId: result.docId };
    } catch (error) {
      this.logger.error(`Error approving document:`, error);
      throw error;
    }
  }
}
