import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DuplicateDetectorService {
  private readonly logger = new Logger(DuplicateDetectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Поиск дубликатов в базе знаний
   */
  async findDuplicates(params: {
    title: string;
    content: string;
    companyCode?: string;
    productCode?: string;
    excludeDocId?: string; // Добавляем параметр для исключения конкретного документа
  }): Promise<
    Array<{
      docId: string;
      title: string;
      similarity: number;
      reason: string;
    }>
  > {
    const duplicates: Array<{
      docId: string;
      title: string;
      similarity: number;
      reason: string;
    }> = [];

    // Получаем существующие документы
    const existingDocs = await this.prisma.kBDoc.findMany({
      where: {
        ...(params.companyCode && { companyCode: params.companyCode }),
        ...(params.productCode && { productCode: params.productCode }),
        ...(params.excludeDocId && { NOT: { id: params.excludeDocId } }), // Исключаем документ, если указан
      },
      include: {
        chunks: true,
      },
    });

    this.logger.log(`Checking for duplicates among ${existingDocs.length} existing documents`);

    for (const doc of existingDocs) {
      let isDuplicate = false;
      let similarity = 0;
      let reason = '';

      // 1. Проверка по заголовку (более строгая)
      const titleSimilarity = this.calculateLevenshteinSimilarity(params.title, doc.title);

      if (titleSimilarity > 0.85) {
        isDuplicate = true;
        similarity = titleSimilarity;
        reason = `Очень похожий заголовок (${Math.round(titleSimilarity * 100)}%)`;
      } else if (titleSimilarity > 0.7) {
        // Проверяем ключевые слова в заголовке
        const keywordMatch = this.checkKeywordSimilarity(params.title, doc.title);
        if (keywordMatch > 0.8) {
          isDuplicate = true;
          similarity = keywordMatch;
          reason = `Похожие ключевые слова в заголовке (${Math.round(keywordMatch * 100)}%)`;
        }
      }

      // 2. Проверка по содержимому (если не найден дубликат по заголовку)
      if (!isDuplicate) {
        const docContent = doc.chunks.map((chunk) => chunk.text).join(' ');
        const contentSimilarity = this.calculateCosineSimilarity(params.content, docContent);

        if (contentSimilarity > 0.9) {
          isDuplicate = true;
          similarity = contentSimilarity;
          reason = `Идентичное содержимое (${Math.round(contentSimilarity * 100)}%)`;
        } else if (contentSimilarity > 0.75) {
          // Дополнительная проверка по ключевым фразам
          const phraseMatch = this.checkPhraseSimilarity(params.content, docContent);
          if (phraseMatch > 0.8) {
            isDuplicate = true;
            similarity = Math.max(contentSimilarity, phraseMatch);
            reason = `Похожие ключевые фразы (${Math.round(similarity * 100)}%)`;
          }
        }
      }

      // 3. Проверка по размеру документа (дополнительный индикатор)
      if (!isDuplicate) {
        const sizeDiff = Math.abs(params.content.length - doc.chunks.map(c => c.text).join('').length);
        const avgSize = (params.content.length + doc.chunks.map(c => c.text).join('').length) / 2;
        const sizeRatio = 1 - (sizeDiff / avgSize);
        
        if (sizeRatio > 0.95 && titleSimilarity > 0.6) {
          isDuplicate = true;
          similarity = (sizeRatio + titleSimilarity) / 2;
          reason = `Похожий размер и заголовок (${Math.round(similarity * 100)}%)`;
        }
      }

      if (isDuplicate) {
        duplicates.push({
          docId: doc.id,
          title: doc.title,
          similarity,
          reason,
        });
      }
    }

    // Сортируем по similarity (от большего к меньшему)
    const sortedDuplicates = duplicates.sort((a, b) => b.similarity - a.similarity);
    
    this.logger.log(`Found ${sortedDuplicates.length} potential duplicates`);
    
    return sortedDuplicates;
  }

  /**
   * Расчёт схожести строк (Levenshtein distance)
   */
  private calculateLevenshteinSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);

    if (maxLength === 0) return 1;

    return 1 - distance / maxLength;
  }

  /**
   * Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Расчёт схожести содержимого (Cosine similarity)
   */
  private calculateCosineSimilarity(text1: string, text2: string): number {
    const words1 = this.tokenize(text1);
    const words2 = this.tokenize(text2);

    const allWords = new Set([...words1, ...words2]);
    const vector1: number[] = [];
    const vector2: number[] = [];

    allWords.forEach((word) => {
      vector1.push(words1.filter((w) => w === word).length);
      vector2.push(words2.filter((w) => w === word).length);
    });

    const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
    const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Токенизация текста
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\wа-яё\s]/gi, '')
      .split(/\s+/)
      .filter((word) => word.length > 2); // убираем короткие слова
  }

  /**
   * Проверка схожести ключевых слов
   */
  private checkKeywordSimilarity(title1: string, title2: string): number {
    const keywords1 = this.extractKeywords(title1);
    const keywords2 = this.extractKeywords(title2);
    
    if (keywords1.length === 0 || keywords2.length === 0) return 0;
    
    const intersection = keywords1.filter(word => keywords2.includes(word));
    const union = [...new Set([...keywords1, ...keywords2])];
    
    return intersection.length / union.length;
  }

  /**
   * Извлечение ключевых слов из текста
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'при', 'о', 'об', 'к', 'у', 'за', 'под', 'над',
      'правила', 'условия', 'страхование', 'страховой', 'договор', 'полис', 'документ', 'файл'
    ]);
    
    return this.tokenize(text)
      .filter(word => !stopWords.has(word) && word.length > 3)
      .slice(0, 10); // берем первые 10 ключевых слов
  }

  /**
   * Проверка схожести ключевых фраз
   */
  private checkPhraseSimilarity(content1: string, content2: string): number {
    const phrases1 = this.extractKeyPhrases(content1);
    const phrases2 = this.extractKeyPhrases(content2);
    
    if (phrases1.length === 0 || phrases2.length === 0) return 0;
    
    let matchCount = 0;
    
    for (const phrase1 of phrases1) {
      for (const phrase2 of phrases2) {
        const similarity = this.calculateLevenshteinSimilarity(phrase1, phrase2);
        if (similarity > 0.8) {
          matchCount++;
          break;
        }
      }
    }
    
    return matchCount / Math.max(phrases1.length, phrases2.length);
  }

  /**
   * Извлечение ключевых фраз из текста
   */
  private extractKeyPhrases(text: string): string[] {
    // Ищем фразы, которые часто встречаются в страховых документах
    const patterns = [
      /страхов[а-я]+ случа[а-я]+/gi,
      /страхов[а-я]+ сумм[а-я]+/gi,
      /страхов[а-я]+ взнос[а-я]+/gi,
      /страхов[а-я]+ премия/gi,
      /франшиз[а-я]+/gi,
      /выплат[а-я]+ возмещени[а-я]+/gi,
      /исключени[а-я]+ из страхования/gi,
      /территори[а-я]+ страхования/gi,
      /срок действия/gi,
      /вступлени[а-я]+ в силу/gi
    ];
    
    const phrases: string[] = [];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        phrases.push(...matches.map(m => m.toLowerCase()));
      }
    }
    
    return [...new Set(phrases)].slice(0, 15); // уникальные фразы, максимум 15
  }
}

