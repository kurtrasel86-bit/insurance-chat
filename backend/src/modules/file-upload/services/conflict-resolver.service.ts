import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FileParserService } from './file-parser.service';

export interface Conflict {
  docId: string;
  docTitle: string;
  conflictType: string;
  description: string;
  newValue: string;
  oldValue: string;
}

@Injectable()
export class ConflictResolverService {
  private readonly logger = new Logger(ConflictResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileParser: FileParserService,
  ) {}

  /**
   * Поиск конфликтов с существующими документами
   */
  async findConflicts(params: {
    newText: string;
    companyCode?: string;
    productCode?: string;
  }): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // Извлекаем ключевые данные из нового документа
    const newKeyData = this.fileParser.extractKeyData(params.newText);

    // Получаем существующие документы
    const existingDocs = await this.prisma.kBDoc.findMany({
      where: {
        ...(params.companyCode && { companyCode: params.companyCode }),
        ...(params.productCode && { productCode: params.productCode }),
      },
      include: {
        chunks: true,
      },
    });

    for (const doc of existingDocs) {
      const docContent = doc.chunks.map((chunk) => chunk.text).join(' ');
      const oldKeyData = this.fileParser.extractKeyData(docContent);

      // Проверка конфликтов по ценам
      if (newKeyData.prices && oldKeyData.prices) {
        const priceConflict = this.detectPriceConflict(newKeyData.prices, oldKeyData.prices);
        if (priceConflict) {
          conflicts.push({
            docId: doc.id,
            docTitle: doc.title,
            conflictType: 'price_difference',
            description: 'Обнаружено расхождение в ценах',
            newValue: priceConflict.newValue,
            oldValue: priceConflict.oldValue,
          });
        }
      }

      // Проверка конфликтов по срокам
      if (newKeyData.terms && oldKeyData.terms) {
        const termConflict = this.detectTermConflict(newKeyData.terms, oldKeyData.terms);
        if (termConflict) {
          conflicts.push({
            docId: doc.id,
            docTitle: doc.title,
            conflictType: 'term_mismatch',
            description: 'Обнаружено расхождение в сроках',
            newValue: termConflict.newValue,
            oldValue: termConflict.oldValue,
          });
        }
      }

      // Проверка конфликтов по процентам/условиям
      if (newKeyData.conditions && oldKeyData.conditions) {
        const conditionConflict = this.detectConditionConflict(newKeyData.conditions, oldKeyData.conditions);
        if (conditionConflict) {
          conflicts.push({
            docId: doc.id,
            docTitle: doc.title,
            conflictType: 'condition_mismatch',
            description: 'Обнаружено расхождение в условиях',
            newValue: conditionConflict.newValue,
            oldValue: conditionConflict.oldValue,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Определение конфликта по ценам
   */
  private detectPriceConflict(
    newPrices: string[],
    oldPrices: string[],
  ): { newValue: string; oldValue: string } | null {
    // Простое сравнение: если наборы цен отличаются
    const newPricesSet = new Set(newPrices.map((p) => p.toLowerCase().trim()));
    const oldPricesSet = new Set(oldPrices.map((p) => p.toLowerCase().trim()));

    const hasNewPrices = [...newPricesSet].some((p) => !oldPricesSet.has(p));
    const hasOldPrices = [...oldPricesSet].some((p) => !newPricesSet.has(p));

    if (hasNewPrices || hasOldPrices) {
      return {
        newValue: newPrices.slice(0, 3).join(', '), // первые 3 цены
        oldValue: oldPrices.slice(0, 3).join(', '),
      };
    }

    return null;
  }

  /**
   * Определение конфликта по срокам
   */
  private detectTermConflict(
    newTerms: string[],
    oldTerms: string[],
  ): { newValue: string; oldValue: string } | null {
    const newTermsSet = new Set(newTerms.map((t) => t.toLowerCase().trim()));
    const oldTermsSet = new Set(oldTerms.map((t) => t.toLowerCase().trim()));

    const hasNewTerms = [...newTermsSet].some((t) => !oldTermsSet.has(t));
    const hasOldTerms = [...oldTermsSet].some((t) => !newTermsSet.has(t));

    if (hasNewTerms || hasOldTerms) {
      return {
        newValue: newTerms.slice(0, 3).join(', '),
        oldValue: oldTerms.slice(0, 3).join(', '),
      };
    }

    return null;
  }

  /**
   * Определение конфликта по условиям
   */
  private detectConditionConflict(
    newConditions: string[],
    oldConditions: string[],
  ): { newValue: string; oldValue: string } | null {
    const newConditionsSet = new Set(newConditions.map((c) => c.toLowerCase().trim()));
    const oldConditionsSet = new Set(oldConditions.map((c) => c.toLowerCase().trim()));

    const hasNewConditions = [...newConditionsSet].some((c) => !oldConditionsSet.has(c));
    const hasOldConditions = [...oldConditionsSet].some((c) => !newConditionsSet.has(c));

    if (hasNewConditions || hasOldConditions) {
      return {
        newValue: newConditions.slice(0, 3).join(', '),
        oldValue: oldConditions.slice(0, 3).join(', '),
      };
    }

    return null;
  }
}

