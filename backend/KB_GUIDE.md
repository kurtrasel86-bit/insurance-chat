# 📚 Knowledge Base (RAG) - Руководство

## Что это?

Knowledge Base с RAG (Retrieval-Augmented Generation) позволяет боту давать точные ответы на основе документов о страховых продуктах.

## Как это работает?

1. **Документы разбиваются на чанки** (фрагменты по 500 символов)
2. **Генерируются эмбеддинги** через OpenAI для семантического поиска
3. **При запросе пользователя** ищутся похожие чанки
4. **AI генерирует ответ** на основе найденной информации

## API Endpoints

### 📝 Добавить документ

```http
POST /kb/documents
Content-Type: application/json

{
  "companyCode": "PICC",
  "productCode": "TRAVEL_ANNUAL",
  "title": "Годовой туристический полис",
  "content": "Полное описание продукта...",
  "fileUrl": "https://example.com/doc.pdf",
  "sourceUrl": "https://picc.com/products/travel",
  "version": "2.0"
}
```

**Ответ:**
```json
{
  "docId": "uuid-here",
  "chunksCount": 5
}
```

### 📋 Список документов

```http
GET /kb/documents?companyCode=PICC&productCode=TRAVEL_ANNUAL
```

**Ответ:**
```json
[
  {
    "id": "uuid",
    "companyCode": "PICC",
    "productCode": "TRAVEL_ANNUAL",
    "title": "Годовой туристический полис",
    "fileUrl": "...",
    "sourceUrl": "...",
    "version": "2.0",
    "createdAt": "2025-01-01T00:00:00Z",
    "_count": {
      "chunks": 5
    }
  }
]
```

### 🔍 Поиск по базе знаний

```http
POST /kb/search
Content-Type: application/json

{
  "query": "Сколько стоит медицинская страховка?",
  "companyCode": "CPIC",
  "limit": 3
}
```

**Ответ:**
```json
[
  {
    "text": "Премиум медицинский полис CPIC - максимальная защита здоровья...",
    "score": 0.87,
    "docTitle": "Премиум медицинское страхование CPIC",
    "companyCode": "CPIC",
    "productCode": "MEDICAL_PREMIUM"
  }
]
```

### 🗑️ Удалить документ

```http
DELETE /kb/documents/:id
```

## Примеры использования

### PowerShell

#### Добавить документ:
```powershell
$body = @{
  companyCode = "PICC"
  productCode = "TRAVEL_ANNUAL"
  title = "Годовой туристический полис"
  content = "Годовой туристический полис PICC обеспечивает..."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/kb/documents" -Method Post -Body $body -ContentType "application/json"
```

#### Поиск:
```powershell
$body = @{
  query = "Сколько стоит страховка для туристов?"
  limit = 3
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/kb/search" -Method Post -Body $body -ContentType "application/json"
```

### Curl

#### Добавить документ:
```bash
curl -X POST http://localhost:3000/kb/documents \
  -H "Content-Type: application/json" \
  -d '{
    "companyCode": "PICC",
    "productCode": "TRAVEL_ANNUAL",
    "title": "Годовой туристический полис",
    "content": "Годовой туристический полис PICC обеспечивает..."
  }'
```

#### Поиск:
```bash
curl -X POST http://localhost:3000/kb/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Сколько стоит страховка для туристов?",
    "limit": 3
  }'
```

## Как бот использует RAG

Когда пользователь пишет боту, система:

1. **Ищет релевантные документы** по запросу
2. **Передает найденную информацию в AI**
3. **AI генерирует ответ** только на основе документов
4. **Если документов нет** - предлагает связаться с агентом

### Пример работы:

**Пользователь:** "Сколько стоит годовая туристическая страховка?"

**Система:**
1. Ищет в KB документы про туристическую страховку
2. Находит "ОСАГО СОГАЗ - Обязательное автострахование" (СОГАЗ)
3. AI отвечает: "ОСАГО от СОГАЗ стоит от 1,200 рублей в год..."

## Управление базой знаний

### Через Prisma Studio:
```powershell
npm run prisma:studio
```

Откроется веб-интерфейс на http://localhost:5555 где можно:
- Просматривать документы
- Редактировать чанки
- Удалять записи

### Через API:

См. примеры выше.

## Тестовые данные

После `npm run prisma:seed` в БД будут:

1. **PICC - Туристический полис** (TRAVEL_ANNUAL)
2. **CPIC - Медицинская страховка** (MEDICAL_PREMIUM)
3. **Ping An - Автострахование** (AUTO_STANDARD)
4. **PICC - Страхование квартиры** (PROPERTY_HOME)
5. **CPIC - Страхование бизнеса** (BUSINESS_SME)

## Настройка эмбеддингов

Для работы векторного поиска нужен **OpenAI API ключ** в `.env`:

```env
OPENAI_API_KEY="sk-your-api-key"
```

Используется модель: `text-embedding-3-small` (1536 измерений)

### Без API ключа:

Система будет работать, но поиск будет базовым (все результаты с score=0).
Для тестирования можно обойтись без ключа.

## Производительность

### Кеширование эмбеддингов:

Эмбеддинги чанков кешируются в памяти для ускорения поиска.

### Оптимизация:

Для больших баз знаний (1000+ документов) рекомендуется:
- Использовать векторную БД (Pinecone, Weaviate, Qdrant)
- Хранить эмбеддинги в отдельной таблице
- Использовать индексы для быстрого поиска

## Улучшения (TODO)

- [ ] Поддержка PDF/DOCX файлов
- [ ] Автоматическое обновление эмбеддингов
- [ ] Векторная БД вместо in-memory поиска
- [ ] Мультиязычность (английский, немецкий)
- [ ] Версионирование документов
- [ ] История изменений




