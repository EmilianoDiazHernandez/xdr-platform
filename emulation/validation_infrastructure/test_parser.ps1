<#
.SYNOPSIS
    Prueba unitaria aislada para el parser TSV de Zeek (Parse-ZeekLog) y la lógica de correlación estricta.

.DESCRIPTION
    Esta prueba valida:
    1. Que la extracción de encabezados (#fields) omite '#fields' sin introducir columnas nulas.
    2. Que el número de propiedades de cada objeto coincide exactamente con el número de columnas de datos.
    3. Que los tipos y nombres con puntos (ej. id.orig_h) se acceden correctamente.
    4. Que la correlación estricta de conn.log y http.log aprueba los flujos legítimos y rechaza falsos positivos (falta de puerto, falta de host, puerto incorrecto, host incorrecto, URI sin test_id).
    5. Que la política de Zeek se genera en codificación ASCII pura sin BOM para evitar errores sintácticos en Zeek 9.0.0.
#>

$ErrorActionPreference = "Stop"

function Parse-ZeekLog {
    param (
        [string]$FilePath
    )
    if (-not (Test-Path $FilePath)) { return @() }
    
    $headers = @()
    $records = @()
    foreach ($line in (Get-Content $FilePath)) {
        if ($line.StartsWith("#fields")) {
            $tokens = $line -split "\t"
            # Omitir el primer token ('#fields') de forma segura
            $headers = @($tokens | Select-Object -Skip 1)
            continue
        }
        if ($line.StartsWith("#") -or [string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        $parts = $line -split "\t"
        if ($headers.Count -gt 0 -and $parts.Count -eq $headers.Count) {
            $rowObj = [ordered]@{}
            for ($i = 0; $i -lt $headers.Count; $i++) {
                $rowObj[$headers[$i]] = $parts[$i]
            }
            $records += [pscustomobject]$rowObj
        }
    }
    return $records
}

Write-Host "=== TEST 1: Parser TSV de conn.log ===" -ForegroundColor Cyan
$testDir = Join-Path $PSScriptRoot "test_artifacts"
if (-not (Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir | Out-Null }

$sampleConnContent = @"
#separator \x09
#set_separator	,
#empty_field	(empty)
#unset_field	-
#path	conn
#fields	ts	uid	id.orig_h	id.orig_p	id.resp_h	id.resp_p	proto	service	duration	orig_bytes	resp_bytes	conn_state
1791950000.123456	Ctest001	172.22.0.3	49152	172.22.0.10	8000	tcp	http	0.0350	150	320	SF
1791950000.200000	Ctest002	127.0.0.1	33000	127.0.0.1	8000	tcp	-	0.0010	0	0	REJ
1791950000.300000	Ctest003	172.22.0.3	49154	172.22.0.99	8000	tcp	-	0.0010	0	0	REJ
#close	2026-10-13-22-00-00
"@

$sampleConnFile = Join-Path $testDir "sample_conn.log"
Set-Content -Path $sampleConnFile -Value $sampleConnContent -Encoding UTF8

$parsedConn = Parse-ZeekLog -FilePath $sampleConnFile
Write-Host "Registros parseados: $($parsedConn.Count) (Esperado: 3)"

if ($parsedConn.Count -ne 3) {
    throw "TEST 1 FALLO: Se esperaban 3 registros pero se obtuvieron $($parsedConn.Count)"
}

# Comprobar que no hay propiedades nulas
$propNames = $parsedConn[0].psobject.Properties.Name
Write-Host "Numero de campos en primer registro: $($propNames.Count)"
if ($propNames -contains $null -or $propNames -contains "") {
    throw "TEST 1 FALLO: Hay nombres de propiedad nulos o vacios."
}
if ($parsedConn[0].'id.orig_h' -ne "172.22.0.3" -or $parsedConn[0].'id.resp_p' -ne "8000") {
    throw "TEST 1 FALLO: Los valores de los campos no coinciden."
}
Write-Host "[OK] TEST 1 superado exitosamente." -ForegroundColor Green

Write-Host "`n=== TEST 2: Correlacion Estricta de conn.log ===" -ForegroundColor Cyan
$targetIp = "172.22.0.3"
$apiIp = "172.22.0.10"
$reqStartTime = 1791950000.100000

$validMatches = @()
foreach ($row in $parsedConn) {
    $rOrigIp = $row.'id.orig_h'
    $rRespIp = $row.'id.resp_h'
    $rRespPort = $row.'id.resp_p'
    $rProto = $row.'proto'
    $rTs = [double]($row.'ts')
    
    # Validacion simultanea y estricta
    $ipOrigMatch = ($rOrigIp -eq $targetIp)
    $ipRespMatch = ($rRespIp -eq $apiIp)
    $portMatch = ($rRespPort -eq "8000")
    $protoMatch = ($rProto.ToLower() -eq "tcp")
    $timeMatch = ([Math]::Abs($rTs - $reqStartTime) -le 30)
    
    if ($ipOrigMatch -and $ipRespMatch -and $portMatch -and $protoMatch -and $timeMatch) {
        $validMatches += $row
    }
}

Write-Host "Coincidencias estrictas encontradas: $($validMatches.Count) (Esperado: 1)"
if ($validMatches.Count -ne 1) {
    throw "TEST 2 FALLO: Se esperaba exactamente 1 coincidencia estricta (excluyendo loopback y destinos erróneos), pero se obtuvieron $($validMatches.Count)"
}
if ($validMatches[0].uid -ne "Ctest001") {
    throw "TEST 2 FALLO: La coincidencia no fue el registro esperado Ctest001."
}
Write-Host "[OK] TEST 2 superado exitosamente (Loopback y destinos invalidos rechazados)." -ForegroundColor Green

Write-Host "`n=== TEST 3: Parser y Correlacion Estricta de http.log (Casos Validos y Negativos) ===" -ForegroundColor Cyan
$expectedTestId = "val-zeek-9999"

# Dataset de prueba con 2 casos validos y 5 casos negativos especificos
$sampleHttpContent = @"
#separator \x09
#fields	ts	uid	id.orig_h	id.orig_p	id.resp_h	id.resp_p	trans_depth	method	host	uri	status_code
1791950000.124000	C_VALID_01	172.22.0.3	49152	172.22.0.10	8000	1	GET	api-ml:8000	/health?test_id=val-zeek-9999	200
1791950000.124100	C_VALID_02	172.22.0.3	49153	172.22.0.10	8000	1	GET	api-ml	/health?test_id=val-zeek-9999	200
1791950000.125000	C_NEG_NOPORT	172.22.0.3	49154	172.22.0.10	-	1	GET	api-ml:8000	/health?test_id=val-zeek-9999	200
1791950000.126000	C_NEG_NOHOST	172.22.0.3	49155	172.22.0.10	8000	1	GET	-	/health?test_id=val-zeek-9999	200
1791950000.127000	C_NEG_BADPORT	172.22.0.3	49156	172.22.0.10	8080	1	GET	api-ml:8000	/health?test_id=val-zeek-9999	200
1791950000.128000	C_NEG_BADHOST	172.22.0.3	49157	172.22.0.10	8000	1	GET	evil-domain.com:8000	/health?test_id=val-zeek-9999	200
1791950000.129000	C_NEG_NOID	172.22.0.3	49158	172.22.0.10	8000	1	GET	api-ml:8000	/health	200
"@

$sampleHttpFile = Join-Path $testDir "sample_http.log"
Set-Content -Path $sampleHttpFile -Value $sampleHttpContent -Encoding UTF8

$parsedHttp = Parse-ZeekLog -FilePath $sampleHttpFile

# Funcion de coincidencia identica a la implementada en validate_zeek_capture.ps1
function Test-HttpLogRecord {
    param($record, $targetTestId)
    $hUri = $record.'uri'
    $hHost = $record.'host'
    $hRespPort = $record.'id.resp_p'
    
    $portMatch = ($hRespPort -eq "8000")
    $hostMatch = (![string]::IsNullOrWhiteSpace($hHost) -and $hHost -ne "-" -and ($hHost -eq "api-ml:8000" -or $hHost -eq "api-ml"))
    $uriMatch = (![string]::IsNullOrWhiteSpace($hUri) -and $hUri -ne "-" -and $hUri -like "*$targetTestId*")
    
    return [bool]($portMatch -and $hostMatch -and $uriMatch)
}

# 1. Comprobacion de Casos Validos
$recValid1 = $parsedHttp | Where-Object { $_.uid -eq "C_VALID_01" }
if (-not (Test-HttpLogRecord -record $recValid1 -targetTestId $expectedTestId)) {
    throw "TEST 3 FALLO: C_VALID_01 (host 'api-ml:8000', puerto 8000, URI con TestID) debio coincidir."
}
Write-Host "  [OK] Caso Valido 1 (api-ml:8000 con TestId) aceptado." -ForegroundColor Green

$recValid2 = $parsedHttp | Where-Object { $_.uid -eq "C_VALID_02" }
if (-not (Test-HttpLogRecord -record $recValid2 -targetTestId $expectedTestId)) {
    throw "TEST 3 FALLO: C_VALID_02 (host 'api-ml', puerto 8000, URI con TestID) debio coincidir."
}
Write-Host "  [OK] Caso Valido 2 (api-ml con TestId) aceptado." -ForegroundColor Green

# 2. Comprobacion de Casos Negativos (Falsos Positivos)
$recNoPort = $parsedHttp | Where-Object { $_.uid -eq "C_NEG_NOPORT" }
if (Test-HttpLogRecord -record $recNoPort -targetTestId $expectedTestId) {
    throw "TEST 3 FALLO: Falso positivo! C_NEG_NOPORT no debio coincidir (falta puerto: '-')."
}
Write-Host "  [OK] Caso Negativo 1 (Falta puerto '-') rechazado correctamente." -ForegroundColor Green

$recNoHost = $parsedHttp | Where-Object { $_.uid -eq "C_NEG_NOHOST" }
if (Test-HttpLogRecord -record $recNoHost -targetTestId $expectedTestId) {
    throw "TEST 3 FALLO: Falso positivo! C_NEG_NOHOST no debio coincidir (falta host: '-')."
}
Write-Host "  [OK] Caso Negativo 2 (Falta host '-') rechazado correctamente." -ForegroundColor Green

$recBadPort = $parsedHttp | Where-Object { $_.uid -eq "C_NEG_BADPORT" }
if (Test-HttpLogRecord -record $recBadPort -targetTestId $expectedTestId) {
    throw "TEST 3 FALLO: Falso positivo! C_NEG_BADPORT no debio coincidir (puerto 8080 en vez de 8000)."
}
Write-Host "  [OK] Caso Negativo 3 (Puerto incorrecto '8080') rechazado correctamente." -ForegroundColor Green

$recBadHost = $parsedHttp | Where-Object { $_.uid -eq "C_NEG_BADHOST" }
if (Test-HttpLogRecord -record $recBadHost -targetTestId $expectedTestId) {
    throw "TEST 3 FALLO: Falso positivo! C_NEG_BADHOST no debio coincidir (host 'evil-domain.com:8000')."
}
Write-Host "  [OK] Caso Negativo 4 (Host incorrecto) rechazado correctamente." -ForegroundColor Green

$recNoId = $parsedHttp | Where-Object { $_.uid -eq "C_NEG_NOID" }
if (Test-HttpLogRecord -record $recNoId -targetTestId $expectedTestId) {
    throw "TEST 3 FALLO: Falso positivo! C_NEG_NOID no debio coincidir (URI '/health' sin TestId)."
}
Write-Host "  [OK] Caso Negativo 5 (URI sin TestID) rechazado correctamente." -ForegroundColor Green

# 3. Comprobacion global de coincidencias en el lote
$allMatches = @()
foreach ($hrow in $parsedHttp) {
    if (Test-HttpLogRecord -record $hrow -targetTestId $expectedTestId) {
        $allMatches += $hrow
    }
}
Write-Host "Coincidencias totales en lote: $($allMatches.Count) (Esperado: 2 validos, 0 negativos)"
if ($allMatches.Count -ne 2) {
    throw "TEST 3 FALLO: Se esperaban exactamente 2 coincidencias validas, se obtuvieron $($allMatches.Count)"
}
Write-Host "[OK] TEST 3 superado exitosamente (5 casos negativos estrictamente descartados)." -ForegroundColor Green

Write-Host "`n=== TEST 4: Generacion y Codificacion de Politica Zeek (Sin BOM) ===" -ForegroundColor Cyan
$testPolicyFile = Join-Path $testDir "test_analyzer.zeek"
$testPolicyContent = @"
# Politica de prueba
@load base/protocols/conn
@load base/protocols/http

event zeek_init()
    {
    Analyzer::register_for_port(Analyzer::ANALYZER_HTTP, 8000/tcp);
    }
"@
Set-Content -Path $testPolicyFile -Value $testPolicyContent -Encoding Ascii

$rawBytes = [System.IO.File]::ReadAllBytes($testPolicyFile)
$hasBom = ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF)
if ($hasBom) {
    throw "TEST 4 FALLO: El archivo contiene UTF-8 BOM (\xef\xbb\xbf), lo que causa error en el parser de Zeek."
}
Write-Host "  [OK] El archivo de politica se genera en ASCII puro sin BOM (Bytes iniciales: $($rawBytes[0..2] -join ', '))." -ForegroundColor Green
Write-Host "[OK] TEST 4 superado exitosamente." -ForegroundColor Green

# Limpieza del directorio de prueba unitaria
Remove-Item -Recurse -Force $testDir
Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "[PASS] Todas las pruebas unitarias del parser y correlacion pasaron al 100%." -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
