import { Body, Controller, Delete, Get, Param, Post, Query, Res, Sse } from '@nestjs/common';
import type { Response } from 'express';
import { KbService } from './kb.service';
import { DocumentAnalyzerService } from './document-analyzer.service';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Controller('kb')
export class KbController {
  constructor(
    private readonly kb: KbService,
    private readonly analyzer: DocumentAnalyzerService,
  ) {}

  /**
   * POST /kb/documents - Добавить документ
   */
  @Post('documents')
  async addDocument(
    @Body()
    body: {
      companyCode: string;
      productCode: string;
      title: string;
      content: string;
      fileUrl?: string;
      sourceUrl?: string;
      version?: string;
    },
  ) {
    return this.kb.addDocument(body);
  }

  /**
   * GET /kb/documents - Список документов
   */
  @Get('documents')
  async listDocuments(@Query('companyCode') companyCode?: string, @Query('productCode') productCode?: string) {
    return this.kb.listDocuments({ companyCode, productCode });
  }

  /**
   * DELETE /kb/documents/:id - Удалить документ
   */
  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string) {
    await this.kb.deleteDocument(id);
    return { success: true };
  }

  /**
   * POST /kb/search - Поиск по базе знаний
   */
  @Post('search')
  async search(
    @Body()
    body: {
      query: string;
      companyCode?: string;
      productCode?: string;
      limit?: number;
    },
  ) {
    return this.kb.search(body);
  }

  /**
   * GET /kb/companies - Список всех компаний в базе
   */
  @Get('companies')
  async getCompanies() {
    return this.kb.getCompanies();
  }

  /**
   * GET /kb/products - Список всех продуктов
   */
  @Get('products')
  async getProducts(@Query('companyCode') companyCode?: string) {
    return this.kb.getProducts(companyCode);
  }

  /**
   * GET /kb/stats - Статистика базы знаний
   */
  @Get('stats')
  async getStats() {
    return this.kb.getStats();
  }

  /**
   * GET /kb/documents/:id - Получить конкретный документ
   */
  @Get('documents/:id')
  async getDocument(@Param('id') id: string) {
    return this.kb.getDocument(id);
  }

  /**
   * GET /kb/documents/:id/chunks - Получить чанки документа
   */
  @Get('documents/:id/chunks')
  async getDocumentChunks(@Param('id') id: string) {
    return this.kb.getDocumentChunks(id);
  }

  /**
   * GET /kb/recent - Последние добавленные документы
   */
  @Get('recent')
  async getRecentDocuments(@Query('limit') limit?: number) {
    return this.kb.getRecentDocuments(limit || 10);
  }

  /**
   * GET /kb/export/json - Экспорт всех данных в JSON
   */
  @Get('export/json')
  async exportToJson(@Res() res: Response) {
    try {
      const data = await this.kb.exportAllData();
      const filename = `insurance-data-${new Date().toISOString().split('T')[0]}.json`;
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(data, null, 2));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /kb/export/csv - Экспорт данных в CSV
   */
  @Get('export/csv')
  async exportToCsv(@Res() res: Response) {
    try {
      const csv = await this.kb.exportToCsv();
      const filename = `insurance-data-${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /kb/analyze - Анализ всех документов
   */
  @Post('analyze')
  async analyzeDocuments(@Body('includeApproved') includeApproved: boolean = true) {
    const analyses = await this.analyzer.analyzeAllDocuments({ includeApproved });
    return { success: true, data: analyses };
  }

  /**
   * POST /kb/analyze-with-progress - Анализ всех документов с прогрессом
   */
  @Post('analyze-with-progress')
  async analyzeDocumentsWithProgress(@Body() body: {
    includeApproved?: boolean;
    includeObsolete?: boolean;
    analysisId?: string;
    limit?: number;
    companyCode?: string;
  }) {
    const analysisId = body.analysisId || `analysis-${Date.now()}`;
    
    // Создаем поток прогресса ДО запуска анализа
    this.analyzer.getAnalysisProgressStream(analysisId);
    
    // Запускаем анализ асинхронно
    setImmediate(async () => {
      try {
        await this.analyzer.analyzeAllDocumentsWithProgress({ 
          includeApproved: body.includeApproved,
          includeObsolete: body.includeObsolete,
          analysisId,
          limit: body.limit,
          companyCode: body.companyCode
        });
      } catch (error) {
        console.error('Analysis error:', error);
      }
    });
    
    return { success: true, analysisId, message: 'Analysis started' };
  }

  /**
   * GET /kb/analysis-progress/:id - SSE endpoint для отслеживания прогресса анализа
   */
  @Sse('analysis-progress/:id')
  getAnalysisProgress(@Param('id') analysisId: string): Observable<any> {
    console.log(`SSE connection requested for analysis: ${analysisId}`);

    return this.analyzer.getAnalysisProgressStream(analysisId).pipe(
      map(data => {
        console.log(`Sending SSE data for ${analysisId}:`, data);
        // Данные уже приходят в правильном формате из анализатора
        return data;
      }),
      catchError(error => {
        console.error(`SSE error for ${analysisId}:`, error);
        return of({
          data: JSON.stringify({
            step: 'error',
            progress: 0,
            message: `Ошибка SSE: ${error.message}`,
            details: { error: error.message }
          })
        });
      })
    );
  }

  /**
   * POST /kb/delete-batch - Массовое удаление документов
   */
  @Post('delete-batch')
  async deleteBatch(@Body('docIds') docIds: string[]) {
    const result = await this.analyzer.deleteDocuments(docIds);
    return { success: true, deleted: result.deleted };
  }

  /**
   * GET /kb/test-analysis - Тестовый анализ одного документа
   */
  @Get('test-analysis')
  async testAnalysis() {
    try {
      // Получаем первый документ
      const doc = await this.kb.prisma.kBDoc.findFirst({
        include: { chunks: true }
      });
      
      if (!doc) {
        return { success: false, message: 'No documents found' };
      }

      return { 
        success: true, 
        message: `Found document: ${doc.title}`,
        docInfo: {
          id: doc.id,
          title: doc.title,
          chunksCount: doc.chunks.length,
          contentLength: doc.chunks.map(c => c.text).join('').length
        }
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * GET /kb/test-simple-analysis - Простой анализ без базы данных
   */
  @Get('test-simple-analysis')
  async testSimpleAnalysis() {
    try {
      const testDoc = {
        id: 'test',
        title: 'Тестовый документ',
        companyCode: 'TEST',
        productCode: 'TEST',
        chunks: [
          { text: 'Это тестовый документ для проверки анализа. Он содержит достаточно текста для анализа.' }
        ]
      };

      const analysis = await this.analyzer.analyzeDocument(testDoc);
      
      return { 
        success: true, 
        data: analysis,
        message: 'Simple analysis completed'
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  @Post('test-mini-analysis')
  async testMiniAnalysis(@Body() body: { limit?: number }) {
    const limit = body.limit || 5;
    const analysisId = `mini-analysis-${Date.now()}`;
    
    try {
      // Имитируем быстрый анализ без реальной базы данных
      const fakeResults: any[] = [];
      
      for (let i = 0; i < limit; i++) {
        fakeResults.push({
          docId: `fake-${i}`,
          title: `Тестовый документ ${i + 1}`,
          companyCode: 'TEST',
          productCode: 'TEST',
          score: Math.floor(Math.random() * 100),
          issues: ['Тестовая проблема'],
          recommendation: 'review',
          reason: 'Тестовый анализ',
          details: {
            hasUsefulContent: true,
            hasSpecificInfo: false,
            isRelevant: true,
            isDuplicate: false,
            isOutdated: false,
            isTestData: true,
            contentLength: 100
          }
        });
        
        // Небольшая задержка для имитации работы
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      return {
        success: true,
        data: fakeResults,
        analysisId,
        message: `Mini analysis of ${limit} fake documents completed`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Mini analysis failed'
      };
    }
  }

  @Post('test-super-simple')
  async testSuperSimple() {
    return {
      success: true,
      message: 'Super simple test works!',
      timestamp: new Date().toISOString()
    };
  }

  @Get('last-analysis-results')
  async getLastAnalysisResults() {
    // Возвращаем последние результаты анализа из кэша
    const lastResults = (this.analyzer as any).lastAnalysisResults;
    if (lastResults && lastResults.length > 0) {
      return {
        success: true,
        data: lastResults,
        message: 'Last analysis results retrieved'
      };
    } else {
      return {
        success: false,
        message: 'No recent analysis results found'
      };
    }
  }

  @Sse('simple-progress/:id')
  getSimpleProgress(@Param('id') id: string): Observable<any> {
    console.log(`Simple SSE connection for: ${id}`);
    
    return new Observable(observer => {
      let counter = 0;
      
      // Отправляем сообщения каждую секунду
      const interval = setInterval(() => {
        const message = {
          step: 'progress',
          progress: (counter + 1) * 20,
          message: `Шаг ${counter + 1} из 5`,
          details: { current: counter + 1, total: 5 }
        };
        
        console.log(`Sending simple SSE message ${counter + 1}:`, message);
        
        observer.next({
          data: JSON.stringify(message)
        });
        
        counter++;
        
        if (counter >= 5) {
          observer.next({
            data: JSON.stringify({
              step: 'complete',
              progress: 100,
              message: 'Завершено!',
              details: { finished: true }
            })
          });
          observer.complete();
          clearInterval(interval);
        }
      }, 1000);
      
      return () => clearInterval(interval);
    });
  }

  @Post('test-single-doc-analysis')
  async testSingleDocAnalysis() {
    try {
      // Тестируем анализ одного документа напрямую
      const testDoc = {
        id: 'test-123',
        title: 'Тестовый документ страхования',
        companyCode: 'TEST',
        productCode: 'LIFE',
        chunks: [
          { text: 'Это правила страхования жизни. Страховая премия составляет 1000 рублей в год. Выплаты производятся в течение 30 дней.' }
        ]
      };

      const analysis = await this.analyzer.analyzeDocument(testDoc);
      
      return {
        success: true,
        data: analysis,
        message: 'Single document analysis completed'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Single document analysis failed'
      };
    }
  }

  @Sse('test-sse')
  testSSE(): Observable<any> {
    console.log('Test SSE connection requested');
    
    return new Observable(observer => {
      let counter = 0;
      
      const interval = setInterval(() => {
        counter++;
        const data = {
          data: JSON.stringify({
            message: `Test message ${counter}`,
            timestamp: new Date().toISOString(),
            counter
          })
        };
        
        console.log('Sending test SSE data:', data);
        observer.next(data);
        
        if (counter >= 5) {
          clearInterval(interval);
          observer.complete();
        }
      }, 1000);
      
      // Отправляем первое сообщение сразу
      observer.next({
        data: JSON.stringify({
          message: 'Test SSE connection established',
          timestamp: new Date().toISOString(),
          counter: 0
        })
      });
      
      return () => {
        clearInterval(interval);
      };
    });
  }

  @Post('test-analysis-with-sse')
  async testAnalysisWithSSE() {
    const analysisId = `test-analysis-${Date.now()}`;
    
    // Создаем поток прогресса
    this.analyzer.getAnalysisProgressStream(analysisId);
    
    // Запускаем тестовый анализ
    setImmediate(async () => {
      try {
        console.log('Starting test analysis with SSE');
        
        // Имитируем анализ с прогрессом
        for (let i = 1; i <= 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Отправляем прогресс через публичный метод
          this.analyzer.sendAnalysisProgress(analysisId, {
            step: 'analyzing',
            progress: (i / 5) * 100,
            message: `Тестовый анализ: шаг ${i} из 5`,
            details: { currentStep: i, totalSteps: 5 }
          });
        }
        
        // Завершаем анализ
        this.analyzer.sendAnalysisProgress(analysisId, {
          step: 'complete',
          progress: 100,
          message: 'Тестовый анализ завершен!',
          details: { completed: true }
        });
        
      } catch (error) {
        console.error('Test analysis error:', error);
      }
    });
    
    return { success: true, analysisId, message: 'Test analysis started' };
  }

  /**
   * POST /kb/documents/:id/approve - Одобрить документ
   */
  @Post('documents/:id/approve')
  async approveDocument(@Param('id') id: string) {
    await this.kb.approveDocument(id);
    return { success: true, message: 'Document approved' };
  }

  /**
   * POST /kb/documents/:id/unapprove - Снять одобрение
   */
  @Post('documents/:id/unapprove')
  async unapproveDocument(@Param('id') id: string) {
    await this.kb.unapproveDocument(id);
    return { success: true, message: 'Approval removed' };
  }

  /**
   * POST /kb/documents/:id/obsolete - Пометить как неактуальный
   */
  @Post('documents/:id/obsolete')
  async markDocumentObsolete(@Param('id') id: string, @Body() body: { reason?: string }) {
    await this.kb.markDocumentObsolete(id, body.reason);
    return { success: true, message: 'Document marked as obsolete' };
  }

  /**
   * POST /kb/documents/:id/unobsolete - Убрать пометку неактуальности
   */
  @Post('documents/:id/unobsolete')
  async unmarkDocumentObsolete(@Param('id') id: string) {
    await this.kb.unmarkDocumentObsolete(id);
    return { success: true, message: 'Document unmarked as obsolete' };
  }

  /**
   * POST /kb/documents/:id/rename - Переименовать документ
   */
  @Post('documents/:id/rename')
  async renameDocument(@Param('id') id: string, @Body('title') title: string) {
    await this.kb.renameDocument(id, title);
    return { success: true, message: 'Document renamed' };
  }

  /**
   * POST /kb/documents/:id/update - Обновить документ
   */
  @Post('documents/:id/update')
  async updateDocument(
    @Param('id') id: string,
    @Body() body: { companyCode?: string; productCode?: string }
  ) {
    await this.kb.updateDocument(id, body);
    return { success: true, message: 'Document updated' };
  }
}

