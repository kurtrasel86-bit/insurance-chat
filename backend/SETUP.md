# Настройка проекта Insurance Chat Backend

## 📋 Шаг 1: Создайте .env файл

Создайте файл `.env` в папке `backend` со следующим содержимым:

```env
DATABASE_URL="file:./dev.db"

TELEGRAM_BOT_TOKEN="8279197548:AAGXNdEXKQUVBoK_qY2D8dAZWjdzSl1qhmQ"

# Опционально - для OpenAI
# OPENAI_API_KEY="your-openai-api-key"
# OPENAI_MODEL="gpt-4o-mini"

JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
```

## 🔧 Шаг 2: Установите зависимости

```powershell
npm install
```

## 🗄️ Шаг 3: Настройте базу данных

### Сгенерировать Prisma Client:
```powershell
npm run prisma:generate
```

### Создать миграцию БД:
```powershell
npm run prisma:migrate
```

При запросе имени миграции введите: `init`

### Заполнить базу тестовыми данными:
```powershell
npm run prisma:seed
```

Это добавит:
- 5 примеров страховых продуктов (PICC, CPIC, Ping An)
- Тестового агента (логин: admin, пароль: admin123)

## 🚀 Шаг 4: Запустите сервер

```powershell
npm run start:dev
```

## 🌐 Настройка Telegram Webhook (для локальной разработки)

### Окно №1 - Запустите туннель:
```powershell
npx localtunnel --port 3000
```

Скопируйте URL туннеля (например: `https://tangy-colts-change.loca.lt`)

### Окно №2 - Настройте webhook:
```powershell
$botToken = "8279197548:AAGXNdEXKQUVBoK_qY2D8dAZWjdzSl1qhmQ"
$publicUrl = "https://ваш-url.loca.lt"  # Вставьте URL из окна №1
Invoke-RestMethod -Uri ("https://api.telegram.org/bot{0}/setWebhook?url={1}/channels/telegram/webhook" -f $botToken, $publicUrl) -Method Get
```

### Окно №3 - Запустите сервер:
```powershell
cd backend
npm run start:dev
```

## 🛠️ Дополнительные команды

### Просмотр БД через Prisma Studio:
```powershell
npm run prisma:studio
```

### Пересоздание БД:
```powershell
# Удалите файл dev.db и папку prisma/migrations
# Затем запустите снова:
npm run prisma:migrate
```

## ✅ Проверка работы

1. Откройте Telegram бота
2. Напишите любое сообщение
3. Бот должен ответить
4. Сообщения сохраняются в БД (`dev.db`)

## 📚 Структура проекта

```
backend/
├── src/
│   ├── modules/
│   │   ├── ai/         # AI сервис (OpenAI)
│   │   ├── auth/       # Аутентификация агентов
│   │   ├── channels/   # Telegram webhook
│   │   ├── chat/       # Чат сервис
│   │   └── prisma/     # Prisma подключение
│   └── main.ts
├── prisma/
│   └── schema.prisma   # Схема БД
├── .env               # Переменные окружения
└── dev.db            # SQLite база данных
```

## 🔍 Troubleshooting

### Ошибка: "Prisma Client not generated"
```powershell
npm run prisma:generate
```

### Ошибка: "Can't reach database"
- Проверьте, что `.env` файл создан
- Проверьте путь в `DATABASE_URL`

### Webhook не работает
- Убедитесь, что туннель запущен
- Проверьте, что URL туннеля правильный в webhook
- Проверьте логи сервера на наличие ошибок

