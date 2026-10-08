# Downloads a portable Tesseract runtime into this project's tools directory.
# No administrator access, registry edits, PATH edits, or global installation.
# Upstream Windows download: https://github.com/tesseract-ocr/tesseract/releases/tag/5.5.0
# Tesseract recommends the UB Mannheim builds in its installation documentation:
# https://tesseract-ocr.github.io/tessdoc/Installation.html
# SHA256 values pin the exact downloaded binaries and language data.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') {
    throw 'Este script configura o Tesseract no Windows x64.'
}
if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'Esta distribuicao do Tesseract exige Windows de 64 bits.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot 'tools'
$runtimeRoot = Join-Path $toolsRoot 'tesseract'
$extractorRoot = Join-Path $toolsRoot '7zip'
$tessdataRoot = Join-Path $runtimeRoot 'tessdata'
New-Item -ItemType Directory -Path $toolsRoot, $runtimeRoot, $tessdataRoot -Force | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

function Get-VerifiedFile {
    param([string]$Url, [string]$Destination, [string]$Sha256)
    if (Test-Path -LiteralPath $Destination) {
        $existingHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
        if ($existingHash -eq $Sha256) { return }
    }
    Write-Host "Baixando $([IO.Path]::GetFileName($Destination))..."
    $partialPath = $Destination + '.download'
    Invoke-WebRequest -Uri $Url -OutFile $partialPath -UseBasicParsing -TimeoutSec 180
    $downloadHash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash
    if ($downloadHash -ne $Sha256) {
        throw "SHA256 inesperado em $partialPath. Arquivo nao executado; confira a origem antes de continuar."
    }
    Move-Item -LiteralPath $partialPath -Destination $Destination -Force
}

# Bootstrap the complete 7-Zip command-line extractor without executing installers.
# These two hashes are also published as asset digests by the official GitHub release.
$bootstrap = Join-Path $toolsRoot '7zr.exe'
$sevenzipArchive = Join-Path $toolsRoot '7z2603-x64.exe'
Get-VerifiedFile `
    -Url 'https://github.com/ip7z/7zip/releases/download/26.03/7zr.exe' `
    -Destination $bootstrap `
    -Sha256 'AD4C82FADCBDF93C03B4FC440F300509C7D60C5C2F4D183E35D9D70D6957037D'
Get-VerifiedFile `
    -Url 'https://github.com/ip7z/7zip/releases/download/26.03/7z2603-x64.exe' `
    -Destination $sevenzipArchive `
    -Sha256 '0859C524B8A63551848F0C246ABDDCB1D0B7B656B0FBFE879F8D85E61A9E6EDD'
& $bootstrap x $sevenzipArchive "-o$extractorRoot" -y -bso0
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel extrair o 7-Zip.' }
$sevenzip = Join-Path $extractorRoot '7z.exe'

$tesseractArchive = Join-Path $toolsRoot 'tesseract-ocr-w64-setup-5.5.0.20241111.exe'
Get-VerifiedFile `
    -Url 'https://github.com/tesseract-ocr/tesseract/releases/download/5.5.0/tesseract-ocr-w64-setup-5.5.0.20241111.exe' `
    -Destination $tesseractArchive `
    -Sha256 'F3FC4236425B690C8BE756F35793F77394EE004BE0A6460A440C754D892F68BC'
& $sevenzip x $tesseractArchive "-o$runtimeRoot" 'tesseract.exe' '*.dll' 'tessdata\*' 'doc\*' '-xr!$PLUGINSDIR' -y -bso0
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel extrair o Tesseract.' }

# Integer LSTM models optimized for low latency. Commit pin prevents silent updates.
$modelsBase = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd'
Get-VerifiedFile `
    -Url "$modelsBase/por.traineddata" `
    -Destination (Join-Path $tessdataRoot 'por.traineddata') `
    -Sha256 'C4932B937207A9514B7514D518B931A99938C02A28A5A5A553F8599ED58B7DEB'
Get-VerifiedFile `
    -Url "$modelsBase/eng.traineddata" `
    -Destination (Join-Path $tessdataRoot 'eng.traineddata') `
    -Sha256 '7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2'

$executable = Join-Path $runtimeRoot 'tesseract.exe'
& $executable --version
if ($LASTEXITCODE -ne 0) { throw 'O Tesseract extraido nao iniciou corretamente.' }
$languageOutput = & $executable --tessdata-dir $tessdataRoot --list-langs
if ($LASTEXITCODE -ne 0 -or 'por' -notin $languageOutput -or 'eng' -notin $languageOutput) {
    throw 'A validacao dos idiomas portugues e ingles falhou.'
}
$languageOutput | ForEach-Object { Write-Host $_ }
Write-Host "`nTesseract pronto. Executavel: $executable"
Write-Host "Dados de idioma: $tessdataRoot"
