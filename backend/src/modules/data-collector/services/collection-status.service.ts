import { Injectable, Logger } from '@nestjs/common';

export interface CollectionStatus {
  isRunning: boolean;
  currentCompany?: string;
  currentOperation?: string;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  startTime?: Date;
  endTime?: Date;
  errors: string[];
  collectedData: {
    totalDocuments: number;
    totalChunks: number;
    companiesProcessed: string[];
  };
  canStop: boolean;
}

@Injectable()
export class CollectionStatusService {
  private readonly logger = new Logger(CollectionStatusService.name);
  private status: CollectionStatus = {
    isRunning: false,
    progress: { completed: 0, total: 0, percentage: 0 },
    errors: [],
    collectedData: { totalDocuments: 0, totalChunks: 0, companiesProcessed: [] },
    canStop: false,
  };

  /**
   * Начать отслеживание сбора данных
   */
  startCollection(totalCompanies: number): void {
    this.status = {
      isRunning: true,
      progress: { completed: 0, total: totalCompanies, percentage: 0 },
      startTime: new Date(),
      errors: [],
      collectedData: { totalDocuments: 0, totalChunks: 0, companiesProcessed: [] },
      canStop: true,
    };
    this.logger.log(`Started collection tracking for ${totalCompanies} companies`);
  }

  /**
   * Обновить статус текущей компании
   */
  updateCurrentCompany(companyName: string, operation: string = 'Обработка'): void {
    this.status.currentCompany = companyName;
    this.status.currentOperation = operation;
    this.logger.log(`Processing ${companyName}: ${operation}`);
  }

  /**
   * Завершить обработку компании
   */
  completeCompany(companyName: string, documentsCount: number = 0, chunksCount: number = 0): void {
    this.status.progress.completed++;
    this.status.progress.percentage = Math.round((this.status.progress.completed / this.status.progress.total) * 100);
    this.status.collectedData.companiesProcessed.push(companyName);
    this.status.collectedData.totalDocuments += documentsCount;
    this.status.collectedData.totalChunks += chunksCount;
    
    this.logger.log(`Completed ${companyName}. Progress: ${this.status.progress.percentage}%`);
  }

  /**
   * Добавить ошибку
   */
  addError(companyName: string, error: string): void {
    const errorMessage = `${companyName}: ${error}`;
    this.status.errors.push(errorMessage);
    this.logger.error(errorMessage);
  }

  /**
   * Остановить сбор данных
   */
  stopCollection(): void {
    this.status.isRunning = false;
    this.status.canStop = false;
    this.status.endTime = new Date();
    this.logger.log('Collection stopped by user');
  }

  /**
   * Завершить сбор данных
   */
  completeCollection(): void {
    this.status.isRunning = false;
    this.status.canStop = false;
    this.status.endTime = new Date();
    this.logger.log(`Collection completed. Total: ${this.status.collectedData.totalDocuments} documents`);
  }

  /**
   * Получить текущий статус
   */
  getStatus(): CollectionStatus {
    return { ...this.status };
  }

  /**
   * Очистить статус
   */
  clearStatus(): void {
    this.status = {
      isRunning: false,
      progress: { completed: 0, total: 0, percentage: 0 },
      errors: [],
      collectedData: { totalDocuments: 0, totalChunks: 0, companiesProcessed: [] },
      canStop: false,
    };
  }

  /**
   * Проверить, можно ли остановить сбор
   */
  canStopCollection(): boolean {
    return this.status.canStop;
  }

  /**
   * Получить время выполнения
   */
  getExecutionTime(): number {
    if (!this.status.startTime) return 0;
    const endTime = this.status.endTime || new Date();
    return Math.round((endTime.getTime() - this.status.startTime.getTime()) / 1000);
  }

  /**
   * Получить статистику производительности
   */
  getPerformanceStats(): {
    executionTime: number;
    documentsPerSecond: number;
    averageTimePerCompany: number;
  } {
    const executionTime = this.getExecutionTime();
    const documentsPerSecond = executionTime > 0 ? this.status.collectedData.totalDocuments / executionTime : 0;
    const averageTimePerCompany = this.status.progress.completed > 0 ? executionTime / this.status.progress.completed : 0;

    return {
      executionTime,
      documentsPerSecond: Math.round(documentsPerSecond * 100) / 100,
      averageTimePerCompany: Math.round(averageTimePerCompany * 100) / 100,
    };
  }
}

