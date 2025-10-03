import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { UrlDocumentService, UrlDocumentData } from './url-document.service';

// Временное хранилище документов по URL (пока нет БД таблицы)
const urlDocumentsCache = new Map<string, UrlDocumentData>();

@Controller('url-documents')
export class UrlDocumentController {
  constructor(private readonly urlDocumentService: UrlDocumentService) {}

  /**
   * POST /url-documents/process - Обработать документ по URL
   */
  @Post('process')
  async processUrlDocument(
    @Body('url') url: string,
    @Body('companyCode') companyCode?: string,
    @Body('productCode') productCode?: string,
    @Body('documentType') documentType?: string,
  ) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    // Валидация URL
    try {
      new URL(url);
    } catch (error) {
      throw new BadRequestException('Invalid URL format');
    }

    const documentData = await this.urlDocumentService.processUrlDocument(url, {
      companyCode,
      productCode,
      documentType,
    });

    // Сохраняем в кэш
    urlDocumentsCache.set(documentData.id, documentData);

    return {
      success: true,
      data: {
        id: documentData.id,
        url: documentData.url,
        title: documentData.title,
        originalTitle: documentData.originalTitle,
        companyCode: documentData.companyCode,
        productCode: documentData.productCode,
        documentType: documentData.documentType,
        status: documentData.status,
        duplicatesCount: documentData.duplicates?.length || 0,
        conflictsCount: documentData.conflicts?.length || 0,
        dateWarningsCount: documentData.dateValidation?.warnings.length || 0,
        dateValidation: documentData.dateValidation,
        createdAt: documentData.createdAt,
      },
    };
  }

  /**
   * GET /url-documents - Список обработанных документов
   */
  @Get()
  async listDocuments() {
    const documents = Array.from(urlDocumentsCache.values());
    
    return {
      success: true,
      data: documents.map(d => ({
        id: d.id,
        url: d.url,
        title: d.title,
        companyCode: d.companyCode,
        productCode: d.productCode,
        status: d.status,
        createdAt: d.createdAt,
      })),
    };
  }

  /**
   * GET /url-documents/:id - Детали документа
   */
  @Get(':id')
  async getDocument(@Param('id') id: string) {
    const document = urlDocumentsCache.get(id);
    
    if (!document) {
      throw new BadRequestException('Document not found');
    }

    return {
      success: true,
      data: document,
    };
  }

  /**
   * POST /url-documents/:id/approve - Одобрить документ
   */
  @Post(':id/approve')
  async approveDocument(
    @Param('id') id: string,
    @Body('duplicatesToReplace') duplicatesToReplace?: string[],
  ) {
    const document = urlDocumentsCache.get(id);
    
    if (!document) {
      throw new BadRequestException('Document not found');
    }

    if (document.status !== 'pending') {
      throw new BadRequestException('Document is not in pending status');
    }

    try {
      const result = await this.urlDocumentService.approveDocument({
        url: document.url,
        title: document.title,
        extractedText: document.extractedText,
        companyCode: document.companyCode!,
        productCode: document.productCode!,
        documentType: document.documentType!,
        duplicatesToReplace,
      });

      // Обновляем статус в кэше
      document.status = 'approved';
      urlDocumentsCache.set(id, document);

      return {
        success: true,
        message: 'Document approved and added to knowledge base',
        docId: result.docId,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to approve document: ${error.message}`);
    }
  }

  /**
   * POST /url-documents/:id/reject - Отклонить документ
   */
  @Post(':id/reject')
  async rejectDocument(@Param('id') id: string) {
    const document = urlDocumentsCache.get(id);
    
    if (!document) {
      throw new BadRequestException('Document not found');
    }

    if (document.status !== 'pending') {
      throw new BadRequestException('Document is not in pending status');
    }

    // Обновляем статус в кэше
    document.status = 'rejected';
    urlDocumentsCache.set(id, document);

    return {
      success: true,
      message: 'Document rejected',
    };
  }
}
