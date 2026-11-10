# =================================================================
#        GENERADOR Y COMPILADOR DE APK - FREE-IPTV PRO (PowerShell)
# =================================================================
$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
$AppDir = Join-Path $RootDir "free_iptv_app"
$AndroidDir = Join-Path $AppDir "android"
$SdkPath = "$env:LOCALAPPDATA\Android\Sdk"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "       GENERADOR Y COMPILADOR DE APK - FREE-IPTV PRO             " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[*] Verificando entorno de Android SDK..." -ForegroundColor Yellow
$LocalProp = Join-Path $AndroidDir "local.properties"
if (-not (Test-Path $LocalProp)) {
    $EscapedSdk = $SdkPath -replace '\\', '\\'
    "sdk.dir=$EscapedSdk" | Out-File -FilePath $LocalProp -Encoding ASCII
}

Write-Host "[*] Sincronizando recursos web con Capacitor..." -ForegroundColor Yellow
Set-Location $AppDir
& npx.cmd cap copy

Write-Host "`n[*] Compilando APK con Gradle (assembleDebug)..." -ForegroundColor Yellow
Set-Location $AndroidDir
& .\gradlew.bat assembleDebug

Write-Host "`n[*] Firmando y alineando APK con uber-apk-signer..." -ForegroundColor Yellow
Set-Location $RootDir
$GradleApk = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"

if (Test-Path $GradleApk) {
    & java -jar uber-apk-signer.jar -a $GradleApk -o . --allowResign
    if (Test-Path "app-debug-aligned-debugSigned.apk") {
        Move-Item -Force "app-debug-aligned-debugSigned.apk" "Free-IPTV-Pro.apk"
        Remove-Item -Force -ErrorAction SilentlyContinue "app-debug-aligned-debugSigned.apk.idsig"
        Write-Host "`n=================================================================" -ForegroundColor Green
        Write-Host " [OK] APK COMPILADA Y FIRMADA EXITOSAMENTE                       " -ForegroundColor Green
        Write-Host " Archivo generado: Free-IPTV-Pro.apk - Listo para instalar       " -ForegroundColor Green
        Write-Host "=================================================================" -ForegroundColor Green
    }
} else {
    Write-Host "[!] No se encontro el APK generado por Gradle." -ForegroundColor Red
}
