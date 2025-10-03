// Скрипт для исправления путей к файлам в базе данных
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixFilePaths() {
  console.log('🔧 Исправление путей к файлам...');

  try {
    // Получаем все документы с fileUrl
    const docs = await prisma.kBDoc.findMany({
      where: {
        fileUrl: { not: null }
      }
    });

    console.log(`Найдено документов с файлами: ${docs.length}`);

    for (const doc of docs) {
      if (doc.fileUrl) {
        // Извлекаем имя файла
        const filename = doc.fileUrl.split('/').pop();
        
        // Новый правильный путь
        const newPath = `/admin/files/download/${filename}`;
        
        if (doc.fileUrl !== newPath) {
          console.log(`Исправление: ${doc.fileUrl} → ${newPath}`);
          
          await prisma.kBDoc.update({
            where: { id: doc.id },
            data: { fileUrl: newPath }
          });
        }
      }
    }

    console.log('✅ Пути исправлены!');
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixFilePaths();

