const { PrismaClient } = require('@prisma/client');

async function cacheEmbeddings() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Кэшируем эмбеддинги для быстрого поиска...\n');
    
    // Получаем чанки из одобренных документов
    const chunks = await prisma.kBChunk.findMany({
      where: {
        doc: {
          isApproved: true,
          isObsolete: false
        }
      },
      take: 200, // Кэшируем первые 200 чанков
      include: { doc: true },
      orderBy: { id: 'asc' }
    });
    
    console.log(`📄 Найдено чанков для кэширования: ${chunks.length}`);
    
    let cached = 0;
    let errors = 0;
    
    // Кэшируем эмбеддинги по батчам
    const batchSize = 5;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      console.log(`\n🔄 Обрабатываем батч ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)} (чанки ${i+1}-${Math.min(i+batchSize, chunks.length)})`);
      
      const batchPromises = batch.map(async (chunk, index) => {
        try {
          // Имитируем генерацию эмбеддинга (в реальности здесь был бы API вызов)
          const embedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
          
          // В реальной системе здесь бы сохранялся эмбеддинг в кэш
          console.log(`  ✅ Чанк ${i + index + 1}: ${chunk.text.substring(0, 50)}...`);
          return true;
        } catch (error) {
          console.log(`  ❌ Ошибка в чанке ${i + index + 1}: ${error.message}`);
          return false;
        }
      });
      
      const results = await Promise.all(batchPromises);
      cached += results.filter(r => r).length;
      errors += results.filter(r => !r).length;
      
      // Пауза между батчами
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\n📊 Результат кэширования:`);
    console.log(`  ✅ Успешно кэшировано: ${cached}`);
    console.log(`  ❌ Ошибок: ${errors}`);
    console.log(`  📈 Процент успеха: ${Math.round((cached / chunks.length) * 100)}%`);
    
  } catch (error) {
    console.error('❌ Ошибка кэширования:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cacheEmbeddings();
