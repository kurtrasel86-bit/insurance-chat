import { Controller, Get, Post, Delete, Put, Body, Param, Query, Sse } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { Observable } from 'rxjs';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  /**
   * POST /sources - Добавить новый источник
   */
  @Post()
  async addSource(@Body() body: {
    name: string;
    url: string;
    type: 'pdf' | 'webpage' | 'news';
    companyCode?: string;
    productCode?: string;
    checkFrequency?: 'hourly' | 'daily' | 'weekly' | 'manual';
  }) {
    const source = await this.sourcesService.addSource(body);
    return { success: true, data: source };
  }

  /**
   * GET /sources - Список источников
   */
  @Get()
  async listSources(
    @Query('type') type?: string,
    @Query('companyCode') companyCode?: string,
    @Query('isActive') isActive?: string,
  ) {
    const sources = await this.sourcesService.listSources({
      type,
      companyCode,
      isActive: isActive === 'true',
    });
    return { success: true, data: sources };
  }

  /**
   * DELETE /sources/:id - Удалить источник
   */
  @Delete(':id')
  async deleteSource(@Param('id') id: string) {
    await this.sourcesService.deleteSource(id);
    return { success: true, message: 'Source deleted' };
  }

  /**
   * PUT /sources/:id - Обновить источник
   */
  @Put(':id')
  async updateSource(
    @Param('id') id: string,
    @Body() updates: {
      name?: string;
      url?: string;
      isActive?: boolean;
      checkFrequency?: string;
    },
  ) {
    const source = await this.sourcesService.updateSource(id, updates);
    return { success: true, data: source };
  }

  /**
   * POST /sources/check-all - Проверить все источники на изменения
   */
  @Post('check-all')
  async checkAllSources() {
    const result = await this.sourcesService.checkAllSources();
    return {
      success: true,
      message: `Checked ${result.checked} sources, found ${result.changesFound} changes`,
      data: result,
    };
  }

  /**
   * POST /sources/:id/check - Проверить конкретный источник
   */
  @Post(':id/check')
  async checkSource(@Param('id') id: string) {
    const changes = await this.sourcesService.checkSourceForChanges(id);
    return {
      success: true,
      data: changes,
      message: `Found ${changes.length} changes`,
    };
  }

  /**
   * GET /sources/changes/pending - Получить все ожидающие изменения
   */
  @Get('changes/pending')
  async getPendingChanges() {
    const changes = await this.sourcesService.getPendingChanges();
    return { success: true, data: changes };
  }

  /**
   * POST /sources/changes/:id/approve - Одобрить изменение
   */
  @Post('changes/:id/approve')
  async approveChange(@Param('id') id: string) {
    const result = await this.sourcesService.approveChange(id);
    return result;
  }

  /**
   * POST /sources/changes/approve-all - Одобрить все изменения
   */
  @Post('changes/approve-all')
  async approveAllChanges() {
    const result = await this.sourcesService.approveAllPendingChanges();
    return { success: true, data: result };
  }

  /**
   * POST /sources/changes/approve-all-stream - Одобрить все изменения с прогрессом
   */
  @Post('changes/approve-all-stream')
  async approveAllChangesWithProgress(@Body() body: { changeIds?: string[] }) {
    const result = await this.sourcesService.approveAllPendingChangesWithProgress(body.changeIds);
    return { success: true, data: result };
  }

  /**
   * POST /sources/changes/approve-all-with-detailed-progress - Одобрить изменения с детальным прогрессом
   */
  @Post('changes/approve-all-with-detailed-progress')
  async approveAllChangesWithDetailedProgress(@Body() body: { changeIds: string[] }) {
    const progressId = `sources-progress-${Date.now()}`;
    
    // Запускаем обработку асинхронно
    setImmediate(() => {
      this.sourcesService.approveChangesWithDetailedProgress(progressId, body.changeIds);
    });

    return { success: true, data: { progressId } };
  }

  /**
   * GET /sources/progress/:id - SSE поток для детального прогресса
   */
  @Sse('progress/:id')
  getSourcesProgress(@Param('id') progressId: string): Observable<any> {
    return this.sourcesService.getSourcesProgressStream(progressId);
  }

  /**
   * POST /sources/changes/:id/reject - Отклонить изменение
   */
  @Post('changes/:id/reject')
  async rejectChange(@Param('id') id: string) {
    const result = await this.sourcesService.rejectChange(id);
    return { success: true, message: 'Change rejected' };
  }
}

