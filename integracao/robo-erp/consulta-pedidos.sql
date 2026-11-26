-- Projeto Artas · consulta dos PEDIDOS DE VENDA EM ABERTO no ERP (Firebird) · SOMENTE LEITURA
-- Base: SELECT fornecida pelo técnico do ERP (mesma origem da análise 915), com dois ajustes:
--   · período: de hoje menos 60 dias até hoje mais 30 dias (o robô troca @DESDE@ e @ATE@; ver config.ini)
--   · só as colunas que a produção usa (sem CNPJ, valores, custos e impostos)
-- Não altere os nomes depois de "AS": o Artas espera exatamente estes nomes.
SELECT
    PROC.DTVDA        AS DATA_VENDA,
    PROC.CODEMP       AS EMPRESA,
    PROC.NRVDA        AS NUMERO,
    PROC.NRROMANEIO   AS ROMANEIO,
    PROC.CODCLI       AS CLIENTE_CODIGO,
    PROC.NOMECLI      AS CLIENTE_NOME,
    PROC.NOMEFANTCLI  AS CLIENTE_FANTASIA,
    PROC.CODREDE      AS REDE_CODIGO,
    PROC.NOMEREDE     AS REDE_NOME,
    PROC.CIDADE       AS CIDADE,
    PROC.UF           AS UF,
    PROC.CODPRO       AS PRODUTO_CODIGO,
    PROC.NOMEPROD     AS PRODUTO_NOME,
    PROC.CODGRUPO     AS GRUPO_CODIGO,
    PROC.NOMEGRUPO    AS GRUPO_NOME,
    PROC.CODSUBGRUPO  AS SUBGRUPO_CODIGO,
    PROC.NOMESUBGRUPO AS SUBGRUPO_NOME,
    PROC.QTDE         AS QUANTIDADE,
    PROC.CODFUNC      AS FUNCIONARIO_CODIGO,
    PROC.NOMEFUNC     AS FUNCIONARIO_NOME,
    PROC.CODCOLA      AS COLABORADOR_CODIGO,
    PROC.NOMECOLA     AS COLABORADOR_NOME
FROM SP_BI_ANALISEDEDADOS(CAST('@DESDE@' AS DATE), CAST('@ATE@' AS DATE), 0, 0, 'N') PROC
WHERE PROC.CANCELADA = 'N'
  AND EXISTS (
        SELECT 1
        FROM CONS029 p
        WHERE p.EMPRESA = PROC.CODEMP
          AND p.TIPO = 'P'
          AND p.NUMERO = PROC.NRVDA
          AND p.DATA = PROC.DTVDA
          AND p.CONS008 = PROC.CODCLI
    )
