const { PrismaClient } = require('@prisma/client');

async function checkDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Проверяем базу данных...\n');
    
    // Проверяем документы
    const docCount = await prisma.kBDoc.count();
    console.log(`📄 Документов в базе: ${docCount}`);
    
    // Проверяем чанки
    const chunkCount = await prisma.kBChunk.count();
    console.log(`🧩 Чанков в базе: ${chunkCount}`);
    
    // Проверяем одобренные документы
    const approvedCount = await prisma.kBDoc.count({
      where: { isApproved: true }
    });
    console.log(`✅ Одобренных документов: ${approvedCount}`);
    
    // Проверяем неактуальные документы
    const obsoleteCount = await prisma.kBDoc.count({
      where: { isObsolete: true }
    });
    console.log(`❌ Неактуальных документов: ${obsoleteCount}`);
    
    // Проверяем компании
    const companies = await prisma.kBDoc.findMany({
      select: { companyCode: true },
      distinct: ['companyCode']
    });
    console.log(`🏢 Компаний: ${companies.length}`);
    companies.forEach(c => console.log(`  - ${c.companyCode}`));
    
    // Проверяем продукты
    const products = await prisma.kBDoc.findMany({
      select: { productCode: true },
      distinct: ['productCode']
    });
    console.log(`📦 Продуктов: ${products.length}`);
    products.forEach(p => console.log(`  - ${p.productCode}`));
    
    // Проверяем несколько чанков
    const sampleChunks = await prisma.kBChunk.findMany({
      take: 3,
      include: { doc: true }
    });
    
    console.log('\n📝 Примеры чанков:');
    sampleChunks.forEach((chunk, i) => {
      console.log(`${i + 1}. Документ: ${chunk.doc.title}`);
      console.log(`   Компания: ${chunk.doc.companyCode}, Продукт: ${chunk.doc.productCode}`);
      console.log(`   Текст: ${chunk.text.substring(0, 100)}...`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
