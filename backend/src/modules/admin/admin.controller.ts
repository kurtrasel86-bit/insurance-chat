import { Controller, Get, Post, Res, Param, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { KbService } from '../kb/kb.service';
import { DataCollectorService } from '../data-collector/data-collector.service';
import { SourcesService } from '../sources/sources.service';
import { DocumentAnalyzerService } from '../kb/document-analyzer.service';
import { AgentsService } from '../agents/agents.service';
import { getCompanyLabel, getProductLabel } from './russian-labels';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly kbService: KbService,
    private readonly dataCollector: DataCollectorService,
    private readonly sourcesService: SourcesService,
    private readonly analyzer: DocumentAnalyzerService,
    private readonly agentsService: AgentsService,
  ) {}

  /**
   * Главная страница админки
   */
  @Get()
  async getAdminDashboard(@Res() res: Response) {
    try {
      const stats = await this.kbService.getStats();
      const companies = await this.kbService.getCompanies();
      const recentDocs = await this.kbService.getRecentDocuments(5);
      const agentsStats = await this.agentsService.getAgentsStats();
      const availableAgents = await this.agentsService.getAvailableAgents();

      const html = this.generateDashboardHTML(stats, companies, recentDocs, agentsStats, availableAgents);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки дашборда: ${error.message}</h1>`);
    }
  }

  /**
   * Страница управления агентами
   */
  @Get('agents')
  async getAgentsPage(@Res() res: Response) {
    try {
      const agentsStats = await this.agentsService.getAgentsStats();
      const availableAgents = await this.agentsService.getAvailableAgents();

      const html = this.generateAgentsHTML(agentsStats, availableAgents);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки агентов: ${error.message}</h1>`);
    }
  }

  /**
   * Страница просмотра документов
   */
  @Get('documents')
  async getDocumentsPage(@Res() res: Response) {
    try {
      const queryParams = res.req.query as any;
      const companyFilter = queryParams.company;
      const productFilter = queryParams.product;
      
      const documents = await this.kbService.listDocuments({
        companyCode: companyFilter,
        productCode: productFilter,
      });
      const companies = await this.kbService.getCompanies();
      
      const html = this.generateDocumentsHTML(documents, companies);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки документов: ${error.message}</h1>`);
    }
  }


  /**
   * Страница добавления текстового документа
   */
  @Get('documents/add-text')
  async getAddTextDocumentPage(@Res() res: Response) {
    try {
      const companies = await this.kbService.getCompanies();
      const html = this.generateAddTextDocumentHTML(companies);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки страницы: ${error.message}</h1>`);
    }
  }

  /**
   * Добавление текстового документа
   */
  @Post('documents/add-text')
  async addTextDocument(@Res() res: Response) {
    try {
      const body = res.req.body;
      const { title, content, companyCode, productCode, sourceUrl } = body;

      if (!title || !content) {
        res.status(400).json({ success: false, message: 'Название и содержимое обязательны' });
        return;
      }

      const result = await this.kbService.addDocument({
        companyCode: companyCode || 'GENERAL',
        productCode: productCode || 'GENERAL',
        title,
        content,
        sourceUrl: sourceUrl || null,
        version: new Date().toISOString(),
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Детальный просмотр документа
   */
  @Get('documents/:id')
  async getDocumentDetail(@Param('id') id: string, @Res() res: Response) {
    try {
      const document = await this.kbService.getDocument(id);
      const chunks = await this.kbService.getDocumentChunks(id);
      
      if (!document) {
        res.status(404).send('<h1>Документ не найден</h1>');
        return;
      }

      const html = this.generateDocumentDetailHTML(document, chunks);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки документа: ${error.message}</h1>`);
    }
  }

  /**
   * Страница поиска
   */
  @Get('search')
  async getSearchPage(@Res() res: Response) {
    try {
      const companies = await this.kbService.getCompanies();
      const html = this.generateSearchHTML(companies);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки поиска: ${error.message}</h1>`);
    }
  }

  /**
   * Страница загрузки файлов
   */
  @Get('files/upload')
  async getFileUploadPage(@Res() res: Response) {
    try {
      const html = this.generateFileUploadHTML();
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки страницы: ${error.message}</h1>`);
    }
  }

  /**
   * Страница проверки файла
   */
  @Get('files/:id/review')
  async getFileReviewPage(@Param('id') fileId: string, @Res() res: Response) {
    try {
      const html = this.generateFileReviewHTML(fileId);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки страницы: ${error.message}</h1>`);
    }
  }

  /**
   * Страница управления источниками
   */
  @Get('sources')
  async getSourcesPage(@Res() res: Response) {
    try {
      const sources = await this.sourcesService.listSources();
      const pendingChanges = await this.sourcesService.getPendingChanges();
      const html = this.generateSourcesHTML(sources, pendingChanges);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка загрузки страницы: ${error.message}</h1>`);
    }
  }

  /**
   * Страница списка компаний
   */
  @Get('companies')
  async getCompaniesPage(@Res() res: Response) {
    try {
      const companies = await this.kbService.getCompanies();
      const stats = await this.kbService.getStats();
      const html = this.generateCompaniesHTML(companies, stats);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка: ${error.message}</h1>`);
    }
  }

  /**
   * Страница списка продуктов
   */
  @Get('products')
  async getProductsPage(@Res() res: Response) {
    try {
      const products = await this.kbService.getProducts();
      const html = this.generateProductsHTML(products);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка: ${error.message}</h1>`);
    }
  }

  /**
   * Страница анализа документов
   */
  @Get('analyze')
  async getAnalyzePage(@Res() res: Response) {
    try {
      const companies = await this.kbService.getCompanies();
      const html = this.generateAnalyzeHTML(companies);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`<h1>Ошибка: ${error.message}</h1>`);
    }
  }

  /**
   * Проверка и исправление битых ссылок на файлы
   */
  @Get('files/cleanup-unused')
  async cleanupUnusedFiles(@Res() res: Response) {
    try {
      const documents = await this.kbService.listDocuments();
      const usedFilenames = new Set<string>();
      
      // Собираем все используемые имена файлов
      for (const doc of documents) {
        if (doc.fileUrl) {
          const filename = doc.fileUrl.replace('/admin/files/download/', '');
          usedFilenames.add(filename);
        }
      }
      
      // Получаем все файлы в папке uploads
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const allFiles = fs.readdirSync(uploadsDir);
      
      const unusedFiles: string[] = [];
      const deletedFiles: string[] = [];
      
      for (const file of allFiles) {
        if (!usedFilenames.has(file)) {
          unusedFiles.push(file);
          try {
            fs.unlinkSync(path.join(uploadsDir, file));
            deletedFiles.push(file);
          } catch (error) {
            this.logger.error(`Ошибка удаления файла ${file}:`, error);
          }
        }
      }
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Очистка неиспользуемых файлов</title>
          <style>
            body { font-family: sans-serif; margin: 20px; }
            .success { background: #efe; padding: 10px; margin: 10px 0; border-radius: 5px; color: #059669; }
            .error { background: #fee; padding: 10px; margin: 10px 0; border-radius: 5px; color: #dc2626; }
            .info { background: #e0f2fe; padding: 10px; margin: 10px 0; border-radius: 5px; color: #0277bd; }
          </style>
        </head>
        <body>
          <div style="margin-bottom: 20px;">
            <a href="/admin" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-bottom: 10px;">🏠 Главная</a>
            <a href="/admin/documents" style="background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">📄 Документы</a>
            <a href="/admin/files/check-links" style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">🔧 Проверка ссылок</a>
          </div>
          
          <h1>🧹 Очистка неиспользуемых файлов</h1>
          
          <div class="info">
            <p><strong>Всего файлов в папке uploads:</strong> ${allFiles.length}</p>
            <p><strong>Используемых файлов:</strong> ${usedFilenames.size}</p>
            <p><strong>Неиспользуемых файлов:</strong> ${unusedFiles.length}</p>
          </div>
          
          ${deletedFiles.length > 0 ? `
            <div class="success">
              <h3>✅ Успешно удалено файлов: ${deletedFiles.length}</h3>
              <ul>
                ${deletedFiles.map(file => `<li>${file}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          ${unusedFiles.length > deletedFiles.length ? `
            <div class="error">
              <h3>❌ Ошибки при удалении:</h3>
              <ul>
                ${unusedFiles.filter(file => !deletedFiles.includes(file)).map(file => `<li>${file}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          <p><a href="/admin/files/check-links">← Вернуться к проверке ссылок</a></p>
        </body>
        </html>
      `;
      
      res.send(html);
    } catch (error) {
      res.status(500).send(`Ошибка: ${error.message}`);
    }
  }

  @Post('files/restore-broken-links')
  async restoreBrokenLinks(@Res() res: Response) {
    try {
      this.logger.log('Начинаем восстановление битых ссылок...');
      const documents = await this.kbService.listDocuments();
      this.logger.log(`Найдено документов: ${documents.length}`);
      const brokenLinks: Array<{
        docId: string;
        title: string;
        fileUrl: string;
        sourceUrl: string;
        filename: string;
      }> = [];
      
      // Находим документы с битыми ссылками, но с валидными sourceUrl
      let docsWithFileUrl = 0;
      let docsWithSourceUrl = 0;
      for (const doc of documents) {
        if (doc.fileUrl) docsWithFileUrl++;
        if (doc.sourceUrl) docsWithSourceUrl++;
        if (doc.fileUrl && doc.sourceUrl) {
          const filename = doc.fileUrl.replace('/admin/files/download/', '');
          const possiblePaths = [
            path.join(process.cwd(), 'uploads', filename),
            path.join(__dirname, '..', '..', '..', 'uploads', filename),
            path.join(__dirname, '..', '..', 'uploads', filename),
            path.join(process.cwd(), 'backend', 'uploads', filename),
          ];
          
          let fileExists = false;
          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              fileExists = true;
              break;
            }
          }
          
          if (!fileExists) {
            brokenLinks.push({
              docId: doc.id,
              title: doc.title,
              fileUrl: doc.fileUrl,
              sourceUrl: doc.sourceUrl,
              filename: filename
            });
          }
        }
      }
      
      this.logger.log(`Документов с fileUrl: ${docsWithFileUrl}, с sourceUrl: ${docsWithSourceUrl}`);
      this.logger.log(`Найдено битых ссылок: ${brokenLinks.length}`);
      
      const restoredFiles: Array<{
        docId: string;
        title: string;
        newFilename: string;
        success: boolean;
        error?: string;
      }> = [];
      
      // Пытаемся восстановить каждый битый файл
      this.logger.log(`Начинаем восстановление ${brokenLinks.length} файлов...`);
      for (const link of brokenLinks) {
        try {
          this.logger.log(`Восстанавливаем файл для документа: ${link.title}`);
          const newFilename = await this.downloadFileFromUrl(link.sourceUrl, link.filename);
          if (newFilename) {
            // Обновляем fileUrl в базе данных
            await this.kbService.updateDocument(link.docId, {
              fileUrl: `/admin/files/download/${newFilename}`
            });
            
            restoredFiles.push({
              docId: link.docId,
              title: link.title,
              newFilename: newFilename,
              success: true
            });
          } else {
            restoredFiles.push({
              docId: link.docId,
              title: link.title,
              newFilename: '',
              success: false,
              error: 'Не удалось скачать файл'
            });
          }
        } catch (error) {
          restoredFiles.push({
            docId: link.docId,
            title: link.title,
            newFilename: '',
            success: false,
            error: error.message
          });
        }
      }
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Восстановление битых ссылок</title>
          <style>
            body { font-family: sans-serif; margin: 20px; }
            .success { background: #efe; padding: 10px; margin: 10px 0; border-radius: 5px; color: #059669; }
            .error { background: #fee; padding: 10px; margin: 10px 0; border-radius: 5px; color: #dc2626; }
            .info { background: #e0f2fe; padding: 10px; margin: 10px 0; border-radius: 5px; color: #0277bd; }
            .file-item { background: #f9f9f9; padding: 10px; margin: 5px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div style="margin-bottom: 20px;">
            <a href="/admin" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-bottom: 10px;">🏠 Главная</a>
            <a href="/admin/documents" style="background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">📄 Документы</a>
            <a href="/admin/files/check-links" style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">🔧 Проверка ссылок</a>
          </div>
          
          <h1>🔧 Восстановление битых ссылок</h1>
          
          <div class="info">
            <p><strong>Найдено битых ссылок с sourceUrl:</strong> ${brokenLinks.length}</p>
            <p><strong>Успешно восстановлено:</strong> ${restoredFiles.filter(f => f.success).length}</p>
            <p><strong>Ошибок:</strong> ${restoredFiles.filter(f => !f.success).length}</p>
          </div>
          
          ${restoredFiles.filter(f => f.success).length > 0 ? `
            <div class="success">
              <h3>✅ Успешно восстановлено:</h3>
              ${restoredFiles.filter(f => f.success).map(file => `
                <div class="file-item">
                  <strong>${file.title}</strong><br>
                  <small>Новый файл: ${file.newFilename}</small>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${restoredFiles.filter(f => !f.success).length > 0 ? `
            <div class="error">
              <h3>❌ Ошибки восстановления:</h3>
              ${restoredFiles.filter(f => !f.success).map(file => `
                <div class="file-item">
                  <strong>${file.title}</strong><br>
                  <small>Ошибка: ${file.error}</small>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          <p><a href="/admin/files/check-links">← Вернуться к проверке ссылок</a></p>
        </body>
        </html>
      `;
      
      res.send(html);
    } catch (error) {
      res.status(500).send(`Ошибка: ${error.message}`);
    }
  }

  @Post('files/remove-broken-links')
  async removeBrokenLinks(@Res() res: Response) {
    try {
      this.logger.log('Начинаем удаление битых ссылок...');
      const documents = await this.kbService.listDocuments();
      this.logger.log(`Найдено документов: ${documents.length}`);
      
      const brokenLinks: Array<{
        docId: string;
        title: string;
        fileUrl: string;
        filename: string;
      }> = [];
      
      // Находим документы с битыми ссылками
      for (const doc of documents) {
        if (doc.fileUrl) {
          const filename = doc.fileUrl.replace('/admin/files/download/', '');
          const possiblePaths = [
            path.join(process.cwd(), 'uploads', filename),
            path.join(__dirname, '..', '..', '..', 'uploads', filename),
            path.join(__dirname, '..', '..', 'uploads', filename),
            path.join(process.cwd(), 'backend', 'uploads', filename),
          ];
          
          let fileExists = false;
          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              fileExists = true;
              break;
            }
          }
          
          if (!fileExists) {
            brokenLinks.push({
              docId: doc.id,
              title: doc.title,
              fileUrl: doc.fileUrl,
              filename: filename
            });
          }
        }
      }
      
      this.logger.log(`Найдено битых ссылок: ${brokenLinks.length}`);
      
      const removedLinks: Array<{
        docId: string;
        title: string;
        success: boolean;
        error?: string;
      }> = [];
      
      // Удаляем fileUrl у документов с битыми ссылками
      this.logger.log(`Удаляем fileUrl у ${brokenLinks.length} документов...`);
      for (const link of brokenLinks) {
        try {
          this.logger.log(`Удаляем fileUrl у документа: ${link.title}`);
          
          // Обновляем документ, убирая fileUrl (оставляем только sourceUrl)
          await this.kbService.updateDocument(link.docId, {
            fileUrl: null
          });
          
          removedLinks.push({
            docId: link.docId,
            title: link.title,
            success: true
          });
        } catch (error) {
          removedLinks.push({
            docId: link.docId,
            title: link.title,
            success: false,
            error: error.message
          });
        }
      }
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Удаление битых ссылок</title>
          <style>
            body { font-family: sans-serif; margin: 20px; }
            .success { background: #efe; padding: 10px; margin: 10px 0; border-radius: 5px; color: #059669; }
            .error { background: #fee; padding: 10px; margin: 10px 0; border-radius: 5px; color: #dc2626; }
            .info { background: #e0f2fe; padding: 10px; margin: 10px 0; border-radius: 5px; color: #0277bd; }
            .file-item { background: #f9f9f9; padding: 10px; margin: 5px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div style="margin-bottom: 20px;">
            <a href="/admin" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-bottom: 10px;">🏠 Главная</a>
            <a href="/admin/documents" style="background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">📄 Документы</a>
            <a href="/admin/files/check-links" style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">🔧 Проверка ссылок</a>
          </div>
          
          <h1>🗑️ Удаление битых ссылок</h1>
          
          <div class="info">
            <p><strong>Найдено битых ссылок:</strong> ${brokenLinks.length}</p>
            <p><strong>Успешно удалено:</strong> ${removedLinks.filter(f => f.success).length}</p>
            <p><strong>Ошибок:</strong> ${removedLinks.filter(f => !f.success).length}</p>
          </div>
          
          ${removedLinks.length > 0 ? `
            <h2>Результаты удаления:</h2>
            ${removedLinks.map(link => `
              <div class="file-item">
                <strong>${link.title}</strong>
                ${link.success ? 
                  '<span class="success">✅ fileUrl удален (остался только sourceUrl)</span>' : 
                  `<span class="error">❌ Ошибка: ${link.error}</span>`
                }
              </div>
            `).join('')}
          ` : ''}
          
          <p><a href="/admin/files/check-links">← Вернуться к проверке ссылок</a></p>
        </body>
        </html>
      `;
      
      res.send(html);
    } catch (error) {
      res.status(500).send(`Ошибка: ${error.message}`);
    }
  }

  @Get('files/check-links')
  async checkFileLinks(@Res() res: Response) {
    try {
      const documents = await this.kbService.listDocuments();
      const brokenLinks: Array<{
        docId: string;
        title: string;
        fileUrl: string;
        filename: string;
      }> = [];
      
      for (const doc of documents) {
        if (doc.fileUrl) {
          const filename = doc.fileUrl.replace('/admin/files/download/', '');
          const possiblePaths = [
            path.join(process.cwd(), 'uploads', filename),
            path.join(__dirname, '..', '..', '..', 'uploads', filename),
            path.join(__dirname, '..', '..', 'uploads', filename),
            path.join(process.cwd(), 'backend', 'uploads', filename),
          ];
          
          let fileExists = false;
          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              fileExists = true;
              break;
            }
          }
          
          if (!fileExists) {
            brokenLinks.push({
              docId: doc.id,
              title: doc.title,
              fileUrl: doc.fileUrl,
              filename: filename
            });
          }
        }
      }
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Проверка ссылок на файлы</title>
          <style>
            body { font-family: sans-serif; margin: 20px; }
            .broken-link { background: #fee; padding: 10px; margin: 10px 0; border-radius: 5px; }
            .good-link { background: #efe; padding: 10px; margin: 10px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div style="margin-bottom: 20px;">
            <a href="/admin" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-bottom: 10px;">🏠 Главная</a>
            <a href="/admin/documents" style="background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">📄 Документы</a>
          </div>
          
          <h1>Проверка ссылок на файлы</h1>
          <p><strong>Всего документов:</strong> ${documents.length}</p>
          <p><strong>С файлами:</strong> ${documents.filter(d => d.fileUrl).length}</p>
          <p><strong>Битых ссылок:</strong> ${brokenLinks.length}</p>
          
          <div style="margin: 20px 0; padding: 15px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
            <h3>🔧 Действия с файлами</h3>
            <p style="margin: 10px 0;">
              <a href="/admin/files/cleanup-unused" style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px; display: inline-block;">
                🧹 Очистить неиспользуемые файлы
              </a>
              <form method="POST" action="/admin/files/restore-broken-links" style="display: inline-block; margin-right: 10px;">
                <button type="submit" style="background: #059669; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                  🔧 Восстановить битые ссылки
                </button>
              </form>
              ${brokenLinks.length > 0 ? `
                <form method="POST" action="/admin/files/remove-broken-links" style="display: inline-block;" onsubmit="return confirm('Вы уверены, что хотите удалить все битые ссылки? Это действие нельзя отменить!');">
                  <button type="submit" style="background: #dc2626; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                    🗑️ Удалить битые ссылки (${brokenLinks.length})
                  </button>
                </form>
              ` : ''}
            </p>
            <p style="font-size: 14px; color: #6b7280; margin: 5px 0;">
              <strong>Очистить неиспользуемые файлы:</strong> Удаляет файлы из папки uploads, которые не используются ни в одном документе<br>
              <strong>Восстановить битые ссылки:</strong> Скачивает файлы заново по sourceUrl для документов с битыми fileUrl<br>
              <strong>Удалить битые ссылки:</strong> Удаляет fileUrl у документов с несуществующими файлами (оставляет только sourceUrl)
            </p>
          </div>
          
          ${brokenLinks.length > 0 ? `
            <h2>Битые ссылки:</h2>
            ${brokenLinks.map(link => `
              <div class="broken-link">
                <strong>${link.title}</strong><br>
                <strong>Файл:</strong> ${link.filename}<br>
                <strong>URL:</strong> ${link.fileUrl}<br>
                <a href="/admin/documents/${link.docId}">Открыть документ</a>
              </div>
            `).join('')}
          ` : '<h2>Все ссылки работают!</h2>'}
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      res.status(500).send(`Ошибка: ${error.message}`);
    }
  }

  /**
   * Раздача файлов из uploads
   */
  @Get('files/download/:filename')
  async downloadFile(@Param('filename') filename: string, @Res() res: Response) {
    try {
      // Используем несколько вариантов путей для поиска файла
      const possiblePaths = [
        path.join(process.cwd(), 'uploads', filename),
        path.join(__dirname, '..', '..', '..', 'uploads', filename),
        path.join(__dirname, '..', '..', 'uploads', filename),
        path.join(process.cwd(), 'backend', 'uploads', filename),
      ];
      
      let filepath = '';
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          filepath = possiblePath;
          break;
        }
      }
      
      if (!filepath) {
        this.logger.warn(`File not found in any of these paths: ${possiblePaths.join(', ')}`);
        this.logger.warn(`Requested filename: ${filename}`);
        this.logger.warn(`Current working directory: ${process.cwd()}`);
        this.logger.warn(`__dirname: ${__dirname}`);
        return res.status(404).send(`Файл не найден: ${filename}`);
      }

      const ext = path.extname(filename).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
      };

      res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
      this.logger.log(`Serving file: ${filepath}`);
      res.sendFile(filepath);
    } catch (error) {
      this.logger.error(`Error serving file ${filename}:`, error);
      res.status(500).send(`Ошибка: ${error.message}`);
    }
  }

  /**
   * Генерация HTML для главной страницы
   */
  private generateDashboardHTML(stats: any, companies: string[], recentDocs: any[], agentsStats: any, availableAgents: any[]): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Админ панель - Страховой ИИ</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2em; font-weight: bold; color: #2563eb; }
        .stat-label { color: #6b7280; margin-top: 5px; }
        .nav-links { display: flex; gap: 10px; margin-top: 20px; }
        .nav-link { background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .nav-link:hover { background: #1d4ed8; }
        .recent-docs { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .doc-item { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .doc-item:last-child { border-bottom: none; }
        .agents-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .agent-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
        .agent-name { font-weight: 600; color: #495057; margin-bottom: 5px; }
        .agent-status { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .status-online { color: #28a745; }
        .status-offline { color: #6c757d; }
        .status-busy { color: #ffc107; }
        .agent-companies { font-size: 12px; color: #6c757d; }
        .agent-sessions { font-size: 12px; color: #6c757d; }
        button.nav-link { cursor: pointer; border: none; }
        .loading-spinner { display: none; }
        .notification { 
            position: fixed; 
            top: 20px; 
            right: 20px; 
            padding: 15px; 
            border-radius: 5px; 
            color: white; 
            z-index: 1000; 
            display: none; 
        }
        .notification.success { background: #059669; }
        .notification.error { background: #dc2626; }
        .notification.info { background: #2563eb; }
        .sources-progress-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .sources-progress-content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            min-width: 500px;
            text-align: center;
        }
        .sources-progress-bar {
            background: #f0f0f0;
            border-radius: 10px;
            height: 20px;
            margin: 20px 0;
            overflow: hidden;
        }
        .sources-progress-fill {
            background: #4CAF50;
            height: 100%;
            width: 0%;
            transition: width 0.5s;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏢 Админ панель - Страховой ИИ</h1>
            <p>Система управления страховой базой знаний</p>
        </div>

        <div class="stats-grid">
            <a href="/admin/documents" class="stat-card" style="text-decoration:none;color:inherit;cursor:pointer;transition:transform 0.2s">
                <div class="stat-number">${stats.totalDocuments}</div>
                <div class="stat-label">Всего документов 👆</div>
            </a>
            <div class="stat-card" style="opacity:0.7;cursor:default">
                <div class="stat-number">${stats.totalChunks}</div>
                <div class="stat-label">Всего чанков</div>
            </div>
            <a href="/admin/companies" class="stat-card" style="text-decoration:none;color:inherit;cursor:pointer;transition:transform 0.2s">
                <div class="stat-number">${stats.totalCompanies}</div>
                <div class="stat-label">Страховых компаний 👆</div>
            </a>
            <a href="/admin/products" class="stat-card" style="text-decoration:none;color:inherit;cursor:pointer;transition:transform 0.2s">
                <div class="stat-number">${stats.totalProducts}</div>
                <div class="stat-label">Страховых продуктов 👆</div>
            </a>
            <a href="/admin/documents" class="stat-card" style="text-decoration:none;color:inherit;cursor:pointer;transition:transform 0.2s">
                <div class="stat-number">${stats.recentDocuments}</div>
                <div class="stat-label">Новых за неделю 👆</div>
            </a>
        </div>

        <div class="nav-links">
            <a href="/admin/documents" class="nav-link">📄 Документы</a>
            <a href="/admin/agents" class="nav-link">👥 Агенты</a>
        </div>

        <div class="agents-section">
            <h2>👥 Агенты (${agentsStats.total})</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
                ${availableAgents.map(agent => `
                    <div class="agent-card">
                        <div class="agent-name">${agent.name}</div>
                        <div class="agent-status ${agent.status === 'online' ? 'status-online' : agent.status === 'busy' ? 'status-busy' : 'status-offline'}">
                            ${agent.status === 'online' ? '🟢 Онлайн' : agent.status === 'busy' ? '🟡 Занят' : '🔴 Офлайн'}
                        </div>
                        <div class="agent-companies">Компании: ${agent.companies.join(', ')}</div>
                        <div class="agent-sessions">Сессий: ${agent.currentSessions}/${agent.maxSessions}</div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #e9ecef; border-radius: 5px; font-size: 14px;">
                <strong>Статистика:</strong> Онлайн: ${agentsStats.online}, Заняты: ${agentsStats.busy}, Офлайн: ${agentsStats.offline}, Запросы: ${agentsStats.pendingRequests}
            </div>
        </div>

        <div class="recent-docs">
            <h2>📋 Последние документы</h2>
            ${recentDocs.map(doc => `
                <div class="doc-item">
                    <a href="/admin/documents/${doc.id}" style="color:#2563eb;text-decoration:none;font-weight:500">${doc.title}</a>
                    ${doc.isApproved ? '<span style="margin-left:8px;background:#059669;color:#fff;padding:2px 6px;border-radius:10px;font-size:10px">✓</span>' : ''}
                    <br>
                    <small style="color:#6b7280">${this.getCompanyLabel(doc.companyCode)} • ${this.getProductLabel(doc.productCode)} • ${new Date(doc.createdAt).toLocaleDateString('ru-RU')}</small>
                </div>
            `).join('')}
        </div>

        
        <!-- Notification container -->
        <div id="notification" class="notification"></div>
    </div>

    <script>
        
        function showNotification(message, type) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = \`notification \${type}\`;
            notification.style.display = 'block';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 5000);
        }
        
        async function checkSourcesFromMain() {
            const button = event.target;
            const originalText = button.innerHTML;
            
            // Show loading state
            button.innerHTML = '⏳ Проверка...';
            button.disabled = true;
            
            // Show progress modal
            showSourcesProgressModal();
            
            try {
                // Start sources check
                const response = await fetch('/sources/check-all', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    // Simulate progress for better UX
                    updateSourcesProgress(0, 'Подготовка к проверке...');
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    updateSourcesProgress(25, 'Проверка источников...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    updateSourcesProgress(50, 'Анализ изменений...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    updateSourcesProgress(75, 'Обработка результатов...');
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    updateSourcesProgress(100, 'Проверка завершена!');
                    
                    setTimeout(() => {
                        hideSourcesProgressModal();
                        showNotification(\`✅ Проверка завершена! Проверено: \${result.data.checked}, найдено изменений: \${result.data.changesFound}\`, 'success');
                    }, 1000);
                } else {
                    throw new Error('Failed to check sources');
                }
            } catch (error) {
                hideSourcesProgressModal();
                showNotification('❌ Ошибка проверки источников: ' + error.message, 'error');
            } finally {
                // Restore button state
                button.innerHTML = originalText;
                button.disabled = false;
            }
        }
        
        function showSourcesProgressModal() {
            const modal = document.createElement('div');
            modal.id = 'sourcesProgressModal';
            modal.className = 'sources-progress-modal';
            modal.innerHTML = \`
                <div class="sources-progress-content">
                    <h3 style="margin-top: 0">🔄 Проверка источников</h3>
                    <div class="sources-progress-bar">
                        <div id="sourcesProgressFill" class="sources-progress-fill"></div>
                    </div>
                    <div id="sourcesProgressText">Подготовка к проверке...</div>
                    <div id="sourcesProgressDetails" style="margin-top: 15px; font-size: 14px; color: #666">
                        <div>📊 Проверяем все источники на изменения</div>
                    </div>
                    <button onclick="hideSourcesProgressModal()" style="margin-top: 20px; padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer;">Отмена</button>
                </div>
            \`;
            
            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hideSourcesProgressModal();
                }
            });
            
            document.body.appendChild(modal);
        }
        
        function hideSourcesProgressModal() {
            const modal = document.getElementById('sourcesProgressModal');
            if (modal) {
                modal.remove();
            }
            
            // Restore button state if it was cancelled
            const button = document.querySelector('button[onclick="checkSourcesFromMain()"]');
            if (button && button.disabled) {
                button.innerHTML = '🔄 Проверить источники';
                button.disabled = false;
            }
        }
        
        function updateSourcesProgress(percent, message) {
            const progressFill = document.getElementById('sourcesProgressFill');
            const progressText = document.getElementById('sourcesProgressText');
            
            if (progressFill) {
                progressFill.style.width = percent + '%';
            }
            if (progressText) {
                progressText.textContent = message;
            }
        }
        
        // Auto-refresh stats every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/kb/stats');
                const stats = await response.json();
                
                // Update stats in the page
                const statsElements = document.querySelectorAll('.stat-number');
                if (statsElements.length >= 4) {
                    statsElements[0].textContent = stats.totalDocuments;
                    statsElements[1].textContent = stats.totalChunks;
                    statsElements[2].textContent = stats.totalCompanies;
                    statsElements[3].textContent = stats.totalProducts;
                    if (statsElements[4]) {
                        statsElements[4].textContent = stats.recentDocuments;
                    }
                }
            } catch (error) {
                console.log('Stats update failed:', error);
            }
        }, 30000);
    </script>
</body>
</html>`;
  }

  /**
   * Генерация HTML для страницы документов
   */
  private generateDocumentsHTML(documents: any[], companies: string[]): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Документы - Админ панель</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .documents-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; }
        .company-badge { background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        .product-badge { background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        .nav-links { display: flex; gap: 10px; margin-bottom: 20px; }
        .nav-link { background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .nav-link:hover { background: #4b5563; }
        .nav-link.primary { background: #2563eb; }
        .nav-link.primary:hover { background: #1d4ed8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📄 Документы базы знаний</h1>
            <p>Всего документов: ${documents.length}</p>
        </div>

        <div class="nav-links">
            <a href="/admin" class="nav-link">🏠 Главная</a>
            <a href="/admin/documents/add-text" class="nav-link primary">📝 Добавить текст</a>
            <a href="/admin/files/upload" class="nav-link primary">📁 Загрузить файлы</a>
            <a href="/admin/sources" class="nav-link primary">🔗 Источники</a>
            <a href="/admin/analyze" class="nav-link">🔍 Анализ документов</a>
            <a href="/admin/search" class="nav-link">🔎 Поиск по базе</a>
            <a href="/admin/files/check-links" class="nav-link">🔧 Проверить ссылки</a>
        </div>

        <div class="documents-table">
            <table>
                <thead>
                    <tr>
                        <th>Название</th>
                        <th>Компания</th>
                        <th>Продукт</th>
                        <th>Чанков</th>
                        <th>Дата создания</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${documents.map(doc => `
                        <tr>
                            <td>
                                <a href="/admin/documents/${doc.id}" style="color:#2563eb;text-decoration:none;font-weight:500">${doc.title}</a>
                                ${doc.isApproved ? '<span style="margin-left:8px;background:#059669;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px">✓ Одобрено</span>' : ''}
                                ${doc.isObsolete ? '<span style="margin-left:8px;background:#f59e0b;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px">⏰ Неактуальный</span>' : ''}
                            </td>
                            <td><span class="company-badge" style="${doc.companyCode === 'GENERAL' ? 'background: #dbeafe; color: #1e40af; border: 1px solid #3b82f6; font-weight: 600;' : ''}">${this.getCompanyLabel(doc.companyCode)}</span></td>
                            <td><span class="product-badge">${this.getProductLabel(doc.productCode)}</span></td>
                            <td>${doc._count.chunks}</td>
                            <td>${new Date(doc.createdAt).toLocaleDateString('ru-RU')}</td>
                            <td>
                                <button onclick="deleteDoc('${doc.id}')" style="background:#dc2626;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer">🗑️ Удалить</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>
    <div id="notification" style="position:fixed;top:20px;right:20px;padding:15px;border-radius:8px;color:#fff;z-index:1000;display:none"></div>
    <script>
    async function deleteDoc(id){
        if(!confirm('Удалить этот документ из базы знаний?'))return;
        try{
            const r=await fetch(\`/kb/documents/\${id}\`,{method:'DELETE'});
            const res=await r.json();
            if(res.success){
                showNotification('✅ Документ удалён','success');
                setTimeout(()=>location.reload(),1000);
            }else{
                showNotification('❌ Ошибка удаления','error');
            }
        }catch(e){
            showNotification('❌ Ошибка: '+e.message,'error');
        }
    }
    function showNotification(msg,type){
        const n=document.getElementById('notification');
        n.textContent=msg;
        n.style.background=type==='success'?'#059669':'#dc2626';
        n.style.display='block';
        setTimeout(()=>n.style.display='none',3000);
    }
    </script>
</body>
</html>`;
  }


  /**
   * Генерация HTML для детального просмотра документа
   */
  private generateDocumentDetailHTML(document: any, chunks: any[]): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${document.title} - Админ панель</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .document-info { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .chunks-container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .chunk-item { padding: 20px; border-bottom: 1px solid #e5e7eb; }
        .chunk-item:last-child { border-bottom: none; }
        .chunk-header { font-weight: bold; color: #6b7280; margin-bottom: 10px; }
        .chunk-content { line-height: 1.6; }
        .company-badge { background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        .product-badge { background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
        .nav-links { display: flex; gap: 10px; margin-bottom: 20px; }
        .nav-link { background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .nav-link:hover { background: #4b5563; }
        .nav-link.primary { background: #2563eb; }
        .nav-link.primary:hover { background: #1d4ed8; }
        .edit-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .edit-modal-content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            min-width: 400px;
            text-align: center;
        }
        .edit-form-group {
            margin-bottom: 20px;
            text-align: left;
        }
        .edit-form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
        }
        .edit-form-group select {
            width: 100%;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 5px;
            font-size: 16px;
        }
        .edit-modal-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-top: 20px;
        }
        .edit-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 600;
        }
        .edit-btn-primary {
            background: #2563eb;
            color: white;
        }
        .edit-btn-secondary {
            background: #6b7280;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📄 ${document.title}</h1>
        </div>

        <div class="nav-links">
            <a href="/admin" class="nav-link">🏠 Главная</a>
            <a href="/admin/documents" class="nav-link">📄 Все документы</a>
        </div>

        <div class="document-info">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px">
                <div>
                    <h2 style="margin:0">Информация о документе</h2>
                    ${document.isApproved ? '<span style="background:#059669;color:#fff;padding:4px 12px;border-radius:12px;font-size:14px;margin-left:10px">✓ Одобрено</span>' : ''}
                </div>
                <div>
                    <button onclick="renameDocument()" style="background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;margin-right:5px">✏️ Переименовать</button>
                    ${document.isObsolete ? 
                        '<button onclick="markAsCurrentFromDetail()" style="background:#059669;color:#fff;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;margin-right:5px">📅 Пометить как актуальный</button>' : 
                        '<button onclick="markAsObsoleteFromDetail()" style="background:#f59e0b;color:#fff;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;margin-right:5px">⏰ Пометить как неактуальный</button>'
                    }
                    <button onclick="deleteDocument()" style="background:#dc2626;color:#fff;border:none;padding:8px 16px;border-radius:5px;cursor:pointer">🗑️ Удалить</button>
                </div>
            </div>
            <p><strong>Компания:</strong> <span class="company-badge" style="${document.companyCode === 'GENERAL' ? 'background: #dbeafe; color: #1e40af; border: 1px solid #3b82f6; font-weight: 600;' : ''}">${this.getCompanyLabel(document.companyCode)}</span> 
                <button onclick="editDocumentCompany()" style="background:#2563eb;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;margin-left:10px;font-size:12px">✏️ Изменить</button>
            </p>
            <p><strong>Статус актуальности:</strong> 
                ${document.isObsolete ? 
                    '<span style="background:#f59e0b;color:#fff;padding:4px 12px;border-radius:12px;font-size:14px">⏰ Неактуальный</span>' : 
                    '<span style="background:#059669;color:#fff;padding:4px 12px;border-radius:12px;font-size:14px">📅 Актуальный</span>'
                }
                ${document.obsoleteAt ? `<br><small style="color:#6b7280">Помечен как неактуальный: ${new Date(document.obsoleteAt).toLocaleString('ru-RU')}</small>` : ''}
            </p>
            <p><strong>Продукт:</strong> <span class="product-badge">${this.getProductLabel(document.productCode)}</span>
                <button onclick="editDocumentProduct()" style="background:#2563eb;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;margin-left:10px;font-size:12px">✏️ Изменить</button>
            </p>
            <p><strong>Дата создания:</strong> ${new Date(document.createdAt).toLocaleString('ru-RU')}</p>
            <p><strong>Количество чанков:</strong> ${document._count.chunks}</p>
            ${document.sourceUrl ? `<p><strong>Источник:</strong> <a href="${document.sourceUrl}" target="_blank">${document.sourceUrl}</a></p>` : ''}
            ${document.fileUrl ? `<p><strong>Файл:</strong> <a href="${document.fileUrl}" target="_blank">📄 Открыть файл</a><br><small style="color:#6b7280">URL: ${document.fileUrl}</small></p>` : ''}
            ${document.version ? `<p><strong>Версия:</strong> ${document.version}</p>` : ''}
            ${document.approvedAt ? `<p><strong>Одобрено:</strong> ${new Date(document.approvedAt).toLocaleString('ru-RU')} (${document.approvedBy || 'admin'})</p>` : ''}
        </div>

        <div class="chunks-container">
            <h2 style="padding: 20px; margin: 0; background: #f9fafb;">Содержимое документа (${chunks.length} чанков)</h2>
            ${chunks.map((chunk, index) => `
                <div class="chunk-item">
                    <div class="chunk-header">Чанк ${index + 1} (${chunk.text.length} символов)</div>
                    <div class="chunk-content">${chunk.text}</div>
                </div>
            `).join('')}
        </div>
    </div>
    <script>
    const docId='${document.id}';
    const currentTitle='${document.title.replace(/'/g, "\\'")}';
    async function renameDocument(){
        const newTitle=prompt('Новое название документа:',currentTitle);
        if(!newTitle||newTitle===currentTitle)return;
        try{
            const r=await fetch(\`/kb/documents/\${docId}/rename\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:newTitle})});
            if((await r.json()).success){
                alert('✅ Документ переименован');
                location.reload();
            }
        }catch(e){alert('❌ Ошибка: '+e.message)}
    }
    async function deleteDocument(){
        if(!confirm('Удалить этот документ из базы знаний?'))return;
        try{
            const r=await fetch(\`/kb/documents/\${docId}\`,{method:'DELETE'});
            if((await r.json()).success){
                alert('✅ Документ удалён');
                window.location.href='/admin/documents';
            }
        }catch(e){alert('❌ Ошибка: '+e.message)}
    }
    
    async function markAsCurrentFromDetail(){
        if(!confirm('Пометить документ как актуальный?'))return;
        try{
            const r=await fetch(\`/kb/documents/\${docId}/unobsolete\`,{method:'POST'});
            if((await r.json()).success){
                alert('✅ Документ помечен как актуальный');
                location.reload();
            }
        }catch(e){alert('❌ Ошибка: '+e.message)}
    }
    
    async function markAsObsoleteFromDetail(){
        if(!confirm('Пометить документ как неактуальный?'))return;
        try{
            const r=await fetch(\`/kb/documents/\${docId}/obsolete\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Помечено вручную'})});
            if((await r.json()).success){
                alert('✅ Документ помечен как неактуальный');
                location.reload();
            }
        }catch(e){alert('❌ Ошибка: '+e.message)}
    }
    
    async function editDocumentCompany(){
        const currentCompany = '${document.companyCode}';
        const companyOptions = [
            {code: 'GENERAL', name: '🌐 Общие правила страхования'},
            {code: 'SOGAZ', name: 'СОГАЗ'},
            {code: 'INGOSSTRAH', name: 'Ингосстрах'},
            {code: 'RESOGARANTIA', name: 'Ресо-Гарантия'},
            {code: 'VSK', name: 'ВСК'},
            {code: 'ROSGOSSTRAH', name: 'Росгосстрах'},
            {code: 'TINKOFF', name: 'Тинькофф'},
            {code: 'SBERBANK', name: 'Сбербанк'},
            {code: 'ALFA', name: 'АльфаСтрахование'}
        ];
        
        showEditModal('company', 'Страховая компания', companyOptions, currentCompany);
    }
    
    async function editDocumentProduct(){
        const currentProduct = '${document.productCode}';
        const productOptions = [
            {code: 'OSAGO', name: 'ОСАГО'},
            {code: 'KASKO', name: 'КАСКО'},
            {code: 'MORTGAGE', name: 'Ипотека'},
            {code: 'LIFE', name: 'Жизнь'},
            {code: 'HEALTH', name: 'Здоровье (ДМС)'},
            {code: 'TRAVEL', name: 'Путешествия'},
            {code: 'PROPERTY', name: 'Имущество'},
            {code: 'LIABILITY', name: 'Ответственность'},
            {code: 'COMPANY_INFO', name: 'Информация о компании'},
            {code: 'PRICING', name: 'Тарифы'},
            {code: 'GENERAL', name: 'Общее'}
        ];
        
        showEditModal('product', 'Тип продукта', productOptions, currentProduct);
    }
    
    function showEditModal(type, title, options, currentValue) {
        const modal = document.createElement('div');
        modal.id = 'editModal';
        modal.className = 'edit-modal';
        
        const optionsHtml = options.map(option => 
            \`<option value="\${option.code}" \${option.code === currentValue ? 'selected' : ''}>\${option.name}</option>\`
        ).join('');
        
        modal.innerHTML = \`
            <div class="edit-modal-content">
                <h3 style="margin-top: 0">✏️ Изменить \${title}</h3>
                <div class="edit-form-group">
                    <label for="editSelect">\${title}:</label>
                    <select id="editSelect">
                        \${optionsHtml}
                    </select>
                </div>
                <div class="edit-modal-buttons">
                    <button onclick="saveEdit('\${type}')" class="edit-btn edit-btn-primary">💾 Сохранить</button>
                    <button onclick="closeEditModal()" class="edit-btn edit-btn-secondary">❌ Отмена</button>
                </div>
            </div>
        \`;
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEditModal();
            }
        });
        
        document.body.appendChild(modal);
    }
    
    function closeEditModal() {
        const modal = document.getElementById('editModal');
        if (modal) {
            modal.remove();
        }
    }
    
    async function saveEdit(type) {
        const select = document.getElementById('editSelect');
        const newValue = select.value;
        
        if (!newValue) {
            alert('Пожалуйста, выберите значение');
            return;
        }
        
        try {
            const response = await fetch(\`/kb/documents/\${docId}/update\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    [type + 'Code']: newValue
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                closeEditModal();
                alert('✅ Документ обновлён');
                location.reload();
            } else {
                alert('❌ Ошибка обновления: ' + result.message);
            }
        } catch (error) {
            alert('❌ Ошибка: ' + error.message);
        }
    }
    </script>
</body>
</html>`;
  }

  /**
   * Генерация HTML для поисковой страницы
   */
  private generateSearchHTML(companies: string[]): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Поиск - Админ панель</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .search-form { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 600; }
        .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 5px; font-size: 16px; }
        .search-button { background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
        .search-button:hover { background: #1d4ed8; }
        .search-results { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .result-item { padding: 20px; border-bottom: 1px solid #e5e7eb; }
        .result-item:last-child { border-bottom: none; }
        .result-title { font-size: 1.2em; font-weight: bold; margin-bottom: 10px; }
        .result-meta { color: #6b7280; margin-bottom: 10px; }
        .result-score { background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; }
        .result-content { line-height: 1.6; }
        .nav-links { display: flex; gap: 10px; margin-bottom: 20px; }
        .nav-link { background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .nav-link:hover { background: #4b5563; }
        .nav-link.primary { background: #2563eb; }
        .nav-link.primary:hover { background: #1d4ed8; }
        .loading { text-align: center; padding: 20px; color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Поиск по базе знаний</h1>
            <p>Семантический поиск по базе знаний о страховых продуктах</p>
        </div>

        <div class="nav-links">
            <a href="/admin" class="nav-link">🏠 Главная</a>
            <a href="/admin/documents" class="nav-link">📄 Документы</a>
        </div>

        <div class="search-form">
            <form id="searchForm">
                <div class="form-group">
                    <label for="query">Поисковый запрос:</label>
                    <input type="text" id="query" name="query" placeholder="Например: стоимость ОСАГО, условия ипотечного страхования..." required>
                </div>
                <div class="form-group">
                    <label for="companyCode">Компания (необязательно):</label>
                    <select id="companyCode" name="companyCode">
                        <option value="">Все компании</option>
                        ${companies.map(company => `<option value="${company}">${company}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="limit">Количество результатов:</label>
                    <select id="limit" name="limit">
                        <option value="5">5</option>
                        <option value="10" selected>10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                    </select>
                </div>
                <button type="submit" class="search-button">🔍 Поиск</button>
            </form>
        </div>

        <div id="searchResults" class="search-results" style="display: none;">
            <div class="loading">Выполняется поиск...</div>
        </div>
    </div>

    <script>
        document.getElementById('searchForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const query = formData.get('query');
            const companyCode = formData.get('companyCode');
            const limit = formData.get('limit');
            
            const resultsDiv = document.getElementById('searchResults');
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div class="loading">Выполняется поиск...</div>';
            
            try {
                const response = await fetch('/kb/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        query: query,
                        companyCode: companyCode || undefined,
                        limit: parseInt(limit)
                    })
                });
                
                const results = await response.json();
                
                if (results.length === 0) {
                    resultsDiv.innerHTML = '<div class="loading">Результаты не найдены</div>';
                    return;
                }
                
                resultsDiv.innerHTML = results.map(result => \`
                    <div class="result-item">
                        <div class="result-title">
                            <a href="/admin/documents/\${result.docId}" style="color:#2563eb;text-decoration:none;font-weight:bold">\${result.docTitle}</a>
                            \${result.isApproved ? '<span style="margin-left:8px;background:#059669;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px">✓ Одобрено</span>' : ''}
                            \${result.isObsolete ? '<span style="margin-left:8px;background:#f59e0b;color:#fff;padding:2px 8px;border-radius:12px;font-size:11px">⏰ Неактуальный</span>' : ''}
                        </div>
                        <div class="result-meta">
                            \${result.companyCode} • \${result.productCode} • 
                            <span class="result-score">Релевантность: \${(result.score * 100).toFixed(1)}%</span>
                        </div>
                        <div class="result-content">\${result.text}</div>
                    </div>
                \`).join('');
                
            } catch (error) {
                resultsDiv.innerHTML = '<div class="loading">Ошибка поиска: ' + error.message + '</div>';
            }
        });
    </script>
</body>
</html>`;
  }

  /**
   * Генерация HTML для страницы проверки файла
   */
  private generateFileReviewHTML(fileId: string): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Проверка файла - Админ панель</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .duplicate-item, .conflict-item { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .conflict-item { background: #fee2e2; border-left-color: #dc2626; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; margin: 5px; }
        .btn-primary { background: #2563eb; color: white; }
        .btn-danger { background: #dc2626; color: white; }
        .btn-secondary { background: #6b7280; color: white; }
        .checkbox { margin-right: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Проверка и одобрение файла</h1>
            <a href="/admin/files/upload">← Назад к загрузке</a>
        </div>

        <div id="fileData" class="section">
            <p>Загрузка...</p>
        </div>

        <div id="duplicates" class="section" style="display:none;">
            <h2>🔍 Найденные дубликаты</h2>
            <div id="duplicatesList"></div>
        </div>

        <div id="conflicts" class="section" style="display:none;">
            <h2>⚠️ Найденные конфликты</h2>
            <div id="conflictsList"></div>
        </div>

        <div class="section">
            <button class="btn btn-primary" onclick="approveFile()">✅ Одобрить и добавить в базу знаний</button>
            <button class="btn btn-danger" onclick="rejectFile()">❌ Отклонить файл</button>
            <button class="btn btn-secondary" onclick="window.location.href='/admin/files/upload'">Отмена</button>
        </div>
    </div>

    <script>
        const fileId = '${fileId}';
        let fileData = null;
        let selectedDuplicates = new Set();

        async function loadFileData() {
            try {
                const response = await fetch(\`/files/\${fileId}\`);
                const result = await response.json();
                
                if (result.success) {
                    fileData = result.data;
                    displayFileData();
                }
            } catch (error) {
                alert('Ошибка загрузки данных файла');
            }
        }

        function displayFileData() {
            document.getElementById('fileData').innerHTML = \`
                <h2>📄 \${fileData.originalName}</h2>
                <p><strong>Компания:</strong> \${fileData.companyCode || 'Не определена'}</p>
                <p><strong>Продукт:</strong> \${fileData.productCode || 'Не определён'}</p>
                <p><strong>Тип документа:</strong> \${fileData.documentType || 'Не определён'}</p>
                <p><strong>Размер:</strong> \${(fileData.size / 1024).toFixed(2)} KB</p>
            \`;

            if (fileData.duplicates && fileData.duplicates.length > 0) {
                document.getElementById('duplicates').style.display = 'block';
                document.getElementById('duplicatesList').innerHTML = fileData.duplicates.map(dup => \`
                    <div class="duplicate-item">
                        <label>
                            <input type="checkbox" class="checkbox" value="\${dup.docId}" onchange="toggleDuplicate('\${dup.docId}')">
                            <strong>\${dup.title}</strong>
                        </label>
                        <p>\${dup.reason}</p>
                        <p style="color: #6b7280; font-size: 14px;">Схожесть: \${Math.round(dup.similarity * 100)}%</p>
                        <p style="font-size: 12px; color: #9ca3af;">✓ Заменить этот документ новым</p>
                    </div>
                \`).join('');
            }

            if (fileData.conflicts && fileData.conflicts.length > 0) {
                document.getElementById('conflicts').style.display = 'block';
                document.getElementById('conflictsList').innerHTML = fileData.conflicts.map(conf => \`
                    <div class="conflict-item">
                        <h4>\${conf.conflictType}</h4>
                        <p>\${conf.description}</p>
                        <p><strong>Документ:</strong> \${conf.docTitle}</p>
                        <p><strong>Новое значение:</strong> \${conf.newValue}</p>
                        <p><strong>Старое значение:</strong> \${conf.oldValue}</p>
                    </div>
                \`).join('');
            }
        }

        function toggleDuplicate(docId) {
            if (selectedDuplicates.has(docId)) {
                selectedDuplicates.delete(docId);
            } else {
                selectedDuplicates.add(docId);
            }
        }

        async function approveFile() {
            if (!confirm('Одобрить файл и добавить в базу знаний?')) return;

            try {
                const response = await fetch(\`/files/\${fileId}/approve\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        duplicatesToReplace: Array.from(selectedDuplicates)
                    })
                });

                const result = await response.json();
                
                if (result.success) {
                    alert('✅ Файл одобрен и добавлен в базу знаний!');
                    window.location.href = '/admin/files/upload';
                } else {
                    alert('❌ Ошибка одобрения файла');
                }
            } catch (error) {
                alert('❌ Ошибка: ' + error.message);
            }
        }

        async function rejectFile() {
            if (!confirm('Отклонить файл? Он будет удалён.')) return;

            try {
                const response = await fetch(\`/files/\${fileId}/reject\`, {
                    method: 'POST'
                });

                const result = await response.json();
                
                if (result.success) {
                    alert('✅ Файл отклонён');
                    window.location.href = '/admin/files/upload';
                } else {
                    alert('❌ Ошибка');
                }
            } catch (error) {
                alert('❌ Ошибка: ' + error.message);
            }
        }

        loadFileData();
    </script>
</body>
</html>`;
  }

  private generateSourcesHTML(sources: any[], pendingChanges: any[]): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Источники</title>
<style>
body{font-family:sans-serif;margin:0;padding:20px;background:#f5f5f5}
.container{max-width:1200px;margin:0 auto}
.header{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.nav-links{display:flex;gap:10px;margin-bottom:20px}
.nav-link{background:#6b7280;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px}
.section{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.btn{padding:8px 16px;border:none;border-radius:5px;cursor:pointer;margin:2px}
.btn-primary{background:#2563eb;color:#fff}
.btn-danger{background:#dc2626;color:#fff}
.btn-success{background:#059669;color:#fff}
.source-card{border:1px solid #e5e7eb;padding:15px;margin:15px 0;border-radius:8px}
.change-card{border-left:4px solid #f59e0b;background:#fffbeb;padding:15px;margin:10px 0}
input,select{width:100%;padding:8px;border:1px solid #d1d5db;border-radius:5px;margin:5px 0}
.sources-progress-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
}
.sources-progress-content {
    background: white;
    padding: 30px;
    border-radius: 10px;
    min-width: 500px;
    text-align: center;
}
.sources-progress-bar {
    background: #f0f0f0;
    border-radius: 10px;
    height: 20px;
    margin: 20px 0;
    overflow: hidden;
}
.sources-progress-fill {
    background: #4CAF50;
    height: 100%;
    width: 0%;
    transition: width 0.5s;
}
</style></head><body>
<div class="container">
<div class="header"><h1>🔗 Источники</h1></div>
<div class="nav-links">
<a href="/admin" class="nav-link">🏠 Главная</a>
<a href="/admin/files/upload" class="nav-link">📁 Файлы</a>
</div>
<div class="section">
<button onclick="checkAll()" class="btn btn-primary">🔄 Проверить все источники</button>
</div>
${pendingChanges.length > 0 ? `<div class="section">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
<h2 style="margin:0">⚠️ Ожидают проверки (${pendingChanges.length})</h2>
<div style="display:flex;gap:10px;align-items:center">
<select id="downloadLimit" style="padding:8px;border:1px solid #d1d5db;border-radius:5px">
<option value="10">Первые 10 документов (быстро)</option>
<option value="20">Первые 20 документов</option>
<option value="50" selected>Первые 50 документов (рекомендуется)</option>
<option value="100">Первые 100 документов</option>
<option value="200">Первые 200 документов</option>
<option value="">Все документы (может занять много времени)</option>
</select>
<button onclick="approveAllWithProgress()" class="btn btn-success">✅ Одобрить выбранное количество</button>
</div>
</div>
<div style="margin-bottom:15px;padding:10px;background:#f0f9ff;border-radius:8px">
<p style="margin:0"><strong>📊 Найдено:</strong></p>
<p style="margin:5px 0">📄 PDF файлов: ${pendingChanges.filter(c => c.changeType === 'pdf_found').length}</p>
<p style="margin:5px 0">📰 Статей: ${pendingChanges.filter(c => c.changeType === 'article_found').length}</p>
</div>
${pendingChanges.map(c => `<div class="change-card"><h4>${c.description}</h4>
<p><b>Источник:</b> ${c.sourceName}</p>
<button onclick="approve('${c.id}')" class="btn btn-success">✅ Одобрить</button>
<button onclick="reject('${c.id}')" class="btn btn-danger">❌ Отклонить</button>
</div>`).join('')}</div>` : ''}
<div class="section"><h2>➕ Добавить источник</h2>
<p style="color:#6b7280;margin-bottom:15px">Введите URL - система автоматически определит компанию и тип источника</p>
<input id="url" placeholder="https://www.sogaz.ru/upload/rules_osago_2024.pdf" required style="margin-bottom:10px">
<div style="font-size:14px;color:#6b7280;margin-bottom:10px">
<p><strong>Примеры:</strong></p>
<p>• PDF: https://www.sogaz.ru/rules.pdf</p>
<p>• Новости: https://www.ingos.ru/news/</p>
<p>• Страница: https://www.tinkoff.ru/insurance/kasko/</p>
</div>
<button onclick="addSource()" class="btn btn-primary">➕ Добавить источник</button>
</div>
<div class="section"><h2>📚 Все источники (${sources.length})</h2>
${sources.map(s => `<div class="source-card">
<h3>${s.name}</h3>
<p>${s.url}</p>
<p>Тип: ${s.type} | Компания: ${s.companyCode || '-'} | Продукт: ${s.productCode || '-'}</p>
<p>Проверка: ${s.lastChecked ? new Date(s.lastChecked).toLocaleString('ru-RU') : 'Никогда'} | Изменений: ${s._count?.changes || 0}</p>
<button onclick="check('${s.id}')" class="btn btn-primary">🔄 Проверить</button>
<button onclick="del('${s.id}')" class="btn btn-danger">🗑️ Удалить</button>
</div>`).join('')}
</div></div>
<script>
async function addSource(){
const url=document.getElementById('url').value;
if(!url){alert('Введите URL');return}
const d={url};
try{
const r=await fetch('/sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
const res=await r.json();
if(res.success){
alert('✅ Источник добавлен! Компания и тип определены автоматически.');
location.reload()}else{alert('❌ Ошибка добавления')}}catch(e){alert('❌ '+e.message)}}
async function checkAll(){
const button = event.target;
const originalText = button.innerHTML;

// Show loading state
button.innerHTML = '⏳ Проверка...';
button.disabled = true;

// Show progress modal
showSourcesProgressModal();

try {
    // Start sources check
    const response = await fetch('/sources/check-all', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (response.ok) {
        const result = await response.json();
        
        // Simulate progress for better UX
        updateSourcesProgress(0, 'Подготовка к проверке...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        updateSourcesProgress(25, 'Проверка источников...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        updateSourcesProgress(50, 'Анализ изменений...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        updateSourcesProgress(75, 'Обработка результатов...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        updateSourcesProgress(100, 'Проверка завершена!');
        
        setTimeout(() => {
            hideSourcesProgressModal();
            alert(\`✅ Проверка завершена! Проверено: \${result.data.checked}, найдено изменений: \${result.data.changesFound}\`);
            location.reload();
        }, 1000);
    } else {
        throw new Error('Failed to check sources');
    }
} catch (error) {
    hideSourcesProgressModal();
    alert('❌ Ошибка проверки источников: ' + error.message);
} finally {
    // Restore button state
    button.innerHTML = originalText;
    button.disabled = false;
}}
async function check(id){
const r=await fetch(\`/sources/\${id}/check\`,{method:'POST'});
const d=await r.json();
alert(\`✅ Найдено: \${d.data.length} изменений\`);location.reload()}
async function del(id){
if(!confirm('Удалить?'))return;
await fetch(\`/sources/\${id}\`,{method:'DELETE'});location.reload()}
async function approve(id){
try{
const r=await fetch(\`/sources/changes/\${id}/approve\`,{method:'POST'});
const res=await r.json();
if(res.success){alert('✅ Одобрено и добавлено в БД');location.reload()}
else{alert('❌ Ошибка: '+res.message)}}catch(e){alert('❌ '+e.message)}}
async function approveAll(){
if(!confirm('Одобрить все изменения и добавить в базу данных?'))return;
showProgressModal();
try{
const r=await fetch('/sources/changes/approve-all-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
const res=await r.json();
if(res.success){
updateProgress(100, res.data.approved, res.data.failed, res.data.total);
setTimeout(() => {
hideProgressModal();
alert(\`✅ Готово!\n\nВсего: \${res.data.total}\nОдобрено: \${res.data.approved}\nОшибок: \${res.data.failed}\`);
location.reload();
}, 1500);
}else{
hideProgressModal();
alert('❌ Ошибка')
}}catch(e){
hideProgressModal();
alert('❌ '+e.message)
}}

async function approveAllWithProgress(){
const limit = document.getElementById('downloadLimit').value;
const limitText = limit ? \`первые \${limit}\` : 'все';
if(!confirm(\`Одобрить \${limitText} изменения и добавить в базу данных с детальным прогрессом?\`))return;

console.log('Starting sources approval with limit:', limit);
showSourcesProgressModal();

try{
// Получаем список изменений для обработки
const changesResponse = await fetch('/sources/changes/pending');
const changesResult = await changesResponse.json();
let changesToProcess = changesResult.data || [];

if (limit && limit !== '') {
const parsedLimit = parseInt(limit);
if (!isNaN(parsedLimit)) {
changesToProcess = changesToProcess.slice(0, parsedLimit);
console.log(\`Limited to \${parsedLimit} changes, processing \${changesToProcess.length}\`);
}
}

const changeIds = changesToProcess.map(c => c.id);
console.log('Processing change IDs:', changeIds);

// Запускаем обработку с прогрессом
const r=await fetch('/sources/changes/approve-all-with-detailed-progress',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({changeIds})
});

const res=await r.json();
if(res.success){
// Подключаемся к SSE для получения детального прогресса
connectToSourcesProgressStream(res.data.progressId);
}else{
hideSourcesProgressModal();
showNotification('❌ Ошибка запуска обработки','error');
}
}catch(error){
hideSourcesProgressModal();
showNotification('❌ '+error.message,'error');
}}

function showProgressModal(){
const modal = document.createElement('div');
modal.id = 'progressModal';
modal.innerHTML = \`
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center">
<div style="background:white;padding:30px;border-radius:10px;min-width:400px;text-align:center">
<h3 style="margin-top:0">📥 Обработка документов...</h3>
<div style="background:#f0f0f0;border-radius:10px;height:20px;margin:20px 0;overflow:hidden">
<div id="progressBar" style="background:#4CAF50;height:100%;width:0%;transition:width 0.3s"></div>
</div>
<div id="progressText">Подготовка...</div>
<div id="progressDetails" style="margin-top:15px;font-size:14px;color:#666">
<div>📊 Обработано: <span id="processed">0</span></div>
<div>✅ Успешно: <span id="approved">0</span></div>
<div>❌ Ошибок: <span id="failed">0</span></div>
</div>
</div>
</div>
\`;
document.body.appendChild(modal);
}

function updateProgress(percent, approved, failed, total){
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const processedSpan = document.getElementById('processed');
const approvedSpan = document.getElementById('approved');
const failedSpan = document.getElementById('failed');

if(progressBar) progressBar.style.width = percent + '%';
if(progressText) progressText.textContent = \`Прогресс: \${percent}%\`;
if(processedSpan) processedSpan.textContent = approved + failed;
if(approvedSpan) approvedSpan.textContent = approved;
if(failedSpan) failedSpan.textContent = failed;
}

function hideProgressModal(){
const modal = document.getElementById('progressModal');
if(modal) modal.remove();
}

function showSourcesProgressModal(){
console.log('Creating sources progress modal...');
const modal = document.createElement('div');
modal.id = 'sourcesProgressModal';
modal.innerHTML = \`
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center">
<div style="background:white;padding:30px;border-radius:10px;min-width:500px;text-align:center">
<h3 style="margin-top:0">📥 Скачивание источников...</h3>
<div style="background:#f0f0f0;border-radius:10px;height:20px;margin:20px 0;overflow:hidden">
<div id="sourcesProgressBar" style="background:#4CAF50;height:100%;width:0%;transition:width 0.5s"></div>
</div>
<div id="sourcesProgressText">Подготовка к скачиванию...</div>
<div id="sourcesProgressDetails" style="margin-top:15px;font-size:14px;color:#666;text-align:left">
<div id="sourcesCurrentStep">⏳ Ожидание...</div>
<div id="sourcesStepDetails" style="margin-top:10px;font-size:12px;color:#999"></div>
</div>
</div>
</div>
\`;
document.body.appendChild(modal);
modal.style.display = 'block';
modal.style.visibility = 'visible';
modal.style.zIndex = '99999';
console.log('Sources progress modal added to DOM');
}

function hideSourcesProgressModal(){
console.log('Hiding sources progress modal...');
const modal = document.getElementById('sourcesProgressModal');
if(modal) {
console.log('Modal found, removing...');
modal.remove();
}
}

function connectToSourcesProgressStream(progressId){
console.log('Connecting to sources SSE stream:', progressId);
const eventSource = new EventSource(\`/sources/progress/\${progressId}\`);

eventSource.onopen = function(event) {
console.log('Sources SSE connection opened:', event);
};

eventSource.onmessage = function(event) {
console.log('Sources SSE message received:', event.data);
try {
const data = JSON.parse(event.data);
updateSourcesProgress(data);
} catch (error) {
console.error('Error parsing sources progress data:', error);
}
};

eventSource.onerror = function(error) {
console.error('Sources SSE error:', error);
eventSource.close();

setTimeout(async () => {
console.log('Sources SSE error occurred, waiting 3 seconds before hiding modal...');
hideSourcesProgressModal();
showNotification('✅ Скачивание завершено', 'success');
location.reload();
}, 3000);
};

window.currentSourcesEventSource = eventSource;
}

function updateSourcesProgress(data){
const progressBar = document.getElementById('sourcesProgressBar');
const progressText = document.getElementById('sourcesProgressText');
const currentStep = document.getElementById('sourcesCurrentStep');
const stepDetails = document.getElementById('sourcesStepDetails');

if (progressBar) progressBar.style.width = data.progress + '%';
if (progressText) progressText.textContent = data.message;

const stepIcons = {
start: '🚀',
downloading: '📥',
processing: '⚙️',
analyzing: '🔍',
saving: '💾',
complete: '✅',
error: '❌'
};

if (currentStep) {
currentStep.textContent = \`\${stepIcons[data.step] || '⏳'} \${data.message}\`;
}

if (stepDetails && data.details) {
let detailsText = '';
if (data.details.currentSource) {
detailsText += \`📄 \${data.details.currentSource}\`;
}
if (data.details.status) {
detailsText += \`\\n\${data.details.status}\`;
}
if (data.details.current && data.details.total) {
detailsText += \`\\n📊 Прогресс: \${data.details.current}/\${data.details.total}\`;
}
if (data.details.downloaded !== undefined) {
detailsText += \`\\n📥 Скачано: \${data.details.downloaded}\`;
}
if (data.details.processed !== undefined) {
detailsText += \`\\n⚙️ Обработано: \${data.details.processed}\`;
}
if (data.details.errors !== undefined && data.details.errors > 0) {
detailsText += \`\\n❌ Ошибок: \${data.details.errors}\`;
}
stepDetails.innerHTML = detailsText.replace(/\\n/g, '<br>');
}

if (data.step === 'complete') {
setTimeout(() => {
hideSourcesProgressModal();
if (window.currentSourcesEventSource) {
window.currentSourcesEventSource.close();
}
showNotification(\`✅ Скачивание завершено! Обработано: \${data.details?.processed || 0}\`, 'success');
location.reload();
}, 2000);
} else if (data.step === 'error') {
setTimeout(() => {
hideSourcesProgressModal();
if (window.currentSourcesEventSource) {
window.currentSourcesEventSource.close();
}
showNotification('❌ Ошибка скачивания источников', 'error');
}, 1000);
}
}
async function reject(id){
await fetch(\`/sources/changes/\${id}/reject\`,{method:'POST'});
alert('✅ Отклонено');location.reload()}

function showSourcesProgressModal() {
    const modal = document.createElement('div');
    modal.id = 'sourcesProgressModal';
    modal.className = 'sources-progress-modal';
    modal.innerHTML = \`
        <div class="sources-progress-content">
            <h3 style="margin-top: 0">🔄 Проверка источников</h3>
            <div class="sources-progress-bar">
                <div id="sourcesProgressFill" class="sources-progress-fill"></div>
            </div>
            <div id="sourcesProgressText">Подготовка к проверке...</div>
            <div id="sourcesProgressDetails" style="margin-top: 15px; font-size: 14px; color: #666">
                <div>📊 Проверяем все источники на изменения</div>
            </div>
            <button onclick="hideSourcesProgressModal()" style="margin-top: 20px; padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer;">Отмена</button>
        </div>
    \`;
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideSourcesProgressModal();
        }
    });
    
    document.body.appendChild(modal);
}

function hideSourcesProgressModal() {
    const modal = document.getElementById('sourcesProgressModal');
    if (modal) {
        modal.remove();
    }
    
    // Restore button state if it was cancelled
    const button = document.querySelector('button[onclick="checkAll()"]');
    if (button && button.disabled) {
        button.innerHTML = '🔄 Проверить все источники';
        button.disabled = false;
    }
}

function updateSourcesProgress(percent, message) {
    const progressFill = document.getElementById('sourcesProgressFill');
    const progressText = document.getElementById('sourcesProgressText');
    
    if (progressFill) {
        progressFill.style.width = percent + '%';
    }
    if (progressText) {
        progressText.textContent = message;
    }
}
</script></body></html>`;
  }

  private generateFileUploadHTML(): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Загрузка файлов</title>
<style>
body{font-family:sans-serif;margin:0;padding:20px;background:#f5f5f5}
.container{max-width:1200px;margin:0 auto}
.header{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.nav-links{display:flex;gap:10px;margin-bottom:20px}
.nav-link{background:#6b7280;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px}
.section{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.drop-zone{border:2px dashed #cbd5e0;border-radius:8px;padding:40px;text-align:center;cursor:pointer}
.drop-zone:hover{border-color:#2563eb;background:#eff6ff}
.btn{padding:10px 20px;border:none;border-radius:5px;cursor:pointer;font-weight:600;margin:5px}
.btn-primary{background:#2563eb;color:#fff}
.btn-secondary{background:#6b7280;color:#fff}
input,select{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:5px;margin:10px 0}
.file-card{border:1px solid #e5e7eb;padding:15px;margin:15px 0;border-radius:8px;background:#fafafa}
.notification{position:fixed;top:20px;right:20px;padding:15px;border-radius:8px;color:#fff;z-index:1000;display:none}
.notification.success{background:#059669}
.notification.error{background:#dc2626}
.notification.info{background:#2563eb}
@keyframes pulse{0%{opacity:1}50%{opacity:0.7}100%{opacity:1}}
</style></head><body>
<div class="container">
<div class="header"><h1>📁 Загрузка файлов</h1><p>Загрузите PDF, DOCX или TXT файлы с правилами страхования</p></div>
<div class="nav-links">
<a href="/admin" class="nav-link">🏠 Главная</a>
<a href="/admin/documents" class="nav-link">📄 Документы</a>
<a href="/admin/sources" class="nav-link">🔗 Источники</a>
</div>
<div class="section">
<h2>📤 Загрузить файл</h2>
<div class="drop-zone" id="dropZone">
<input type="file" id="fileInput" style="display:none" accept=".pdf,.docx,.txt">
<p style="font-size:48px;margin:0">📄</p>
<p style="font-size:18px">Перетащите файл сюда или нажмите</p>
<p style="color:#6b7280;font-size:12px">PDF, DOCX, TXT (до 10MB)</p>
</div>
<div id="selectedFile" style="display:none;margin-top:20px;padding:15px;background:#eff6ff;border-radius:8px">
<p><strong>Файл:</strong> <span id="fileName"></span> (<span id="fileSize"></span>)</p>
</div>
<form id="uploadForm" style="display:none;margin-top:20px">
<select id="companyCode"><option value="">Компания (автоопределение)</option><option value="SOGAZ">СОГАЗ</option><option value="INGOSSTRAH">Ингосстрах</option><option value="RESOGARANTIA">Ресо-Гарантия</option><option value="VSK">ВСК</option><option value="ROSGOSSTRAH">Росгосстрах</option><option value="TINKOFF">Тинькофф</option><option value="SBERBANK">Сбербанк</option><option value="ALFA">АльфаСтрахование</option></select>
<select id="productCode"><option value="">Продукт (автоопределение)</option><option value="OSAGO">ОСАГО</option><option value="KASKO">КАСКО</option><option value="MORTGAGE">Ипотека</option><option value="LIFE">Жизнь</option><option value="HEALTH">Здоровье (ДМС)</option><option value="TRAVEL">Путешествия</option><option value="PROPERTY">Имущество</option></select>
<select id="documentType"><option value="">Тип документа (автоопределение)</option><option value="rules">Правила страхования</option><option value="instructions">Инструкция</option><option value="terms">Условия</option><option value="tariffs">Тарифы</option></select>
<button type="submit" class="btn btn-primary">🚀 Загрузить и проанализировать</button>
<button type="button" class="btn btn-secondary" onclick="resetForm()">❌ Отмена</button>
</form>
</div>
<div class="section"><h2>📋 Загруженные файлы</h2><div id="filesList"><p style="color:#6b7280;text-align:center">Нет файлов</p></div></div>
</div>
<div id="notification" class="notification"></div>
<script>
let selectedFile=null;
const dropZone=document.getElementById('dropZone');
const fileInput=document.getElementById('fileInput');
dropZone.addEventListener('click',()=>fileInput.click());
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.style.borderColor='#2563eb'});
dropZone.addEventListener('dragleave',()=>dropZone.style.borderColor='#cbd5e0');
dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.style.borderColor='#cbd5e0';if(e.dataTransfer.files.length>0)handleFile(e.dataTransfer.files[0])});
fileInput.addEventListener('change',e=>{if(e.target.files.length>0)handleFile(e.target.files[0])});
function handleFile(file){selectedFile=file;document.getElementById('fileName').textContent=file.name;document.getElementById('fileSize').textContent=(file.size/1024).toFixed(2)+' KB';document.getElementById('selectedFile').style.display='block';document.getElementById('uploadForm').style.display='block'}
function resetForm(){selectedFile=null;document.getElementById('selectedFile').style.display='none';document.getElementById('uploadForm').style.display='none';fileInput.value=''}
document.getElementById('uploadForm').addEventListener('submit',async e=>{
e.preventDefault();
if(!selectedFile){showNotification('Выберите файл','error');return}
const formData=new FormData();
formData.append('file',selectedFile);
const cc=document.getElementById('companyCode').value;
const pc=document.getElementById('productCode').value;
const dt=document.getElementById('documentType').value;
if(cc)formData.append('companyCode',cc);
if(pc)formData.append('productCode',pc);
if(dt)formData.append('documentType',dt);
try{
showFileUploadProgressWithSSE();
const r=await fetch('/files/upload-with-progress',{method:'POST',body:formData});
const res=await r.json();
if(res.success){
// Подключаемся к SSE для получения прогресса
connectToProgressStream(res.data.id);
// Результаты покажем после завершения прогресса
window.uploadResult = res.data;
}else{
hideFileUploadProgress();
showNotification('❌ Ошибка','error')
}}catch(error){
hideFileUploadProgress();
showNotification('❌ '+error.message,'error')}});
async function loadFiles(){
try{
const r=await fetch('/files');
const res=await r.json();
if(res.success&&res.data.length>0){
document.getElementById('filesList').innerHTML=res.data.map(f=>\`<div class="file-card">
<h3>📄 \${f.filename}</h3>
<p>Компания: \${f.companyCode||'-'} | Продукт: \${f.productCode||'-'}</p>
<p>Статус: \${f.status} | \${new Date(f.createdAt).toLocaleString('ru-RU')}</p>
<button class="btn btn-primary" onclick="window.location.href='/admin/files/\${f.id}/review'">🔍 Проверить</button>
<button class="btn btn-secondary" onclick="deleteFile('\${f.id}')">🗑️ Удалить</button>
</div>\`).join('')}}catch(e){}}
async function deleteFile(id){
if(!confirm('Удалить?'))return;
try{
await fetch(\`/files/\${id}\`,{method:'DELETE'});
showNotification('✅ Удалено','success');loadFiles()}catch(e){showNotification('❌ Ошибка','error')}}
function showNotification(msg,type){
const n=document.getElementById('notification');
n.textContent=msg;
n.className=\`notification \${type}\`;
n.style.display='block';
setTimeout(()=>n.style.display='none',5000)}

function showFileUploadProgressWithSSE(){
const modal = document.createElement('div');
modal.id = 'fileUploadModal';
modal.innerHTML = \`
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center">
<div style="background:white;padding:30px;border-radius:10px;min-width:450px;text-align:center">
<h3 style="margin-top:0">📄 Анализ документа...</h3>
<div style="background:#f0f0f0;border-radius:10px;height:20px;margin:20px 0;overflow:hidden">
<div id="fileProgressBar" style="background:#4CAF50;height:100%;width:0%;transition:width 0.5s"></div>
</div>
<div id="fileProgressText">Подготовка к обработке...</div>
<div id="fileProgressDetails" style="margin-top:15px;font-size:14px;color:#666;text-align:left">
<div id="currentStep">⏳ Ожидание...</div>
<div id="stepDetails" style="margin-top:10px;font-size:12px;color:#999"></div>
</div>
</div>
</div>
\`;
document.body.appendChild(modal);
}

function connectToProgressStream(fileId) {
const eventSource = new EventSource(\`/files/progress/\${fileId}\`);

eventSource.onmessage = function(event) {
try {
const data = JSON.parse(event.data);
updateRealProgress(data);
} catch (error) {
console.error('Error parsing progress data:', error);
}
};

eventSource.onerror = function(error) {
console.error('SSE error:', error);
eventSource.close();
};

// Сохраняем ссылку для закрытия
window.currentEventSource = eventSource;
}

function updateRealProgress(data) {
const progressBar = document.getElementById('fileProgressBar');
const progressText = document.getElementById('fileProgressText');
const currentStep = document.getElementById('currentStep');
const stepDetails = document.getElementById('stepDetails');

if (progressBar) progressBar.style.width = data.progress + '%';
if (progressText) progressText.textContent = data.message;

// Обновляем текущий шаг
const stepIcons = {
start: '🚀',
extracting: '📄',
analyzing: '🔍',
duplicates: '🔄',
conflicts: '⚠️',
dates: '📅',
complete: '✅',
error: '❌'
};

if (currentStep) {
currentStep.textContent = \`\${stepIcons[data.step] || '⏳'} \${data.message}\`;
}

if (stepDetails && data.details) {
// Показываем более читаемые детали
let detailsText = '';
if (data.details.fileName) {
detailsText += \`📄 \${data.details.fileName}\`;
}
if (data.details.currentStep) {
detailsText += \`\\n\${data.details.currentStep}\`;
}
if (data.details.duplicatesFound !== undefined) {
detailsText += \`\\n🔄 Дубликатов найдено: \${data.details.duplicatesFound}\`;
}
if (data.details.conflictsFound !== undefined) {
detailsText += \`\\n⚠️ Конфликтов найдено: \${data.details.conflictsFound}\`;
}
if (data.details.datesFound !== undefined) {
detailsText += \`\\n📅 Дат найдено: \${data.details.datesFound}\`;
}
if (data.details.companyCode) {
detailsText += \`\\n🏢 Компания: \${data.details.companyCode}\`;
}
if (data.details.productCode) {
detailsText += \`\\n📋 Продукт: \${data.details.productCode}\`;
}
stepDetails.innerHTML = detailsText.replace(/\\n/g, '<br>');
}

// Если обработка завершена
if (data.step === 'complete') {
setTimeout(() => {
hideFileUploadProgress();
if (window.currentEventSource) {
window.currentEventSource.close();
}
// Показываем результаты
const result = window.uploadResult;
if (result && (result.duplicatesCount > 0 || result.conflictsCount > 0 || result.dateWarningsCount > 0)) {
showAnalysisResults(result);
} else {
showNotification('✅ Файл загружен и проанализирован! Проблем не найдено.', 'success');
}
resetForm();
loadFiles();
}, 1500);
} else if (data.step === 'error') {
setTimeout(() => {
hideFileUploadProgress();
if (window.currentEventSource) {
window.currentEventSource.close();
}
showNotification('❌ ' + data.message, 'error');
}, 1000);
}
}

function hideFileUploadProgress(){
const modal = document.getElementById('fileUploadModal');
if(modal) {
if(modal.dataset.interval) clearInterval(modal.dataset.interval);
modal.remove();
}
// Закрываем SSE соединение если есть
if(window.currentEventSource) {
window.currentEventSource.close();
window.currentEventSource = null;
}}

function showAnalysisResults(data){
const modal = document.createElement('div');
modal.id = 'analysisModal';
modal.innerHTML = \`
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center">
<div style="background:white;padding:30px;border-radius:10px;max-width:700px;max-height:80vh;overflow-y:auto">
<h3 style="margin-top:0;color:#dc2626">📋 Результаты анализа документа</h3>
<div style="margin-bottom:20px;padding:15px;background:#fef2f2;border-radius:8px;border-left:4px solid #dc2626">
<p style="margin:0"><strong>📊 Обнаружено проблем:</strong></p>
<p style="margin:5px 0">🔄 Дубликатов: \${data.duplicatesCount}</p>
<p style="margin:5px 0">⚠️ Конфликтов: \${data.conflictsCount}</p>
<p style="margin:5px 0">📅 Предупреждений о датах: \${data.dateWarningsCount || 0}</p>
</div>
<div style="margin-bottom:20px">
<p><strong>📄 Файл:</strong> \${data.filename}</p>
<p><strong>🏢 Компания:</strong> \${data.companyCode || 'Не определена'}</p>
<p><strong>📦 Продукт:</strong> \${data.productCode || 'Не определен'}</p>
</div>
\${data.dateValidation && data.dateValidation.warnings.length > 0 ? \`
<div style="margin-bottom:20px;padding:15px;background:#fef3cd;border-radius:8px;border-left:4px solid #f59e0b">
<p style="margin:0 0 10px 0"><strong>📅 Предупреждения о датах:</strong></p>
\${data.dateValidation.warnings.map(w => \`<p style="margin:5px 0;font-size:14px">• \${w}</p>\`).join('')}
</div>
\` : ''}
\${data.dateValidation && data.dateValidation.recommendations.length > 0 ? \`
<div style="margin-bottom:20px;padding:15px;background:#ecfdf5;border-radius:8px;border-left:4px solid #10b981">
<p style="margin:0 0 10px 0"><strong>💡 Рекомендации:</strong></p>
\${data.dateValidation.recommendations.map(r => \`<p style="margin:5px 0;font-size:14px">• \${r}</p>\`).join('')}
</div>
\` : ''}
<div style="margin-bottom:20px">
<p style="color:#6b7280;font-size:14px">
Файл был проанализирован и сохранен. Вы можете просмотреть все детали 
на странице проверки файла.
</p>
</div>
<div style="display:flex;gap:10px;justify-content:flex-end">
<button onclick="closeAnalysisModal()" class="btn btn-secondary">Закрыть</button>
<button onclick="reviewFile('\${data.id}')" class="btn btn-primary">🔍 Проверить детали</button>
</div>
</div>
</div>
\`;
document.body.appendChild(modal);
}

function closeAnalysisModal(){
const modal = document.getElementById('analysisModal');
if(modal) modal.remove();
}

function reviewFile(fileId){
closeAnalysisModal();
window.location.href = \`/admin/files/\${fileId}/review\`;
}

loadFiles();
</script></body></html>`;
  }

  private generateCompaniesHTML(companies: string[], stats: any): string {
    const companyStats = stats.companyStats || [];
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Компании</title>
<style>
body{font-family:sans-serif;margin:0;padding:20px;background:#f5f5f5}
.container{max-width:1200px;margin:0 auto}
.header{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.nav-links{display:flex;gap:10px;margin-bottom:20px}
.nav-link{background:#6b7280;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px}
.company-card{background:#fff;padding:20px;border-radius:8px;margin:15px 0;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
.company-card h2{margin:0 0 10px 0;color:#1f2937}
</style></head><body>
<div class="container">
<div class="header"><h1>🏢 Страховые компании</h1><p>Всего компаний: ${companies.length}</p></div>
<div class="nav-links">
<a href="/admin" class="nav-link">🏠 Главная</a>
<a href="/admin/documents" class="nav-link">📄 Документы</a>
</div>
${companies.map(code => {
  const stat = companyStats.find(s => s.companyCode === code) || { documentCount: 0, chunkCount: 0 };
  const isGeneral = code === 'GENERAL';
  return `<div class="company-card" style="${isGeneral ? 'border-left: 4px solid #3b82f6; background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);' : ''}">
<h2>${this.getCompanyLabel(code)}</h2>
<p><strong>Код:</strong> ${code}</p>
<p><strong>Документов:</strong> ${stat.documentCount}</p>
<p><strong>Чанков:</strong> ${stat.chunkCount || 0}</p>
${isGeneral ? '<p style="color: #3b82f6; font-weight: 600; margin: 10px 0;">📋 Общие правила и нормы страхования</p>' : ''}
<a href="/admin/documents?company=${code}">Просмотреть документы →</a>
</div>`;
}).join('')}
</div></body></html>`;
  }

  private generateProductsHTML(products: any[]): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Продукты</title>
<style>
body{font-family:sans-serif;margin:0;padding:20px;background:#f5f5f5}
.container{max-width:1200px;margin:0 auto}
.header{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.nav-links{display:flex;gap:10px;margin-bottom:20px}
.nav-link{background:#6b7280;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px}
.product-card{background:#fff;padding:20px;border-radius:8px;margin:15px 0;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
.product-card h2{margin:0 0 10px 0;color:#1f2937}
</style></head><body>
<div class="container">
<div class="header"><h1>📦 Страховые продукты</h1><p>Всего продуктов: ${products.length}</p></div>
<div class="nav-links">
<a href="/admin" class="nav-link">🏠 Главная</a>
<a href="/admin/documents" class="nav-link">📄 Документы</a>
</div>
${products.map(p => `<div class="product-card">
<h2>${this.getProductLabel(p.productCode)}</h2>
<p><strong>Компания:</strong> ${this.getCompanyLabel(p.companyCode)}</p>
<p><strong>Название:</strong> ${p.title || '-'}</p>
<a href="/admin/documents?company=${p.companyCode}&product=${p.productCode}">Просмотреть документы →</a>
</div>`).join('')}
</div></body></html>`;
  }

  private getCompanyLabel(code: string): string {
    return getCompanyLabel(code);
  }

  private getProductLabel(code: string): string {
    return getProductLabel(code);
  }

  private generateAnalyzeHTML(companies: string[]): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Анализ документов</title>
<style>
body{font-family:sans-serif;margin:0;padding:20px;background:#f5f5f5}
.container{max-width:1400px;margin:0 auto}
.header{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.nav-links{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
.nav-link{background:#6b7280;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px}
.section{background:#fff;padding:20px;border-radius:8px;margin-bottom:20px}
.doc-card{border:1px solid #e5e7eb;padding:15px;margin:10px 0;border-radius:8px}
.doc-card.delete{border-left:4px solid #dc2626;background:#fef2f2}
.doc-card.review{border-left:4px solid #f59e0b;background:#fffbeb}
.doc-card.keep{border-left:4px solid #059669;background:#f0fdf4}
.score{font-size:24px;font-weight:bold;padding:10px;border-radius:8px;display:inline-block;min-width:60px;text-align:center}
.score.high{background:#d1fae5;color:#065f46}
.score.medium{background:#fef3c7;color:#92400e}
.score.low{background:#fee2e2;color:#991b1b}
.btn{padding:8px 16px;border:none;border-radius:5px;cursor:pointer;margin:2px;font-weight:600}
.btn-primary{background:#2563eb;color:#fff}
.btn-danger{background:#dc2626;color:#fff}
.btn-success{background:#059669;color:#fff}
.issues{color:#dc2626;font-size:14px;margin:10px 0}
.notification{position:fixed;top:20px;right:20px;padding:15px;border-radius:8px;color:#fff;z-index:1000;display:none}
.notification.success{background:#059669}
.notification.error{background:#dc2626}
.notification.info{background:#2563eb}
</style></head><body>
<div class="container">
<div class="header"><h1>🔍 Анализ качества документов</h1><p>AI-оценка полезности документов для работы агента</p></div>
<div class="nav-links">
<a href="/admin" class="nav-link">🏠 Главная</a>
<a href="/admin/documents" class="nav-link">📄 Документы</a>
</div>
<div class="section">
<label style="display:block;margin-bottom:15px"><input type="checkbox" id="includeApproved" checked style="margin-right:10px">Проверять ранее одобренные документы</label>
<label style="display:block;margin-bottom:15px"><input type="checkbox" id="includeObsolete" style="margin-right:10px">Проверять неактуальные документы</label>
<div style="margin-bottom:15px">
<label for="companyFilter" style="display:block;margin-bottom:5px">Компания для анализа:</label>
<select id="companyFilter" style="padding:8px;border:1px solid #d1d5db;border-radius:5px;width:100%">
<option value="">Все компании</option>
${companies.map(company => `<option value="${company}">${this.getCompanyLabel(company)}</option>`).join('')}
</select>
</div>
<div style="margin-bottom:15px">
<label for="analysisLimit" style="display:block;margin-bottom:5px">Лимит документов для анализа:</label>
<select id="analysisLimit" style="padding:8px;border:1px solid #d1d5db;border-radius:5px">
<option value="5" selected>Первые 5 документов (для тестирования)</option>
<option value="10">Первые 10 документов (быстро)</option>
<option value="50">Первые 50 документов (рекомендуется)</option>
<option value="100">Первые 100 документов</option>
<option value="200">Первые 200 документов</option>
<option value="">Все документы (может занять очень много времени)</option>
</select>
</div>
<button onclick="startAnalysis()" class="btn btn-primary" style="font-size:16px;padding:12px 24px">🔍 Начать анализ документов</button>
<span id="analysisStatus" style="margin-left:15px;color:#6b7280"></span>
</div>
<div id="results" class="section" style="display:none">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
<h2>📊 Результаты анализа</h2>
<div>
<button onclick="deleteSelected()" class="btn btn-danger">🗑️ Удалить выбранные</button>
<button onclick="deleteAllBad()" class="btn btn-danger">🗑️ Удалить все рекомендованные</button>
</div>
</div>
<div id="stats" style="margin-bottom:20px;padding:15px;background:#f9fafb;border-radius:8px"></div>
<div id="documentsList"></div>
</div>
</div>
<div id="notification" class="notification"></div>
<script>
let analyses=[];
let selectedDocs=new Set();
async function startAnalysis(){
const btn=event.target;
const status=document.getElementById('analysisStatus');
const includeApproved=document.getElementById('includeApproved').checked;
btn.disabled=true;
btn.textContent='⏳ Анализ...';
status.textContent='Подготовка к анализу...';

// Показываем прогресс-бар
console.log('Starting analysis, showing progress modal...');
showAnalysisProgressModal();

try{
const analysisId = 'analysis-' + Date.now();
const includeObsolete = document.getElementById('includeObsolete').checked;
const limit = document.getElementById('analysisLimit').value;
const companyFilter = document.getElementById('companyFilter').value;
console.log('Selected limit:', limit);
console.log('Selected company:', companyFilter);
const requestBody = {includeApproved, includeObsolete, analysisId};
if(companyFilter && companyFilter !== '') {
  requestBody.companyCode = companyFilter;
}
if(limit && limit !== '') {
  const parsedLimit = parseInt(limit);
  if (!isNaN(parsedLimit)) {
    requestBody.limit = parsedLimit;
    console.log('Using limit:', parsedLimit);
  }
} else {
  console.log('No limit - analyzing all documents');
}
const r=await fetch('/kb/analyze-with-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)});
const res=await r.json();
if(res.success){
// Подключаемся к настоящему SSE для получения прогресса
setTimeout(() => {
  connectToAnalysisProgressStream(res.analysisId);
}, 500);
// Результаты покажем после завершения прогресса
window.analysisResult = res.data;
}else{
hideAnalysisProgressModal();
showNotification('❌ Ошибка анализа','error');
btn.disabled=false;
btn.textContent='🔍 Начать анализ всех документов';
status.textContent='';
}}catch(e){
hideAnalysisProgressModal();
showNotification('❌ '+e.message,'error');
btn.disabled=false;
btn.textContent='🔍 Начать анализ всех документов';
status.textContent='';
}}
function updateStats(){
const toDelete=analyses.filter(a=>a.recommendation==='delete');
const toReview=analyses.filter(a=>a.recommendation==='review');
const toKeep=analyses.filter(a=>a.recommendation==='keep');
document.getElementById('stats').innerHTML=\`
<p><strong>Всего:</strong> \${analyses.length} документов</p>
<p style="color:#059669"><strong>Хорошие:</strong> \${toKeep.length} (оценка ≥70)</p>
<p style="color:#f59e0b"><strong>Требуют проверки:</strong> \${toReview.length} (оценка 40-69)</p>
<p style="color:#dc2626"><strong>Рекомендовано удалить:</strong> \${toDelete.length} (оценка <40)</p>
\`;
}

function displayResults(){
document.getElementById('results').style.display='block';
updateStats();
document.getElementById('documentsList').innerHTML=analyses.map(a=>\`
<div class="doc-card \${a.recommendation}" id="doc-\${a.docId}">
<div style="display:flex;justify-content:space-between;align-items:start">
<div style="flex:1">
<label><input type="checkbox" onchange="toggleDoc('\${a.docId}')" style="margin-right:10px">
<a href="/admin/documents/\${a.docId}" target="_blank" style="color:#2563eb;text-decoration:none;font-weight:500">\${a.title}</a>
<span id="approved-\${a.docId}" style="margin-left:10px;background:#059669;color:#fff;padding:2px 8px;border-radius:12px;font-size:12px;display:none">✓ Одобрено</span>
</label>
<p style="margin:5px 0;color:#6b7280">\${getCompanyLabel('\${a.companyCode}')} • \${getProductLabel('\${a.productCode}')}</p>
<p style="margin:5px 0"><strong>Оценка:</strong> <span class="score \${a.score>=70?'high':a.score>=40?'medium':'low'}">\${a.score}/100</span></p>
<p style="margin:5px 0"><strong>Рекомендация:</strong> \${getRecommendationLabel(a.recommendation)} - \${a.reason}</p>
\${a.issues.length>0?\`<div class="issues"><strong>Проблемы:</strong><br>\${a.issues.map(i=>{
  // Если это сообщение о дубликатах, делаем его кликабельным
  if (i.includes('дубликат') || i.includes('Найдено')) {
    if (a.details.duplicates && a.details.duplicates.length > 0) {
      return \`• <span style="color:#2563eb;cursor:pointer;text-decoration:underline" onclick="showDuplicatesModal('\${a.docId}')">\${i}</span>\`;
    }
  }
  return \`• \${i}\`;
}).join('<br>')}</div>\`:''}
\${a.details.companyValidation && !a.details.companyValidation.isCorrect ? \`
<div style="margin:10px 0;padding:10px;background:#fef3cd;border-radius:5px;border-left:4px solid #f59e0b">
<strong>🏢 Предложение по компании:</strong><br>
<strong>Текущая:</strong> \${getCompanyLabel(a.companyCode)}<br>
<strong>Предлагается:</strong> \${getCompanyLabel(a.details.companyValidation.suggestedCompany)}<br>
<strong>Причина:</strong> \${a.details.companyValidation.reason}<br>
<strong>Уверенность:</strong> \${Math.round(a.details.companyValidation.confidence * 100)}%<br>
<button onclick="updateDocumentCompany('\${a.docId}', '\${a.details.companyValidation.suggestedCompany}')" class="btn btn-primary" style="margin-top:5px;font-size:12px">✏️ Исправить компанию</button>
</div>
\` : ''}
\${a.details.titleValidation && !a.details.titleValidation.isCorrect ? \`
<div style="margin:10px 0;padding:10px;background:#fef3cd;border-radius:5px;border-left:4px solid #f59e0b">
<strong>📝 Предложение по названию:</strong><br>
<strong>Текущее:</strong> \${a.title}<br>
<strong>Предлагается:</strong> \${a.details.titleValidation.suggestedTitle}<br>
<strong>Причина:</strong> \${a.details.titleValidation.reason}<br>
<strong>Уверенность:</strong> \${Math.round(a.details.titleValidation.confidence * 100)}%<br>
<button onclick="updateDocumentTitle('\${a.docId}', '\${a.details.titleValidation.suggestedTitle}')" class="btn btn-primary" style="margin-top:5px;font-size:12px">✏️ Исправить название</button>
</div>
\` : ''}
<p style="font-size:12px;color:#9ca3af">Длина: \${a.details.contentLength} символов | Полезность: \${a.details.hasUsefulContent?'✓':'✗'} | Конкретная информация: \${a.details.hasSpecificInfo?'✓':'✗'}</p>
<div style="margin-top:10px">
<button onclick="approveDoc('\${a.docId}')" id="approve-btn-\${a.docId}" class="btn btn-success">✅ Одобрить</button>
<button onclick="renameDoc('\${a.docId}')" class="btn btn-primary">✏️ Переименовать</button>
\${a.details.isOutdated ? \`
<button onclick="markAsCurrent('\${a.docId}')" class="btn btn-success" style="background:#059669">📅 Пометить как актуальный</button>
\` : \`
<button onclick="markAsObsolete('\${a.docId}')" class="btn btn-warning" style="background:#f59e0b">⏰ Пометить как неактуальный</button>
\`}
</div>
</div>
<button onclick="deleteOne('\${a.docId}')" class="btn btn-danger">🗑️ Удалить</button>
</div>
</div>
\`).join('')}
function toggleDoc(id){selectedDocs.has(id)?selectedDocs.delete(id):selectedDocs.add(id)}
async function deleteSelected(){
if(selectedDocs.size===0){alert('Выберите документы');return}
if(!confirm(\`Удалить \${selectedDocs.size} документов?\`))return;
await deleteDocs(Array.from(selectedDocs))}
async function deleteAllBad(){
const toDelete=analyses.filter(a=>a.recommendation==='delete').map(a=>a.docId);
if(toDelete.length===0){alert('Нет документов для удаления');return}
if(!confirm(\`Удалить все \${toDelete.length} рекомендованных документов?\`))return;
await deleteDocs(toDelete)}
async function deleteOne(id){
if(!confirm('Удалить этот документ?'))return;
await deleteDocs([id])}
async function deleteDocs(ids){
try{
showNotification('Удаление...','info');
const r=await fetch('/kb/delete-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({docIds:ids})});
const res=await r.json();
if(res.success){
// Удаляем элементы со страницы сразу
ids.forEach(id => {
const element = document.getElementById(\`doc-\${id}\`);
if(element) {
element.style.transition = 'opacity 0.3s ease';
element.style.opacity = '0';
setTimeout(() => element.remove(), 300);
}
});
// Обновляем статистику
analyses = analyses.filter(a => !ids.includes(a.docId));
// Очищаем выбранные документы
ids.forEach(id => selectedDocs.delete(id));
updateStats();
showNotification(\`✅ Удалено: \${res.deleted} документов\`,'success');
// Перезапускаем анализ через некоторое время для полного обновления
setTimeout(()=>startAnalysis(),2000)}else{showNotification('❌ Ошибка','error')}}catch(e){showNotification('❌ '+e.message,'error')}}
function getRecommendationLabel(r){
return r==='keep'?'✅ Оставить':r==='review'?'⚠️ Проверить':'❌ Удалить'}
function getCompanyLabel(code){
const labels={'SOGAZ':'СОГАЗ','INGOSSTRAH':'Ингосстрах','RESOGARANTIA':'Ресо-Гарантия','VSK':'ВСК','ROSGOSSTRAH':'Росгосстрах','TINKOFF':'Тинькофф','SBERBANK':'Сбербанк','ALFA':'АльфаСтрахование','TEST':'Тест'};
return labels[code]||code}
function getProductLabel(code){
const labels={'OSAGO':'ОСАГО','KASKO':'КАСКО','MORTGAGE':'Ипотека','LIFE':'Жизнь','HEALTH':'ДМС','TRAVEL':'Путешествия','PROPERTY':'Имущество','LIABILITY':'Ответственность','COMPANY_INFO':'Информация','PRICING':'Тарифы','GENERAL':'Общее'};
return labels[code]||code}
async function approveDoc(id){
try{
const r=await fetch(\`/kb/documents/\${id}/approve\`,{method:'POST'});
if((await r.json()).success){
document.getElementById(\`approve-btn-\${id}\`).textContent='✓ Одобрено';
document.getElementById(\`approve-btn-\${id}\`).disabled=true;
document.getElementById(\`approved-\${id}\`).style.display='inline';
showNotification('✅ Документ одобрен','success')}}catch(e){showNotification('❌ '+e.message,'error')}}
async function renameDoc(id){
const currentTitle=analyses.find(a=>a.docId===id)?.title;
const newTitle=prompt('Новое название:',currentTitle);
if(!newTitle||newTitle===currentTitle)return;
try{
const r=await fetch(\`/kb/documents/\${id}/rename\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:newTitle})});
if((await r.json()).success){
showNotification('✅ Документ переименован','success');
setTimeout(()=>startAnalysis(),1000)}}catch(e){showNotification('❌ '+e.message,'error')}}

async function updateDocumentCompany(docId, newCompanyCode){
if(!confirm(\`Изменить компанию документа на "\${getCompanyLabel(newCompanyCode)}"?\`))return;
try{
const r=await fetch(\`/kb/documents/\${docId}/update\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyCode:newCompanyCode})});
if((await r.json()).success){
showNotification('✅ Компания документа обновлена','success');
setTimeout(()=>startAnalysis(),1000)}}catch(e){showNotification('❌ '+e.message,'error')}}

async function updateDocumentTitle(docId, newTitle){
if(!confirm(\`Изменить название документа на "\${newTitle}"?\`))return;
try{
const r=await fetch(\`/kb/documents/\${docId}/rename\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:newTitle})});
if((await r.json()).success){
showNotification('✅ Название документа обновлено','success');
setTimeout(()=>startAnalysis(),1000)}}catch(e){showNotification('❌ '+e.message,'error')}}

async function markAsCurrent(docId){
if(!confirm('Пометить документ как актуальный?'))return;
try{
const r=await fetch(\`/kb/documents/\${docId}/unobsolete\`,{method:'POST'});
if((await r.json()).success){
showNotification('✅ Документ помечен как актуальный','success');
setTimeout(()=>startAnalysis(),1000)}}catch(e){showNotification('❌ '+e.message,'error')}}

async function markAsObsolete(docId){
if(!confirm('Пометить документ как неактуальный?'))return;
try{
const r=await fetch(\`/kb/documents/\${docId}/obsolete\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Помечено вручную'})});
if((await r.json()).success){
showNotification('✅ Документ помечен как неактуальный','success');
setTimeout(()=>startAnalysis(),1000)}}catch(e){showNotification('❌ '+e.message,'error')}}

function showDuplicatesModal(docId){
console.log('showDuplicatesModal called with docId:', docId);
console.log('analyses array:', analyses);
console.log('analyses length:', analyses.length);

const analysis = analyses.find(a => a.docId === docId);
console.log('found analysis:', analysis);

if (!analysis) {
alert('Анализ документа не найден');
return;
}

if (!analysis.details.duplicates || analysis.details.duplicates.length === 0) {
alert('Дубликаты не найдены для этого документа');
return;
}

const modal = document.createElement('div');
modal.id = 'duplicatesModal';
modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center';
modal.innerHTML = \`
<div style="background:white;padding:30px;border-radius:10px;max-width:700px;max-height:80vh;overflow-y:auto">
<h3 style="margin-top:0;color:#f59e0b">🔄 Найденные дубликаты</h3>
<p><strong>Документ:</strong> \${analysis.title}</p>
<p><strong>Найдено дубликатов:</strong> \${analysis.details.duplicates.length}</p>
<div style="margin-top:20px">
\${analysis.details.duplicates.map(dup => \`
<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:10px 0;border-radius:4px">
<strong>\${dup.title}</strong><br>
<p style="margin:5px 0;color:#6b7280">\${dup.reason}</p>
<p style="margin:5px 0;color:#6b7280">Схожесть: \${Math.round(dup.similarity * 100)}%</p>
<a href="/admin/documents/\${dup.docId}" target="_blank" style="color:#2563eb;text-decoration:none">📄 Открыть документ →</a>
</div>
\`).join('')}
</div>
<div style="margin-top:20px;text-align:center">
<button onclick="closeDuplicatesModal()" style="padding:10px 20px;background:#6b7280;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:600">Закрыть</button>
</div>
</div>
\`;

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
if (e.target === modal) {
closeDuplicatesModal();
}
});

document.body.appendChild(modal);
}

function closeDuplicatesModal(){
const modal = document.getElementById('duplicatesModal');
if (modal) {
modal.remove();
}
}

function showNotification(msg,type){
const n=document.getElementById('notification');
n.textContent=msg;
n.className=\`notification \${type}\`;
n.style.display='block';
setTimeout(()=>n.style.display='none',5000)}

function showAnalysisProgressModal(){
console.log('Creating analysis progress modal...');
const modal = document.createElement('div');
modal.id = 'analysisProgressModal';
modal.innerHTML = \`
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center">
<div style="background:white;padding:30px;border-radius:10px;min-width:500px;text-align:center">
<h3 style="margin-top:0">🔍 Анализ документов...</h3>
<div style="background:#f0f0f0;border-radius:10px;height:20px;margin:20px 0;overflow:hidden">
<div id="analysisProgressBar" style="background:#4CAF50;height:100%;width:0%;transition:width 0.5s"></div>
</div>
<div id="analysisProgressText">Подготовка к анализу...</div>
<div id="analysisProgressDetails" style="margin-top:15px;font-size:14px;color:#666;text-align:left">
<div id="analysisCurrentStep">⏳ Ожидание...</div>
<div id="analysisStepDetails" style="margin-top:10px;font-size:12px;color:#999"></div>
</div>
</div>
</div>
\`;
document.body.appendChild(modal);
console.log('Analysis progress modal added to DOM');
console.log('Modal element:', modal);
console.log('Modal style:', modal.style);
// Принудительно показываем модальное окно
modal.style.display = 'block';
modal.style.visibility = 'visible';
modal.style.zIndex = '99999';
}

function connectToSimpleProgressStream(analysisId) {
console.log('Connecting to SIMPLE SSE stream:', analysisId);
const eventSource = new EventSource(\`/kb/simple-progress/\${analysisId}\`);

eventSource.onopen = function(event) {
  console.log('Simple SSE connection opened:', event);
};

eventSource.onmessage = function(event) {
  console.log('Simple SSE message received:', event.data);
try {
const data = JSON.parse(event.data);
updateAnalysisProgress(data);
} catch (error) {
console.error('Error parsing simple progress data:', error);
}
};

eventSource.onerror = function(error) {
console.error('Simple SSE error:', error);
eventSource.close();

// Показываем результаты через 3 секунды
setTimeout(async () => {
  console.log('Simple SSE error occurred, showing results...');
  hideAnalysisProgressModal();
  
  try {
    // Получаем последние результаты анализа из кэша
    const response = await fetch('/kb/last-analysis-results');
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data && result.data.length > 0) {
        analyses = result.data;
        displayResults();
        showNotification(\`✅ Проанализировано: \${result.data.length} документов\`, 'success');
      } else {
        showNotification('⚠️ Анализ завершен, но результаты пусты', 'warning');
      }
    } else {
      showNotification('❌ Ошибка получения результатов анализа', 'error');
    }
  } catch (error) {
    console.error('Error fetching analysis results:', error);
    showNotification('❌ Ошибка получения результатов', 'error');
  }
  
  const btn = document.querySelector('button[onclick="startAnalysis()"]');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '🔍 Начать анализ документов';
  }
  const status = document.getElementById('analysisStatus');
  if (status) status.textContent = '';
}, 3000);
};

window.currentAnalysisEventSource = eventSource;
}

function connectToAnalysisProgressStream(analysisId) {
console.log('Connecting to SSE stream:', analysisId);
const eventSource = new EventSource(\`/kb/analysis-progress/\${analysisId}\`);

eventSource.onopen = function(event) {
  console.log('SSE connection opened:', event);
};

eventSource.onmessage = function(event) {
  console.log('SSE message received:', event.data);
try {
const data = JSON.parse(event.data);
updateAnalysisProgress(data);
} catch (error) {
console.error('Error parsing analysis progress data:', error);
}
};

eventSource.onerror = function(error) {
console.error('Analysis SSE error:', error);
eventSource.close();

// Даем время увидеть прогресс-бар перед получением результатов
setTimeout(async () => {
  console.log('SSE error occurred, waiting 3 seconds before hiding modal...');
  hideAnalysisProgressModal();
  
  try {
    // Получаем последние результаты анализа из кэша
    const response = await fetch('/kb/last-analysis-results');
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data && result.data.length > 0) {
        analyses = result.data;
        displayResults();
        showNotification(\`✅ Проанализировано: \${result.data.length} документов\`, 'success');
      } else {
        showNotification('⚠️ Анализ завершен, но результаты пусты', 'warning');
      }
    } else {
      showNotification('❌ Ошибка получения результатов анализа', 'error');
    }
  } catch (error) {
    console.error('Error fetching analysis results:', error);
    showNotification('❌ Ошибка получения результатов', 'error');
  }
  
  const btn = document.querySelector('button[onclick="startAnalysis()"]');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '🔍 Начать анализ документов';
  }
  const status = document.getElementById('analysisStatus');
  if (status) status.textContent = '';
}, 3000); // Увеличиваем задержку до 3 секунд
};

window.currentAnalysisEventSource = eventSource;
}

function updateAnalysisProgress(data) {
const progressBar = document.getElementById('analysisProgressBar');
const progressText = document.getElementById('analysisProgressText');
const currentStep = document.getElementById('analysisCurrentStep');
const stepDetails = document.getElementById('analysisStepDetails');

if (progressBar) progressBar.style.width = data.progress + '%';
if (progressText) progressText.textContent = data.message;

const stepIcons = {
loading: '📂',
analyzing: '🔍',
complete: '✅',
error: '❌'
};

if (currentStep) {
currentStep.textContent = \`\${stepIcons[data.step] || '⏳'} \${data.message}\`;
}

if (stepDetails && data.details) {
// Показываем более читаемые детали
let detailsText = '';
if (data.details.currentDocument) {
detailsText += \`📄 \${data.details.currentDocument}\`;
}
if (data.details.status) {
detailsText += \`\\n\${data.details.status}\`;
}
if (data.details.companyCode) {
detailsText += \`\\n🏢 \${data.details.companyCode}\`;
}
if (data.details.current && data.details.total) {
detailsText += \`\\n📊 Прогресс: \${data.details.current}/\${data.details.total}\`;
}
if (data.details.summary) {
detailsText += \`\\n📋 \${data.details.summary}\`;
}
stepDetails.innerHTML = detailsText.replace(/\\n/g, '<br>');
}

if (data.step === 'complete') {
setTimeout(async () => {
hideAnalysisProgressModal();
if (window.currentAnalysisEventSource) {
window.currentAnalysisEventSource.close();
}

try {
  // Получаем последние результаты анализа из кэша
  const response = await fetch('/kb/last-analysis-results');
  
  if (response.ok) {
    const result = await response.json();
    if (result.success && result.data && result.data.length > 0) {
      analyses = result.data;
      displayResults();
      showNotification(\`✅ Проанализировано: \${result.data.length} документов\`, 'success');
    } else {
      showNotification('⚠️ Анализ завершен, но результаты пусты', 'warning');
    }
  } else {
    showNotification('❌ Ошибка получения результатов анализа', 'error');
  }
} catch (error) {
  console.error('Error fetching analysis results:', error);
  showNotification('❌ Ошибка получения результатов', 'error');
}

const btn = document.querySelector('button[onclick="startAnalysis()"]');
if (btn) {
btn.disabled = false;
btn.textContent = '🔍 Начать анализ документов';
}
const status = document.getElementById('analysisStatus');
if (status) status.textContent = '';
}, 1500);
} else if (data.step === 'error') {
setTimeout(() => {
hideAnalysisProgressModal();
if (window.currentAnalysisEventSource) {
window.currentAnalysisEventSource.close();
}
showNotification('❌ ' + data.message, 'error');
const btn = document.querySelector('button[onclick="startAnalysis()"]');
if (btn) {
btn.disabled = false;
btn.textContent = '🔍 Начать анализ всех документов';
}
const status = document.getElementById('analysisStatus');
if (status) status.textContent = '';
}, 1000);
}
}

function hideAnalysisProgressModal(){
console.log('Hiding analysis progress modal...');
const modal = document.getElementById('analysisProgressModal');
if(modal) {
  console.log('Modal found, removing...');
  modal.remove();
} else {
  console.log('Modal not found!');
}
if(window.currentAnalysisEventSource) {
window.currentAnalysisEventSource.close();
window.currentAnalysisEventSource = null;
}}

</script></body></html>`;
  }

  /**
   * Скачивает файл по URL и сохраняет в папку uploads
   */
  private async downloadFileFromUrl(url: string, originalFilename: string, redirectCount: number = 0): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        // Генерируем уникальное имя файла
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const extension = path.extname(originalFilename) || '.pdf';
        const newFilename = `restored-${timestamp}-${randomSuffix}${extension}`;
        const filePath = path.join(process.cwd(), 'uploads', newFilename);
        
        const file = fs.createWriteStream(filePath);
        
        const request = client.get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Обрабатываем редирект
            const redirectUrl = response.headers.location;
            if (redirectUrl && redirectCount < 5) {
              this.logger.log(`Редирект ${redirectCount + 1} с ${url} на ${redirectUrl}`);
              file.close();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
              // Рекурсивно вызываем функцию с новым URL
              this.downloadFileFromUrl(redirectUrl, originalFilename, redirectCount + 1).then(resolve);
              return;
            } else {
              this.logger.error(`Слишком много редиректов или нет URL редиректа для ${url}`);
              file.close();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
              resolve(null);
              return;
            }
          }
          
          if (response.statusCode !== 200) {
            this.logger.error(`HTTP ${response.statusCode} при скачивании ${url}`);
            file.close();
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            resolve(null);
            return;
          }
          
          response.pipe(file);
          
          file.on('finish', () => {
            file.close();
            this.logger.log(`Файл успешно скачан: ${newFilename}`);
            resolve(newFilename);
          });
          
          file.on('error', (err) => {
            this.logger.error(`Ошибка записи файла ${newFilename}:`, err);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            resolve(null);
          });
        });
        
        request.on('error', (err) => {
          this.logger.error(`Ошибка запроса к ${url}:`, err);
          file.close();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          resolve(null);
        });
        
        request.setTimeout(30000, () => {
          this.logger.error(`Таймаут при скачивании ${url}`);
          request.destroy();
          file.close();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          resolve(null);
        });
        
      } catch (error) {
        this.logger.error(`Ошибка при скачивании ${url}:`, error);
        resolve(null);
      }
    });
  }

  /**
   * Генерация HTML для страницы агентов
   */
  private generateAgentsHTML(agentsStats: any, availableAgents: any[]): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Управление агентами - Страховой ИИ</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2em; font-weight: bold; color: #2563eb; }
        .stat-label { color: #6b7280; margin-top: 5px; }
        .nav-links { display: flex; gap: 10px; margin-top: 20px; }
        .nav-link { background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .nav-link:hover { background: #1d4ed8; }
        .agents-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .agent-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .agent-name { font-weight: 600; color: #495057; margin-bottom: 10px; font-size: 18px; }
        .agent-status { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .status-online { color: #28a745; }
        .status-offline { color: #6c757d; }
        .status-busy { color: #ffc107; }
        .agent-info { margin-bottom: 8px; font-size: 14px; color: #6c757d; }
        .agent-companies { background: #f8f9fa; padding: 8px; border-radius: 4px; margin-top: 10px; }
        .back-link { color: #2563eb; text-decoration: none; margin-bottom: 20px; display: inline-block; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/admin" class="back-link">← Назад к дашборду</a>
        
        <div class="header">
            <h1>👥 Управление агентами</h1>
            <p>Мониторинг и управление агентами страховой системы</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${agentsStats.total}</div>
                <div class="stat-label">Всего агентов</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #28a745">${agentsStats.online}</div>
                <div class="stat-label">Онлайн</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #ffc107">${agentsStats.busy}</div>
                <div class="stat-label">Заняты</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #6c757d">${agentsStats.offline}</div>
                <div class="stat-label">Офлайн</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color: #dc3545">${agentsStats.pendingRequests}</div>
                <div class="stat-label">Ожидают</div>
            </div>
        </div>

        <div class="agents-grid">
            ${availableAgents.map(agent => `
                <div class="agent-card">
                    <div class="agent-name">${agent.name}</div>
                    <div class="agent-status ${agent.status === 'online' ? 'status-online' : agent.status === 'busy' ? 'status-busy' : 'status-offline'}">
                        ${agent.status === 'online' ? '🟢 Онлайн' : agent.status === 'busy' ? '🟡 Занят' : '🔴 Офлайн'}
                    </div>
                    <div class="agent-info"><strong>Логин:</strong> ${agent.login}</div>
                    <div class="agent-info"><strong>Сессий:</strong> ${agent.currentSessions}/${agent.maxSessions}</div>
                    <div class="agent-companies">
                        <strong>Компании:</strong><br>
                        ${agent.companies.map(company => `• ${company}`).join('<br>')}
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="nav-links">
            <a href="/admin" class="nav-link">🏠 Главная</a>
            <a href="/admin/documents" class="nav-link">📄 Документы</a>
            <a href="/admin/sources" class="nav-link">🔗 Источники</a>
            <a href="/admin/analyze" class="nav-link">🔍 Анализ документов</a>
            <a href="/admin/search" class="nav-link">🔎 Поиск по базе</a>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * HTML для добавления текстового документа
   */
  private generateAddTextDocumentHTML(companies: string[]): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Добавить текстовый документ - Админ панель</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .form-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 20px; }
        .form-label { display: block; margin-bottom: 8px; font-weight: 600; color: #374151; }
        .form-input, .form-textarea, .form-select { 
            width: 100%; 
            padding: 12px; 
            border: 1px solid #d1d5db; 
            border-radius: 6px; 
            font-size: 14px; 
            box-sizing: border-box;
        }
        .form-textarea { 
            min-height: 300px; 
            resize: vertical; 
            font-family: inherit;
        }
        .form-input:focus, .form-textarea:focus, .form-select:focus { 
            outline: none; 
            border-color: #2563eb; 
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); 
        }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .btn { 
            background: #2563eb; 
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer; 
            font-size: 14px; 
            font-weight: 600;
            transition: background-color 0.2s;
        }
        .btn:hover { background: #1d4ed8; }
        .btn-secondary { 
            background: #6b7280; 
            margin-right: 10px;
        }
        .btn-secondary:hover { background: #4b5563; }
        .nav-links { display: flex; gap: 10px; margin-bottom: 20px; }
        .nav-link { background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .nav-link:hover { background: #4b5563; }
        .nav-link.primary { background: #2563eb; }
        .nav-link.primary:hover { background: #1d4ed8; }
        .notification { 
            position: fixed; 
            top: 20px; 
            right: 20px; 
            padding: 15px; 
            border-radius: 8px; 
            color: white; 
            z-index: 1000; 
            display: none; 
        }
        .notification.success { background: #059669; }
        .notification.error { background: #dc2626; }
        .notification.info { background: #2563eb; }
        .help-text { font-size: 12px; color: #6b7280; margin-top: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📝 Добавить текстовый документ</h1>
            <p>Создание нового документа в базе знаний путем ввода текста</p>
        </div>

        <div class="nav-links">
            <a href="/admin" class="nav-link">🏠 Главная</a>
            <a href="/admin/documents" class="nav-link">📄 Документы</a>
            <a href="/admin/files/upload" class="nav-link">📁 Загрузить файлы</a>
            <a href="/admin/sources" class="nav-link">🔗 Источники</a>
        </div>

        <div class="form-container">
            <form id="addTextForm">
                <div class="form-group">
                    <label for="title" class="form-label">Название документа *</label>
                    <input type="text" id="title" name="title" class="form-input" placeholder="Введите название документа" required>
                    <div class="help-text">Краткое и понятное название документа</div>
                </div>

                <div class="form-group">
                    <label for="content" class="form-label">Содержимое документа *</label>
                    <textarea id="content" name="content" class="form-textarea" placeholder="Вставьте или введите текст документа здесь..." required></textarea>
                    <div class="help-text">Основной текст документа. Можно вставить скопированный текст из любого источника</div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="companyCode" class="form-label">Страховая компания</label>
                        <select id="companyCode" name="companyCode" class="form-select">
                            <option value="GENERAL">Общие документы</option>
                            ${companies.map(company => `
                                <option value="${company}">${this.getCompanyLabel(company)}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="productCode" class="form-label">Тип продукта</label>
                        <select id="productCode" name="productCode" class="form-select">
                            <option value="GENERAL">Общие</option>
                            <option value="OSAGO">ОСАГО</option>
                            <option value="CASCO">КАСКО</option>
                            <option value="PROPERTY">Имущество</option>
                            <option value="LIFE">Жизнь и здоровье</option>
                            <option value="TRAVEL">Путешествия</option>
                            <option value="BUSINESS">Бизнес</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="sourceUrl" class="form-label">Ссылка на источник (необязательно)</label>
                    <input type="url" id="sourceUrl" name="sourceUrl" class="form-input" placeholder="https://example.com/source">
                    <div class="help-text">URL источника, откуда взят текст (если есть)</div>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 30px;">
                    <button type="button" onclick="history.back()" class="btn btn-secondary">← Назад</button>
                    <button type="submit" class="btn">💾 Добавить документ</button>
                </div>
            </form>
        </div>
    </div>

    <div id="notification" class="notification"></div>

    <script>
        document.getElementById('addTextForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const data = {
                title: formData.get('title'),
                content: formData.get('content'),
                companyCode: formData.get('companyCode'),
                productCode: formData.get('productCode'),
                sourceUrl: formData.get('sourceUrl') || null
            };

            try {
                showNotification('⏳ Добавление документа...', 'info');
                
                const response = await fetch('/admin/documents/add-text', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    showNotification('✅ Документ успешно добавлен!', 'success');
                    setTimeout(() => {
                        window.location.href = '/admin/documents';
                    }, 2000);
                } else {
                    showNotification('❌ Ошибка: ' + result.message, 'error');
                }
            } catch (error) {
                showNotification('❌ Ошибка: ' + error.message, 'error');
            }
        });

        function showNotification(message, type) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = \`notification \${type}\`;
            notification.style.display = 'block';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 5000);
        }
    </script>
</body>
</html>`;
  }
}