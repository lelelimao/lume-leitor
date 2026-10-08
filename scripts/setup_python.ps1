# Official CPython NuGet distribution, documented at docs.python.org/3.13/using/windows.html.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot 'tools'
$pythonArchive = Join-Path $toolsRoot 'python-3.13.15.zip'
$pythonRoot = Join-Path $toolsRoot 'python-portable'
$expectedHash = '05357887DF50D3153EFC681BDF432C321D3E2F9CE5788F99F4515B27E8FDA0AC'
New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $pythonArchive) -or (Get-FileHash -LiteralPath $pythonArchive -Algorithm SHA256).Hash -ne $expectedHash) {
    Write-Host 'Baixando a distribuicao oficial portatil do Python 3.13.15...'
    Invoke-WebRequest -Uri 'https://api.nuget.org/v3-flatcontainer/python/3.13.15/python.3.13.15.nupkg' -OutFile $pythonArchive -UseBasicParsing -TimeoutSec 180
}
if ((Get-FileHash -LiteralPath $pythonArchive -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'O pacote Python nao passou na verificacao SHA256.'
}
Expand-Archive -LiteralPath $pythonArchive -DestinationPath $pythonRoot -Force
$pythonExecutable = Join-Path $pythonRoot 'tools\python.exe'
& $pythonExecutable -c 'import sys,venv,ensurepip; print(sys.version)'
if ($LASTEXITCODE -ne 0) { throw 'O Python portatil nao iniciou. Confira o Windows x64 e a pasta do projeto.' }
Write-Host "Python pronto: $pythonExecutable"
