# 📁 План системы загрузки файлов с правилами страхования

## 🎯 Цели:

1. **Загрузка файлов** - PDF, DOCX, TXT с правилами страхования
2. **Автоматическая обработка** - извлечение текста, анализ содержимого
3. **Выявление дубликатов** - сравнение с существующими документами
4. **Обнаружение противоречий** - поиск конфликтующей информации
5. **Ручное одобрение** - интерфейс для принятия решений
6. **Версионирование** - сохранение истории изменений

## 📦 Необходимые пакеты:

```bash
npm install multer @types/multer pdf-parse mammoth
```

- `multer` - загрузка файлов
- `pdf-parse` - парсинг PDF
- `mammoth` - парсинг DOCX
- `@types/multer` - TypeScript типы

## 🏗️ Архитектура:

### 1. **FileUploadModule**
```
src/modules/file-upload/
├── file-upload.module.ts
├── file-upload.controller.ts      # Эндпоинты для загрузки
├── file-upload.service.ts          # Основная логика
├── services/
│   ├── file-parser.service.ts      # Парсинг PDF/DOCX
│   ├── duplicate-detector.service.ts # Поиск дубликатов
│   └── conflict-resolver.service.ts  # Обнаружение противоречий
└── dtos/
    └── upload.dto.ts                # DTO для загрузки
```

### 2. **База данных** (добавить в schema.prisma):

```prisma
model UploadedFile {
  id              String   @id @default(uuid())
  filename        String
  originalName    String
  mimeType        String
  size            Int
  path            String
  
  companyCode     String
  productCode     String
  documentType    String   // 'rules', 'instructions', 'terms', etc.
  
  status          String   // 'pending', 'approved', 'rejected'
  extractedText   String?
  
  // Связь с KB документами
  kbDocId         String?
  kbDoc           KBDoc?   @relation(fields: [kbDocId], references: [id])
  
  // Дубликаты и конфликты
  duplicates      DuplicateCheck[]
  conflicts       ConflictCheck[]
  
  uploadedBy      String?
  createdAt       DateTime @default(now())
  processedAt     DateTime?
}

model DuplicateCheck {
  id              String   @id @default(uuid())
  fileId          String
  file            UploadedFile @relation(fields: [fileId], references: [id])
  
  existingDocId   String
  similarity      Float    // 0-1 (процент схожести)
  status          String   // 'pending_review', 'keep_both', 'replace', 'ignore'
  
  createdAt       DateTime @default(now())
  resolvedAt      DateTime?
}

model ConflictCheck {
  id              String   @id @default(uuid())
  fileId          String
  file            UploadedFile @relation(fields: [fileId], references: [id])
  
  existingDocId   String
  conflictType    String   // 'price_difference', 'term_mismatch', etc.
  description     String
  
  newValue        String
  oldValue        String
  
  status          String   // 'pending_review', 'accept_new', 'keep_old', 'manual_merge'
  
  createdAt       DateTime @default(now())
  resolvedAt      DateTime?
}
```

### 3. **API Эндпоинты:**

```typescript
POST   /files/upload              # Загрузить файл
GET    /files                     # Список загруженных файлов
GET    /files/:id                 # Детали файла
DELETE /files/:id                 # Удалить файл

GET    /files/:id/duplicates      # Найденные дубликаты
POST   /files/:id/duplicates/:dupId/resolve  # Разрешить дубликат

GET    /files/:id/conflicts       # Найденные конфликты
POST   /files/:id/conflicts/:confId/resolve  # Разрешить конфликт

POST   /files/:id/approve         # Одобрить и добавить в KB
POST   /files/:id/reject          # Отклонить файл
```

### 4. **Веб-интерфейс** (добавить в AdminController):

```
/admin/files                       # Управление файлами
/admin/files/upload                # Форма загрузки
/admin/files/:id/review            # Проверка дубликатов и конфликтов
```

## 🔄 Процесс загрузки:

```
1. Загрузка файла
   ↓
2. Определение типа (PDF/DOCX/TXT)
   ↓
3. Извлечение текста
   ↓
4. Анализ содержимого (компания, продукт, тип документа)
   ↓
5. Поиск дубликатов (схожесть текста > 80%)
   ↓
6. Поиск конфликтов (разные цены, условия и т.д.)
   ↓
7. Создание задачи на ручную проверку
   ↓
8. Ручное одобрение/отклонение
   ↓
9. Добавление в KB или удаление старых данных
```

## 💡 Алгоритмы:

### Поиск дубликатов:
1. Сравнение по заголовку (Levenshtein distance)
2. Сравнение по содержимому (cosine similarity)
3. Если схожесть > 80% → дубликат

### Поиск конфликтов:
1. Извлечение ключевых данных (цены, сроки, условия)
2. Сравнение с существующими
3. Если отличия > 10% → конфликт

### Автоматическое определение:
1. Ключевые слова в названии файла
2. Метаданные PDF
3. Структура документа

## 🎨 UI компоненты:

### Форма загрузки:
```html
<form>
  <input type="file" accept=".pdf,.docx,.txt">
  <select name="company">СОГАЗ, Ингосстрах...</select>
  <select name="product">ОСАГО, КАСКО...</select>
  <select name="docType">Правила, Инструкция...</select>
  <button>Загрузить</button>
</form>
```

### Карточка проверки:
```
📄 Правила ОСАГО 2024.pdf
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Найдено дубликатов: 1
⚠️  Найдено конфликтов: 2

Дубликаты:
  • "Правила ОСАГО 2023.pdf" (схожесть: 85%)
    [ Заменить старый ] [ Оставить оба ] [ Игнорировать ]

Конфликты:
  • Стоимость ОСАГО
    Новое: 2000-15000₽  vs  Старое: 1800-12000₽
    [ Принять новое ] [ Оставить старое ] [ Ручное слияние ]
    
  • Срок действия
    Новое: 12 месяцев  vs  Старое: 6-12 месяцев  
    [ Принять новое ] [ Оставить старое ]

[ Одобрить всё ] [ Отклонить ]
```

## 🚀 Этапы реализации:

### Этап 1: Базовая загрузка ✅
- [x] Установка пакетов
- [ ] FileUploadModule
- [ ] Эндпоинт загрузки
- [ ] Сохранение файлов

### Этап 2: Парсинг
- [ ] PDF парсер
- [ ] DOCX парсер
- [ ] TXT парсер
- [ ] Извлечение метаданных

### Этап 3: Анализ
- [ ] Определение типа документа
- [ ] Извлечение ключевых данных
- [ ] Поиск дубликатов
- [ ] Поиск конфликтов

### Этап 4: UI
- [ ] Форма загрузки
- [ ] Список файлов
- [ ] Интерфейс проверки
- [ ] Разрешение конфликтов

### Этап 5: Интеграция
- [ ] Добавление в KB
- [ ] Версионирование
- [ ] История изменений

## 📝 Примеры использования:

### 1. Загрузка файла:
```bash
curl -X POST http://localhost:3000/files/upload \
  -F "file=@Правила_ОСАГО_2024.pdf" \
  -F "companyCode=SOGAZ" \
  -F "productCode=OSAGO" \
  -F "documentType=rules"
```

### 2. Проверка дубликатов:
```bash
curl http://localhost:3000/files/123/duplicates
```

### 3. Разрешение конфликта:
```bash
curl -X POST http://localhost:3000/files/123/conflicts/456/resolve \
  -d '{"action": "accept_new"}'
```

## 🎉 Готово!

После реализации вы сможете:
1. ✅ Загружать PDF/DOCX файлы через веб-интерфейс
2. ✅ Автоматически извлекать текст
3. ✅ Находить дубликаты и конфликты
4. ✅ Вручную проверять и одобрять изменения
5. ✅ Поддерживать актуальность базы знаний

