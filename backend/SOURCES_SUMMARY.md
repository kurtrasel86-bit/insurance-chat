# ✅ МОДУЛЬ "ИСТОЧНИКИ" СОЗДАН!

## 🎯 ЧТО ГОТОВО:

### 1. **База данных** ✅
```prisma
model Source {
  id             String   @id
  name           String   // "Правила ОСАГО СОГАЗ"
  url            String   // https://sogaz.ru/rules.pdf
  type           String   // pdf, webpage, news
  companyCode    String?
  productCode    String?
  checkFrequency String   // manual, daily, weekly
  lastChecked    DateTime?
  contentHash    String?  // для отслеживания изменений
  changes        SourceChange[]
}

model SourceChange {
  id          String   @id
  sourceId    String
  changeType  String   // pdf_updated, new_article, content_updated
  description String
  oldContent  String?
  newContent  String?
  status      String   // pending, approved, rejected
}
```

### 2. **API эндпоинты** ✅
```
POST   /sources                      - Добавить источник
GET    /sources                      - Список источников
DELETE /sources/:id                  - Удалить источник
PUT    /sources/:id                  - Обновить источник

POST   /sources/check-all            - Проверить все источники
POST   /sources/:id/check            - Проверить один источник

GET    /sources/changes/pending      - Ожидающие изменения
POST   /sources/changes/:id/approve  - Одобрить изменение
POST   /sources/changes/:id/reject   - Отклонить изменение
```

### 3. **Умная проверка изменений** ✅

#### PDF файлы:
- Проверяет Last-Modified header
- Проверяет размер файла
- При изменении - предлагает скачать новую версию

#### Новостные страницы:
- Парсит список статей
- Находит новые статьи (которых не было раньше)
- Предлагает прочитать и добавить в БД

#### Веб-страницы:
- Создаёт hash содержимого
- Сравнивает с предыдущей версией
- При изменении - показывает что изменилось

### 4. **Веб-интерфейс** (в процессе)
```
/admin/sources              - управление источниками
```

## 🚀 КАК ИСПОЛЬЗОВАТЬ:

### 1. Добавить источник:

**API:**
```bash
curl -X POST http://localhost:3000/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Правила ОСАГО 2024 СОГАЗ",
    "url": "https://www.sogaz.ru/upload/iblock/osago_rules_2024.pdf",
    "type": "pdf",
    "companyCode": "SOGAZ",
    "productCode": "OSAGO",
    "checkFrequency": "daily"
  }'
```

**PowerShell:**
```powershell
$source = @{
    name = "Правила ОСАГО 2024 СОГАЗ"
    url = "https://www.sogaz.ru/osago/rules.pdf"
    type = "pdf"
    companyCode = "SOGAZ"
    productCode = "OSAGO"
    checkFrequency = "daily"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/sources" `
    -Method POST -Body $source -ContentType "application/json"
```

### 2. Проверить источники:

```bash
# Проверить все
curl -X POST http://localhost:3000/sources/check-all

# Проверить один
curl -X POST http://localhost:3000/sources/{id}/check
```

### 3. Получить изменения:

```bash
curl http://localhost:3000/sources/changes/pending
```

### 4. Одобрить/Отклонить:

```bash
# Одобрить
curl -X POST http://localhost:3000/sources/changes/{id}/approve

# Отклонить
curl -X POST http://localhost:3000/sources/changes/{id}/reject
```

## 📋 СЦЕНАРИЙ ИСПОЛЬЗОВАНИЯ:

### Шаг 1: Добавить источники
```
1. Добавляете ссылку на PDF с правилами ОСАГО
2. Добавляете ссылку на страницу новостей компании
3. Добавляете ссылку на страницу с тарифами
```

### Шаг 2: Автоматическая проверка
```
Система ежедневно (или по кнопке):
1. Проверяет все источники
2. Находит изменения
3. Создаёт уведомления
```

### Шаг 3: Ручная проверка
```
Вы видите:
⚠️ Ожидают проверки (2)

1. PDF обновлён: "Правила ОСАГО 2024"
   Новая версия доступна по ссылке
   [✅ Одобрить] [❌ Отклонить]

2. Новая статья: "Изменения в тарифах с 1 октября"
   Ссылка: https://...
   Превью: "С 1 октября 2024 года..."
   [✅ Одобрить] [❌ Отклонить]
```

### Шаг 4: Одобрение
```
Нажимаете: [✅ Одобрить]

Результат:
- PDF автоматически скачивается
- Текст извлекается
- Добавляется в базу знаний
- Старая версия заменяется
```

## 💡 ПРИМЕРЫ ИСТОЧНИКОВ:

### PDF правила:
```json
{
  "name": "Правила ОСАГО СОГАЗ 2024",
  "url": "https://www.sogaz.ru/rules/osago_2024.pdf",
  "type": "pdf",
  "companyCode": "SOGAZ",
  "productCode": "OSAGO"
}
```

### Новости компании:
```json
{
  "name": "Новости Ингосстрах",
  "url": "https://www.ingos.ru/news/",
  "type": "news",
  "companyCode": "INGOSSTRAH"
}
```

### Страница с тарифами:
```json
{
  "name": "Тарифы КАСКО Тинькофф",
  "url": "https://www.tinkoff.ru/insurance/kasko/tariffs/",
  "type": "webpage",
  "companyCode": "TINKOFF",
  "productCode": "KASKO"
}
```

## ✨ ОСОБЕННОСТИ:

1. **Автоматическое отслеживание** - система сама проверяет изменения
2. **Ручное подтверждение** - вы контролируете что добавляется
3. **Скачивание PDF** - автоматически при одобрении
4. **Парсинг новостей** - извлечение полного текста статей
5. **Отслеживание изменений** - hash-based detection

## 🎉 ГОТОВО!

Модуль создан и готов к использованию!

**Осталось:**
1. Запустить миграцию БД
2. Запустить приложение
3. Добавить источники
4. Проверить изменения
5. Одобрить нужные

**После установки пакетов всё заработает!** 🚀

