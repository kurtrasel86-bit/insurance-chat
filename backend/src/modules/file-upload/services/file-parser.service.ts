import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  /**
   * Извлечение текста из файла в зависимости от типа
   */
  async extractText(filePath: string, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        return await this.extractFromPDF(filePath);
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        return await this.extractFromDOCX(filePath);
      } else if (mimeType === 'text/plain') {
        return await this.extractFromTXT(filePath);
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      this.logger.error(`Error extracting text from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Извлечение текста из буфера (для URL документов)
   */
  async extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        return await this.extractFromPDFBuffer(buffer);
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        return await this.extractFromDOCXBuffer(buffer);
      } else if (mimeType === 'text/plain') {
        return buffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      this.logger.error(`Error extracting text from buffer:`, error);
      throw error;
    }
  }

  /**
   * Извлечение текста из PDF
   */
  private async extractFromPDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      this.logger.error(`PDF parsing error:`, error);
      throw new Error('Failed to parse PDF file');
    }
  }

  /**
   * Извлечение текста из PDF буфера
   */
  private async extractFromPDFBuffer(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      this.logger.error(`PDF buffer parsing error:`, error);
      throw new Error('Failed to parse PDF buffer');
    }
  }

  /**
   * Извлечение текста из DOCX
   */
  private async extractFromDOCX(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      this.logger.error(`DOCX parsing error:`, error);
      throw new Error('Failed to parse DOCX file');
    }
  }

  /**
   * Извлечение текста из DOCX буфера
   */
  private async extractFromDOCXBuffer(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      this.logger.error(`DOCX buffer parsing error:`, error);
      throw new Error('Failed to parse DOCX buffer');
    }
  }

  /**
   * Извлечение текста из TXT
   */
  private async extractFromTXT(filePath: string): Promise<string> {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      this.logger.error(`TXT reading error:`, error);
      throw new Error('Failed to read TXT file');
    }
  }

  /**
   * Определение типа документа по содержимому
   */
  detectDocumentType(text: string, filename: string): string {
    const lowerText = text.toLowerCase();
    const lowerFilename = filename.toLowerCase();

    if (lowerText.includes('правила страхования') || lowerFilename.includes('правил')) {
      return 'rules';
    }
    if (lowerText.includes('инструкция') || lowerFilename.includes('инструкц')) {
      return 'instructions';
    }
    if (lowerText.includes('условия страхования') || lowerFilename.includes('услов')) {
      return 'terms';
    }
    if (lowerText.includes('тариф') || lowerFilename.includes('тариф')) {
      return 'tariffs';
    }
    if (lowerText.includes('памятка') || lowerFilename.includes('памятка')) {
      return 'guide';
    }

    return 'general';
  }

  /**
   * Генерация осмысленного русского названия для документа
   */
  generateRussianTitle(params: {
    originalFilename: string;
    extractedText: string;
    companyCode?: string;
    productCode?: string;
    documentType?: string;
  }): string {
    const company = this.getCompanyName(params.companyCode);
    const product = this.getProductName(params.productCode);
    const docType = this.getDocTypeName(params.documentType);

    // Пробуем извлечь год из текста или названия файла
    const yearMatch = (params.originalFilename + ' ' + params.extractedText.substring(0, 200))
      .match(/20(2[0-9]|3[0-9])/);
    const year = yearMatch ? yearMatch[0] : '';

    // Формируем название
    let title = '';

    if (docType && product && company) {
      title = `${docType} ${product} - ${company}${year ? ' (' + year + ')' : ''}`;
    } else if (docType && product) {
      title = `${docType} ${product}${year ? ' (' + year + ')' : ''}`;
    } else if (product && company) {
      title = `${product} - ${company}${year ? ' (' + year + ')' : ''}`;
    } else if (company) {
      title = `Документ - ${company}${year ? ' (' + year + ')' : ''}`;
    } else {
      // Используем первые слова из текста
      const firstLine = params.extractedText.split('\n')[0].trim();
      title = firstLine.substring(0, 100) || params.originalFilename;
    }

    return title;
  }

  private getCompanyName(code?: string): string {
    const companies: Record<string, string> = {
      'SOGAZ': 'СОГАЗ',
      'INGOSSTRAH': 'Ингосстрах',
      'RESOGARANTIA': 'Ресо-Гарантия',
      'VSK': 'ВСК',
      'ROSGOSSTRAH': 'Росгосстрах',
      'TINKOFF': 'Тинькофф',
      'SBERBANK': 'Сбербанк',
      'ALFA': 'АльфаСтрахование',
    };
    return code ? companies[code] || code : '';
  }

  private getProductName(code?: string): string {
    const products: Record<string, string> = {
      'OSAGO': 'ОСАГО',
      'KASKO': 'КАСКО',
      'MORTGAGE': 'Ипотечное страхование',
      'LIFE': 'Страхование жизни',
      'HEALTH': 'ДМС',
      'TRAVEL': 'Страхование путешественников',
      'PROPERTY': 'Страхование имущества',
      'LIABILITY': 'Страхование ответственности',
    };
    return code ? products[code] || code : '';
  }

  private getDocTypeName(type?: string): string {
    const types: Record<string, string> = {
      'rules': 'Правила страхования',
      'instructions': 'Инструкция',
      'terms': 'Условия страхования',
      'tariffs': 'Тарифы',
      'guide': 'Памятка',
    };
    return type ? types[type] || '' : '';
  }

  /**
   * Автоматическое определение компании и продукта
   */
  detectCompanyAndProduct(text: string, filename: string): { companyCode?: string; productCode?: string } {
    const combined = (text + ' ' + filename).toLowerCase();
    const result: { companyCode?: string; productCode?: string } = {};

    // Определение компании
    if (combined.includes('согаз')) result.companyCode = 'SOGAZ';
    else if (combined.includes('ингосстрах')) result.companyCode = 'INGOSSTRAH';
    else if (combined.includes('ресо')) result.companyCode = 'RESOGARANTIA';
    else if (combined.includes('вск')) result.companyCode = 'VSK';
    else if (combined.includes('росгосстрах') || combined.includes('ргс')) result.companyCode = 'ROSGOSSTRAH';
    else if (combined.includes('тинькофф') || combined.includes('тинков')) result.companyCode = 'TINKOFF';
    else if (combined.includes('сбербанк')) result.companyCode = 'SBERBANK';
    else if (combined.includes('альфа')) result.companyCode = 'ALFA';

    // Определение продукта
    if (combined.includes('осаго')) result.productCode = 'OSAGO';
    else if (combined.includes('каско')) result.productCode = 'KASKO';
    else if (combined.includes('ипотека') || combined.includes('ипотечное')) result.productCode = 'MORTGAGE';
    else if (combined.includes('жизнь') || combined.includes('жизни')) result.productCode = 'LIFE';
    else if (combined.includes('здоровье') || combined.includes('дмс')) result.productCode = 'HEALTH';
    else if (combined.includes('путешеств') || combined.includes('туризм')) result.productCode = 'TRAVEL';
    else if (combined.includes('имущество') || combined.includes('недвижимость')) result.productCode = 'PROPERTY';
    else if (combined.includes('ответственность')) result.productCode = 'LIABILITY';

    return result;
  }


  /**
   * Извлечение ключевых данных (цены, сроки, условия)
   */
  extractKeyData(text: string): {
    prices?: string[];
    terms?: string[];
    conditions?: string[];
  } {
    const result: { prices?: string[]; terms?: string[]; conditions?: string[] } = {};

    // Поиск цен (числа с рублями)
    const priceRegex = /(\d+[\s,.]?\d*)\s*(руб|₽|рублей)/gi;
    const prices = text.match(priceRegex);
    if (prices && prices.length > 0) {
      result.prices = [...new Set(prices)]; // убираем дубликаты
    }

    // Поиск сроков (месяцы, годы)
    const termRegex = /(\d+)\s*(месяц|год|лет)/gi;
    const terms = text.match(termRegex);
    if (terms && terms.length > 0) {
      result.terms = [...new Set(terms)];
    }

    // Поиск процентов
    const percentRegex = /(\d+[\s,.]?\d*)\s*%/g;
    const percents = text.match(percentRegex);
    if (percents && percents.length > 0) {
      result.conditions = [...new Set(percents)];
    }

    return result;
  }
}
