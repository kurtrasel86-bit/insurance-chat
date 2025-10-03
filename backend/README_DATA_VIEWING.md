# 📊 Просмотр собранных данных - Руководство

## Обзор

Система предоставляет несколько способов для просмотра и анализа собранных данных от страховых компаний России:

1. **Веб-интерфейс админки** - удобный браузерный интерфейс
2. **REST API** - программный доступ к данным
3. **Экспорт данных** - выгрузка в различных форматах
4. **Семантический поиск** - интеллектуальный поиск по содержимому

## 🌐 Веб-интерфейс админки

### Доступ к админке

После запуска приложения откройте в браузере:

```
http://localhost:3000/admin
```

### Основные страницы

#### 1. Главная панель (`/admin`)
- **Статистика базы знаний**: общее количество документов, чанков, компаний
- **Последние документы**: 5 недавно добавленных документов
- **Статус планировщика**: информация о автоматическом сборе данных
- **Быстрая навигация**: ссылки на все разделы

#### 2. Просмотр документов (`/admin/documents`)
- **Таблица всех документов** с информацией:
  - Название документа
  - Страховая компания
  - Тип продукта
  - Количество чанков
  - Дата создания
- **Фильтрация и сортировка**
- **Детальный просмотр** каждого документа

#### 3. Система сбора данных (`/admin/data-collection`)
- **Конфигурация компаний**: статус веб-скрапинга и API
- **Статус планировщика**: время последнего и следующего запуска
- **Мониторинг процессов**: отслеживание автоматического сбора

#### 4. Семантический поиск (`/admin/search`)
- **Поисковый интерфейс** с возможностями:
  - Поиск по ключевым словам
  - Фильтрация по компании
  - Настройка количества результатов
- **Результаты с релевантностью**: показ процента соответствия
- **Предварительный просмотр** найденного контента

#### 5. Детальный просмотр документа (`/admin/documents/:id`)
- **Полная информация** о документе:
  - Метаданные (компания, продукт, дата, источник)
  - Полное содержимое по чанкам
  - Ссылки на оригинальные файлы
- **Структурированный просмотр** чанков

## 🔌 REST API

### Основные эндпоинты

#### База знаний

```http
# Получение статистики
GET /kb/stats

# Список всех компаний
GET /kb/companies

# Список всех продуктов
GET /kb/products?companyCode=SOGAZ

# Список документов
GET /kb/documents?companyCode=SOGAZ&productCode=OSAGO

# Последние документы
GET /kb/recent?limit=10

# Получение конкретного документа
GET /kb/documents/{id}

# Получение чанков документа
GET /kb/documents/{id}/chunks

# Семантический поиск
POST /kb/search
Content-Type: application/json

{
  "query": "стоимость ОСАГО",
  "companyCode": "SOGAZ",
  "limit": 10
}
```

#### Система сбора данных

```http
# Список компаний
GET /data-collector/companies

# Статус планировщика
GET /data-collector/scheduler/status

# Статистика сбора данных
GET /data-collector/scheduler/stats

# Ручной запуск сбора
POST /data-collector/scheduler/trigger?companyId=sogaz

# Тестирование API компании
POST /data-collector/test/api/sogaz
```

### Примеры использования API

#### Получение статистики
```bash
curl http://localhost:3000/kb/stats
```

#### Поиск по базе знаний
```bash
curl -X POST http://localhost:3000/kb/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ипотечное страхование", "limit": 5}'
```

#### Получение документов компании
```bash
curl "http://localhost:3000/kb/documents?companyCode=SOGAZ"
```

## 📤 Экспорт данных

### JSON экспорт

```http
GET /kb/export/json
```

**Пример ответа:**
```json
{
  "exportDate": "2025-01-01T12:00:00.000Z",
  "totalDocuments": 150,
  "totalChunks": 1250,
  "documents": [
    {
      "id": "doc-123",
      "companyCode": "SOGAZ",
      "productCode": "OSAGO",
      "title": "ОСАГО - Основные тарифы",
      "content": "Полное содержимое документа...",
      "chunks": [...],
      "createdAt": "2025-01-01T10:00:00.000Z"
    }
  ]
}
```

### CSV экспорт

```http
GET /kb/export/csv
```

**Структура CSV:**
- ID документа
- Компания
- Продукт
- Название
- Источник URL
- Файл URL
- Версия
- Дата создания
- Количество чанков
- Полное содержимое

### Программный экспорт

```javascript
// Получение всех данных
const response = await fetch('http://localhost:3000/kb/export/json');
const data = await response.json();

// Поиск и фильтрация
const searchResponse = await fetch('http://localhost:3000/kb/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'медицинское страхование',
    companyCode: 'INGOSSTRAH',
    limit: 20
  })
});
const results = await searchResponse.json();
```

## 🔍 Семантический поиск

### Возможности поиска

1. **Естественные запросы**: "сколько стоит автострахование"
2. **Фильтрация по компании**: поиск только по СОГАЗ
3. **Фильтрация по продукту**: только ОСАГО или КАСКО
4. **Настройка релевантности**: от 5 до 50 результатов

### Примеры поисковых запросов

- "стоимость ОСАГО для нового автомобиля"
- "условия ипотечного страхования"
- "покрытие медицинской страховки"
- "франшиза по КАСКО"
- "документы для оформления полиса"

### API поиска

```javascript
// Базовый поиск
const search = async (query) => {
  const response = await fetch('http://localhost:3000/kb/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 10 })
  });
  return response.json();
};

// Поиск с фильтрами
const searchWithFilters = async (query, companyCode, productCode) => {
  const response = await fetch('http://localhost:3000/kb/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      query, 
      companyCode, 
      productCode,
      limit: 20 
    })
  });
  return response.json();
};
```

## 📊 Мониторинг и аналитика

### Ключевые метрики

1. **Объем данных**:
   - Общее количество документов
   - Количество чанков
   - Количество компаний и продуктов

2. **Активность сбора**:
   - Последние добавленные документы
   - Статус планировщика
   - Время следующего сбора

3. **Качество данных**:
   - Статистика по компаниям
   - Анализ релевантности поиска
   - Ошибки при сборе данных

### Получение статистики

```bash
# Общая статистика базы знаний
curl http://localhost:3000/kb/stats

# Статистика планировщика
curl http://localhost:3000/data-collector/scheduler/stats

# Статистика уведомлений
curl http://localhost:3000/data-collector/notifications/stats
```

## 🛠️ Интеграция с внешними системами

### Webhook уведомления

Настройте webhook для получения уведомлений о новых данных:

```env
NOTIFICATION_WEBHOOK_ENABLED=true
NOTIFICATION_WEBHOOK_URL=https://your-system.com/webhook
```

### Telegram уведомления

```env
NOTIFICATION_TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Email уведомления

```env
NOTIFICATION_EMAIL_ENABLED=true
NOTIFICATION_EMAIL_RECIPIENTS=admin@example.com,analyst@example.com
```

## 🔧 Настройка и конфигурация

### Переменные окружения

```env
# Включение/выключение функций
DATA_COLLECTION_ENABLED=true
SCHEDULER_ENABLED=true

# Настройки поиска
OPENAI_API_KEY=your-openai-key

# Настройки экспорта
EXPORT_MAX_DOCUMENTS=1000
```

### Кастомизация интерфейса

Админка генерируется динамически и может быть настроена через:
- Модификацию `AdminController`
- Добавление новых страниц
- Интеграция с внешними дашбордами

## 📱 Мобильный доступ

Веб-интерфейс адаптивен и работает на мобильных устройствах:
- Адаптивная верстка
- Сенсорная навигация
- Оптимизированные формы

## 🔐 Безопасность

### Рекомендации по безопасности

1. **Ограничение доступа**: используйте reverse proxy (nginx)
2. **Аутентификация**: добавьте JWT токены
3. **Rate limiting**: ограничьте количество запросов
4. **Логирование**: отслеживайте доступ к данным

### Пример настройки nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location /admin {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Ограничение доступа
        allow 192.168.1.0/24;
        deny all;
    }
}
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи приложения
2. Убедитесь в правильности конфигурации
3. Проверьте доступность API
4. Обратитесь к команде разработки

---

**Создано:** 1 января 2025  
**Версия:** 1.0  
**Технологии:** NestJS, Prisma, OpenAI, HTML/CSS/JavaScript


