import { Injectable, Logger } from '@nestjs/common';
import { InsuranceCompanyConfig, CollectedData } from '../data-collector.service';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

@Injectable()
export class ApiIntegrationService {
  private readonly logger = new Logger(ApiIntegrationService.name);
  private readonly httpClients = new Map<string, AxiosInstance>();

  constructor() {}

  /**
   * Получение HTTP клиента для компании
   */
  private getHttpClient(company: InsuranceCompanyConfig): AxiosInstance {
    const clientKey = company.id;
    
    if (!this.httpClients.has(clientKey)) {
      const client = axios.create({
        baseURL: company.website,
        timeout: 30000,
        headers: {
          'User-Agent': 'InsuranceDataCollector/1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(company.apiKey && { 'Authorization': `Bearer ${company.apiKey}` }),
        },
      });

      // Добавляем интерцепторы для логирования
      client.interceptors.request.use(
        (config) => {
          this.logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
          return config;
        },
        (error) => {
          this.logger.error('API Request Error:', error);
          return Promise.reject(error);
        }
      );

      client.interceptors.response.use(
        (response) => {
          this.logger.debug(`API Response: ${response.status} ${response.config.url}`);
          return response;
        },
        (error) => {
          this.logger.error('API Response Error:', error.response?.data || error.message);
          return Promise.reject(error);
        }
      );

      this.httpClients.set(clientKey, client);
    }

    return this.httpClients.get(clientKey)!;
  }

  /**
   * Основной метод сбора данных через API
   */
  async fetchCompanyData(company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    if (!company.apiConfig?.enabled) {
      this.logger.debug(`API integration disabled for ${company.name}`);
      return [];
    }

    this.logger.log(`Fetching data via API for ${company.name}`);
    const collectedData: CollectedData[] = [];

    try {
      const client = this.getHttpClient(company);

      // Сбор данных о продуктах
      const productsData = await this.fetchProducts(client, company);
      collectedData.push(...productsData);

      // Сбор данных о тарифах
      const pricingData = await this.fetchPricing(client, company);
      collectedData.push(...pricingData);

      // Сбор документов
      const documentsData = await this.fetchDocuments(client, company);
      collectedData.push(...documentsData);

    } catch (error) {
      this.logger.error(`API integration failed for ${company.name}:`, error);
      throw error;
    }

    this.logger.log(`Fetched ${collectedData.length} items via API for ${company.name}`);
    return collectedData;
  }

  /**
   * Получение данных о продуктах через API
   */
  private async fetchProducts(client: AxiosInstance, company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const products: CollectedData[] = [];

    try {
      const response = await client.get(company.apiConfig!.endpoints.products);
      const data = response.data;

      if (Array.isArray(data)) {
        // Если API возвращает массив продуктов
        for (const product of data) {
          const productData = this.parseProductData(product, company);
          if (productData) {
            products.push(productData);
          }
        }
      } else if (data.products && Array.isArray(data.products)) {
        // Если продукты находятся в поле products
        for (const product of data.products) {
          const productData = this.parseProductData(product, company);
          if (productData) {
            products.push(productData);
          }
        }
      } else {
        // Если API возвращает один продукт или другую структуру
        const productData = this.parseProductData(data, company);
        if (productData) {
          products.push(productData);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to fetch products for ${company.name}:`, error);
    }

    return products;
  }

  /**
   * Получение данных о тарифах через API
   */
  private async fetchPricing(client: AxiosInstance, company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const pricing: CollectedData[] = [];

    try {
      const response = await client.get(company.apiConfig!.endpoints.pricing);
      const data = response.data;

      if (data) {
        const pricingData = this.parsePricingData(data, company);
        if (pricingData) {
          pricing.push(pricingData);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to fetch pricing for ${company.name}:`, error);
    }

    return pricing;
  }

  /**
   * Получение документов через API
   */
  private async fetchDocuments(client: AxiosInstance, company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const documents: CollectedData[] = [];

    try {
      const response = await client.get(company.apiConfig!.endpoints.documents);
      const data = response.data;

      if (Array.isArray(data)) {
        for (const document of data) {
          const docData = this.parseDocumentData(document, company);
          if (docData) {
            documents.push(docData);
          }
        }
      } else if (data.documents && Array.isArray(data.documents)) {
        for (const document of data.documents) {
          const docData = this.parseDocumentData(document, company);
          if (docData) {
            documents.push(docData);
          }
        }
      } else {
        const docData = this.parseDocumentData(data, company);
        if (docData) {
          documents.push(docData);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to fetch documents for ${company.name}:`, error);
    }

    return documents;
  }

  /**
   * Парсинг данных продукта
   */
  private parseProductData(product: any, company: InsuranceCompanyConfig): CollectedData | null {
    try {
      const title = product.name || product.title || product.productName || 'Продукт';
      const description = product.description || product.info || product.details || '';
      const productType = product.type || product.category || product.productType || 'GENERAL';

      const features = product.features ? 
        (Array.isArray(product.features) ? product.features.join('\n') : product.features) : '';
      
      const benefits = product.benefits ? 
        (Array.isArray(product.benefits) ? product.benefits.join('\n') : product.benefits) : '';

      const conditions = product.conditions || product.terms || product.rules || '';

      const content = [
        title,
        description,
        features ? `Особенности:\n${features}` : '',
        benefits ? `Преимущества:\n${benefits}` : '',
        conditions ? `Условия:\n${conditions}` : ''
      ].filter(Boolean).join('\n\n');

      if (content.length > 50) {
        return {
          companyCode: company.code,
          productCode: productType.toUpperCase(),
          title: title,
          content: content,
          sourceUrl: product.url || company.website,
          version: product.version || new Date().toISOString(),
          lastModified: product.lastModified ? new Date(product.lastModified) : new Date(),
          dataType: 'product_info',
        };
      }

    } catch (error) {
      this.logger.error('Error parsing product data:', error);
    }

    return null;
  }

  /**
   * Парсинг данных о тарифах
   */
  private parsePricingData(data: any, company: InsuranceCompanyConfig): CollectedData | null {
    try {
      const title = data.title || 'Тарифы и цены';
      
      let content = '';
      
      if (data.tariffs && Array.isArray(data.tariffs)) {
        content = data.tariffs.map((tariff: any) => {
          const name = tariff.name || tariff.product || 'Тариф';
          const price = tariff.price || tariff.cost || tariff.amount || 'Не указано';
          const period = tariff.period || tariff.duration || '';
          return `${name}: ${price}${period ? ` (${period})` : ''}`;
        }).join('\n');
      } else if (data.pricing && typeof data.pricing === 'object') {
        content = Object.entries(data.pricing).map(([key, value]) => {
          return `${key}: ${value}`;
        }).join('\n');
      } else if (typeof data === 'object') {
        content = Object.entries(data).map(([key, value]) => {
          return `${key}: ${value}`;
        }).join('\n');
      } else {
        content = String(data);
      }

      if (content.length > 50) {
        return {
          companyCode: company.code,
          productCode: 'PRICING',
          title: title,
          content: content,
          sourceUrl: company.website,
          version: new Date().toISOString(),
          lastModified: new Date(),
          dataType: 'pricing',
        };
      }

    } catch (error) {
      this.logger.error('Error parsing pricing data:', error);
    }

    return null;
  }

  /**
   * Парсинг данных документов
   */
  private parseDocumentData(document: any, company: InsuranceCompanyConfig): CollectedData | null {
    try {
      const title = document.name || document.title || document.documentName || 'Документ';
      const content = document.content || document.text || document.description || '';
      const documentType = document.type || document.category || 'DOCUMENTS';

      if (content.length > 100) {
        return {
          companyCode: company.code,
          productCode: documentType.toUpperCase(),
          title: title,
          content: content,
          sourceUrl: document.url || document.link || company.website,
          version: document.version || new Date().toISOString(),
          lastModified: document.lastModified ? new Date(document.lastModified) : new Date(),
          dataType: 'terms',
        };
      }

    } catch (error) {
      this.logger.error('Error parsing document data:', error);
    }

    return null;
  }

  /**
   * Проверка доступности API
   */
  async checkApiAvailability(company: InsuranceCompanyConfig): Promise<boolean> {
    if (!company.apiConfig?.enabled) {
      return false;
    }

    try {
      const client = this.getHttpClient(company);
      
      // Проверяем доступность основного эндпоинта
      const response = await client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      this.logger.debug(`API not available for ${company.name}:`, error.message);
      return false;
    }
  }

  /**
   * Получение информации о версии API
   */
  async getApiVersion(company: InsuranceCompanyConfig): Promise<string | null> {
    if (!company.apiConfig?.enabled) {
      return null;
    }

    try {
      const client = this.getHttpClient(company);
      const response = await client.get('/version');
      return response.data.version || response.data.api_version || null;
    } catch (error) {
      this.logger.debug(`Failed to get API version for ${company.name}:`, error.message);
      return null;
    }
  }

  /**
   * Тестирование подключения к API
   */
  async testConnection(company: InsuranceCompanyConfig): Promise<{
    available: boolean;
    version?: string;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const available = await this.checkApiAvailability(company);
      const latency = Date.now() - startTime;
      
      if (available) {
        const version = await this.getApiVersion(company);
        return { available: true, version: version || undefined, latency };
      } else {
        return { available: false, latency, error: 'API not available' };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return { 
        available: false, 
        latency, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

