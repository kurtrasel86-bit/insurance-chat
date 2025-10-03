const { PrismaClient } = require('@prisma/client');

async function approveDocuments() {
  const prisma = new PrismaClient();
  
  try {
    console.log('✅ Одобряем документы для поиска...\n');
    
    // Одобряем первые 50 документов от каждой компании
    const companies = ['RESO', 'VSK', 'SOGAZ'];
    
    for (const company of companies) {
      console.log(`Одобряем документы компании ${company}...`);
      
      const docs = await prisma.kBDoc.findMany({
        where: {
          companyCode: company,
          isApproved: false,
          isObsolete: false
        },
        take: 50,
        select: { id: true, title: true }
      });
      
      if (docs.length > 0) {
        await prisma.kBDoc.updateMany({
          where: {
            id: { in: docs.map(d => d.id) }
          },
          data: {
            isApproved: true,
            approvedAt: new Date(),
            approvedBy: 'admin'
          }
        });
        
        console.log(`  ✅ Одобрено ${docs.length} документов`);
        console.log(`  Примеры: ${docs.slice(0, 3).map(d => d.title).join(', ')}`);
      } else {
        console.log(`  ⚠️ Нет документов для одобрения`);
      }
    }
    
    // Проверяем результат
    const totalApproved = await prisma.kBDoc.count({
      where: { isApproved: true }
    });
    
    const totalChunks = await prisma.kBChunk.count({
      where: {
        doc: {
          isApproved: true,
          isObsolete: false
        }
      }
    });
    
    console.log(`\n📊 Результат:`);
    console.log(`  Одобренных документов: ${totalApproved}`);
    console.log(`  Чанков для поиска: ${totalChunks}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

approveDocuments();
