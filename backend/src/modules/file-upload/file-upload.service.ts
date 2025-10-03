import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KbService } from '../kb/kb.service';
import { FileParserService } from './services/file-parser.service';
import { DuplicateDetectorService } from './services/duplicate-detector.service';
import { ConflictResolverService, Conflict } from './services/conflict-resolver.service';
import { DateValidatorService, DateValidationResult } from './services/date-validator.service';
import { Observable, Subject } from 'rxjs';
import * as fs from 'fs';

export interface UploadedFileData {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  companyCode?: string;
  productCode?: string;
  documentType?: string;
  status: string;
  extractedText?: string;
  duplicates?: Array<{ docId: string; title: string; similarity: number; reason: string }>;
  conflicts?: Conflict[];
  dateValidation?: DateValidationResult;
  createdAt: Date;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private progressStreams = new Map<string, Subject<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly kb: KbService,
    private readonly fileParser: FileParserService,
    private readonly duplicateDetector: DuplicateDetectorService,
    private readonly conflictResolver: ConflictResolverService,
    private readonly dateValidator: DateValidatorService,
  ) {}

  /**
   * Обработка загруженного файла
   */
  async processUploadedFile(file: Express.Multer.File, metadata?: {
    companyCode?: string;
    productCode?: string;
    documentType?: string;
  }): Promise<UploadedFileData> {
    this.logger.log(`Processing file: ${file.originalname}`);

    try {
      // 1. Извлекаем текст из файла
      const extractedText = await this.fileParser.extractText(file.path, file.mimetype);
      
      // 2. Автоматическое определение компании/продукта если не указано
      const detected = this.fileParser.detectCompanyAndProduct(extractedText, file.originalname);
      const companyCode = metadata?.companyCode || detected.companyCode;
      const productCode = metadata?.productCode || detected.productCode;
      const documentType = metadata?.documentType || this.fileParser.detectDocumentType(extractedText, file.originalname);

      // 2.1 Генерируем русское название
      const russianTitle = this.fileParser.generateRussianTitle({
        originalFilename: file.originalname,
        extractedText,
        companyCode,
        productCode,
        documentType,
      });

      // 3. Поиск дубликатов
      const duplicates = await this.duplicateDetector.findDuplicates({
        title: russianTitle,
        content: extractedText,
        companyCode,
        productCode,
      });

      // 4. Поиск конфликтов
      const conflicts = await this.conflictResolver.findConflicts({
        newText: extractedText,
        companyCode,
        productCode,
      });

      // 5. Проверка актуальности дат
      const dateValidation = await this.dateValidator.validateDocumentDates({
        title: russianTitle,
        content: extractedText,
        filename: file.originalname,
      });

      // 6. Сохраняем в БД (временно создаём запись в памяти, позже добавим таблицу)
      const fileData: UploadedFileData = {
        id: `file-${Date.now()}`,
        filename: file.filename,
        originalName: russianTitle,
        size: file.size,
        companyCode,
        productCode,
        documentType,
        status: 'pending',
        extractedText,
        duplicates,
        conflicts,
        dateValidation,
        createdAt: new Date(),
      };

      this.logger.log(`File processed: ${duplicates.length} duplicates, ${conflicts.length} conflicts, ${dateValidation.foundDates.length} dates found (${dateValidation.warnings.length} warnings)`);
      
      return fileData;
    } catch (error) {
      this.logger.error(`Error processing file:`, error);
      throw error;
    }
  }

  /**
   * Одобрение файла и добавление в базу знаний
   */
  async approveFile(params: {
    filePath: string;
    filename: string;
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
      // params.filename уже содержит русское название
      const result = await this.kb.addDocument({
        companyCode: params.companyCode,
        productCode: params.productCode,
        title: params.filename, // Это русское название!
        content: params.extractedText,
        fileUrl: params.filePath,
        version: new Date().toISOString(),
      });

      this.logger.log(`File approved and added to KB: ${result.docId}`);

      return { success: true, docId: result.docId };
    } catch (error) {
      this.logger.error(`Error approving file:`, error);
      throw error;
    }
  }

  /**
   * Отклонение файла
   */
  async rejectFile(filePath: string): Promise<void> {
    try {
      // Удаляем файл с диска
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`File rejected and deleted: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`Error rejecting file:`, error);
      throw error;
    }
  }

  /**
   * Обработка файла с отслеживанием прогресса
   */
  async processUploadedFileWithProgress(file: Express.Multer.File, metadata?: {
    companyCode?: string;
    productCode?: string;
    documentType?: string;
  }): Promise<UploadedFileData> {
    const fileId = `file-${Date.now()}`;
    const progressSubject = new Subject<MessageEvent>();
    this.progressStreams.set(fileId, progressSubject);

    this.logger.log(`Processing file with progress tracking: ${file.originalname}`);

    try {
      // Отправляем начальный прогресс
      this.sendProgress(fileId, {
        step: 'start',
        progress: 0,
        message: 'Начинаем обработку файла...',
        details: { filename: file.originalname }
      });

      // 1. Извлекаем текст из файла
      this.sendProgress(fileId, {
        step: 'extracting',
        progress: 20,
        message: 'Извлечение текста из файла...',
        details: { size: file.size }
      });

      const extractedText = await this.fileParser.extractText(file.path, file.mimetype);
      
      // 2. Автоматическое определение компании/продукта
      this.sendProgress(fileId, {
        step: 'analyzing',
        progress: 40,
        message: 'Определение компании и продукта...',
        details: { textLength: extractedText.length }
      });

      const detected = this.fileParser.detectCompanyAndProduct(extractedText, file.originalname);
      const companyCode = metadata?.companyCode || detected.companyCode;
      const productCode = metadata?.productCode || detected.productCode;
      const documentType = metadata?.documentType || this.fileParser.detectDocumentType(extractedText, file.originalname);

      // 2.1 Генерируем русское название
      const russianTitle = this.fileParser.generateRussianTitle({
        originalFilename: file.originalname,
        extractedText,
        companyCode,
        productCode,
        documentType,
      });

      // 3. Поиск дубликатов
      this.sendProgress(fileId, {
        step: 'duplicates',
        progress: 60,
        message: 'Поиск дубликатов...',
        details: { title: russianTitle }
      });

      const duplicates = await this.duplicateDetector.findDuplicates({
        title: russianTitle,
        content: extractedText,
        companyCode,
        productCode,
      });

      // 4. Поиск конфликтов
      this.sendProgress(fileId, {
        step: 'conflicts',
        progress: 75,
        message: 'Проверка конфликтов...',
        details: { duplicatesFound: duplicates.length }
      });

      const conflicts = await this.conflictResolver.findConflicts({
        newText: extractedText,
        companyCode,
        productCode,
      });

      // 5. Проверка актуальности дат
      this.sendProgress(fileId, {
        step: 'dates',
        progress: 90,
        message: 'Проверка актуальности дат...',
        details: { conflictsFound: conflicts.length }
      });

      const dateValidation = await this.dateValidator.validateDocumentDates({
        title: russianTitle,
        content: extractedText,
        filename: file.originalname,
      });

      // 6. Завершение
      this.sendProgress(fileId, {
        step: 'complete',
        progress: 100,
        message: 'Обработка завершена!',
        details: {
          duplicates: duplicates.length,
          conflicts: conflicts.length,
          dateWarnings: dateValidation.warnings.length
        }
      });

      const fileData: UploadedFileData = {
        id: fileId,
        filename: file.filename,
        originalName: russianTitle,
        size: file.size,
        companyCode,
        productCode,
        documentType,
        status: 'pending',
        extractedText,
        duplicates,
        conflicts,
        dateValidation,
        createdAt: new Date(),
      };

      this.logger.log(`File processed with progress: ${duplicates.length} duplicates, ${conflicts.length} conflicts, ${dateValidation.foundDates.length} dates found (${dateValidation.warnings.length} warnings)`);
      
      // Закрываем поток прогресса через 2 секунды
      setTimeout(() => {
        progressSubject.complete();
        this.progressStreams.delete(fileId);
      }, 2000);

      return fileData;
    } catch (error) {
      this.sendProgress(fileId, {
        step: 'error',
        progress: 0,
        message: `Ошибка обработки: ${error.message}`,
        details: { error: error.message }
      });
      
      setTimeout(() => {
        progressSubject.complete();
        this.progressStreams.delete(fileId);
      }, 1000);

      this.logger.error(`Error processing file with progress:`, error);
      throw error;
    }
  }

  /**
   * Получение потока прогресса для файла
   */
  getProgressStream(fileId: string): Observable<any> {
    const subject = this.progressStreams.get(fileId);
    if (!subject) {
      // Создаем новый поток, если его нет
      const newSubject = new Subject<any>();
      this.progressStreams.set(fileId, newSubject);
      return newSubject.asObservable();
    }
    return subject.asObservable();
  }

  /**
   * Отправка прогресса
   */
  private sendProgress(fileId: string, data: {
    step: string;
    progress: number;
    message: string;
    details?: any;
  }): void {
    const subject = this.progressStreams.get(fileId);
    if (subject) {
      subject.next({
        data: JSON.stringify(data),
        type: 'progress'
      });
    }
  }
}
