# Test the new "Start Data Collection" button functionality

Write-Host "Testing Data Collection Button..." -ForegroundColor Green

# Test 1: Check if admin page loads with button
Write-Host "`n1. Checking admin page for button..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/admin" -Method GET
    if ($response.Content -match "Начать сбор данных") {
        Write-Host "✅ Button found on admin page!" -ForegroundColor Green
    } else {
        Write-Host "❌ Button not found on admin page" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error loading admin page: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Check data collection page
Write-Host "`n2. Checking data collection page..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/admin/data-collection" -Method GET
    if ($response.Content -match "Начать сбор данных") {
        Write-Host "✅ Button found on data collection page!" -ForegroundColor Green
    } else {
        Write-Host "❌ Button not found on data collection page" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error loading data collection page: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Test the actual data collection endpoint
Write-Host "`n3. Testing data collection endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/data-collector/collect/all" -Method POST -ContentType "application/json"
    Write-Host "✅ Data collection endpoint is working!" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Data collection endpoint error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test completed! ===" -ForegroundColor Green
Write-Host "You can now open http://localhost:3000/admin in your browser" -ForegroundColor Cyan
Write-Host "and click the '🚀 Начать сбор данных' button!" -ForegroundColor Cyan

