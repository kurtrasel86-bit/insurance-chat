#!/usr/bin/env node

/**
 * Скрипт для исправления найденных проблем в базе знаний
 * Исправляет коды компаний и продуктов на основе анализа
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000';

// Маппинг исправлений на основе анализа
const COMPANY_FIXES = {
  'RESOGARANTIA': 'RESO'
};

const PRODUCT_FIXES = {
  'OSAGO': 'AUTO',
  'KASKO': 'AUTO'
};

// Загружаем результаты анализа
let analysisReport = null;
try {
  const reportData = fs.readFileSync('kb-analysis-report.json', 'utf8');
  analysisReport = JSON.parse(reportData);
  console.log('📄 Загружен отчет анализа:', analysisReport.timestamp);
} catch (error) {
  console.error('❌ Ошибка загрузки отчета анализа:', error.message);
  process.exit(1);
}

async function updateDocument(docId, updates) {
  try {
    const response = await fetch(`${API_BASE}/kb/documents/${docId}/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Ошибка обновления документа ${docId}:`, error.message);
    return null;
  }
}

async function fixCompanyCodes() {
  console.log('\n🏢 Исправляем коды компаний...');
  
  const companyFixes = analysisReport.toFixCompany || [];
  let successCount = 0;
  let errorCount = 0;

  for (const fix of companyFixes) {
    const newCompanyCode = fix.issues[0].split('-> ')[1];
    console.log(`[${successCount + errorCount + 1}/${companyFixes.length}] Исправляем: ${fix.title} (${fix.id}) -> ${newCompanyCode}`);
    
    const result = await updateDocument(fix.id, {
      companyCode: newCompanyCode
    });

    if (result) {
      successCount++;
      console.log(`✅ Успешно обновлен: ${fix.title}`);
    } else {
      errorCount++;
      console.log(`❌ Ошибка обновления: ${fix.title}`);
    }

    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n🏢 Результат исправления компаний:`);
  console.log(`✅ Успешно: ${successCount}`);
  console.log(`❌ Ошибок: ${errorCount}`);
  
  return { successCount, errorCount };
}

async function fixProductCodes() {
  console.log('\n📦 Исправляем коды продуктов...');
  
  const productFixes = analysisReport.toFixProduct || [];
  let successCount = 0;
  let errorCount = 0;

  for (const fix of productFixes) {
    const newProductCode = fix.issues[0].split('-> ')[1];
    console.log(`[${successCount + errorCount + 1}/${productFixes.length}] Исправляем: ${fix.title} (${fix.id}) -> ${newProductCode}`);
    
    const result = await updateDocument(fix.id, {
      productCode: newProductCode
    });

    if (result) {
      successCount++;
      console.log(`✅ Успешно обновлен: ${fix.title}`);
    } else {
      errorCount++;
      console.log(`❌ Ошибка обновления: ${fix.title}`);
    }

    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n📦 Результат исправления продуктов:`);
  console.log(`✅ Успешно: ${successCount}`);
  console.log(`❌ Ошибок: ${errorCount}`);
  
  return { successCount, errorCount };
}

async function markDocumentsAsObsolete() {
  console.log('\n🔴 Помечаем документы как obsolete...');
  
  const obsoleteDocs = analysisReport.toMarkObsolete || [];
  let successCount = 0;
  let errorCount = 0;

  for (const doc of obsoleteDocs) {
    console.log(`[${successCount + errorCount + 1}/${obsoleteDocs.length}] Помечаем как obsolete: ${doc.title} (${doc.id})`);
    
    const result = await updateDocument(doc.id, {
      isObsolete: true,
      obsoleteReason: 'Автоматически помечено как устаревшее на основе анализа'
    });

    if (result) {
      successCount++;
      console.log(`✅ Успешно помечен: ${doc.title}`);
    } else {
      errorCount++;
      console.log(`❌ Ошибка пометки: ${doc.title}`);
    }

    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n🔴 Результат пометки как obsolete:`);
  console.log(`✅ Успешно: ${successCount}`);
  console.log(`❌ Ошибок: ${errorCount}`);
  
  return { successCount, errorCount };
}

async function deleteDocuments() {
  console.log('\n🗑️ Удаляем документы...');
  
  const deleteDocs = analysisReport.toDelete || [];
  let successCount = 0;
  let errorCount = 0;

  for (const doc of deleteDocs) {
    console.log(`[${successCount + errorCount + 1}/${deleteDocs.length}] Удаляем: ${doc.title} (${doc.id})`);
    
    try {
      const response = await fetch(`${API_BASE}/kb/documents/${doc.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        successCount++;
        console.log(`✅ Успешно удален: ${doc.title}`);
      } else {
        const errorText = await response.text();
        console.log(`❌ Ошибка удаления: ${doc.title} - ${response.status}: ${errorText}`);
        errorCount++;
      }
    } catch (error) {
      console.log(`❌ Ошибка удаления: ${doc.title} - ${error.message}`);
      errorCount++;
    }

    // Небольшая пауза между запросами
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n🗑️ Результат удаления:`);
  console.log(`✅ Успешно: ${successCount}`);
  console.log(`❌ Ошибок: ${errorCount}`);
  
  return { successCount, errorCount };
}

async function main() {
  console.log('🔧 Начинаем исправление проблем в базе знаний...\n');

  const results = {
    companyFixes: { successCount: 0, errorCount: 0 },
    productFixes: { successCount: 0, errorCount: 0 },
    obsoleteMarks: { successCount: 0, errorCount: 0 },
    deletions: { successCount: 0, errorCount: 0 }
  };

  // 1. Исправляем коды компаний
  if (analysisReport.toFixCompany && analysisReport.toFixCompany.length > 0) {
    results.companyFixes = await fixCompanyCodes();
  } else {
    console.log('🏢 Нет документов для исправления кодов компаний');
  }

  // 2. Исправляем коды продуктов
  if (analysisReport.toFixProduct && analysisReport.toFixProduct.length > 0) {
    results.productFixes = await fixProductCodes();
  } else {
    console.log('📦 Нет документов для исправления кодов продуктов');
  }

  // 3. Помечаем документы как obsolete
  if (analysisReport.toMarkObsolete && analysisReport.toMarkObsolete.length > 0) {
    results.obsoleteMarks = await markDocumentsAsObsolete();
  } else {
    console.log('🔴 Нет документов для пометки как obsolete');
  }

  // 4. Удаляем документы
  if (analysisReport.toDelete && analysisReport.toDelete.length > 0) {
    results.deletions = await deleteDocuments();
  } else {
    console.log('🗑️ Нет документов для удаления');
  }

  // Итоговый отчет
  console.log('\n📊 ИТОГОВЫЙ ОТЧЕТ ИСПРАВЛЕНИЙ:');
  console.log('='.repeat(50));
  console.log(`🏢 Исправлено кодов компаний: ${results.companyFixes.successCount} (ошибок: ${results.companyFixes.errorCount})`);
  console.log(`📦 Исправлено кодов продуктов: ${results.productFixes.successCount} (ошибок: ${results.productFixes.errorCount})`);
  console.log(`🔴 Помечено как obsolete: ${results.obsoleteMarks.successCount} (ошибок: ${results.obsoleteMarks.errorCount})`);
  console.log(`🗑️ Удалено документов: ${results.deletions.successCount} (ошибок: ${results.deletions.errorCount})`);

  const totalSuccess = results.companyFixes.successCount + results.productFixes.successCount + 
                     results.obsoleteMarks.successCount + results.deletions.successCount;
  const totalErrors = results.companyFixes.errorCount + results.productFixes.errorCount + 
                     results.obsoleteMarks.errorCount + results.deletions.errorCount;

  console.log(`\n🎯 ОБЩИЙ РЕЗУЛЬТАТ:`);
  console.log(`✅ Всего успешных операций: ${totalSuccess}`);
  console.log(`❌ Всего ошибок: ${totalErrors}`);

  // Сохраняем отчет об исправлениях
  const fixReport = {
    timestamp: new Date().toISOString(),
    originalAnalysis: analysisReport.timestamp,
    results: results,
    totalSuccess,
    totalErrors
  };

  fs.writeFileSync('kb-fix-report.json', JSON.stringify(fixReport, null, 2));
  console.log('\n💾 Отчет об исправлениях сохранен в файл: kb-fix-report.json');

  console.log('\n✅ Исправления завершены!');
}

main().catch(console.error);
