<#
.SYNOPSIS
  Copia o backup cifrado MAIS RECENTE do servidor para o PC (dois discos fisicos) e confere o SHA-256 nas tres pontas.
.DESCRIPTION
  Roda no PC do responsavel (Windows PowerShell). Pede a senha do sudo do servidor (digitada por voce).
  NAO envolve a senha do backup e nunca a registra.
  FALHA FECHADO: se nao comprovar dois discos fisicos DISTINTOS, se ssh/scp falharem ou se qualquer SHA-256
  divergir, escreve "BACKUP NAO CONCLUIDO", sai com codigo 1 e NAO registra nada em REGISTRO.txt.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\ferramentas\copiar-backup-externo.ps1 -Servidor finan-server -DestinoA D:\BackupsRaioX -DestinoB C:\BackupsRaioX
#>
param(
    [string]$Servidor = 'finan-server',
    [string]$PastaNoServidor = '/var/backups/raiox-staging',
    [string]$DestinoA = 'D:\BackupsRaioX',
    [string]$DestinoB = 'C:\BackupsRaioX',
    [switch]$AceitoMesmoDisco   # so para emergencia: registra o backup marcado como MESMO-DISCO (nao conta como externo duplo)
)
$ErrorActionPreference = 'Stop'
function Falha($m) {
    Write-Host "BACKUP NAO CONCLUIDO: $m" -ForegroundColor Red
    # Limpeza de melhor esforco: tudo que esta execucao cria no servidor fica em UMA pasta e UM script, ambos de nome
    # unico e conhecidos desde o inicio (vale mesmo se a falha vier antes de ler o resumo). Nao afirma sucesso sem confirmar.
    if ($script:remotoDir -and $script:remotoSh -and $script:Servidor) {
        $limpou = $false
        try {
            ssh $script:Servidor "rm -rf -- $($script:remotoDir) $($script:remotoSh)" 2>$null | Out-Null
            $limpou = ($LASTEXITCODE -eq 0)
        } catch { }
        if ($limpou) { Write-Host "Temporarios desta execucao removidos do servidor." -ForegroundColor Yellow }
        else { Write-Host "ATENCAO: nao confirmei a remocao dos temporarios no servidor: $($script:remotoDir) e $($script:remotoSh). Remova manualmente." -ForegroundColor Yellow }
    }
    exit 1
}
# Executavel nativo nao lanca excecao sozinho: confere o codigo de saida de cada chamada.
function Nativo([string]$desc, [scriptblock]$cmd) {
    & $cmd
    if ($LASTEXITCODE -ne 0) { Falha "$desc falhou (codigo $LASTEXITCODE)." }
}

# 0) discos fisicos: precisam ser comprovadamente DIFERENTES
function DiscoDe([string]$caminho) {
    $letra = ([IO.Path]::GetPathRoot($caminho)).Substring(0,1)
    $p = Get-Partition -DriveLetter $letra -ErrorAction Stop
    return [int]$p.DiskNumber
}
$mesmoDisco = $false
try {
    $dA = DiscoDe $DestinoA; $dB = DiscoDe $DestinoB
    if ($dA -eq $dB) { $mesmoDisco = $true }
    else { Write-Host "Discos fisicos distintos: $DestinoA (disco $dA) e $DestinoB (disco $dB)." -ForegroundColor Green }
} catch { Falha "nao consegui comprovar os discos fisicos ($($_.Exception.Message))." }
if ($mesmoDisco -and -not $AceitoMesmoDisco) { Falha "$DestinoA e $DestinoB estao no MESMO disco fisico (disco $dA): nao ha copia independente. Use outro destino ou -AceitoMesmoDisco." }
if ($mesmoDisco) { Write-Host "AVISO: mesmo disco fisico; sera registrado como MESMO-DISCO." -ForegroundColor Yellow }

$dia = Get-Date -Format 'yyyy-MM-dd'
$pastaA = Join-Path $DestinoA $dia
$pastaB = Join-Path $DestinoB $dia
. (Join-Path $PSScriptRoot 'backup-externo-lib.ps1')
if (-not (Pasta-RemotaValida $PastaNoServidor)) { Falha "PastaNoServidor invalida: $PastaNoServidor" }

# Nomes UNICOS por execucao: nunca le nem sobrescreve temporario de outra tentativa (protected_regular do /tmp).
$idExec = [guid]::NewGuid().ToString('N').Substring(0, 12)
$remotoSh = "/tmp/raiox-remoto-$idExec.sh"
$remotoDir = "/tmp/raiox-copia-$idExec"            # pasta unica da execucao: copias do backup e resumo ficam so aqui
$remotoResumo = "$remotoDir/resumo.txt"
$localSh = Join-Path $env:TEMP "raiox-remoto-$idExec.sh"
$info = Join-Path $env:TEMP "raiox-resumo-$idExec.txt"

# Script remoto vai por ARQUIVO (sem aspas aninhadas em ssh): acha o backup mais recente, calcula o SHA-256,
# deixa copias legiveis ao usuario no /tmp e escreve o resumo com nome e hash em linhas separadas.
$remoto = @'
#!/bin/bash
set -eu
PASTA="$1"; ID="$2"; DONO="${SUDO_USER:?}"
f="$(ls -1t "$PASTA"/raiox-backup_*.tar.gz.gpg 2>/dev/null | head -1 || true)"
[ -n "$f" ] || { echo "nenhum backup em $PASTA" >&2; exit 3; }
[ -f "$f.sha256" ] || { echo "falta $f.sha256" >&2; exit 4; }
n="$(basename "$f")"
h="$(sha256sum "$f" | cut -d' ' -f1)"
D="/tmp/raiox-copia-$ID"
[ ! -e "$D" ] || { echo "$D ja existe" >&2; exit 5; }
install -d -o "$DONO" -m 700 "$D"
install -o "$DONO" -m 600 "$f" "$D/$n"
install -o "$DONO" -m 600 "$f.sha256" "$D/$n.sha256"
printf '%s\n%s\n' "$n" "$h" > "$D/resumo.txt"
chown "$DONO" "$D/resumo.txt"
chmod 600 "$D/resumo.txt"
'@
[IO.File]::WriteAllText($localSh, ($remoto -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))

# 1) envia o script, roda com sudo (interativo: voce digita a senha do sudo) e baixa o resumo
Write-Host "Digite a senha do sudo do servidor quando pedir." -ForegroundColor Cyan
Nativo "enviar o script remoto" { scp -q $localSh "${Servidor}:$remotoSh" }
Remove-Item $localSh -Force -ErrorAction SilentlyContinue
Nativo "descobrir o backup no servidor" { ssh -t $Servidor "sudo bash $remotoSh '$PastaNoServidor' $idExec" }
Nativo "baixar o resumo do backup" { scp -q "${Servidor}:$remotoResumo" $info }
$resumo = Ler-ResumoBackup (Get-Content $info -Raw)
Remove-Item $info -Force -ErrorAction SilentlyContinue
if ($null -eq $resumo) { Falha "resumo do servidor fora do formato esperado (duas linhas: nome e SHA-256). Nada foi copiado." }
$nome = $resumo.Nome; $hashSrv = $resumo.Hash
Write-Host "Arquivo: $nome"

# 2) baixa para o destino A e confere ANTES de copiar para o B
New-Item -ItemType Directory -Force $pastaA | Out-Null
New-Item -ItemType Directory -Force $pastaB | Out-Null
$arqA = Join-Path $pastaA $nome
$arqB = Join-Path $pastaB $nome
Nativo "baixar o backup" { scp -q "${Servidor}:$remotoDir/$nome" $arqA }
Nativo "baixar o .sha256" { scp -q "${Servidor}:$remotoDir/$nome.sha256" "$arqA.sha256" }
Nativo "apagar temporarios do servidor" { ssh $Servidor "rm -rf -- $remotoDir $remotoSh" }
$hA = (Get-FileHash $arqA -Algorithm SHA256).Hash.ToLower()
if ($hA -ne $hashSrv) { Falha "SHA-256 do destino A difere do servidor (A=$hA; servidor=$hashSrv). Arquivo mantido para analise." }
Copy-Item $arqA $arqB -Force
Copy-Item "$arqA.sha256" "$arqB.sha256" -Force

# 3) confere as tres pontas (leitura real do disco B)
$hB = (Get-FileHash $arqB -Algorithm SHA256).Hash.ToLower()
Write-Host ("Servidor : {0}" -f $hashSrv)
Write-Host ("Destino A: {0}  {1}" -f $hA, $(if ($hA -eq $hashSrv) { 'IGUAL' } else { 'DIFERE' }))
Write-Host ("Destino B: {0}  {1}" -f $hB, $(if ($hB -eq $hashSrv) { 'IGUAL' } else { 'DIFERE' }))
if ($hB -ne $hashSrv) { Falha "SHA-256 do destino B difere do servidor. Repita a copia." }

# 4) registra SOMENTE se tudo passou
$marca = if ($mesmoDisco) { 'MESMO-DISCO' } else { 'OK' }
$linha = "{0}  {1}  {2}  {3} B  {4}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $nome, $hashSrv, (Get-Item $arqA).Length, $marca
Add-Content -Path (Join-Path $DestinoA 'REGISTRO.txt') -Value $linha -Encoding UTF8
Write-Host "BACKUP EXTERNO CONCLUIDO E REGISTRADO ($marca)." -ForegroundColor Green
