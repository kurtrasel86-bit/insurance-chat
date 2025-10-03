# 🎉 Knowledge Base + RAG - Готово!

## Что добавлено?

### 1. **Knowledge Base модуль** 📚
- Управление базой знаний о страховых продуктах
- Автоматическая разбивка документов на чанки
- API для добавления/удаления/поиска документов

### 2. **Векторный поиск** 🔍
- Семантический поиск через OpenAI embeddings
- Косинусное сходство для ранжирования результатов
- Кеширование эмбеддингов для производительности

### 3. **RAG интеграция** 🤖
- AI отвечает на основе документов из базы знаний
- Точные ответы о страховых продуктах
- Автоматический fallback если информации нет

### 4. **Тестовые данные** ✅
- 5 готовых примеров страховых продуктов
- Полное описание покрытий и цен
- Тестовый агент для админки

## Быстрый старт

### 1. Создайте `.env`:
```env
DATABASE_URL="file:./dev.db"
TELEGRAM_BOT_TOKEN="ваш-токен"
OPENAI_API_KEY="ваш-ключ-openai"
JWT_SECRET="секретный-ключ"
```

### 2. Установите и запустите:
```powershell
cd insurance-chat/backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

### 3. Протестируйте бота:

#### Telegram бот:
Напишите в Telegram боту: **"Сколько стоит туристическая страховка?"**

#### Веб-чат:
- **Полноэкранный чат:** http://localhost:3000/web
- **Демо с виджетом:** http://localhost:3000/web/demo
- **Тест API:** `.\test-web-chat.ps1`

#### Система агентов:
- **Тест агентов:** `.\test-agents.ps1`
- **Запрос агента:** кнопка "Связать с агентом" в чате

Бот найдет информацию в базе знаний и ответит точно! 🎯

## Структура проекта

```
backend/
├── src/modules/
│   ├── kb/                    # ⭐ НОВЫЙ: Knowledge Base
│   │   ├── kb.service.ts      # Логика RAG
│   │   ├── kb.controller.ts   # API endpoints
│   │   └── kb.module.ts
│   ├── ai/                    # ⭐ ОБНОВЛЕН: AI модуль
│   │   ├── ai.service.ts      # RAG интеграция
│   │   ├── ai.controller.ts   # ⭐ НОВЫЙ: AI API
│   │   └── ai.module.ts
│   ├── web/                   # ⭐ НОВЫЙ: Веб-чат
│   │   ├── web.controller.ts  # Веб-интерфейс и виджет
│   │   └── web.module.ts
│   ├── agents/                # ⭐ НОВЫЙ: Система агентов
│   │   ├── agents.service.ts  # Логика handover
│   │   ├── agents.controller.ts # API агентов
│   │   └── agents.module.ts
│   ├── chat/
│   │   └── chat.service.ts    # ⭐ ОБНОВЛЕН: Prisma БД
│   ├── channels/
│   │   ├── telegram.controller.ts
│   │   └── channels.module.ts # ⭐ ОБНОВЛЕН: KB импорт
│   └── prisma/                # ⭐ НОВЫЙ: Prisma модуль
│       ├── prisma.service.ts
│       └── prisma.module.ts
├── public/                    # ⭐ НОВЫЙ: Статические файлы
│   ├── index.html             # Веб-чат интерфейс
│   └── demo.html              # Демо-страница с виджетом
├── prisma/
│   ├── schema.prisma          # ⭐ ИСПРАВЛЕН: Relations
│   └── seed.ts                # ⭐ НОВЫЙ: Тестовые данные
├── SETUP.md                   # ⭐ Инструкция по установке
├── KB_GUIDE.md                # ⭐ Руководство по KB
├── WEB_WIDGET_GUIDE.md        # ⭐ НОВЫЙ: Руководство по виджету
├── AGENTS_SYSTEM_GUIDE.md     # ⭐ НОВЫЙ: Руководство по агентам
├── test-web-chat.ps1          # ⭐ НОВЫЙ: Тест веб-чата
├── test-agents.ps1            # ⭐ НОВЫЙ: Тест системы агентов
└── README_RAG.md              # ⭐ Этот файл
```

## API Endpoints

### Knowledge Base:

- `POST /kb/documents` - Добавить документ
- `GET /kb/documents` - Список документов
- `DELETE /kb/documents/:id` - Удалить документ
- `POST /kb/search` - Поиск по базе

Подробнее: [KB_GUIDE.md](./KB_GUIDE.md)

### Веб-чат (НОВЫЙ):

- `GET /web` - Полноэкранный чат
- `GET /web/demo` - Демо-страница с виджетом
- `GET /web/widget` - JavaScript для встраивания
- `POST /web/chat` - Отправка сообщения
- `GET /web/messages/:sessionId` - История сообщений
- `POST /web/search` - Поиск по базе знаний
- `GET /web/products` - Список продуктов
- `POST /web/request-agent` - Запрос агента
- `GET /web/agents/available` - Доступные агенты
- `GET /web/agents/stats` - Статистика агентов

Подробнее: [WEB_WIDGET_GUIDE.md](./WEB_WIDGET_GUIDE.md)

### Система агентов (НОВЫЙ):

- `GET /agents/available` - Список доступных агентов
- `GET /agents/stats` - Статистика агентов
- `POST /agents/request` - Запрос подключения агента
- `POST /agents/accept` - Агент принимает запрос
- `POST /agents/reject` - Агент отклоняет запрос
- `GET /agents/requests/:agentId` - Запросы агента
- `GET /agents/request/:requestId` - Информация о запросе
- `POST /agents/end-session` - Завершить сессию агента

Подробнее: [AGENTS_SYSTEM_GUIDE.md](./AGENTS_SYSTEM_GUIDE.md)

### AI:

- `POST /ai/generate` - Генерация ответа AI

### Chat (существующие):

- `POST /chat/sessions` - Создать сессию
- `POST /chat/messages` - Отправить сообщение
- `GET /chat/messages/:sessionId` - История сообщений

### Telegram Webhook:

- `POST /channels/telegram/webhook` - Webhook для Telegram

## Тестовые данные

После seed доступны:

| Компания | Продукт | Описание | Цена |
|----------|---------|----------|------|
| PICC | TRAVEL_ANNUAL | Годовой туристический полис | от 2,500¥/год |
| CPIC | MEDICAL_PREMIUM | Премиум медицинская страховка | от 8,000¥/год |
| Ping An | AUTO_STANDARD | Автострахование ОСАГО+КАСКО | от 950¥/год |
| PICC | PROPERTY_HOME | Страхование квартиры | от 800¥/год |
| CPIC | BUSINESS_SME | Страхование малого бизнеса | от 15,000¥/год |

## Примеры вопросов для тестирования

Спросите бота в Telegram:

1. **"Сколько стоит туристическая страховка?"**
   → Найдет PICC TRAVEL_ANNUAL

2. **"Что покрывает медицинская страховка CPIC?"**
   → Найдет CPIC MEDICAL_PREMIUM

3. **"Нужна страховка на машину"**
   → Найдет Ping An AUTO_STANDARD

4. **"Как застраховать квартиру?"**
   → Найдет PICC PROPERTY_HOME

5. **"Страхование для бизнеса"**
   → Найдет CPIC BUSINESS_SME

## Как это работает?

```
Пользователь: "Сколько стоит медицинская страховка?"
        ↓
1. Telegram отправляет сообщение → TelegramController
        ↓
2. Сохраняется в БД → ChatService (Prisma)
        ↓
3. Генерируется embedding запроса → KbService
        ↓
4. Ищутся похожие документы (cosine similarity)
        ↓
5. Найденные чанки передаются в AI → AiService
        ↓
6. AI генерирует ответ на основе документов
        ↓
7. Ответ отправляется пользователю и сохраняется в БД
```

## Что дальше?

### Следующие улучшения:

1. **Веб-виджет** - чат для сайта
2. **Админ-панель** - управление чатами и KB
3. **Handover** - передача от AI к агенту
4. **Voice** - голосовые сообщения
5. **Интеграция polis.online** - оформление полисов

### Оптимизация RAG:

1. Векторная БД (Pinecone/Qdrant)
2. Хранение эмбеддингов в Prisma
3. Индексы для быстрого поиска
4. Batch processing для больших объемов

## Troubleshooting

### Бот отвечает "нет информации"
- Проверьте, что seed выполнен: `npm run prisma:seed`
- Проверьте OPENAI_API_KEY в `.env`

### Поиск не работает
- Убедитесь, что OPENAI_API_KEY валиден
- Проверьте баланс OpenAI аккаунта
- Посмотрите логи сервера на наличие ошибок

### База данных не создается
- Удалите `dev.db` и `prisma/migrations`
- Запустите снова: `npm run prisma:migrate`

## Документация

- [SETUP.md](./SETUP.md) - Полная инструкция по установке
- [KB_GUIDE.md](./KB_GUIDE.md) - Руководство по Knowledge Base
- [Prisma Docs](https://www.prisma.io/docs) - Документация Prisma
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings) - OpenAI эмбеддинги

---

**Создано:** 1 октября 2025
**Технологии:** NestJS, Prisma, SQLite, OpenAI, RAG, Telegram Bot API




