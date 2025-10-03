# Тест веб-чата
Write-Host "🧪 Тестирование веб-чата..." -ForegroundColor Green

$baseUrl = "http://localhost:3000"

# Тест 1: Создание сессии
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

# Тест 2: Отправка сообщения
Write-Host "`n2. Отправка сообщения..." -ForegroundColor Yellow
try {
    $messageResponse = Invoke-RestMethod -Uri "$baseUrl/web/chat" -Method Post -ContentType "application/json" -Body (@{
        sessionId = $sessionId
        message = "Сколько стоит туристическая страховка?"
    } | ConvertTo-Json)
    
    Write-Host "✅ Сообщение отправлено" -ForegroundColor Green
    Write-Host "🤖 Ответ AI: $($messageResponse.reply)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Ошибка отправки сообщения: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 3: Поиск по базе знаний
Write-Host "`n3. Поиск по базе знаний..." -ForegroundColor Yellow
try {
    $searchResponse = Invoke-RestMethod -Uri "$baseUrl/web/search" -Method Post -ContentType "application/json" -Body (@{
        query = "медицинская страховка"
        limit = 3
    } | ConvertTo-Json)
    
    Write-Host "✅ Найдено результатов: $($searchResponse.Count)" -ForegroundColor Green
    foreach ($result in $searchResponse) {
        Write-Host "📄 $($result.docTitle) (score: $([math]::Round($result.score, 2)))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Ошибка поиска: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 4: Список продуктов
Write-Host "`n4. Получение списка продуктов..." -ForegroundColor Yellow
try {
    $productsResponse = Invoke-RestMethod -Uri "$baseUrl/web/products" -Method Get
    
    Write-Host "✅ Продукты получены:" -ForegroundColor Green
    foreach ($company in $productsResponse.PSObject.Properties) {
        Write-Host "🏢 $($company.Name):" -ForegroundColor Cyan
        foreach ($product in $company.Value) {
            Write-Host "  - $($product.title) ($($product.productCode))" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Ошибка получения продуктов: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 5: AI генерация
Write-Host "`n5. Тест AI генерации..." -ForegroundColor Yellow
try {
    $aiResponse = Invoke-RestMethod -Uri "$baseUrl/ai/generate" -Method Post -ContentType "application/json" -Body (@{
        message = "Нужна страховка на машину"
        sessionId = $sessionId
        useRAG = $true
    } | ConvertTo-Json)
    
    Write-Host "✅ AI ответ получен:" -ForegroundColor Green
    Write-Host "🤖 $($aiResponse.reply)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Ошибка AI: $($_.Exception.Message)" -ForegroundColor Red
}

# Тест 6: История сообщений
Write-Host "`n6. Получение истории сообщений..." -ForegroundColor Yellow
try {
    $historyResponse = Invoke-RestMethod -Uri "$baseUrl/chat/messages/$sessionId" -Method Get
    
    Write-Host "✅ История получена, сообщений: $($historyResponse.items.Count)" -ForegroundColor Green
    foreach ($msg in $historyResponse.items) {
        $sender = if ($msg.sender -eq "user") { "👤 Пользователь" } else { "🤖 AI" }
        Write-Host "$sender : $($msg.text)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Ошибка получения истории: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 Тестирование завершено!" -ForegroundColor Green
Write-Host "`n📱 Откройте в браузере:" -ForegroundColor Yellow
Write-Host "   Полноэкранный чат: $baseUrl/web" -ForegroundColor White
Write-Host "   Демо с виджетом: $baseUrl/web/demo" -ForegroundColor White
Write-Host "   Виджет скрипт: $baseUrl/web/widget" -ForegroundColor White
