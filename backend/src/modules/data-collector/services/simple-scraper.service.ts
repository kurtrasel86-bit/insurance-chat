import { Injectable, Logger } from '@nestjs/common';
import { InsuranceCompanyConfig, CollectedData } from '../data-collector.service';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class SimpleScraperService {
  private readonly logger = new Logger(SimpleScraperService.name);

  constructor() {}

  /**
   * Основной метод сбора данных с сайта компании
   */
  async scrapeCompanyData(company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    this.logger.log(`Starting simple web scraping for ${company.name}`);
    
    const collectedData: CollectedData[] = [];

    try {
      // Собираем данные с главной страницы
      const mainPageData = await this.scrapeMainPage(company);
      collectedData.push(...mainPageData);

      // Собираем данные со страниц продуктов
      const productsData = await this.scrapeProductsPages(company);
      collectedData.push(...productsData);

      // Собираем данные о тарифах
      const pricingData = await this.scrapePricingPages(company);
      collectedData.push(...pricingData);

    } catch (error) {
      this.logger.error(`Error scraping ${company.name}:`, error);
      throw error;
    }

    this.logger.log(`Collected ${collectedData.length} items from ${company.name}`);
    return collectedData;
  }

  /**
   * Сбор данных с главной страницы
   */
  private async scrapeMainPage(company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const data: CollectedData[] = [];

    try {
      const response = await axios.get(company.website, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
      });

      const $ = cheerio.load(response.data);

      // Ищем информацию о страховых продуктах на главной странице
      const productSections = [
        '.insurance-products',
        '.products',
        '.services',
        '.insurance-types',
        '.product-cards',
        '.service-cards',
        '[class*="product"]',
        '[class*="service"]',
        '[class*="insurance"]'
      ];

      for (const selector of productSections) {
        const elements = $(selector);
        if (elements.length > 0) {
          elements.each((index, element) => {
            const $el = $(element);
            const title = this.extractTitle($el);
            const content = this.extractContent($el);

            if (title && content && content.length > 20) {
              const productType = this.detectProductType(title, content);
              
              data.push({
                companyCode: company.code,
                productCode: productType,
                title: title,
                content: content,
                sourceUrl: company.website,
                version: new Date().toISOString(),
                lastModified: new Date(),
                dataType: 'product_info',
              });
            }
          });
        }
      }

      // Если не нашли продуктов, создаем общую информацию о компании
      if (data.length === 0) {
        const pageTitle = $('title').text().trim();
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        const mainContent = $('main, .content, .main-content').text().trim().substring(0, 1000);

        if (pageTitle || mainContent) {
          data.push({
            companyCode: company.code,
            productCode: 'COMPANY_INFO',
            title: pageTitle || `${company.name} - Страховая компания`,
            content: `${pageTitle}\n\n${metaDescription}\n\n${mainContent}`,
            sourceUrl: company.website,
            version: new Date().toISOString(),
            lastModified: new Date(),
            dataType: 'product_info',
          });
        }
      }

    } catch (error) {
      this.logger.error(`Error scraping main page for ${company.name}:`, error.message);
    }

    return data;
  }

  /**
   * Сбор данных со страниц продуктов
   */
  private async scrapeProductsPages(company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const data: CollectedData[] = [];
    
    const productPages = [
      '/products',
      '/insurance',
      '/services',
      '/individuals',
      '/business',
      '/personal',
      '/corporate'
    ];

    for (const path of productPages) {
      try {
        const url = new URL(path, company.website).href;
        const response = await axios.get(url, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        const $ = cheerio.load(response.data);
        
        // Ищем продукты на странице
        const productSelectors = [
          '.product',
          '.service',
          '.insurance-product',
          '.product-card',
          '.service-card',
          '[class*="product"]',
          '[class*="service"]',
          'article',
          '.card'
        ];

        for (const selector of productSelectors) {
          const elements = $(selector);
          elements.each((index, element) => {
            const $el = $(element);
            const title = this.extractTitle($el);
            const content = this.extractContent($el);

            if (title && content && content.length > 30) {
              const productType = this.detectProductType(title, content);
              
              data.push({
                companyCode: company.code,
                productCode: productType,
                title: title,
                content: content,
                sourceUrl: url,
                version: new Date().toISOString(),
                lastModified: new Date(),
                dataType: 'product_info',
              });
            }
          });
        }

        // Если нашли продукты, прекращаем поиск
        if (data.length > 0) {
          break;
        }

      } catch (error) {
        this.logger.debug(`Failed to scrape products from ${path}:`, error.message);
      }
    }

    return data;
  }

  /**
   * Сбор данных о тарифах
   */
  private async scrapePricingPages(company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const data: CollectedData[] = [];
    
    const pricingPages = [
      '/tariffs',
      '/pricing',
      '/rates',
      '/calculator',
      '/cost',
      '/price'
    ];

    for (const path of pricingPages) {
      try {
        const url = new URL(path, company.website).href;
        const response = await axios.get(url, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        const $ = cheerio.load(response.data);
        
        const pricingSelectors = [
          '.pricing',
          '.tariff',
          '.rate',
          '.price',
          '.cost',
          '[class*="price"]',
          '[class*="tariff"]',
          'table'
        ];

        for (const selector of pricingSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            const title = $('h1, h2, .title').first().text().trim() || 'Тарифы';
            const content = elements.map((_, el) => $(el).text().trim()).get().join('\n\n');

            if (content && content.length > 50) {
              data.push({
                companyCode: company.code,
                productCode: 'PRICING',
                title: title,
                content: content,
                sourceUrl: url,
                version: new Date().toISOString(),
                lastModified: new Date(),
                dataType: 'pricing',
              });
              break;
            }
          }
        }

      } catch (error) {
        this.logger.debug(`Failed to scrape pricing from ${path}:`, error.message);
      }
    }

    return data;
  }

  /**
   * Извлечение заголовка из элемента
   */
  private extractTitle($el: cheerio.Cheerio): string {
    const titleSelectors = ['h1', 'h2', 'h3', '.title', '.name', '.heading', 'a'];
    
    for (const selector of titleSelectors) {
      const title = $el.find(selector).first().text().trim();
      if (title && title.length > 2) {
        return title;
      }
    }
    
    // Если не нашли заголовок, берем первую строку текста
    const text = $el.text().trim();
    return text.split('\n')[0].substring(0, 100);
  }

  /**
   * Извлечение содержимого из элемента
   */
  private extractContent($el: cheerio.Cheerio): string {
    // Удаляем скрипты и стили
    $el.find('script, style, nav, footer, header').remove();
    
    // Извлекаем текстовое содержимое
    const content = $el.text()
      .replace(/\s+/g, ' ')
      .trim();
    
    return content.substring(0, 2000); // Ограничиваем длину
  }

  /**
   * Определение типа продукта по названию и описанию
   */
  private detectProductType(title: string, description: string): string {
    const text = (title + ' ' + description).toLowerCase();

    if (text.includes('осаго') || text.includes('автострахование')) {
      return 'OSAGO';
    }
    if (text.includes('каско')) {
      return 'KASKO';
    }
    if (text.includes('ипотека') || text.includes('ипотечное')) {
      return 'MORTGAGE';
    }
    if (text.includes('жизнь') || text.includes('жизни')) {
      return 'LIFE';
    }
    if (text.includes('здоровье') || text.includes('медицинское')) {
      return 'HEALTH';
    }
    if (text.includes('путешествие') || text.includes('туризм')) {
      return 'TRAVEL';
    }
    if (text.includes('имущество') || text.includes('недвижимость')) {
      return 'PROPERTY';
    }
    if (text.includes('ответственность')) {
      return 'LIABILITY';
    }

    return 'GENERAL';
  }

  /**
   * Задержка для соблюдения rate limit
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
