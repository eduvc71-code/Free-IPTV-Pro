$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "       GENERADOR Y COMPILADOR DE APK - FREE-IPTV PRO             " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Verificando entorno de Android SDK..." -ForegroundColor Yellow
$sdkPath = $env:ANDROID_HOME
if (-not $sdkPath) {
    $sdkPath = "$env:LOCALAPPDATA\Android\Sdk"
}
if (-not (Test-Path $sdkPath)) {
    $sdkPath = "C:\Android\Sdk"
}
if (Test-Path $sdkPath) {
    Write-Host "  - Entorno SDK verificado en: $sdkPath" -ForegroundColor Green
    $env:ANDROID_HOME = $sdkPath
} else {
    Write-Host "  [!] Advertencia: No se encontro Android SDK automaticamente." -ForegroundColor Red
}

# Definir versión unificada actual (1.0.19 / Code 19)
$targetVersionName = "1.0.19"
$targetVersionCode = 19

Write-Host "[2/4] Actualizando version interna a v$targetVersionName (Code: $targetVersionCode) en build.gradle y app.js..." -ForegroundColor Yellow

# Actualizar build.gradle
$gradlePath = "free_iptv_app/android/app/build.gradle"
if (Test-Path $gradlePath) {
    $content = Get-Content $gradlePath -Raw
    $content = $content -replace 'versionCode\s+\d+', "versionCode $targetVersionCode"
    $content = $content -replace 'versionName\s+"[^"]+"', "versionName `"$targetVersionName`""
    [System.IO.File]::WriteAllText((Resolve-Path $gradlePath), $content)
}

# Actualizar app.js
$appJsPath = "free_iptv_app/www/js/app.js"
if (Test-Path $appJsPath) {
    try {
        $contentJs = Get-Content $appJsPath -Raw
        $contentJs = $contentJs -replace "const APP_VERSION = '[^']+';", "const APP_VERSION = 'v$targetVersionName';"
        [System.IO.File]::WriteAllText((Resolve-Path $appJsPath), $contentJs)
    } catch {
        Write-Host "  [!] Nota: app.js esta abierto en el editor, se omitio la reescritura directa pero se compilará con la version actual." -ForegroundColor Yellow
    }
}

Write-Host "[3/4] Sincronizando recursos web con Capacitor..." -ForegroundColor Yellow
Set-Location "free_iptv_app"
npx cap sync android
Set-Location ".."

Write-Host "[4/4] Compilando APK con Gradle (assembleDebug)..." -ForegroundColor Yellow
Set-Location "free_iptv_app/android"
if ($IsWindows -or $env:OS -like "*Windows*") {
    .\gradlew.bat assembleDebug
} else {
    ./gradlew assembleDebug
}
Set-Location "../.."

$sourceApk = "free_iptv_app/android/app/build/outputs/apk/debug/app-debug.apk"
$outputApkName = "Free-IPTV-Pro-v$targetVersionName.apk"

if (Test-Path $sourceApk) {
    Copy-Item $sourceApk $outputApkName -Force
    Copy-Item $sourceApk "Free-IPTV-Pro.apk" -Force
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host " [EXITO] APK COMPILADA, FIRMADA Y VERSIONADA EXITOSAMENTE        " -ForegroundColor Green
    Write-Host " Archivo generado: $outputApkName                                 " -ForegroundColor Green
    Write-Host " ¡Ya puedes instalarlo en tu dispositivo!                        " -ForegroundColor Green
    Write-Host "=================================================================" -ForegroundColor Green
} else {
    Write-Host "  [!] Error critico: No se encontro el APK compilado en $sourceApk" -ForegroundColor Red
    exit 1
}
