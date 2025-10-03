# Тест системы агентов
Write-Host "🧪 Тестирование системы агентов..." -ForegroundColor Green

$baseUrl = "http://localhost:3000"

# Тест 1: Создание сессии чата
Write-Host "`n1. Создание сессии чата..." -ForegroundColor Yellow
try {
    $sessionResponse = Invoke-RestMethod -Uri "$baseUrl/chat/sessions" -Method Post -ContentType "application/json" -Body (@{
        channel = "web"
        channelUserId = "test_user_$(Get-Date -Format 'yyyyMMddHHmmss')"
        preferVoice = $false
    } | ConvertTo-Json)
    
    $sessionId = $sessionResponse.id
    Write-Host "✅ Сессия создана: $sessionId" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка создания сессии: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Тест 2: Проверка доступных агентов
Write-Host "`n2. Проверка доступных агентов..." -ForegroundColor Yellow
try {
    $agentsResponse = Invoke-RestMethod -Uri "$baseUrl/agents/available" -Method Get
    
    Write-Host "✅ Найдено агентов: $($agentsResponse.Count)" -ForegroundColor Green
    foreach ($agent in $agentsResponse) {
        Write-Host "👤 $($agent.name) ($($agent.login)) - $($agent.status)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Ошибка получения агентов: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 3: Статистика агентов
Write-Host "`n3. Статистика агентов..." -ForegroundColor Yellow
try {
    $statsResponse = Invoke-RestMethod -Uri "$baseUrl/agents/stats" -Method Get
    
    Write-Host "✅ Статистика агентов:" -ForegroundColor Green
    Write-Host "   Всего: $($statsResponse.total)" -ForegroundColor White
    Write-Host "   Онлайн: $($statsResponse.online)" -ForegroundColor Green
    Write-Host "   Заняты: $($statsResponse.busy)" -ForegroundColor Yellow
    Write-Host "   Офлайн: $($statsResponse.offline)" -ForegroundColor Red
    Write-Host "   Ожидающих запросов: $($statsResponse.pendingRequests)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Ошибка получения статистики: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 4: Запрос агента
Write-Host "`n4. Запрос подключения агента..." -ForegroundColor Yellow
try {
    $requestResponse = Invoke-RestMethod -Uri "$baseUrl/agents/request" -Method Post -ContentType "application/json" -Body (@{
        sessionId = $sessionId
        channel = "web"
        channelUserId = "test_user"
        reason = "Тестовый запрос агента"
    } | ConvertTo-Json)
    
    if ($requestResponse.success) {
        Write-Host "✅ Запрос агента отправлен: $($requestResponse.message)" -ForegroundColor Green
        $requestId = $requestResponse.requestId
        Write-Host "   ID запроса: $requestId" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Ошибка запроса агента: $($requestResponse.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Ошибка запроса агента: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 5: Получение информации о запросе
if ($requestId) {
    Write-Host "`n5. Информация о запросе..." -ForegroundColor Yellow
    try {
        $requestInfo = Invoke-RestMethod -Uri "$baseUrl/agents/request/$requestId" -Method Get
        
        Write-Host "✅ Информация о запросе:" -ForegroundColor Green
        Write-Host "   ID: $($requestInfo.id)" -ForegroundColor White
        Write-Host "   Сессия: $($requestInfo.sessionId)" -ForegroundColor White
        Write-Host "   Статус: $($requestInfo.status)" -ForegroundColor White
        Write-Host "   Канал: $($requestInfo.channel)" -ForegroundColor White
        Write-Host "   Причина: $($requestInfo.reason)" -ForegroundColor White
    } catch {
        Write-Host "❌ Ошибка получения информации о запросе: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Тест 6: Симуляция принятия запроса агентом (если есть агенты)
Write-Host "`n6. Симуляция принятия запроса агентом..." -ForegroundColor Yellow
try {
    $agents = Invoke-RestMethod -Uri "$baseUrl/agents/available" -Method Get
    
    if ($agents.Count -gt 0 -and $requestId) {
        $agentId = $agents[0].id
        Write-Host "Используем агента: $($agents[0].name) ($agentId)" -ForegroundColor Cyan
        
        $acceptResponse = Invoke-RestMethod -Uri "$baseUrl/agents/accept" -Method Post -ContentType "application/json" -Body (@{
            agentId = $agentId
            requestId = $requestId
        } | ConvertTo-Json)
        
        if ($acceptResponse.success) {
            Write-Host "✅ Агент принял запрос: $($acceptResponse.message)" -ForegroundColor Green
        } else {
            Write-Host "❌ Ошибка принятия запроса: $($acceptResponse.message)" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ Нет доступных агентов для тестирования" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Ошибка симуляции принятия запроса: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 7: Проверка истории сообщений после подключения агента
Write-Host "`n7. Проверка истории сообщений..." -ForegroundColor Yellow
try {
    $historyResponse = Invoke-RestMethod -Uri "$baseUrl/chat/messages/$sessionId" -Method Get
    
    Write-Host "✅ История сообщений (последние 5):" -ForegroundColor Green
    $lastMessages = $historyResponse.items | Select-Object -Last 5
    foreach ($msg in $lastMessages) {
        $sender = switch ($msg.sender) {
            "user" { "👤 Пользователь" }
            "ai" { "🤖 AI" }
            "system" { "⚙️ Система" }
            default { "❓ Неизвестно" }
        }
        Write-Host "$sender : $($msg.text)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Ошибка получения истории: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 8: Завершение сессии агентом
Write-Host "`n8. Завершение сессии агентом..." -ForegroundColor Yellow
try {
    $agents = Invoke-RestMethod -Uri "$baseUrl/agents/available" -Method Get
    
    if ($agents.Count -gt 0) {
        $agentId = $agents[0].id
        
        $endSessionResponse = Invoke-RestMethod -Uri "$baseUrl/agents/end-session" -Method Post -ContentType "application/json" -Body (@{
            sessionId = $sessionId
            agentId = $agentId
        } | ConvertTo-Json)
        
        if ($endSessionResponse.success) {
            Write-Host "✅ Сессия агента завершена: $($endSessionResponse.message)" -ForegroundColor Green
        } else {
            Write-Host "❌ Ошибка завершения сессии: $($endSessionResponse.message)" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ Нет агентов для завершения сессии" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Ошибка завершения сессии: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 Тестирование системы агентов завершено!" -ForegroundColor Green
Write-Host "`n📱 Откройте в браузере для тестирования UI:" -ForegroundColor Yellow
Write-Host "   Веб-чат: $baseUrl/web" -ForegroundColor White
Write-Host "   Демо с виджетом: $baseUrl/web/demo" -ForegroundColor White
