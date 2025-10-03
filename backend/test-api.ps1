# Тестирование API системы сбора данных

Write-Host "=== Тестирование API системы сбора данных ===" -ForegroundColor Green

# 1. Проверка статистики базы знаний
Write-Host "`n1. Проверка статистики базы знаний:" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "Статистика:" -ForegroundColor Cyan
    Write-Host "  Документов: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "  Чанков: $($stats.totalChunks)" -ForegroundColor White
    Write-Host "  Компаний: $($stats.totalCompanies)" -ForegroundColor White
    Write-Host "  Продуктов: $($stats.totalProducts)" -ForegroundColor White
} catch {
    Write-Host "Ошибка получения статистики: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. Добавление тестового документа
Write-Host "`n2. Добавление тестового документа:" -ForegroundColor Yellow
try {
    $testDoc = @{
        companyCode = "TEST"
        productCode = "OSAGO"
        title = "Тестовый документ ОСАГО"
        content = "Это тестовый документ о страховании ОСАГО. Стоимость полиса составляет от 2000 до 15000 рублей в зависимости от региона и мощности двигателя. Покрытие включает возмещение ущерба третьим лицам при ДТП."
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "http://localhost:3000/kb/documents" -Method POST -Body $testDoc -ContentType "application/json"
    Write-Host "Документ добавлен успешно!" -ForegroundColor Green
    Write-Host "ID документа: $($result.docId)" -ForegroundColor Cyan
    Write-Host "Количество чанков: $($result.chunksCount)" -ForegroundColor Cyan
} catch {
    Write-Host "Ошибка добавления документа: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Проверка обновленной статистики
Write-Host "`n3. Проверка обновленной статистики:" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "Обновленная статистика:" -ForegroundColor Cyan
    Write-Host "  Документов: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "  Чанков: $($stats.totalChunks)" -ForegroundColor White
    Write-Host "  Компаний: $($stats.totalCompanies)" -ForegroundColor White
    Write-Host "  Продуктов: $($stats.totalProducts)" -ForegroundColor White
} catch {
    Write-Host "Ошибка получения статистики: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Получение списка документов
Write-Host "`n4. Получение списка документов:" -ForegroundColor Yellow
try {
    $docs = Invoke-RestMethod -Uri "http://localhost:3000/kb/documents" -Method GET
    Write-Host "Найдено документов: $($docs.Length)" -ForegroundColor Cyan
    foreach ($doc in $docs) {
        Write-Host "  - $($doc.title) ($($doc.companyCode)/$($doc.productCode))" -ForegroundColor White
    }
} catch {
    Write-Host "Ошибка получения документов: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Тестирование поиска
Write-Host "`n5. Тестирование семантического поиска:" -ForegroundColor Yellow
try {
    $searchQuery = @{
        query = "стоимость ОСАГО"
        limit = 5
    } | ConvertTo-Json

    $searchResults = Invoke-RestMethod -Uri "http://localhost:3000/kb/search" -Method POST -Body $searchQuery -ContentType "application/json"
    Write-Host "Результаты поиска:" -ForegroundColor Cyan
    foreach ($result in $searchResults) {
        Write-Host "  - $($result.docTitle) (релевантность: $([math]::Round($result.score * 100, 1))%)" -ForegroundColor White
        Write-Host "    Текст: $($result.text.Substring(0, [Math]::Min(100, $result.text.Length)))..." -ForegroundColor Gray
    }
} catch {
    Write-Host "Ошибка поиска: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Проверка списка компаний для сбора данных
Write-Host "`n6. Проверка списка страховых компаний:" -ForegroundColor Yellow
try {
    $companies = Invoke-RestMethod -Uri "http://localhost:3000/data-collector/companies" -Method GET
    Write-Host "Настроено компаний: $($companies.Length)" -ForegroundColor Cyan
    foreach ($company in $companies) {
        Write-Host "  - $($company.name) ($($company.code))" -ForegroundColor White
        Write-Host "    Сайт: $($company.website)" -ForegroundColor Gray
        Write-Host "    Веб-скрапинг: $(if($company.scrapingConfig.enabled) {'Включен'} else {'Отключен'})" -ForegroundColor Gray
    }
} catch {
    Write-Host "Ошибка получения компаний: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Тестирование завершено ===" -ForegroundColor Green

