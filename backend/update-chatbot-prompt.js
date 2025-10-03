#!/usr/bin/env node

/**
 * Скрипт для обновления системного промпта чат-бота
 * на основе инструкций из CHATBOT_INSTRUCTIONS.md
 */

const fs = require('fs');
const path = require('path');

const INSTRUCTIONS_FILE = path.join(__dirname, 'CHATBOT_INSTRUCTIONS.md');
const PROMPTS_FILE = path.join(__dirname, 'CHATBOT_PROMPTS.md');
const AI_SERVICE_FILE = path.join(__dirname, 'src', 'modules', 'ai', 'ai.service.ts');

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Ошибка чтения файла ${filePath}:`, error.message);
        return null;
    }
}

function updateAIService() {
    console.log('🔄 Обновление системного промпта чат-бота...');
    
    // Читаем инструкции
    const instructions = readFile(INSTRUCTIONS_FILE);
    const prompts = readFile(PROMPTS_FILE);
    
    if (!instructions || !prompts) {
        console.error('❌ Не удалось прочитать файлы инструкций');
        return;
    }
    
    // Читаем текущий AI service
    const aiServiceContent = readFile(AI_SERVICE_FILE);
    if (!aiServiceContent) {
        console.error('❌ Не удалось прочитать ai.service.ts');
        return;
    }
    
    // Извлекаем системный промпт из prompts файла
    const systemPromptMatch = prompts.match(/## Системный промпт \(основной\)\s*\n\s*```\s*\n(.*?)\n```/s);
    if (!systemPromptMatch) {
        console.error('❌ Не найден системный промпт в CHATBOT_PROMPTS.md');
        console.error('Ищем паттерн: ## Системный промпт (основной)');
        return;
    }
    
    const newSystemPrompt = systemPromptMatch[1].trim();
    
    // Обновляем системный промпт в ai.service.ts
    // Ищем строку с базовым системным промптом (может быть в одинарных или обратных кавычках)
    const basePromptRegex = /let systemPrompt = [`'][^`']*[`'];?/s;
    const basePromptMatch = aiServiceContent.match(basePromptRegex);
    
    if (!basePromptMatch) {
        console.error('❌ Не найден базовый системный промпт в ai.service.ts');
        return;
    }
    
    // Заменяем базовый промпт на новый (используем обратные кавычки для многострочного текста)
    const updatedContent = aiServiceContent.replace(
        basePromptRegex,
        `let systemPrompt = \`${newSystemPrompt}\`;`
    );
    
    if (updatedContent === aiServiceContent) {
        console.log('⚠️  Системный промпт не изменился');
        return;
    }
    
    // Записываем обновленный файл
    try {
        fs.writeFileSync(AI_SERVICE_FILE, updatedContent, 'utf8');
        console.log('✅ Системный промпт успешно обновлен!');
        console.log('📝 Новый промпт:');
        console.log('─'.repeat(50));
        console.log(newSystemPrompt);
        console.log('─'.repeat(50));
    } catch (error) {
        console.error('❌ Ошибка записи файла:', error.message);
    }
}

function showInstructions() {
    console.log('📋 Инструкции по использованию:');
    console.log('');
    console.log('1. Редактируйте файл CHATBOT_INSTRUCTIONS.md с общими принципами');
    console.log('2. Редактируйте файл CHATBOT_PROMPTS.md с конкретными промптами');
    console.log('3. Запустите: node update-chatbot-prompt.js');
    console.log('4. Перезапустите сервер: npm run start:dev');
    console.log('');
    console.log('📁 Файлы для редактирования:');
    console.log(`   - ${INSTRUCTIONS_FILE}`);
    console.log(`   - ${PROMPTS_FILE}`);
    console.log('');
    console.log('🔧 Файл для обновления:');
    console.log(`   - ${AI_SERVICE_FILE}`);
}

// Основная логика
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showInstructions();
} else {
    updateAIService();
}
