# Teste automatizado das funcoes de backup-externo-lib.ps1 (parser do resumo do servidor).
# Uso: powershell -ExecutionPolicy Bypass -File ferramentas\teste-copiar-backup-externo.ps1   (sai 0 = tudo passou)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'backup-externo-lib.ps1')
$falhas = 0
function Esperar([string]$desc, $obtido, $esperado) {
    if ($obtido -eq $esperado) { Write-Host "[OK]    $desc" } else { Write-Host "[FALHA] $desc (obtido='$obtido' esperado='$esperado')" -ForegroundColor Red; $script:falhas++ }
}
$n = 'raiox-backup_2026-10-12_16-57-01.tar.gz.gpg'
$h = 'ed9624b381349f51e3ae59bbb075687734850173314233536a1fab44867c4863'

$r = Ler-ResumoBackup "$n`n$h`n";            Esperar 'normal (LF)'            "$($r.Nome)|$($r.Hash)" "$n|$h"
$r = Ler-ResumoBackup "$n`r`n$h`r`n";        Esperar 'normal (CRLF)'          "$($r.Nome)|$($r.Hash)" "$n|$h"
$r = Ler-ResumoBackup "`n`n$n`n`n$h`n`n";    Esperar 'linhas em branco extras' "$($r.Nome)|$($r.Hash)" "$n|$h"
$r = Ler-ResumoBackup "$n`n$($h.ToUpper())"; Esperar 'hash maiusculo vira minusculo' $r.Hash $h

Esperar 'vazio'                        (Ler-ResumoBackup '')                       $null
Esperar 'so espacos'                   (Ler-ResumoBackup "  `n `n")                $null
Esperar 'so uma linha'                 (Ler-ResumoBackup $n)                       $null
Esperar 'defeito real: n literal colado' (Ler-ResumoBackup "${n}n${h}n")           $null
Esperar 'nome e hash na mesma linha'   (Ler-ResumoBackup "$n $h")                  $null
Esperar 'linhas a mais'                (Ler-ResumoBackup "$n`n$h`nextra")          $null
Esperar 'hash curto'                   (Ler-ResumoBackup "$n`n$($h.Substring(0,63))") $null
Esperar 'hash com caractere invalido'  (Ler-ResumoBackup "$n`n$($h.Substring(0,63))z") $null
Esperar 'nome fora do padrao'          (Ler-ResumoBackup "outro.tar.gz.gpg`n$h")   $null
Esperar 'nome com caminho'             (Ler-ResumoBackup "../$n`n$h")              $null
Esperar 'ordem invertida'              (Ler-ResumoBackup "$h`n$n")                 $null
Esperar 'mensagem de erro do sudo'     (Ler-ResumoBackup "sudo: a password is required`n") $null
Esperar 'resumo de tentativa antiga com nome diferente aceito como esta (o chamador compara com o que baixou)' ((Ler-ResumoBackup "raiox-backup_2026-01-01_00-00-00.tar.gz.gpg`n$h").Nome) 'raiox-backup_2026-01-01_00-00-00.tar.gz.gpg'

Esperar 'pasta remota valida'          (Pasta-RemotaValida '/var/backups/raiox-staging') $true
Esperar 'pasta com ..'                 (Pasta-RemotaValida '/var/../etc')          $false
Esperar 'pasta com espaco/aspas'       (Pasta-RemotaValida "/var/backups/a b'")    $false
Esperar 'pasta relativa'               (Pasta-RemotaValida 'var/backups')          $false

if ($falhas -eq 0) { Write-Host "TODOS OS TESTES PASSARAM" -ForegroundColor Green; exit 0 }
Write-Host "$falhas TESTE(S) FALHARAM" -ForegroundColor Red; exit 1
