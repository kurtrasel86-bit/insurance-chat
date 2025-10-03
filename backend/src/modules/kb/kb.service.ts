import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface EmbeddingVector {
  embedding: number[];
}

@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name);
  private embeddingsCache = new Map<string, number[]>();

  constructor(public readonly prisma: PrismaService) {}

  /**
   * Генерация эмбеддинга через OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set, using zero vector');
      return new Array(1536).fill(0); // Default embedding dimension for text-embedding-3-small
    }

    try {
      const response = await fetch(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`OpenAI API error: ${response.status} - ${errorText}`);
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as { data: EmbeddingVector[] };
      return data.data[0].embedding;
    } catch (error: any) {
      this.logger.error('Failed to generate embedding', error?.stack || String(error));
      this.logger.warn('Falling back to zero vector for embedding');
      return new Array(1536).fill(0);
    }
  }

  /**
   * Косинусное сходство между векторами
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Добавление документа в базу знаний
   */
  async addDocument(params: {
    companyCode: string;
    productCode: string;
    title: string;
    content: string;
    fileUrl?: string;
    sourceUrl?: string;
    version?: string;
    documentType?: string;
    isApproved?: boolean;
    approvedAt?: Date;
    approvedBy?: string;
  }): Promise<{ docId: string; chunksCount: number }> {
    const { companyCode, productCode, title, content, fileUrl, sourceUrl, version, documentType, isApproved, approvedAt, approvedBy } = params;

    // Разбиваем документ на чанки (по 500 символов с перекрытием 50)
    const chunks = this.splitIntoChunks(content, 500, 50);

    // Создаём документ
    const doc = await this.prisma.kBDoc.create({
      data: {
        companyCode,
        productCode,
        title,
        fileUrl,
        sourceUrl,
        version,
        documentType,
        isApproved: isApproved || false,
        approvedAt,
        approvedBy,
      },
    });

    // Создаём чанки
    for (let i = 0; i < chunks.length; i++) {
      await this.prisma.kBChunk.create({
        data: {
          docId: doc.id,
          chunkIdx: i,
          text: chunks[i],
        },
      });
    }

    this.logger.log(`Added document ${doc.id} with ${chunks.length} chunks`);

    return {
      docId: doc.id,
      chunksCount: chunks.length,
    };
  }

  /**
   * Разбиение текста на чанки
   */
  private splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start += chunkSize - overlap;
    }

    return chunks;
  }

  /**
   * Семантический поиск по базе знаний
   */
  async search(params: {
    query: string;
    companyCode?: string;
    productCode?: string;
    limit?: number;
  }): Promise<Array<{ text: string; score: number; docTitle: string; docId: string; companyCode: string; productCode: string; isApproved: boolean; isObsolete: boolean }>> {
    const { query, companyCode, productCode, limit = 5 } = params;
    
    this.logger.log(`Поиск: "${query}", компания: ${companyCode || 'все'}, лимит: ${limit}`);

    // Получаем чанки только из одобренных и не устаревших документов
    const chunks = await this.prisma.kBChunk.findMany({
      include: {
        doc: true,
      },
      where: {
        doc: {
          isApproved: true,
          isObsolete: false,
          ...(companyCode && { companyCode }),
          ...(productCode && { productCode }),
        },
      },
      take: 100, // Ограничиваем количество чанков для производительности
    });

    this.logger.log(`Найдено чанков: ${chunks.length}`);
    
    // Если чанков нет, возвращаем пустой результат
    if (chunks.length === 0) {
      this.logger.log('Нет чанков для поиска');
      return [];
    }

    // Используем только текстовый поиск (без AITUNNEL для экономии)
    this.logger.log('Используем текстовый поиск (AITUNNEL отключен для экономии)');
    return this.textSearch(chunks, query, limit);
  }

  /**
   * Простой текстовый поиск (fallback когда нет OpenAI API)
   */
  private textSearch(
    chunks: Array<{ text: string; doc: { id: string; title: string; companyCode: string; productCode: string; isApproved: boolean; isObsolete: boolean } }>,
    query: string,
    limit: number
  ): Array<{ text: string; score: number; docTitle: string; docId: string; companyCode: string; productCode: string; isApproved: boolean; isObsolete: boolean }> {
    this.logger.log('Используем текстовый поиск (AITUNNEL отключен для экономии)');
    
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/)
      .filter(word => word.length > 2)
      .map(word => word.replace(/[^\wа-яё]/gi, '')); // Убираем знаки препинания
    
    const results = chunks.map(chunk => {
      const textLower = chunk.text.toLowerCase();
      const titleLower = chunk.doc.title.toLowerCase();
      
      let score = 0;
      
      // Поиск точных совпадений слов (более важные)
      for (const word of queryWords) {
        const textExact = (textLower.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
        const titleExact = (titleLower.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
        score += textExact * 2 + titleExact * 6; // Название важнее
        
        // Частичные совпадения (менее важные)
        const textPartial = (textLower.match(new RegExp(word, 'g')) || []).length;
        const titlePartial = (titleLower.match(new RegExp(word, 'g')) || []).length;
        score += (textPartial - textExact) * 0.5 + (titlePartial - titleExact) * 1.5;
      }
      
      // Бонус за точное совпадение фразы
      if (textLower.includes(queryLower)) {
        score += 15;
      }
      if (titleLower.includes(queryLower)) {
        score += 50;
      }
      
      // Нормализуем score (0-1)
      const normalizedScore = Math.min(1, score / 10);
      
      return {
        text: chunk.text,
        score: normalizedScore,
        docTitle: chunk.doc.title,
        docId: chunk.doc.id,
        companyCode: chunk.doc.companyCode,
        productCode: chunk.doc.productCode,
        isApproved: chunk.doc.isApproved,
        isObsolete: chunk.doc.isObsolete,
      };
    }).filter(result => result.score > 0);
    
    const sortedResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
    this.logger.log(`Текстовый поиск вернул ${sortedResults.length} результатов`);
    
    return sortedResults;
  }

  /**
   * Получение всех документов
   */
  async listDocuments(params?: { companyCode?: string; productCode?: string }) {
    return this.prisma.kBDoc.findMany({
      where: {
        ...(params?.companyCode && { companyCode: params.companyCode }),
        ...(params?.productCode && { productCode: params.productCode }),
      },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Удаление документа
   */
  async deleteDocument(docId: string) {
    // Удаляем чанки
    await this.prisma.kBChunk.deleteMany({
      where: { docId },
    });

    // Удаляем документ
    await this.prisma.kBDoc.delete({
      where: { id: docId },
    });

    // Очищаем кеш эмбеддингов
    this.embeddingsCache.clear();

    this.logger.log(`Deleted document ${docId}`);
  }

  /**
   * Получение списка всех компаний
   */
  async getCompanies() {
    const companies = await this.prisma.kBDoc.findMany({
      select: {
        companyCode: true,
      },
      distinct: ['companyCode'],
      orderBy: {
        companyCode: 'asc',
      },
    });

    const companyCodes = companies.map(c => c.companyCode);
    
    // Добавляем специальную категорию для общих правил
    if (!companyCodes.includes('GENERAL')) {
      companyCodes.unshift('GENERAL');
    }
    
    return companyCodes;
  }

  /**
   * Получение списка всех продуктов
   */
  async getProducts(companyCode?: string) {
    const products = await this.prisma.kBDoc.findMany({
      where: {
        ...(companyCode && { companyCode }),
      },
      select: {
        companyCode: true,
        productCode: true,
        title: true,
        createdAt: true,
      },
      distinct: ['companyCode', 'productCode'],
      orderBy: [
        { companyCode: 'asc' },
        { productCode: 'asc' },
      ],
    });

    return products;
  }

  /**
   * Получение статистики базы знаний
   */
  async getStats() {
    const totalDocs = await this.prisma.kBDoc.count();
    const totalChunks = await this.prisma.kBChunk.count();
    
    const companiesCount = await this.prisma.kBDoc.findMany({
      select: { companyCode: true },
      distinct: ['companyCode'],
    });

    const productsCount = await this.prisma.kBDoc.findMany({
      select: { productCode: true },
      distinct: ['productCode'],
    });

    const recentDocs = await this.prisma.kBDoc.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // последние 7 дней
        },
      },
    });

    const companyStats = await this.prisma.kBDoc.groupBy({
      by: ['companyCode'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    // Получаем количество чанков для каждой компании отдельно
    const companyChunkCounts = await Promise.all(
      companyStats.map(async (company) => {
        const chunkCount = await this.prisma.kBChunk.count({
          where: {
            doc: {
              companyCode: company.companyCode,
            },
          },
        });
        return {
          companyCode: company.companyCode,
          chunkCount,
        };
      })
    );

    // Создаем мапу для быстрого поиска
    const chunkCountMap = new Map(
      companyChunkCounts.map(item => [item.companyCode, item.chunkCount])
    );

    return {
      totalDocuments: totalDocs,
      totalChunks: totalChunks,
      totalCompanies: companiesCount.length,
      totalProducts: productsCount.length,
      recentDocuments: recentDocs,
      companyStats: companyStats.map(c => ({
        companyCode: c.companyCode,
        documentCount: c._count.id,
        chunkCount: chunkCountMap.get(c.companyCode) || 0,
      })),
    };
  }

  /**
   * Получение конкретного документа
   */
  async getDocument(docId: string) {
    const document = await this.prisma.kBDoc.findUnique({
      where: { id: docId },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

    return document;
  }

  /**
   * Получение чанков документа
   */
  async getDocumentChunks(docId: string) {
    const chunks = await this.prisma.kBChunk.findMany({
      where: { docId },
      orderBy: { chunkIdx: 'asc' },
    });

    return chunks;
  }

  /**
   * Получение последних добавленных документов
   */
  async getRecentDocuments(limit: number = 10) {
    const documents = await this.prisma.kBDoc.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

    return documents;
  }

  /**
   * Экспорт всех данных в JSON
   */
  async exportAllData() {
    const documents = await this.prisma.kBDoc.findMany({
      include: {
        chunks: {
          orderBy: { chunkIdx: 'asc' },
        },
      },
      orderBy: [
        { companyCode: 'asc' },
        { productCode: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return {
      exportDate: new Date().toISOString(),
      totalDocuments: documents.length,
      totalChunks: documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
      documents: documents.map(doc => ({
        id: doc.id,
        companyCode: doc.companyCode,
        productCode: doc.productCode,
        title: doc.title,
        fileUrl: doc.fileUrl,
        sourceUrl: doc.sourceUrl,
        version: doc.version,
        createdAt: doc.createdAt,
        content: doc.chunks.map(chunk => chunk.text).join('\n\n'),
        chunks: doc.chunks.map(chunk => ({
          index: chunk.chunkIdx,
          text: chunk.text,
          length: chunk.text.length,
        })),
      })),
    };
  }

  /**
   * Экспорт данных в CSV
   */
  async exportToCsv() {
    const documents = await this.prisma.kBDoc.findMany({
      include: {
        chunks: {
          orderBy: { chunkIdx: 'asc' },
        },
      },
      orderBy: [
        { companyCode: 'asc' },
        { productCode: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Заголовки CSV
    const headers = [
      'ID',
      'Компания',
      'Продукт',
      'Название',
      'Источник',
      'Файл',
      'Версия',
      'Дата создания',
      'Количество чанков',
      'Содержимое',
    ];

    // Конвертируем данные в CSV
    const csvRows = [headers.join(',')];

    for (const doc of documents) {
      const content = doc.chunks.map(chunk => chunk.text).join(' ').replace(/"/g, '""');
      
      const row = [
        `"${doc.id}"`,
        `"${doc.companyCode}"`,
        `"${doc.productCode}"`,
        `"${doc.title.replace(/"/g, '""')}"`,
        `"${doc.sourceUrl || ''}"`,
        `"${doc.fileUrl || ''}"`,
        `"${doc.version || ''}"`,
        `"${doc.createdAt.toISOString()}"`,
        `"${doc.chunks.length}"`,
        `"${content}"`,
      ];

      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Одобрение документа
   */
  async approveDocument(docId: string, approvedBy: string = 'admin'): Promise<void> {
    await this.prisma.kBDoc.update({
      where: { id: docId },
      data: {
        isApproved: true,
        approvedAt: new Date(),
        approvedBy,
      },
    });
  }

  /**
   * Снятие одобрения с документа
   */
  async unapproveDocument(docId: string): Promise<void> {
    await this.prisma.kBDoc.update({
      where: { id: docId },
      data: {
        isApproved: false,
        approvedAt: null,
        approvedBy: null,
      },
    });
  }

  async markDocumentObsolete(docId: string, reason?: string): Promise<void> {
    await this.prisma.kBDoc.update({
      where: { id: docId },
      data: {
        isObsolete: true,
        obsoleteAt: new Date(),
        obsoleteBy: reason || 'System',
      },
    });
  }

  async unmarkDocumentObsolete(docId: string): Promise<void> {
    await this.prisma.kBDoc.update({
      where: { id: docId },
      data: {
        isObsolete: false,
        obsoleteAt: null,
        obsoleteBy: null,
      },
    });
  }

  /**
   * Переименование документа
   */
  async renameDocument(docId: string, newTitle: string): Promise<void> {
    await this.prisma.kBDoc.update({
      where: { id: docId },
      data: { title: newTitle },
    });
  }

  /**
   * Обновление документа
   */
  async updateDocument(docId: string, updates: { companyCode?: string; productCode?: string; fileUrl?: string | null }): Promise<void> {
    const updateData: any = {};
    
    if (updates.companyCode) {
      updateData.companyCode = updates.companyCode;
    }
    
    if (updates.productCode) {
      updateData.productCode = updates.productCode;
    }
    
    if (updates.fileUrl !== undefined) {
      updateData.fileUrl = updates.fileUrl;
    }

    await this.prisma.kBDoc.update({
      where: { id: docId },
      data: updateData,
    });
  }
}

