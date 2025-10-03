# Test search functionality

Write-Host "Testing search..." -ForegroundColor Green

try {
    $searchQuery = @{
        query = "OSAGO cost"
        limit = 5
    } | ConvertTo-Json

    $searchResults = Invoke-RestMethod -Uri "http://localhost:3000/kb/search" -Method POST -Body $searchQuery -ContentType "application/json"
    
    Write-Host "Search results:" -ForegroundColor Cyan
    Write-Host "Found: $($searchResults.Length) results" -ForegroundColor White
    
    foreach ($result in $searchResults) {
        Write-Host "  - $($result.docTitle)" -ForegroundColor Yellow
        Write-Host "    Score: $([math]::Round($result.score * 100, 1))%" -ForegroundColor Gray
        Write-Host "    Text: $($result.text.Substring(0, [Math]::Min(80, $result.text.Length)))..." -ForegroundColor White
        Write-Host ""
    }
} catch {
    Write-Host "Search error: $($_.Exception.Message)" -ForegroundColor Red
}

