# Auditoria da versão para tráfego ampliado

**Escopo:** auditoria estática e testes simulados do código gerado; não equivale a homologação com dinheiro real nem teste de carga do provedor.

## Mudanças
- Removida a consulta fixa de status a cada 5,5 segundos.
- Polling adaptativo com pausa em background, jitter e resposta 429.
- Referência e Idempotency-Key estáveis entre retries da mesma tentativa com mesmos dados.
- Redis REST opcional para limite global, cache compartilhado e sinal autenticado de webhook; fortemente recomendado antes de campanha de centenas de pessoas.
- Não guardar dados pessoais da resposta completa de transação no cache.
- Confirmação do WhatsApp liberada somente após status PAID validado.
- Texto público sobre “teste antecipado” removido para não confundir clientes.

## Testes locais
Rodar `npm test`. Inclui cálculo, retry/idempotência, token adulterado, CPF inválido, status pendente, webhook sem assinatura, webhook pago assinado, 150 consultas ao cache sem consultar provedor, reembolso, sem Redis e limite compartilhado. Sintaxe JS, HTML/arquivos e ZIP são verificados também na entrega.

## Pendências obrigatórias antes do tráfego em escala
1. Configurar as variáveis da Vercel, principalmente API_KEY, ORDER_SIGNING_SECRET e secret do webhook. Redis REST recomendado para escala.
2. Novo deploy, cadastro da URL de webhook e teste de webhook real assinado.
3. PIX real autorizado: geração, pagamento, PAID, obrigado, WhatsApp. Conferir valores e referência no painel do gateway.
4. Testes visuais em iPhone/Android reais e teste de carga autorizado. Não fazer teste de carga diretamente contra a API do gateway sem coordenação com o fornecedor.
5. Se for necessário suportar mais de ~30 novas criações/min, negociar cota maior/arquitetura de fila com o provedor: este ZIP prioriza estabilidade e resposta de espera, não remove o limite externo.

## Refinamento desta entrega
- Corrigido resumo e seleção de ingresso ao reabrir o checkout durante PIX pendente; nenhum dado local aprova pagamento.
- ZIP completo contém frontend, API serverless, webhook, Redis REST, testes, README e .env.example sem credenciais reais.

## Ajuste de exibição PIX

Testes novos: criação com campos opcionais ausentes; valor ausente com consulta de conferência; valor divergente recusado; PIX sem código recusado. Resultado dos testes registrado durante geração do pacote. **Testes locais simulados não comprovam recebimento de PIX real.**
