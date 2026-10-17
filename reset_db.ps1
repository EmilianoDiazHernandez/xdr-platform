# ==========================================================
# reset_db.ps1 - Limpieza de Estado y Datos Operativos XDR
# ==========================================================
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Reseteando Base de Datos y Cache XDR (Clean Slate)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Truncar tablas operativas en TimescaleDB (conservando catalogos)
docker exec xdr-db-timescale psql -U xdr_user -d xdr_db -c "TRUNCATE TABLE alertas_xdr, campanas_xdr, eventos_correlacionados, eventos_endpoint, flujos_trafico, registro_idempotencia, dispositivo_ips, dispositivos CASCADE;"

# 2. Purgar cache de correlacion en Redis
docker exec xdr-redis redis-cli flushall

# 3. Limpiar archivo de estado y logs locales de emulacion si existen
$streamState = ".\emulation\topologias\red-corporativa-base\zeek_logs\.stream_state.json"
if (Test-Path $streamState) {
    Remove-Item -Path $streamState -Force
}

Write-Host "`n  [OK] Tablas operativas truncadas." -ForegroundColor Green
Write-Host "  [OK] Cache de Redis purgado." -ForegroundColor Green
Write-Host "  [OK] Estado actual: 0 alertas, 0 flujos, 0 nodos residuales." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
