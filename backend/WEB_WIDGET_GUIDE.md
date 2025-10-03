# 🌐 Веб-виджет чата - Руководство

## Что это?

Веб-виджет чата позволяет встроить страховой чат-бот на любой сайт. Пользователи могут задавать вопросы о страховании прямо на вашем сайте без перехода на другие страницы.

## Возможности

### ✅ Реализовано:
- **Встраиваемый виджет** - одна строка кода для подключения
- **Адаптивный дизайн** - работает на всех устройствах
- **RAG интеграция** - умные ответы на основе базы знаний
- **Быстрые действия** - кнопки для частых вопросов
- **Голосовые сообщения** - поддержка записи голоса (в разработке)
- **Загрузка файлов** - поддержка изображений и документов (в разработке)

### 🔄 В разработке:
- Передача чата агенту
- Интеграция с polis.online
- Генерация PDF полисов

## Быстрый старт

### 1. Запустите сервер

```powershell
cd backend
npm run start:dev
```

### 2. Откройте демо-страницу

Перейдите по адресу: http://localhost:3000/web/demo

### 3. Протестируйте виджет

Нажмите на кнопку чата в правом нижнем углу и попробуйте задать вопросы:
- "Сколько стоит туристическая страховка?"
- "Нужна медицинская страховка"
- "Страхование автомобиля"

## Встраивание на сайт

### Простое подключение

Добавьте одну строку в `<head>` вашего сайта:

```html
<script src="http://localhost:3000/web/widget"></script>
```

### Настройка URL

Для продакшена измените URL в `.env`:

```env
WEB_BASE_URL=https://your-domain.com
```

Тогда скрипт будет:

```html
<script src="https://your-domain.com/web/widget"></script>
```

## API Endpoints

### Веб-чат

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/web` | Полноэкранный чат |
| GET | `/web/demo` | Демо-страница с виджетом |
| GET | `/web/widget` | JavaScript для встраивания |
| POST | `/web/chat` | Отправка сообщения |
| GET | `/web/messages/:sessionId` | История сообщений |
| POST | `/web/search` | Поиск по базе знаний |
| GET | `/web/products` | Список продуктов |
| POST | `/web/request-agent` | Запрос агента |

### AI

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/ai/generate` | Генерация ответа AI |

## Примеры использования

### JavaScript API

```javascript
// Отправка сообщения
const response = await fetch('/web/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session-id',
    message: 'Сколько стоит страховка?'
  })
});

const data = await response.json();
console.log(data.reply); // Ответ AI
```

### Поиск по базе знаний

```javascript
const searchResults = await fetch('/web/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'туристическая страховка',
    companyCode: 'PICC',
    limit: 5
  })
});
```

### Получение списка продуктов

```javascript
const products = await fetch('/web/products?companyCode=PICC');
const data = await products.json();
console.log(data); // Группированные по компаниям продукты
```

## Кастомизация виджета

### Изменение внешнего вида

Виджет создается динамически через JavaScript. Вы можете модифицировать стили после загрузки:

```javascript
// После загрузки виджета
const chatButton = document.getElementById('insurance-chat-button');
const chatFrame = document.getElementById('insurance-chat-frame');

// Изменить цвет кнопки
chatButton.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)';

// Изменить размер чата
chatFrame.style.width = '500px';
chatFrame.style.height = '700px';
```

### Позиционирование

```javascript
// Изменить позицию кнопки
chatButton.style.bottom = '30px';
chatButton.style.left = '30px'; // вместо right
```

## Интеграция с аналитикой

### Google Analytics

```javascript
// Отслеживание открытия чата
chatButton.addEventListener('click', () => {
  gtag('event', 'chat_opened', {
    event_category: 'engagement',
    event_label: 'insurance_chat'
  });
});
```

### Яндекс.Метрика

```javascript
// Отслеживание отправки сообщений
function trackMessage(message) {
  ym(12345678, 'reachGoal', 'chat_message_sent', {
    message_length: message.length
  });
}
```

## Безопасность

### CORS настройки

В `main.ts` добавьте CORS для внешних доменов:

```typescript
app.enableCors({
  origin: ['https://your-domain.com', 'https://another-domain.com'],
  credentials: true
});
```

### Валидация сессий

Все запросы проверяют валидность `sessionId`. Невалидные сессии отклоняются.

## Производительность

### Оптимизация загрузки

```html
<!-- Асинхронная загрузка виджета -->
<script>
  (function() {
    const script = document.createElement('script');
    script.src = 'http://localhost:3000/web/widget';
    script.async = true;
    document.head.appendChild(script);
  })();
</script>
```

### Кеширование

Статические файлы кешируются браузером. Для обновления виджета измените версию:

```html
<script src="http://localhost:3000/web/widget?v=2.0"></script>
```

## Мобильная адаптация

Виджет автоматически адаптируется под мобильные устройства:

- На экранах < 480px чат открывается на весь экран
- Кнопки увеличиваются для удобного нажатия
- Текст масштабируется для читаемости

## Troubleshooting

### Виджет не загружается

1. Проверьте, что сервер запущен на порту 3000
2. Убедитесь, что нет блокировки CORS
3. Проверьте консоль браузера на ошибки

### Чат не отвечает

1. Проверьте подключение к интернету
2. Убедитесь, что база знаний заполнена (`npm run prisma:seed`)
3. Проверьте логи сервера

### Ошибки CORS

Добавьте ваш домен в CORS настройки сервера или используйте прокси.

## Разработка

### Локальная разработка

```powershell
# Запуск сервера
npm run start:dev

# Открыть демо
start http://localhost:3000/web/demo
```

### Тестирование виджета

```powershell
# Тест API
curl -X POST http://localhost:3000/web/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Привет", "sessionId": "test"}'
```

## Следующие шаги

1. **Handover система** - передача чата агенту
2. **Интеграция polis.online** - оформление полисов
3. **Голосовые сообщения** - полная поддержка
4. **WhatsApp интеграция** - мультиплатформа
5. **PDF генерация** - автоматические полисы

---

**Создано:** 1 октября 2025  
**Технологии:** NestJS, HTML5, CSS3, JavaScript, RAG, OpenAI
