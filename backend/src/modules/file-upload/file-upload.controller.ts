import {
  Controller,
  Post,
  Get,
  Delete,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  BadRequestException,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileUploadService, UploadedFileData } from './file-upload.service';

// Временное хранилище загруженных файлов (пока нет БД таблицы)
const uploadedFilesCache = new Map<string, UploadedFileData>();

@Controller('files')
export class FileUploadController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  /**
   * POST /files/upload - Загрузить файл
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('companyCode') companyCode?: string,
    @Body('productCode') productCode?: string,
    @Body('documentType') documentType?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const fileData = await this.fileUploadService.processUploadedFile(file, {
      companyCode,
      productCode,
      documentType,
    });

    // Сохраняем в кэш
    uploadedFilesCache.set(fileData.id, fileData);

    return {
      success: true,
      data: {
        id: fileData.id,
        filename: fileData.originalName,
        size: fileData.size,
        companyCode: fileData.companyCode,
        productCode: fileData.productCode,
        documentType: fileData.documentType,
        status: fileData.status,
        duplicatesCount: fileData.duplicates?.length || 0,
        conflictsCount: fileData.conflicts?.length || 0,
        dateWarningsCount: fileData.dateValidation?.warnings.length || 0,
        dateValidation: fileData.dateValidation,
      },
    };
  }

  /**
   * GET /files - Список загруженных файлов
   */
  @Get()
  async listFiles() {
    const files = Array.from(uploadedFilesCache.values());
    
    return {
      success: true,
      data: files.map(f => ({
        id: f.id,
        filename: f.originalName,
        companyCode: f.companyCode,
        productCode: f.productCode,
        status: f.status,
        createdAt: f.createdAt,
      })),
    };
  }

  /**
   * GET /files/:id - Детали файла
   */
  @Get(':id')
  async getFile(@Param('id') id: string) {
    const file = uploadedFilesCache.get(id);
    
    if (!file) {
      throw new BadRequestException('File not found');
    }

    return {
      success: true,
      data: file,
    };
  }

  /**
   * POST /files/:id/approve - Одобрить файл
   */
  @Post(':id/approve')
  async approveFile(
    @Param('id') id: string,
    @Body('duplicatesToReplace') duplicatesToReplace?: string[],
  ) {
    const file = uploadedFilesCache.get(id);
    
    if (!file) {
      throw new BadRequestException('File not found');
    }

    const result = await this.fileUploadService.approveFile({
      filePath: `/admin/files/download/${file.filename}`,
      filename: file.originalName,
      extractedText: file.extractedText || '',
      companyCode: file.companyCode || 'UNKNOWN',
      productCode: file.productCode || 'GENERAL',
      documentType: file.documentType || 'general',
      duplicatesToReplace,
    });

    // Обновляем статус
    file.status = 'approved';
    uploadedFilesCache.set(id, file);

    return {
      success: true,
      message: 'File approved and added to knowledge base',
      data: result,
    };
  }

  /**
   * POST /files/:id/reject - Отклонить файл
   */
  @Post(':id/reject')
  async rejectFile(@Param('id') id: string) {
    const file = uploadedFilesCache.get(id);
    
    if (!file) {
      throw new BadRequestException('File not found');
    }

    await this.fileUploadService.rejectFile(`./uploads/${file.filename}`);

    // Удаляем из кэша
    uploadedFilesCache.delete(id);

    return {
      success: true,
      message: 'File rejected and deleted',
    };
  }

  /**
   * DELETE /files/:id - Удалить файл
   */
  @Delete(':id')
  async deleteFile(@Param('id') id: string) {
    const file = uploadedFilesCache.get(id);
    
    if (!file) {
      throw new BadRequestException('File not found');
    }

    await this.fileUploadService.rejectFile(`./uploads/${file.filename}`);
    uploadedFilesCache.delete(id);

    return {
      success: true,
      message: 'File deleted',
    };
  }

  /**
   * POST /files/upload-with-progress - Загрузить файл с отслеживанием прогресса
   */
  @Post('upload-with-progress')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileWithProgress(
    @UploadedFile() file: Express.Multer.File,
    @Body('companyCode') companyCode?: string,
    @Body('productCode') productCode?: string,
    @Body('documentType') documentType?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const fileData = await this.fileUploadService.processUploadedFileWithProgress(file, {
      companyCode,
      productCode,
      documentType,
    });

    // Сохраняем в кэш
    uploadedFilesCache.set(fileData.id, fileData);

    return {
      success: true,
      data: {
        id: fileData.id,
        filename: fileData.originalName,
        size: fileData.size,
        companyCode: fileData.companyCode,
        productCode: fileData.productCode,
        documentType: fileData.documentType,
        status: fileData.status,
        duplicatesCount: fileData.duplicates?.length || 0,
        conflictsCount: fileData.conflicts?.length || 0,
        dateWarningsCount: fileData.dateValidation?.warnings.length || 0,
        dateValidation: fileData.dateValidation,
      },
    };
  }

  /**
   * GET /files/progress/:id - SSE endpoint для отслеживания прогресса
   */
  @Sse('progress/:id')
  getProgress(@Param('id') id: string): Observable<any> {
    return this.fileUploadService.getProgressStream(id);
  }
}
