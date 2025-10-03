# Check what was loaded into the database

Write-Host "=== Checking Database Contents ===" -ForegroundColor Green

# Get all documents
Write-Host "`n📄 Loading all documents..." -ForegroundColor Yellow
try {
    $docs = Invoke-RestMethod -Uri "http://localhost:3000/kb/documents" -Method GET
    
    Write-Host "`nTotal documents: $($docs.Length)" -ForegroundColor Cyan
    
    # Group by company
    $byCompany = $docs | Group-Object -Property companyCode
    
    Write-Host "`n📊 Documents by company:" -ForegroundColor Yellow
    foreach ($group in $byCompany) {
        Write-Host "  $($group.Name): $($group.Count) documents" -ForegroundColor White
    }
    
    # Show first 10 documents
    Write-Host "`n📝 First 10 documents:" -ForegroundColor Yellow
    foreach ($doc in $docs | Select-Object -First 10) {
        Write-Host "`n  Title: $($doc.title)" -ForegroundColor Cyan
        Write-Host "  Company: $($doc.companyCode) | Product: $($doc.productCode)" -ForegroundColor Gray
        Write-Host "  Source: $($doc.sourceUrl)" -ForegroundColor Gray
        Write-Host "  Created: $($doc.createdAt)" -ForegroundColor Gray
        
        # Get first chunk to see content
        try {
            $chunks = Invoke-RestMethod -Uri "http://localhost:3000/kb/documents/$($doc.id)/chunks" -Method GET
            if ($chunks.Length -gt 0) {
                $preview = $chunks[0].text.Substring(0, [Math]::Min(200, $chunks[0].text.Length))
                Write-Host "  Preview: $preview..." -ForegroundColor White
            }
        } catch {
            Write-Host "  Preview: (no chunks)" -ForegroundColor Red
        }
    }
    
    # Show stats
    Write-Host "`n📈 Statistics:" -ForegroundColor Yellow
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "  Total Documents: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "  Total Chunks: $($stats.totalChunks)" -ForegroundColor White
    Write-Host "  Companies: $($stats.totalCompanies)" -ForegroundColor White
    Write-Host "  Products: $($stats.totalProducts)" -ForegroundColor White
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Check Complete ===" -ForegroundColor Green

