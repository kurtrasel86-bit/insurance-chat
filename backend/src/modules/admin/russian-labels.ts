/**
 * Русские названия для компаний и продуктов
 */

export const COMPANY_LABELS: Record<string, string> = {
  'GENERAL': '🌐 Общие правила страхования',
  'SOGAZ': 'СОГАЗ',
  'INGOSSTRAH': 'Ингосстрах',
  'RESOGARANTIA': 'Ресо-Гарантия',
  'VSK': 'ВСК',
  'ROSGOSSTRAH': 'Росгосстрах',
  'TINKOFF': 'Тинькофф Страхование',
  'SBERBANK': 'Сбербанк Страхование',
  'ALFA': 'АльфаСтрахование',
  'TEST': 'Тестовая компания',
};

export const PRODUCT_LABELS: Record<string, string> = {
  'OSAGO': 'ОСАГО (Автогражданка)',
  'KASKO': 'КАСКО (Добровольное авто)',
  'MORTGAGE': 'Ипотечное страхование',
  'LIFE': 'Страхование жизни',
  'HEALTH': 'Медицинское страхование (ДМС)',
  'TRAVEL': 'Страхование путешественников',
  'PROPERTY': 'Страхование имущества',
  'LIABILITY': 'Страхование ответственности',
  'COMPANY_INFO': 'Информация о компании',
  'PRICING': 'Тарифы и цены',
  'DOCUMENTS': 'Документы и условия',
  'GENERAL': 'Общая информация',
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  'rules': 'Правила страхования',
  'instructions': 'Инструкция',
  'terms': 'Условия страхования',
  'tariffs': 'Тарифы',
  'guide': 'Памятка',
  'general': 'Общий документ',
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  'pdf': 'PDF документ',
  'webpage': 'Веб-страница',
  'news': 'Новостная страница',
};

export function getCompanyLabel(code: string): string {
  return COMPANY_LABELS[code] || code;
}

export function getProductLabel(code: string): string {
  return PRODUCT_LABELS[code] || code;
}

export function getDocumentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] || type;
}

export function getSourceTypeLabel(type: string): string {
  return SOURCE_TYPE_LABELS[type] || type;
}

