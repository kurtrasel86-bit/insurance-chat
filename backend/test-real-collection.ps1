# Test real data collection without Puppeteer

Write-Host "Testing Real Data Collection..." -ForegroundColor Green

# Test 1: Check current stats
Write-Host "`n1. Current database stats:" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "Documents: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "Chunks: $($stats.totalChunks)" -ForegroundColor White
    Write-Host "Companies: $($stats.totalCompanies)" -ForegroundColor White
    Write-Host "Products: $($stats.totalProducts)" -ForegroundColor White
} catch {
    Write-Host "Error getting stats: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Start real data collection
Write-Host "`n2. Starting real data collection..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/data-collector/collect/all" -Method POST -ContentType "application/json"
    Write-Host "✅ Data collection started successfully!" -ForegroundColor Green
    Write-Host "Response: $($response.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Data collection failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Wait and check updated stats
Write-Host "`n3. Waiting for collection to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "Updated stats:" -ForegroundColor Cyan
    Write-Host "Documents: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "Chunks: $($stats.totalChunks)" -ForegroundColor White
    Write-Host "Companies: $($stats.totalCompanies)" -ForegroundColor White
    Write-Host "Products: $($stats.totalProducts)" -ForegroundColor White
} catch {
    Write-Host "Error getting updated stats: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Check collected documents
Write-Host "`n4. Checking collected documents..." -ForegroundColor Yellow
try {
    $docs = Invoke-RestMethod -Uri "http://localhost:3000/kb/documents" -Method GET
    Write-Host "Found $($docs.Length) documents:" -ForegroundColor Cyan
    
    foreach ($doc in $docs | Select-Object -First 5) {
        Write-Host "  - $($doc.title)" -ForegroundColor Yellow
        Write-Host "    Company: $($doc.companyCode) | Product: $($doc.productCode)" -ForegroundColor Gray
        Write-Host "    URL: $($doc.sourceUrl)" -ForegroundColor Gray
        Write-Host ""
    }
} catch {
    Write-Host "Error getting documents: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Test search functionality
Write-Host "`n5. Testing search functionality..." -ForegroundColor Yellow
try {
    $searchQuery = @{
        query = "ОСАГО страхование"
        limit = 3
    } | ConvertTo-Json

    $searchResults = Invoke-RestMethod -Uri "http://localhost:3000/kb/search" -Method POST -Body $searchQuery -ContentType "application/json"
    Write-Host "Search results for 'ОСАГО страхование':" -ForegroundColor Cyan
    
    foreach ($result in $searchResults) {
        Write-Host "  - $($result.docTitle)" -ForegroundColor Yellow
        Write-Host "    Score: $([math]::Round($result.score * 100, 1))%" -ForegroundColor Gray
        Write-Host "    Text: $($result.text.Substring(0, [Math]::Min(100, $result.text.Length)))..." -ForegroundColor White
        Write-Host ""
    }
} catch {
    Write-Host "Search error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test completed! ===" -ForegroundColor Green
Write-Host "You can now open http://localhost:3000/admin to view the collected data!" -ForegroundColor Cyan

