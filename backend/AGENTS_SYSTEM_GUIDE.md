# 👨‍💼 Система агентов (Handover) - Руководство

## Что это?

Система передачи чата от AI к живому агенту позволяет клиентам получить помощь от реального специалиста, когда AI не может решить их вопрос или когда требуется персональное обслуживание.

## Возможности

### ✅ Реализовано:
- **Запрос агента** - клиент может попросить подключить агента
- **Уведомления агентов** - все доступные агенты получают уведомление
- **Принятие запроса** - первый откликнувшийся агент подключается
- **Уведомление остальных** - остальные агенты получают уведомление о занятости заявки
- **Переключение режима** - чат переключается с AI на агента
- **Завершение сессии** - агент может передать чат обратно AI
- **Таймаут запроса** - автоматическое завершение через 5 минут
- **Статистика агентов** - мониторинг доступности и нагрузки

### 🔄 В разработке:
- Уведомления через Telegram/WhatsApp
- Email уведомления агентам
- Настройка лимитов сессий для агентов
- Приоритизация запросов

## Архитектура

```
Клиент → Веб-чат → AgentsService → Уведомления агентам
                ↓
            ChatService (обновление сессии)
                ↓
            Prisma (сохранение в БД)
```

## API Endpoints

### Агенты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/agents/available` | Список доступных агентов |
| GET | `/agents/stats` | Статистика агентов |
| POST | `/agents/request` | Запрос подключения агента |
| POST | `/agents/accept` | Агент принимает запрос |
| POST | `/agents/reject` | Агент отклоняет запрос |
| GET | `/agents/requests/:agentId` | Запросы конкретного агента |
| GET | `/agents/request/:requestId` | Информация о запросе |
| POST | `/agents/end-session` | Завершить сессию агента |

### Веб-чат (интеграция)

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/web/request-agent` | Запрос агента через веб-чат |
| GET | `/web/agents/available` | Доступные агенты для веб-чата |
| GET | `/web/agents/stats` | Статистика для веб-чата |

## Примеры использования

### JavaScript API

#### Запрос агента:
```javascript
const response = await fetch('/web/request-agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session-id',
    reason: 'Сложный вопрос по полису'
  })
});

const result = await response.json();
console.log(result.message); // "Запрос отправлен 3 агентам..."
```

#### Получение статистики:
```javascript
const stats = await fetch('/web/agents/stats');
const data = await stats.json();
console.log(`Онлайн агентов: ${data.online}`);
```

### PowerShell

#### Тестирование системы:
```powershell
.\test-agents.ps1
```

#### Запрос агента:
```powershell
$body = @{
  sessionId = "session-id"
  channel = "web"
  channelUserId = "user123"
  reason = "Тестовый запрос"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/agents/request" -Method Post -Body $body -ContentType "application/json"
```

## Жизненный цикл запроса агента

### 1. **Запрос от клиента**
```javascript
// Клиент нажимает "Связать с агентом"
requestAgent()
```

### 2. **Создание уведомления**
```typescript
const notification: AgentNotification = {
  id: requestId,
  sessionId,
  channel,
  channelUserId,
  reason,
  createdAt: new Date(),
  status: 'pending',
};
```

### 3. **Уведомление агентов**
- Система находит всех доступных агентов (`status: 'online'`)
- Отправляет уведомления (пока в логах, TODO: Telegram/WhatsApp)
- Устанавливает таймаут 5 минут

### 4. **Принятие запроса**
```typescript
// Агент принимает запрос
await agentsService.acceptRequest(agentId, requestId);
```

### 5. **Переключение режима**
```typescript
// Сессия переключается в режим агента
await prisma.chatSession.update({
  where: { id: sessionId },
  data: {
    agentId: agentId,
    state: 'agent', // Переключаем с 'qa' на 'agent'
  },
});
```

### 6. **Уведомление клиента**
```typescript
await chatService.postMessage({
  sessionId,
  sender: 'system',
  text: `✅ К чату подключился агент ${agent.name}. Теперь вы общаетесь с живым специалистом.`,
});
```

### 7. **Завершение сессии**
```typescript
// Агент завершает работу
await agentsService.endAgentSession(sessionId, agentId);
```

## Состояния запроса

| Состояние | Описание |
|-----------|----------|
| `pending` | Ожидает ответа от агентов |
| `accepted` | Принят агентом |
| `rejected` | Отклонен агентом |
| `expired` | Истекло время ожидания (5 мин) |

## Состояния агента

| Состояние | Описание |
|-----------|----------|
| `online` | Доступен для новых запросов |
| `offline` | Недоступен |
| `busy` | Занят (в разработке) |

## Состояния сессии чата

| Состояние | Описание |
|-----------|----------|
| `qa` | Общение с AI |
| `agent` | Общение с агентом |
| `waiting` | Ожидание агента |

## Конфигурация

### Таймауты
```typescript
// Время ожидания агента (5 минут)
setTimeout(() => {
  this.handleRequestTimeout(requestId);
}, 5 * 60 * 1000);
```

### Лимиты агентов
```typescript
// Максимальное количество сессий на агента
maxSessions: 5
```

## Мониторинг

### Статистика агентов
```typescript
{
  total: 10,           // Всего агентов
  online: 7,           // Онлайн
  busy: 2,             // Заняты
  offline: 1,          // Офлайн
  pendingRequests: 3   // Ожидающих запросов
}
```

### Логи
```typescript
this.logger.log(`Agent request created: ${requestId} for session ${sessionId}`);
this.logger.log(`Agent ${agent.name} (${agentId}) accepted request ${requestId}`);
```

## Интеграция с веб-чатом

### HTML кнопка
```html
<button class="quick-action" onclick="requestAgent()">
    👨‍💼 Связать с агентом
</button>
```

### JavaScript функция
```javascript
async function requestAgent() {
  const response = await fetch('/web/request-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId,
      reason: 'Клиент запросил подключение агента'
    })
  });
  
  const result = await response.json();
  addMessage(`✅ ${result.message}`, 'system');
}
```

## Тестирование

### Автоматическое тестирование
```powershell
.\test-agents.ps1
```

### Ручное тестирование
1. Откройте http://localhost:3000/web
2. Нажмите "Связать с агентом"
3. Проверьте логи сервера
4. Симулируйте принятие запроса агентом

### Тестовые данные
После `npm run prisma:seed` создается тестовый агент:
- **Логин:** admin
- **Пароль:** admin123
- **Статус:** online
- **Компании:** PICC,CPIC,PING_AN

## Troubleshooting

### Агент не получает уведомления
- Проверьте статус агента (`online`)
- Проверьте логи сервера
- Убедитесь, что агент существует в БД

### Запрос не создается
- Проверьте, что сессия существует
- Убедитесь, что нет активного запроса для сессии
- Проверьте логи на ошибки

### Таймаут не срабатывает
- Проверьте, что запрос в состоянии `pending`
- Убедитесь, что прошло 5 минут
- Проверьте логи на ошибки

## Следующие шаги

### 1. **Уведомления агентов**
- Telegram Bot API для уведомлений
- WhatsApp Business API
- Email уведомления

### 2. **Расширенная аналитика**
- Время ответа агентов
- Количество принятых/отклоненных запросов
- Рейтинг агентов

### 3. **Приоритизация**
- Срочные запросы
- VIP клиенты
- Специализация агентов

### 4. **Автоматизация**
- Автоматическое назначение агентов
- Балансировка нагрузки
- Эскалация сложных вопросов

---

**Создано:** 1 октября 2025  
**Технологии:** NestJS, Prisma, TypeScript, WebSocket (планируется)
