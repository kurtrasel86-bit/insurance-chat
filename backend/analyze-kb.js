#!/usr/bin/env node

/**
 * Скрипт для анализа и очистки базы знаний
 * Выполняет задание по наведению порядка в базе знаний
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000';

// Критерии для анализа
const OBSOLETE_KEYWORDS = [
  'устарело', 'не действует', 'заменено', 'отменено', 'неактуально',
  'выпущен новый', 'новая версия', 'обновлено', 'изменено'
];

const DELETE_KEYWORDS = [
  'техническая документация', 'внутреннее использование',
  'служебная информация', 'временный файл'
];

const INSURANCE_KEYWORDS = [
  'страхование', 'страховой', 'полис', 'страховка', 'риск',
  'покрытие', 'выплата', 'премия', 'тариф', 'условия'
];

async function fetchDocuments() {
  try {
    const response = await fetch(`${API_BASE}/kb/documents`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Ошибка получения документов:', error.message);
    return [];
  }
}

async function fetchDocumentContent(docId) {
  try {
    const response = await fetch(`${API_BASE}/kb/documents/${docId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Ошибка получения содержимого документа ${docId}:`, error.message);
    return '';
  }
}

function analyzeDocument(doc, content) {
  const analysis = {
    id: doc.id,
    title: doc.title,
    companyCode: doc.companyCode,
    productCode: doc.productCode,
    isApproved: doc.isApproved,
    isObsolete: doc.isObsolete,
    actions: [],
    issues: []
  };

  const contentLower = content.toLowerCase();
  const titleLower = doc.title.toLowerCase();

  // 1. Проверка на неактуальность (только при явных признаках)
  const hasObsoleteKeywords = OBSOLETE_KEYWORDS.some(keyword => 
    contentLower.includes(keyword) || titleLower.includes(keyword)
  );
  
  if (hasObsoleteKeywords && !doc.isObsolete) {
    analysis.actions.push('mark_obsolete');
    analysis.issues.push('Содержит ключевые слова неактуальности');
  }

  // 2. Проверка на удаление
  const hasDeleteKeywords = DELETE_KEYWORDS.some(keyword => 
    contentLower.includes(keyword) || titleLower.includes(keyword)
  );
  
  const isNotInsurance = !INSURANCE_KEYWORDS.some(keyword => 
    contentLower.includes(keyword) || titleLower.includes(keyword)
  );
  
  const isTooShort = content.length < 100;
  
  if (hasDeleteKeywords || (isNotInsurance && isTooShort)) {
    analysis.actions.push('delete');
    analysis.issues.push('Не подходит для страхового сервиса');
  }

  // 3. Проверка на исправление компании
  const companyMismatch = checkCompanyMismatch(doc.companyCode, content);
  if (companyMismatch) {
    analysis.actions.push('fix_company');
    analysis.issues.push(`Неправильная компания: ${doc.companyCode} -> ${companyMismatch}`);
  }

  // 4. Проверка на исправление продукта
  const productMismatch = checkProductMismatch(doc.productCode, content);
  if (productMismatch) {
    analysis.actions.push('fix_product');
    analysis.issues.push(`Неправильный продукт: ${doc.productCode} -> ${productMismatch}`);
  }

  return analysis;
}

function checkCompanyMismatch(companyCode, content) {
  const contentLower = content.toLowerCase();
  
  // Словарь компаний и их ключевых слов
  const companyKeywords = {
    'SOGAZ': ['согаз', 'согаз-мед', 'согаз-жизнь'],
    'INGOSSTRAKH': ['ингосстрах', 'ингосстрах-м'],
    'RESO': ['ресо', 'ресо-гарантия'],
    'VSK': ['вск', 'военно-страховая компания'],
    'ROSGOSSTRAKH': ['росгосстрах', 'ргс']
  };

  // Найти упоминания компаний в тексте
  for (const [code, keywords] of Object.entries(companyKeywords)) {
    if (code !== companyCode) {
      const hasKeywords = keywords.some(keyword => contentLower.includes(keyword));
      if (hasKeywords) {
        return code;
      }
    }
  }

  return null;
}

function checkProductMismatch(productCode, content) {
  const contentLower = content.toLowerCase();
  
  // Словарь продуктов и их ключевых слов
  const productKeywords = {
    'AUTO': ['авто', 'автомобиль', 'машина', 'осаго', 'каско', 'автострахование'],
    'PROPERTY': ['имущество', 'квартира', 'дом', 'недвижимость', 'имущественное'],
    'HEALTH': ['здоровье', 'медицина', 'дмс', 'медицинское', 'здоровье'],
    'LIFE': ['жизнь', 'жизненное', 'накопительное', 'инвестиционное'],
    'TRAVEL': ['путешествие', 'туризм', 'выезд', 'заграница', 'туристическое'],
    'ACCIDENT': ['несчастный случай', 'нс', 'травма', 'ущерб здоровью']
  };

  // Найти упоминания продуктов в тексте
  for (const [code, keywords] of Object.entries(productKeywords)) {
    if (code !== productCode) {
      const hasKeywords = keywords.some(keyword => contentLower.includes(keyword));
      if (hasKeywords) {
        return code;
      }
    }
  }

  return null;
}

async function main() {
  console.log('🔍 Начинаем анализ базы знаний...\n');

  // Получаем все документы
  console.log('📄 Получаем список документов...');
  const documents = await fetchDocuments();
  console.log(`Найдено документов: ${documents.length}\n`);

  if (documents.length === 0) {
    console.log('❌ Документы не найдены');
    return;
  }

  // Анализируем каждый документ
  console.log('🔍 Анализируем документы...');
  const analyses = [];
  
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`[${i + 1}/${documents.length}] Анализируем: ${doc.title}`);
    
    const content = await fetchDocumentContent(doc.id);
    const analysis = analyzeDocument(doc, content);
    analyses.push(analysis);
    
    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Группируем результаты
  const toMarkObsolete = analyses.filter(a => a.actions.includes('mark_obsolete'));
  const toDelete = analyses.filter(a => a.actions.includes('delete'));
  const toFixCompany = analyses.filter(a => a.actions.includes('fix_company'));
  const toFixProduct = analyses.filter(a => a.actions.includes('fix_product'));

  // Выводим отчет
  console.log('\n📊 РЕЗУЛЬТАТЫ АНАЛИЗА:');
  console.log('='.repeat(50));
  console.log(`📄 Всего документов: ${documents.length}`);
  console.log(`🔴 Пометить как obsolete: ${toMarkObsolete.length}`);
  console.log(`🗑️  Удалить: ${toDelete.length}`);
  console.log(`🏢 Исправить компанию: ${toFixCompany.length}`);
  console.log(`📦 Исправить продукт: ${toFixProduct.length}`);

  // Детальный отчет
  if (toMarkObsolete.length > 0) {
    console.log('\n🔴 ДОКУМЕНТЫ ДЛЯ ПОМЕТКИ КАК OBSOLETE:');
    toMarkObsolete.forEach(a => {
      console.log(`- ${a.title} (${a.companyCode}/${a.productCode})`);
      console.log(`  Проблемы: ${a.issues.join(', ')}`);
    });
  }

  if (toDelete.length > 0) {
    console.log('\n🗑️  ДОКУМЕНТЫ ДЛЯ УДАЛЕНИЯ:');
    toDelete.forEach(a => {
      console.log(`- ${a.title} (${a.companyCode}/${a.productCode})`);
      console.log(`  Проблемы: ${a.issues.join(', ')}`);
    });
  }

  if (toFixCompany.length > 0) {
    console.log('\n🏢 ДОКУМЕНТЫ ДЛЯ ИСПРАВЛЕНИЯ КОМПАНИИ:');
    toFixCompany.forEach(a => {
      console.log(`- ${a.title} (${a.companyCode} -> ${a.issues[0].split('-> ')[1]})`);
    });
  }

  if (toFixProduct.length > 0) {
    console.log('\n📦 ДОКУМЕНТЫ ДЛЯ ИСПРАВЛЕНИЯ ПРОДУКТА:');
    toFixProduct.forEach(a => {
      console.log(`- ${a.title} (${a.productCode} -> ${a.issues[0].split('-> ')[1]})`);
    });
  }

  // Сохраняем результаты в файл
  const report = {
    timestamp: new Date().toISOString(),
    totalDocuments: documents.length,
    toMarkObsolete: toMarkObsolete.map(a => ({ id: a.id, title: a.title, issues: a.issues })),
    toDelete: toDelete.map(a => ({ id: a.id, title: a.title, issues: a.issues })),
    toFixCompany: toFixCompany.map(a => ({ id: a.id, title: a.title, issues: a.issues })),
    toFixProduct: toFixProduct.map(a => ({ id: a.id, title: a.title, issues: a.issues }))
  };

  fs.writeFileSync('kb-analysis-report.json', JSON.stringify(report, null, 2));
  console.log('\n💾 Отчет сохранен в файл: kb-analysis-report.json');

  console.log('\n✅ Анализ завершен!');
}

main().catch(console.error);
