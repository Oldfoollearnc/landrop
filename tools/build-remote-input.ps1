$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'csc.exe not found (.NET Framework 4.x required)' }

$inputSrc = Join-Path $root 'tools\remote-input.cs'
$inputOut = Join-Path $root 'assets\remote-input.exe'
& $csc /nologo /target:exe /out:$inputOut /r:System.Windows.Forms.dll $inputSrc
if ($LASTEXITCODE -ne 0) { throw "csc failed (remote-input): $LASTEXITCODE" }

$captureSrc = Join-Path $root 'tools\remote-capture.cs'
$captureOut = Join-Path $root 'assets\remote-capture.exe'
& $csc /nologo /target:exe /out:$captureOut /r:System.Drawing.dll /r:System.Windows.Forms.dll $captureSrc
if ($LASTEXITCODE -ne 0) { throw "csc failed (remote-capture): $LASTEXITCODE" }

Write-Output "built $inputOut"
Write-Output "built $captureOut"
