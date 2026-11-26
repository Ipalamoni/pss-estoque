# =====================================================================
# Projeto Artas · INTEGRAÇÃO DE PEDIDOS DO ERP (Windows PowerShell 5.1 ou mais novo)
#
# O que faz: lê no ERP (Firebird, pela conexão ODBC que já existe) os pedidos de venda em aberto
# e envia para o Artas. SÓ LEITURA no ERP: a consulta roda numa transação que é desfeita no fim
# (nada é gravado lá). Não abre porta nenhuma: só faz chamadas de saída para o Artas (HTTPS).
#
# Modos:
#   -Modo teste   lê o ERP e salva teste_pedidos.csv nesta pasta (NÃO envia nada ao Artas)
#   -Modo enviar  lê o ERP e envia ao Artas (é o que o agendamento do Windows roda a cada 30 min)
#
# Arquivos desta pasta: config.ini (senha, NÃO compartilhar), consulta-pedidos.sql, artas.log
# Códigos de saída: 0 ok · 2 configuração · 3 conexão ODBC não encontrada (tente o PowerShell 32 bits)
#                   4 erro no ERP · 5 erro no Artas
# =====================================================================
param([ValidateSet('teste', 'enviar')][string]$Modo = 'teste')

$ErrorActionPreference = 'Stop'
$VERSAO = '1.0.2'
$PASTA = Split-Path -Parent $MyInvocation.MyCommand.Path
$LOG = Join-Path $PASTA 'artas.log'
$INV = [Globalization.CultureInfo]::InvariantCulture

function Log([string]$texto) {
    $linha = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  [' + $Modo + '] ' + $texto
    Write-Host $linha
    try {
        if ((Test-Path $LOG) -and ((Get-Item $LOG).Length -gt 2MB)) { Move-Item $LOG ($LOG + '.anterior') -Force }
        Add-Content -Path $LOG -Value $linha -Encoding UTF8
    } catch { }
}

function Sair([int]$codigo, [string]$texto) {
    if ($texto) { Log $texto }
    exit $codigo
}

# ---------------------------------------------------------------------
# 1) configuração
# ---------------------------------------------------------------------
$arqConfig = Join-Path $PASTA 'config.ini'
if (-not (Test-Path $arqConfig)) { Sair 2 'ERRO: falta o arquivo config.ini nesta pasta (copie o config.exemplo.ini e preencha a senha).' }
$cfg = @{}
foreach ($l in (Get-Content $arqConfig -Encoding UTF8)) {
    $t = $l.Trim()
    if ($t -eq '' -or $t.StartsWith(';') -or $t.StartsWith('#') -or $t.StartsWith('[')) { continue }
    $i = $t.IndexOf('=')
    if ($i -gt 0) { $cfg[$t.Substring(0, $i).Trim().ToLower()] = $t.Substring($i + 1).Trim() }
}
foreach ($k in @('supabase_url', 'chave_publicavel', 'dominio_login', 'usuario', 'odbc')) {
    if (-not $cfg[$k]) { Sair 2 "ERRO: no config.ini falta preencher '$k'." }
}
if ($Modo -eq 'enviar' -and -not $cfg['senha']) { Sair 2 "ERRO: no config.ini falta a senha do usuário de integração (linha 'senha =')." }
$diasAtras = 30; if ($cfg['dias_atras']) { $diasAtras = [int]$cfg['dias_atras'] }
$diasFrente = 30; if ($cfg['dias_frente']) { $diasFrente = [int]$cfg['dias_frente'] }
$limite = 300; if ($cfg['tempo_limite']) { $limite = [int]$cfg['tempo_limite'] }
$url = $cfg['supabase_url'].TrimEnd('/')
$desde = (Get-Date).Date.AddDays(-$diasAtras).ToString('yyyy-MM-dd')
$ate = (Get-Date).Date.AddDays($diasFrente).ToString('yyyy-MM-dd')

$arqSql = Join-Path $PASTA 'consulta-pedidos.sql'
if (-not (Test-Path $arqSql)) { Sair 2 'ERRO: falta o arquivo consulta-pedidos.sql nesta pasta.' }
$sql = (Get-Content $arqSql -Raw -Encoding UTF8).Replace('@DESDE@', $desde).Replace('@ATE@', $ate)
# tira as linhas de comentário (o driver ODBC não precisa delas)
$sql = (($sql -split "`r?`n") | Where-Object { -not $_.TrimStart().StartsWith('--') }) -join "`r`n"

# ---------------------------------------------------------------------
# 2) Artas: entrar com o usuário de integração e enviar
# ---------------------------------------------------------------------
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Mensagem-Erro($erro) {
    $m = $erro.Exception.Message
    if ($erro.ErrorDetails -and $erro.ErrorDetails.Message) { $m = $m + ' | ' + $erro.ErrorDetails.Message }
    return $m
}

function Chamar-Artas([string]$caminho, $corpo, [string]$token) {
    $cab = @{ 'apikey' = $cfg['chave_publicavel'] }
    if ($token) { $cab['Authorization'] = 'Bearer ' + $token }
    $json = $corpo | ConvertTo-Json -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Method Post -Uri ($url + $caminho) -Headers $cab -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 120
}

function Entrar-Artas {
    $login = $cfg['usuario'].ToLower() + '@' + $cfg['dominio_login']
    $r = Chamar-Artas '/auth/v1/token?grant_type=password' @{ email = $login; password = $cfg['senha'] } $null
    if (-not $r.access_token) { throw 'O Artas não devolveu a sessão de integração.' }
    return $r.access_token
}

function Enviar-Artas($pacote) {
    $token = Entrar-Artas
    return Chamar-Artas '/rest/v1/rpc/erp_receber_pedidos' @{ p = $pacote } $token
}

# ---------------------------------------------------------------------
# 3) ERP: ler os pedidos (somente leitura)
# ---------------------------------------------------------------------
Log ("Início · Artas " + $VERSAO + " · pedidos de " + $desde + " a " + $ate + " · PowerShell " + [IntPtr]::Size * 8 + " bits")
$linhas = New-Object System.Collections.Generic.List[object]
$relogio = [Diagnostics.Stopwatch]::StartNew()
$con = $null
try {
    $con = New-Object System.Data.Odbc.OdbcConnection($cfg['odbc'])
    try { $con.Open() } catch {
        $m = $_.Exception.Message
        if ($m -match 'IM002' -or $m -match 'not found' -or $m -match 'encontrad') {
            Sair 3 ('ERRO: a conexão ODBC não foi encontrada neste PowerShell (' + ([IntPtr]::Size * 8) + ' bits). Detalhe: ' + $m)
        }
        throw
    }
    $tx = $con.BeginTransaction([System.Data.IsolationLevel]::ReadCommitted)
    try {
        $cmd = $con.CreateCommand()
        $cmd.Transaction = $tx
        $cmd.CommandTimeout = $limite
        $cmd.CommandText = $sql
        $rd = $cmd.ExecuteReader()
        while ($rd.Read()) {
            $o = [ordered]@{}
            for ($i = 0; $i -lt $rd.FieldCount; $i++) {
                $nome = $rd.GetName($i).ToLower()
                $v = $rd.GetValue($i)
                if ($v -is [DBNull]) { $v = $null }
                elseif ($v -is [datetime]) { $v = $v.ToString('yyyy-MM-dd') }
                elseif ($v -is [decimal] -or $v -is [double] -or $v -is [single]) { $v = $v.ToString($INV) }
                else { $v = ([string]$v).Trim() }
                $o[$nome] = $v
            }
            $linhas.Add([pscustomobject]$o)
        }
        $rd.Close()
    } finally {
        $tx.Rollback()   # desfaz a transação: garante que nada fica gravado no ERP
    }
} catch {
    $relogio.Stop()
    $msg = 'ERRO ao ler o ERP: ' + $_.Exception.Message
    Log $msg
    if ($Modo -eq 'enviar') {   # avisa o Artas que a integração está com problema
        try {
            $null = Enviar-Artas @{ maquina = $env:COMPUTERNAME; versao_robo = $VERSAO; desde = $desde; ate = $ate
                                   segundos = [math]::Round($relogio.Elapsed.TotalSeconds, 2); erro = $msg.Substring(0, [math]::Min(1900, $msg.Length)) }
        } catch { Log ('Também não consegui avisar o Artas: ' + (Mensagem-Erro $_)) }
    }
    Sair 4 ''
} finally {
    if ($con) { $con.Close() }
}
$relogio.Stop()
$seg = [math]::Round($relogio.Elapsed.TotalSeconds, 2)

# conferência rápida
$esperadas = @('data_venda', 'empresa', 'numero', 'produto_codigo', 'quantidade')
if ($linhas.Count -gt 0) {
    $tem = $linhas[0].PSObject.Properties.Name
    $faltam = $esperadas | Where-Object { $tem -notcontains $_ }
    if ($faltam) { Sair 4 ('ERRO: a consulta não trouxe as colunas: ' + ($faltam -join ', ') + '. Confira o consulta-pedidos.sql.') }
}
$pedidos = ($linhas | ForEach-Object { $_.empresa + '|' + $_.numero } | Sort-Object -Unique).Count
$produtos = ($linhas | ForEach-Object { $_.produto_codigo } | Sort-Object -Unique).Count
$total = 0; foreach ($x in $linhas) { if ($x.quantidade) { $total += [decimal]::Parse($x.quantidade, $INV) } }
Log ("ERP lido em " + $seg.ToString($INV) + " s · " + $linhas.Count + " linhas · " + $pedidos + " pedidos · " + $produtos + " produtos · quantidade total " + $total.ToString($INV))

# ---------------------------------------------------------------------
# 4a) modo TESTE: salva o CSV para conferir no Excel (não envia nada)
# ---------------------------------------------------------------------
if ($Modo -eq 'teste') {
    $csv = Join-Path $PASTA 'teste_pedidos.csv'
    $paraExcel = foreach ($x in $linhas) {
        $h = [ordered]@{}
        foreach ($p in $x.PSObject.Properties) { $h[$p.Name] = $p.Value }
        if ($h['quantidade']) { $h['quantidade'] = ([string]$h['quantidade']).Replace('.', ',') }   # Excel em português usa vírgula
        [pscustomobject]$h
    }
    if ($linhas.Count -gt 0) { $paraExcel | Export-Csv -Path $csv -Delimiter ';' -NoTypeInformation -Encoding UTF8 }
    else { Set-Content -Path $csv -Value 'A consulta não trouxe nenhum pedido em aberto.' -Encoding UTF8 }
    Sair 0 ('TESTE concluído. Abra no Excel: ' + $csv + ' (nada foi enviado ao Artas)')
}

# ---------------------------------------------------------------------
# 4b) modo ENVIAR
# ---------------------------------------------------------------------
try {
    $r = Enviar-Artas @{ maquina = $env:COMPUTERNAME; versao_robo = $VERSAO; desde = $desde; ate = $ate; segundos = $seg
                        linhas = [object[]]$linhas.ToArray() }
    $extra = ''
    if ($r.protecao_lista_vazia) { $extra = ' · ATENÇÃO: consulta vazia, o Artas manteve a lista anterior' }
    Sair 0 ("Enviado ao Artas · " + $r.linhas + " linhas · novas " + $r.novas + " · alteradas " + $r.alteradas + " · saíram " + $r.removidas + $extra)
} catch {
    Sair 5 ('ERRO ao enviar ao Artas: ' + (Mensagem-Erro $_))
}
