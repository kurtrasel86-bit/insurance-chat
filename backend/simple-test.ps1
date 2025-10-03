# Simple API Test

Write-Host "Testing API..." -ForegroundColor Green

# Test 1: Get stats
Write-Host "`n1. Getting stats:" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "Documents: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "Chunks: $($stats.totalChunks)" -ForegroundColor White
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Add test document
Write-Host "`n2. Adding test document:" -ForegroundColor Yellow
try {
    $testDoc = @{
        companyCode = "TEST"
        productCode = "OSAGO"
        title = "Test OSAGO Document"
        content = "This is a test document about OSAGO insurance. Cost ranges from 2000 to 15000 rubles."
    } | ConvertTo-Json

    $result = Invoke-RestMethod -Uri "http://localhost:3000/kb/documents" -Method POST -Body $testDoc -ContentType "application/json"
    Write-Host "Document added! ID: $($result.docId)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get updated stats
Write-Host "`n3. Updated stats:" -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "Documents: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "Chunks: $($stats.totalChunks)" -ForegroundColor White
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTest completed!" -ForegroundColor Green

