const API_BASE = 'http://localhost:3000';

async function testUrlDocuments() {
  console.log('🔗 Тестируем загрузку документов по URL...\n');

  try {
    // Тест 1: Обработка PDF документа по URL
    console.log('📄 Тест 1: Обработка PDF документа');
    const pdfResponse = await fetch(`${API_BASE}/url-documents/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://reso.ru/upload/iblock/123/1234567890.pdf', // Пример URL
        companyCode: 'RESO',
        productCode: 'AUTO',
        documentType: 'rules'
      })
    });

    if (pdfResponse.ok) {
      const pdfData = await pdfResponse.json();
      console.log('✅ PDF документ обработан:', pdfData.data.title);
      console.log(`   Дубликатов: ${pdfData.data.duplicatesCount}`);
      console.log(`   Конфликтов: ${pdfData.data.conflictsCount}`);
      console.log(`   Предупреждений по датам: ${pdfData.data.dateWarningsCount}`);
    } else {
      console.log('❌ Ошибка обработки PDF:', await pdfResponse.text());
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Тест 2: Обработка HTML страницы
    console.log('🌐 Тест 2: Обработка HTML страницы');
    const htmlResponse = await fetch(`${API_BASE}/url-documents/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://reso.ru/about/news/', // Пример URL
        companyCode: 'RESO',
        productCode: 'GENERAL',
        documentType: 'news'
      })
    });

    if (htmlResponse.ok) {
      const htmlData = await htmlResponse.json();
      console.log('✅ HTML страница обработана:', htmlData.data.title);
      console.log(`   Дубликатов: ${htmlData.data.duplicatesCount}`);
      console.log(`   Конфликтов: ${htmlData.data.conflictsCount}`);
    } else {
      console.log('❌ Ошибка обработки HTML:', await htmlResponse.text());
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Тест 3: Список документов
    console.log('📋 Тест 3: Список обработанных документов');
    const listResponse = await fetch(`${API_BASE}/url-documents`);
    
    if (listResponse.ok) {
      const listData = await listResponse.json();
      console.log(`✅ Найдено документов: ${listData.data.length}`);
      listData.data.forEach((doc, index) => {
        console.log(`   ${index + 1}. ${doc.title} (${doc.companyCode}/${doc.productCode})`);
        console.log(`      URL: ${doc.url}`);
        console.log(`      Статус: ${doc.status}`);
      });
    } else {
      console.log('❌ Ошибка получения списка:', await listResponse.text());
    }

  } catch (error) {
    console.error('❌ Ошибка тестирования:', error.message);
  }
}

testUrlDocuments();
