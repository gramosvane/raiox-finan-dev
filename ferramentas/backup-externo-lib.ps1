# Funcoes puras (sem rede, sem disco) usadas por copiar-backup-externo.ps1 e testadas por teste-copiar-backup-externo.ps1.
# Regra: na duvida, devolver $null (o chamador FALHA FECHADO). Nada de "tentar adivinhar" o formato.

# Resumo escrito pelo servidor: EXATAMENTE duas linhas nao vazias: nome do backup e SHA-256 (64 hex).
# Devolve @{ Nome = ...; Hash = ... } ou $null se qualquer coisa estiver fora do formato.
function Ler-ResumoBackup([string]$texto) {
    if ([string]::IsNullOrWhiteSpace($texto)) { return $null }
    $linhas = @($texto -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    if ($linhas.Count -ne 2) { return $null }
    $nome = $linhas[0]; $hash = $linhas[1]
    if ($nome -notmatch '^raiox-backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.tar\.gz\.gpg$') { return $null }
    if ($hash -notmatch '^[0-9a-fA-F]{64}$') { return $null }
    return @{ Nome = $nome; Hash = $hash.ToLower() }
}

# Pasta remota: so caminho absoluto simples (vai dentro de um comando ssh).
function Pasta-RemotaValida([string]$p) {
    return ($p -match '^/[A-Za-z0-9_./-]+$') -and ($p -notmatch '\.\.')
}
