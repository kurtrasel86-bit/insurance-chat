import { Injectable, Logger } from '@nestjs/common';
import { InsuranceCompanyConfig, CollectedData } from '../data-collector.service';
import * as puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

@Injectable()
export class WebScraperService {
  private readonly logger = new Logger(WebScraperService.name);
  private browser: puppeteer.Browser | null = null;

  constructor() {}

  /**
   * Инициализация браузера
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    }
  }

  /**
   * Закрытие браузера
   */
  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Основной метод сбора данных с сайта компании
   */
  async scrapeCompanyData(company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    this.logger.log(`Starting web scraping for ${company.name}`);
    
    await this.initBrowser();
    const collectedData: CollectedData[] = [];

    try {
      const page = await this.browser!.newPage();
      
      // Настройка пользовательского агента
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Настройка таймаутов
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // Переход на главную страницу
      await page.goto(company.website, { waitUntil: 'networkidle2' });
      await this.delay(2000); // Даем время на загрузку

      // Сбор данных о продуктах
      const productsData = await this.scrapeProducts(page, company);
      collectedData.push(...productsData);

      // Сбор данных о тарифах
      const pricingData = await this.scrapePricing(page, company);
      collectedData.push(...pricingData);

      // Сбор документов и условий
      const documentsData = await this.scrapeDocuments(page, company);
      collectedData.push(...documentsData);

      await page.close();
      
    } catch (error) {
      this.logger.error(`Error scraping ${company.name}:`, error);
      throw error;
    }

    this.logger.log(`Collected ${collectedData.length} items from ${company.name}`);
    return collectedData;
  }

  /**
   * Сбор информации о продуктах
   */
  private async scrapeProducts(page: puppeteer.Page, company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const products: CollectedData[] = [];

    try {
      // Поиск страницы с продуктами
      const productPages = [
        '/products',
        '/insurance',
        '/services',
        '/individuals',
        '/business',
      ];

      for (const productPath of productPages) {
        try {
          const url = new URL(productPath, company.website).href;
          await page.goto(url, { waitUntil: 'networkidle2' });
          await this.delay(1000);

          // Проверяем, есть ли продукты на странице
          const hasProducts = await page.$(company.scrapingConfig.selectors.productList);
          if (hasProducts) {
            const pageProducts = await this.extractProductsFromPage(page, company, url);
            products.push(...pageProducts);
            break; // Если нашли продукты, перестаем искать
          }
        } catch (error) {
          this.logger.debug(`Failed to scrape products from ${productPath}:`, error.message);
        }
      }

      // Если не нашли через стандартные пути, пробуем собрать с главной страницы
      if (products.length === 0) {
        await page.goto(company.website, { waitUntil: 'networkidle2' });
        const mainPageProducts = await this.extractProductsFromPage(page, company, company.website);
        products.push(...mainPageProducts);
      }

    } catch (error) {
      this.logger.error(`Error scraping products for ${company.name}:`, error);
    }

    return products;
  }

  /**
   * Извлечение продуктов со страницы
   */
  private async extractProductsFromPage(page: puppeteer.Page, company: InsuranceCompanyConfig, baseUrl: string): Promise<CollectedData[]> {
    const products: CollectedData[] = [];

    try {
      const content = await page.content();
      const $ = cheerio.load(content);

      // Ищем элементы продуктов
      const productElements = $(company.scrapingConfig.selectors.productList);
      
      for (let i = 0; i < productElements.length; i++) {
        const element = productElements.eq(i);
        
        // Извлекаем базовую информацию о продукте
        const title = element.find('h1, h2, h3, .title, .name').first().text().trim() || 
                     element.find('a').first().text().trim() ||
                     `Продукт ${i + 1}`;

        const description = element.find('.description, .text, p').first().text().trim();
        
        // Определяем тип продукта
        const productType = this.detectProductType(title, description);
        
        if (title && description) {
          products.push({
            companyCode: company.code,
            productCode: productType,
            title: title,
            content: `${title}\n\n${description}`,
            sourceUrl: baseUrl,
            version: new Date().toISOString(),
            lastModified: new Date(),
            dataType: 'product_info',
          });
        }

        // Если есть ссылка на детальную страницу, собираем дополнительную информацию
        const detailLink = element.find('a[href]').first().attr('href');
        if (detailLink) {
          try {
            const detailUrl = new URL(detailLink, baseUrl).href;
            const detailData = await this.scrapeProductDetails(page, company, detailUrl, productType);
            if (detailData) {
              products.push(detailData);
            }
          } catch (error) {
            this.logger.debug(`Failed to scrape product details from ${detailLink}:`, error.message);
          }
        }
      }

    } catch (error) {
      this.logger.error(`Error extracting products from page:`, error);
    }

    return products;
  }

  /**
   * Сбор детальной информации о продукте
   */
  private async scrapeProductDetails(page: puppeteer.Page, company: InsuranceCompanyConfig, url: string, productType: string): Promise<CollectedData | null> {
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      await this.delay(1000);

      const content = await page.content();
      const $ = cheerio.load(content);

      const title = $('h1').first().text().trim() || 
                   $('.product-title').first().text().trim() ||
                   'Детали продукта';

      // Собираем основное содержание
      const mainContent = $('.product-content, .description, .details, .info').text().trim();
      const features = $('.features li, .benefits li').map((_, el) => $(el).text().trim()).get().join('\n');
      const conditions = $('.conditions, .terms, .rules').text().trim();

      const fullContent = [
        title,
        mainContent,
        features ? `Особенности:\n${features}` : '',
        conditions ? `Условия:\n${conditions}` : ''
      ].filter(Boolean).join('\n\n');

      if (fullContent.length > 50) { // Минимальная длина контента
        return {
          companyCode: company.code,
          productCode: productType,
          title: title,
          content: fullContent,
          sourceUrl: url,
          version: new Date().toISOString(),
          lastModified: new Date(),
          dataType: 'product_info',
        };
      }

    } catch (error) {
      this.logger.debug(`Failed to scrape product details from ${url}:`, error.message);
    }

    return null;
  }

  /**
   * Сбор информации о тарифах
   */
  private async scrapePricing(page: puppeteer.Page, company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const pricingData: CollectedData[] = [];

    try {
      // Поиск страниц с тарифами
      const pricingPages = [
        '/tariffs',
        '/pricing',
        '/rates',
        '/calculator',
        '/cost',
      ];

      for (const pricingPath of pricingPages) {
        try {
          const url = new URL(pricingPath, company.website).href;
          await page.goto(url, { waitUntil: 'networkidle2' });
          await this.delay(1000);

          const hasPricing = await page.$(company.scrapingConfig.selectors.pricing);
          if (hasPricing) {
            const content = await page.content();
            const $ = cheerio.load(content);

            const title = $('h1').first().text().trim() || 'Тарифы';
            const pricingContent = $(company.scrapingConfig.selectors.pricing).text().trim();

            if (pricingContent) {
              pricingData.push({
                companyCode: company.code,
                productCode: 'PRICING',
                title: title,
                content: pricingContent,
                sourceUrl: url,
                version: new Date().toISOString(),
                lastModified: new Date(),
                dataType: 'pricing',
              });
            }
            break;
          }
        } catch (error) {
          this.logger.debug(`Failed to scrape pricing from ${pricingPath}:`, error.message);
        }
      }

    } catch (error) {
      this.logger.error(`Error scraping pricing for ${company.name}:`, error);
    }

    return pricingData;
  }

  /**
   * Сбор документов и условий
   */
  private async scrapeDocuments(page: puppeteer.Page, company: InsuranceCompanyConfig): Promise<CollectedData[]> {
    const documents: CollectedData[] = [];

    try {
      // Поиск страниц с документами
      const documentPages = [
        '/documents',
        '/rules',
        '/terms',
        '/conditions',
        '/legal',
      ];

      for (const docPath of documentPages) {
        try {
          const url = new URL(docPath, company.website).href;
          await page.goto(url, { waitUntil: 'networkidle2' });
          await this.delay(1000);

          const content = await page.content();
          const $ = cheerio.load(content);

          const title = $('h1').first().text().trim() || 'Документы и условия';
          const docContent = $('.content, .text, .document').text().trim();

          if (docContent && docContent.length > 100) {
            documents.push({
              companyCode: company.code,
              productCode: 'DOCUMENTS',
              title: title,
              content: docContent,
              sourceUrl: url,
              version: new Date().toISOString(),
              lastModified: new Date(),
              dataType: 'terms',
            });
          }

        } catch (error) {
          this.logger.debug(`Failed to scrape documents from ${docPath}:`, error.message);
        }
      }

    } catch (error) {
      this.logger.error(`Error scraping documents for ${company.name}:`, error);
    }

    return documents;
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

  /**
   * Очистка ресурсов
   */
  async cleanup(): Promise<void> {
    await this.closeBrowser();
  }
}


