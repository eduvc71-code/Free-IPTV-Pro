$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "       GENERADOR Y COMPILADOR DE APK - FREE-IPTV PRO             " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[Paso 1] Copiar archivos web a Android y sincronizar..." -ForegroundColor Yellow
Set-Location "free_iptv_app"
npx cap copy
npx cap sync
Set-Location ".."

Write-Host "[Paso 2] Compilando el APK con Gradle (assembleDebug)..." -ForegroundColor Yellow
Set-Location "free_iptv_app/android"
if ($IsWindows -or $env:OS -like "*Windows*") {
    .\gradlew.bat assembleDebug
} else {
    ./gradlew assembleDebug
}
Set-Location "../.."

$sourceApk = "free_iptv_app/android/app/build/outputs/apk/debug/app-debug.apk"
$targetVersionName = "1.0.23"
$outputApkName = "Free-IPTV-Pro-v$targetVersionName.apk"

if (Test-Path $sourceApk) {
    Copy-Item $sourceApk $outputApkName -Force
    Copy-Item $sourceApk "Free-IPTV-Pro.apk" -Force
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host " [EXITO] APK COMPILADA Y GENERADA EXITOSAMENTE                  " -ForegroundColor Green
    Write-Host " Ruta del APK: $sourceApk                                         " -ForegroundColor Green
    Write-Host " Copia en raiz: $outputApkName                                    " -ForegroundColor Green
    Write-Host "=================================================================" -ForegroundColor Green
} else {
    Write-Host "  [!] Error critico: No se encontro el APK compilado en $sourceApk" -ForegroundColor Red
    exit 1
}
