const fetch = require('node-fetch');

async function testSearch() {
  try {
    console.log('🔍 Тестируем поиск по базе знаний...\n');
    
    // Тест 1: Простой поиск
    console.log('Тест 1: Поиск "страхование"');
    const response1 = await fetch('http://localhost:3000/kb/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'страхование',
        limit: 3
      })
    });
    
    if (response1.ok) {
      const results1 = await response1.json();
      console.log(`✅ Найдено результатов: ${results1.length}`);
      results1.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.docTitle} (${r.companyCode}/${r.productCode}) - ${r.score.toFixed(3)}`);
        console.log(`     ${r.text.substring(0, 100)}...`);
      });
    } else {
      console.log(`❌ Ошибка: ${response1.status} - ${await response1.text()}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Тест 2: Поиск по компании
    console.log('Тест 2: Поиск "ОСАГО" в компании RESO');
    const response2 = await fetch('http://localhost:3000/kb/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'ОСАГО',
        companyCode: 'RESO',
        limit: 3
      })
    });
    
    if (response2.ok) {
      const results2 = await response2.json();
      console.log(`✅ Найдено результатов: ${results2.length}`);
      results2.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.docTitle} (${r.companyCode}/${r.productCode}) - ${r.score.toFixed(3)}`);
        console.log(`     ${r.text.substring(0, 100)}...`);
      });
    } else {
      console.log(`❌ Ошибка: ${response2.status} - ${await response2.text()}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Тест 3: Проверка статистики
    console.log('Тест 3: Статистика базы знаний');
    const response3 = await fetch('http://localhost:3000/kb/stats');
    
    if (response3.ok) {
      const stats = await response3.json();
      console.log('✅ Статистика:');
      console.log(`  Документов: ${stats.totalDocuments}`);
      console.log(`  Чанков: ${stats.totalChunks}`);
      console.log(`  Компаний: ${stats.companies.length}`);
      console.log(`  Продуктов: ${stats.products.length}`);
    } else {
      console.log(`❌ Ошибка статистики: ${response3.status} - ${await response3.text()}`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error.message);
  }
}

testSearch();
