# Test the new collection monitoring system

Write-Host "Testing Collection Monitoring System..." -ForegroundColor Green

# Test 1: Check collection status endpoint
Write-Host "`n1. Testing status endpoint..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "http://localhost:3000/data-collector/status" -Method GET
    Write-Host "✅ Status endpoint working!" -ForegroundColor Green
    Write-Host "Current status:" -ForegroundColor Cyan
    Write-Host "  Running: $($status.data.isRunning)" -ForegroundColor White
    Write-Host "  Progress: $($status.data.progress.completed)/$($status.data.progress.total)" -ForegroundColor White
    Write-Host "  Current company: $($status.data.currentCompany)" -ForegroundColor White
} catch {
    Write-Host "❌ Status endpoint error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Check performance endpoint
Write-Host "`n2. Testing performance endpoint..." -ForegroundColor Yellow
try {
    $performance = Invoke-RestMethod -Uri "http://localhost:3000/data-collector/performance" -Method GET
    Write-Host "✅ Performance endpoint working!" -ForegroundColor Green
    Write-Host "Performance stats:" -ForegroundColor Cyan
    Write-Host "  Execution time: $($performance.data.executionTime)s" -ForegroundColor White
    Write-Host "  Documents per second: $($performance.data.documentsPerSecond)" -ForegroundColor White
    Write-Host "  Avg time per company: $($performance.data.averageTimePerCompany)s" -ForegroundColor White
} catch {
    Write-Host "❌ Performance endpoint error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Start collection and monitor status
Write-Host "`n3. Starting collection with monitoring..." -ForegroundColor Yellow
try {
    # Start collection in background
    $collectionJob = Start-Job -ScriptBlock {
        try {
            Invoke-RestMethod -Uri "http://localhost:3000/data-collector/collect/all" -Method POST -ContentType "application/json"
            return "SUCCESS"
        } catch {
            return "ERROR: $($_.Exception.Message)"
        }
    }
    
    Write-Host "Collection started in background. Monitoring status..." -ForegroundColor Cyan
    
    # Monitor status for 30 seconds
    for ($i = 1; $i -le 30; $i++) {
        Start-Sleep -Seconds 1
        
        try {
            $status = Invoke-RestMethod -Uri "http://localhost:3000/data-collector/status" -Method GET
            $data = $status.data
            
            Write-Host "[$i] Status: $(if($data.isRunning) {'Running'} else {'Stopped'}) | Company: $($data.currentCompany) | Progress: $($data.progress.completed)/$($data.progress.total) ($($data.progress.percentage)%)" -ForegroundColor Gray
            
            if (!$data.isRunning -and $i -gt 5) {
                Write-Host "Collection completed!" -ForegroundColor Green
                break
            }
        } catch {
            Write-Host "[$i] Status check failed" -ForegroundColor Red
        }
    }
    
    # Get final result
    $result = Receive-Job -Job $collectionJob
    Remove-Job -Job $collectionJob
    
    Write-Host "Collection result: $result" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Collection monitoring error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Check final stats
Write-Host "`n4. Checking final statistics..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:3000/kb/stats" -Method GET
    Write-Host "Final database stats:" -ForegroundColor Cyan
    Write-Host "  Documents: $($stats.totalDocuments)" -ForegroundColor White
    Write-Host "  Chunks: $($stats.totalChunks)" -ForegroundColor White
    Write-Host "  Companies: $($stats.totalCompanies)" -ForegroundColor White
    Write-Host "  Products: $($stats.totalProducts)" -ForegroundColor White
} catch {
    Write-Host "❌ Stats error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Monitoring Test Completed! ===" -ForegroundColor Green
Write-Host "You can now open http://localhost:3000/admin and click 'Начать сбор данных'" -ForegroundColor Cyan
Write-Host "to see the real-time monitoring in action!" -ForegroundColor Cyan

