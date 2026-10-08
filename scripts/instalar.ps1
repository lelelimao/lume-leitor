# Local component installer for Windows x64. Run through instalar.cmd.
[CmdletBinding()]
param([switch]$SkipSmoke)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Use Windows de 64 bits.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

function Invoke-Python {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Um componente falhou (codigo $LASTEXITCODE). Veja a mensagem acima." }
}
function Test-Python {
    param([string]$Executable)
    if (-not (Test-Path -LiteralPath $Executable)) { return $false }
    try {
        & $Executable -c 'import sys; sys.exit(0 if sys.version_info[:2] in ((3,12),(3,13)) and sys.maxsize>2**32 else 1)' 2>$null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}
function Test-Venv {
    param([string]$Executable)
    if (-not (Test-Python $Executable)) { return $false }
    try {
        $checkOutput = & $Executable -m pip check 2>&1
        if ($LASTEXITCODE -eq 0) { return $true }
        if ([string]($checkOutput -join "`n") -match 'is not supported on this platform') {
            Write-Host 'A .venv existente contem bibliotecas de outro Python ou plataforma; criando um ambiente novo.' -ForegroundColor Yellow
            return $false
        }
        # Dependencias ausentes apos uma tentativa interrompida serao instaladas na etapa 2.
        return $true
    } catch {
        Write-Host 'A .venv existente nao pode ser validada; criando um ambiente novo.' -ForegroundColor Yellow
    }
    return $false
}

Write-Host '[1/5] Verificando Python...' -ForegroundColor Magenta
$venvRoot = Join-Path $projectRoot '.venv'
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
if (-not (Test-Venv $venvPython)) {
    $pythonExecutable = $null
    $candidates = @(
        (Join-Path $projectRoot 'tools\python-portable\tools\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Python\pythoncore-3.13-64\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Python\pythoncore-3.12-64\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
        (Join-Path $env:ProgramFiles 'Python313\python.exe'),
        (Join-Path $env:ProgramFiles 'Python312\python.exe')
    )
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        foreach ($version in @('3.13', '3.12')) {
            try {
                $discovered = & $launcher.Source "-$version" -c 'import sys; print(sys.executable)' 2>$null
                if ($LASTEXITCODE -eq 0 -and $discovered) { $candidates += [string]$discovered }
            } catch { }
        }
    }
    $existing = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($existing -and $existing.Source -notmatch 'WindowsApps') { $candidates += $existing.Source }
    foreach ($candidate in $candidates) {
        if (Test-Python $candidate) { $pythonExecutable = $candidate; break }
    }
    if (-not $pythonExecutable) {
        & (Join-Path $PSScriptRoot 'setup_python.ps1')
        $pythonExecutable = Join-Path $projectRoot 'tools\python-portable\tools\python.exe'
    }
    if (-not (Test-Python $pythonExecutable)) { throw 'Nao foi possivel preparar Python. Instale Python 3.12 ou 3.13 x64.' }
    Write-Host "Usando Python: $pythonExecutable" -ForegroundColor Cyan
    if (Test-Path -LiteralPath $venvRoot) {
        $backupName = '.venv-anterior-' + (Get-Date -Format 'yyyyMMdd-HHmmssfff')
        Rename-Item -LiteralPath $venvRoot -NewName $backupName
        Write-Host "Ambiente antigo guardado em $backupName. Ele nao deve ser copiado entre computadores." -ForegroundColor Yellow
    }
    Invoke-Python $pythonExecutable @('-m','venv',$venvRoot)
}
Invoke-Python $venvPython @('-m','ensurepip','--upgrade')

Write-Host '[2/5] Instalando bibliotecas Python, voz Google e YOLO...' -ForegroundColor Magenta
Invoke-Python $venvPython @('-m','pip','install','-r',(Join-Path $projectRoot 'requirements-lock.txt'),'--index-url','https://pypi.org/simple')
Invoke-Python $venvPython @('-m','pip','check')

Write-Host '[3/5] Preparando Tesseract e os idiomas...' -ForegroundColor Magenta
& (Join-Path $PSScriptRoot 'setup_tesseract.ps1')

Write-Host '[4/5] Preparando modelo de deteccao de texto...' -ForegroundColor Magenta
Invoke-Python $venvPython @((Join-Path $PSScriptRoot 'download_models.py'))
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
    Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination (Join-Path $projectRoot '.env')
}

Write-Host '[5/5] Verificando os componentes...' -ForegroundColor Magenta
Invoke-Python $venvPython @('-c','import fastapi,uvicorn,pytesseract,gtts')
if (-not $SkipSmoke) { Invoke-Python $venvPython @((Join-Path $PSScriptRoot 'smoke_ocr.py')) }
Write-Host "`nInstalacao concluida. Execute iniciar.cmd e abra http://localhost:8000." -ForegroundColor Green
Write-Host 'Google e navegador estao disponiveis. Configure Alexa na tela do Lume se tiver Echo + Home Assistant.'
