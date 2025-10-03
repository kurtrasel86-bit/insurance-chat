import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebScraperService } from './services/web-scraper.service';
import { SimpleScraperService } from './services/simple-scraper.service';
import { ApiIntegrationService } from './services/api-integration.service';
import { DataParserService } from './services/data-parser.service';
import { NotificationService } from './services/notification.service';
import { CollectionStatusService } from './services/collection-status.service';

export interface InsuranceCompanyConfig {
  id: string;
  name: string;
  code: string;
  website: string;
  apiEndpoint?: string;
  apiKey?: string;
  scrapingConfig: {
    enabled: boolean;
    selectors: {
      productList: string;
      productDetails: string;
      pricing: string;
    };
    rateLimit: number; // requests per minute
  };
  apiConfig?: {
    enabled: boolean;
    endpoints: {
      products: string;
      pricing: string;
      documents: string;
    };
  };
}

export interface CollectedData {
  companyCode: string;
  productCode: string;
  title: string;
  content: string;
  sourceUrl: string;
  version: string;
  lastModified: Date;
  dataType: 'product_info' | 'pricing' | 'terms' | 'documents';
}

@Injectable()
export class DataCollectorService {
  private readonly logger = new Logger(DataCollectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webScraper: WebScraperService,
    private readonly simpleScraper: SimpleScraperService,
    private readonly apiIntegration: ApiIntegrationService,
    private readonly dataParser: DataParserService,
    private readonly notification: NotificationService,
    private readonly collectionStatus: CollectionStatusService,
  ) {}

  /**
   * Основные страховые компании России
   */
  private readonly insuranceCompanies: InsuranceCompanyConfig[] = [
    {
      id: 'sogaz',
      name: 'СОГАЗ',
      code: 'SOGAZ',
      website: 'https://www.sogaz.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.products-list .product-item',
          productDetails: '.product-details',
          pricing: '.pricing-table',
        },
        rateLimit: 30,
      },
      apiConfig: {
        enabled: false,
        endpoints: {
          products: '/api/products',
          pricing: '/api/pricing',
          documents: '/api/documents',
        },
      },
    },
    {
      id: 'ingosstrah',
      name: 'Ингосстрах',
      code: 'INGOSSTRAH',
      website: 'https://www.ingos.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.insurance-products .product-card',
          productDetails: '.product-info',
          pricing: '.tariff-info',
        },
        rateLimit: 30,
      },
    },
    {
      id: 'resogarantia',
      name: 'Ресо-Гарантия',
      code: 'RESOGARANTIA',
      website: 'https://www.reso.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.products .product',
          productDetails: '.product-description',
          pricing: '.tariff-section',
        },
        rateLimit: 30,
      },
    },
    {
      id: 'vsk',
      name: 'ВСК',
      code: 'VSK',
      website: 'https://www.vsk.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.insurance-products .item',
          productDetails: '.product-details',
          pricing: '.price-info',
        },
        rateLimit: 30,
      },
    },
    {
      id: 'rosgosstrah',
      name: 'Росгосстрах',
      code: 'ROSGOSSTRAH',
      website: 'https://www.rgs.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.products-list .product',
          productDetails: '.product-content',
          pricing: '.tariff-data',
        },
        rateLimit: 30,
      },
    },
    {
      id: 'tinkoff_insurance',
      name: 'Тинькофф Страхование',
      code: 'TINKOFF',
      website: 'https://www.tinkoffinsurance.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.insurance-cards .card',
          productDetails: '.card-content',
          pricing: '.price-section',
        },
        rateLimit: 30,
      },
    },
    {
      id: 'sberbank_insurance',
      name: 'Сбербанк Страхование',
      code: 'SBERBANK',
      website: 'https://www.sberbankins.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.products .product-item',
          productDetails: '.product-info',
          pricing: '.tariff-info',
        },
        rateLimit: 30,
      },
    },
    {
      id: 'alpha_insurance',
      name: 'АльфаСтрахование',
      code: 'ALPHA',
      website: 'https://www.alfastrah.ru',
      scrapingConfig: {
        enabled: true,
        selectors: {
          productList: '.insurance-products .product',
          productDetails: '.product-description',
          pricing: '.pricing-info',
        },
        rateLimit: 30,
      },
    },
  ];

  /**
   * Запуск сбора данных для всех компаний
   */
  async collectAllData(): Promise<void> {
    this.logger.log('Starting data collection for all insurance companies');
    
    // Инициализируем отслеживание статуса
    this.collectionStatus.startCollection(this.insuranceCompanies.length);

    try {
      for (const company of this.insuranceCompanies) {
        // Проверяем, не была ли остановлена коллекция
        if (!this.collectionStatus.canStopCollection()) {
          this.logger.log('Collection stopped by user');
          break;
        }

        try {
          this.collectionStatus.updateCurrentCompany(company.name, 'Подготовка к сбору данных');
          await this.collectCompanyData(company);
        } catch (error) {
          this.logger.error(`Failed to collect data for ${company.name}:`, error);
          this.collectionStatus.addError(company.name, error.message);
          await this.notification.notifyError(company.code, error.message);
        }
      }

      this.collectionStatus.completeCollection();
      this.logger.log('Data collection completed for all companies');
      
    } catch (error) {
      this.logger.error('Critical error during data collection:', error);
      this.collectionStatus.stopCollection();
      throw error;
    }
  }

  /**
   * Остановка сбора данных
   */
  async stopCollection(): Promise<void> {
    if (this.collectionStatus.canStopCollection()) {
      this.collectionStatus.stopCollection();
      this.logger.log('Data collection stop requested');
    }
  }

  /**
   * Получение статуса сбора данных
   */
  getCollectionStatus() {
    return this.collectionStatus.getStatus();
  }

  /**
   * Получение статистики производительности
   */
  getPerformanceStats() {
    return this.collectionStatus.getPerformanceStats();
  }

  /**
   * Сбор данных для конкретной компании
   */
  async collectCompanyData(company: InsuranceCompanyConfig): Promise<void> {
    this.logger.log(`Collecting data for ${company.name}`);
    this.collectionStatus.updateCurrentCompany(company.name, 'Начало сбора данных');

    let collectedData: CollectedData[] = [];
    let documentsCount = 0;
    let chunksCount = 0;

    // Сбор через веб-скрапинг (используем простой скрапер без Puppeteer)
    if (company.scrapingConfig.enabled) {
      try {
        this.collectionStatus.updateCurrentCompany(company.name, 'Веб-скрапинг');
        const scrapedData = await this.simpleScraper.scrapeCompanyData(company);
        collectedData = [...collectedData, ...scrapedData];
      } catch (error) {
        this.logger.error(`Simple web scraping failed for ${company.name}:`, error);
        this.collectionStatus.addError(company.name, `Web scraping failed: ${error.message}`);
        // Пробуем альтернативный метод - создаем базовые данные
        this.collectionStatus.updateCurrentCompany(company.name, 'Создание базовых данных');
        const basicData = this.createBasicCompanyData(company);
        collectedData = [...collectedData, ...basicData];
      }
    }

    // Сбор через API
    if (company.apiConfig?.enabled) {
      try {
        this.collectionStatus.updateCurrentCompany(company.name, 'API интеграция');
        const apiData = await this.apiIntegration.fetchCompanyData(company);
        collectedData = [...collectedData, ...apiData];
      } catch (error) {
        this.logger.error(`API integration failed for ${company.name}:`, error);
        this.collectionStatus.addError(company.name, `API integration failed: ${error.message}`);
      }
    }

    // Парсинг и обработка данных
    this.collectionStatus.updateCurrentCompany(company.name, 'Обработка данных');
    for (const data of collectedData) {
      try {
        const processedData = await this.dataParser.processData(data);
        const savedData = await this.saveToKnowledgeBase(processedData);
        documentsCount++;
        chunksCount += savedData.chunksCount;
      } catch (error) {
        this.logger.error(`Failed to process data for ${company.name}:`, error);
        this.collectionStatus.addError(company.name, `Data processing failed: ${error.message}`);
      }
    }

    // Уведомление о новых данных
    if (collectedData.length > 0) {
      this.collectionStatus.updateCurrentCompany(company.name, 'Отправка уведомлений');
      await this.notification.notifyNewData(company.code, collectedData.length);
    }

    // Завершаем обработку компании
    this.collectionStatus.completeCompany(company.name, documentsCount, chunksCount);
    this.logger.log(`Collected ${collectedData.length} data items for ${company.name}`);
  }

  /**
   * Сохранение данных в базу знаний
   */
  private async saveToKnowledgeBase(data: CollectedData): Promise<{ docId: string; chunksCount: number }> {
    // Проверяем, существует ли уже такой документ
    const existingDoc = await this.prisma.kBDoc.findFirst({
      where: {
        companyCode: data.companyCode,
        productCode: data.productCode,
        title: data.title,
        sourceUrl: data.sourceUrl,
      },
    });

    if (existingDoc) {
      // Обновляем существующий документ
      return await this.updateExistingDocument(existingDoc.id, data);
    } else {
      // Создаем новый документ
      return await this.createNewDocument(data);
    }
  }

  /**
   * Создание нового документа
   */
  private async createNewDocument(data: CollectedData): Promise<{ docId: string; chunksCount: number }> {
    const doc = await this.prisma.kBDoc.create({
      data: {
        companyCode: data.companyCode,
        productCode: data.productCode,
        title: data.title,
        sourceUrl: data.sourceUrl,
        version: data.version,
      },
    });

    // Создаем чанки
    const chunks = this.splitIntoChunks(data.content, 500, 50);
    for (let i = 0; i < chunks.length; i++) {
      await this.prisma.kBChunk.create({
        data: {
          docId: doc.id,
          chunkIdx: i,
          text: chunks[i],
        },
      });
    }

    this.logger.log(`Created new document ${doc.id} for ${data.companyCode}/${data.productCode}`);
    
    return { docId: doc.id, chunksCount: chunks.length };
  }

  /**
   * Обновление существующего документа
   */
  private async updateExistingDocument(docId: string, data: CollectedData): Promise<{ docId: string; chunksCount: number }> {
    // Удаляем старые чанки
    await this.prisma.kBChunk.deleteMany({
      where: { docId },
    });

    // Обновляем документ
    await this.prisma.kBDoc.update({
      where: { id: docId },
      data: {
        version: data.version,
        sourceUrl: data.sourceUrl,
      },
    });

    // Создаем новые чанки
    const chunks = this.splitIntoChunks(data.content, 500, 50);
    for (let i = 0; i < chunks.length; i++) {
      await this.prisma.kBChunk.create({
        data: {
          docId,
          chunkIdx: i,
          text: chunks[i],
        },
      });
    }

    this.logger.log(`Updated document ${docId} for ${data.companyCode}/${data.productCode}`);
    
    return { docId, chunksCount: chunks.length };
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
   * Создание базовых данных о компании, если скрапинг не удался
   */
  private createBasicCompanyData(company: InsuranceCompanyConfig): CollectedData[] {
    const basicData: CollectedData[] = [];

    // Создаем базовую информацию о компании
    basicData.push({
      companyCode: company.code,
      productCode: 'COMPANY_INFO',
      title: `${company.name} - Страховая компания`,
      content: `${company.name} - одна из ведущих страховых компаний России. Предоставляет широкий спектр страховых услуг для физических и юридических лиц. Сайт: ${company.website}`,
      sourceUrl: company.website,
      version: new Date().toISOString(),
      lastModified: new Date(),
      dataType: 'product_info',
    });

    // Создаем базовые продукты страхования
    const commonProducts = [
      {
        code: 'OSAGO',
        title: 'ОСАГО',
        description: 'Обязательное страхование автогражданской ответственности. Защищает от финансовых потерь при ДТП.'
      },
      {
        code: 'KASKO',
        title: 'КАСКО',
        description: 'Добровольное страхование автомобиля от ущерба и угона. Покрывает риски повреждения и хищения транспортного средства.'
      },
      {
        code: 'PROPERTY',
        title: 'Страхование имущества',
        description: 'Защита недвижимого и движимого имущества от различных рисков: пожар, кража, стихийные бедствия.'
      },
      {
        code: 'HEALTH',
        title: 'Медицинское страхование',
        description: 'Добровольное медицинское страхование для получения качественной медицинской помощи.'
      }
    ];

    for (const product of commonProducts) {
      basicData.push({
        companyCode: company.code,
        productCode: product.code,
        title: `${product.title} - ${company.name}`,
        content: `${product.title}\n\n${product.description}\n\nКомпания: ${company.name}\nСайт: ${company.website}`,
        sourceUrl: company.website,
        version: new Date().toISOString(),
        lastModified: new Date(),
        dataType: 'product_info',
      });
    }

    return basicData;
  }

  /**
   * Получение списка компаний
   */
  getInsuranceCompanies(): InsuranceCompanyConfig[] {
    return this.insuranceCompanies;
  }

  /**
   * Получение конфигурации компании
   */
  getCompanyConfig(companyId: string): InsuranceCompanyConfig | undefined {
    return this.insuranceCompanies.find(company => company.id === companyId);
  }

}

