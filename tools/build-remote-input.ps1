$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'csc.exe not found (.NET Framework 4.x required)' }
$src = Join-Path $root 'tools\remote-input.cs'
$out = Join-Path $root 'assets\remote-input.exe'
& $csc /nologo /target:exe /out:$out /r:System.Windows.Forms.dll $src
if ($LASTEXITCODE -ne 0) { throw "csc failed: $LASTEXITCODE" }
Write-Output "built $out"
