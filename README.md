# Halloween Party 1.0 — checkout PIX, confirmação e entrega manual

Esta versão é baseada no último pacote `halloween_party_pix_escala_auditado_vercel.zip`, com verificação adicional da recuperação visual da compra no mesmo navegador. Preserva o visual, as atrações **sem imagem**, o open bar **sem imagem**, o local não revelado, os CTAs próximos à compra, os valores e o WhatsApp para receber manualmente os ingressos.

## Variáveis no ambiente **Production** da Vercel

| Variável | Necessidade |
|---|---|
| `BRAVOPAY_API_KEY` | Obrigatória. Chave NOVA; a anterior foi exposta no chat. |
| `ORDER_SIGNING_SECRET` | Obrigatória, aleatória com 32+ caracteres; manter estável entre deploys. |
| `BRAVOPAY_WEBHOOK_SECRET` | Necessária para autenticar webhooks. Cadastrar `https://SEU-DOMINIO/api/bravopay-webhook`. |
| `UPSTASH_REDIS_REST_URL` | **Fortemente recomendada para centenas de visitantes / processamento eficiente em escala**. |
| `UPSTASH_REDIS_REST_TOKEN` | O par da URL acima. Sem ambos, não há limite global nem cache compartilhado. |
| `BRAVOPAY_PRODUCT_ID_MULHER`, `BRAVOPAY_PRODUCT_ID_HOMEM` | Opcionais para cobrança; configurar IDs reais se usar UTMify e filtros por produto. |

Segredos apenas na Vercel. Após configurar, faça **novo deploy**. Este ZIP não contém credenciais reais. A instalação via Vercel executa `npm install` para a dependência `qrcode`.

## Resumo das correções

- `create-pix`: cálculo inteiro em centavos, validação de dados, referência/idempotência determinística baseada em UUID da tentativa e conteúdo do pedido. Se a resposta se perder, repetir o mesmo envio reutiliza `Idempotency-Key` durante a janela de idempotência do provedor (documentada como 24h). Não garante reconciliação após o vencimento dessa janela, nem entre sessões/dispositivos.
- `pix-status`: token assinado obrigatório; correspondência de id, referência, valor, método, BRL e metadados antes de liberar compra. O cache do Redis guarda **somente dados de conciliação**, não CPF/e-mail/telefone. Com Redis, status por webhook e consulta compartilhada; sem Redis, consulta menos frequente.
- `bravopay-webhook`: só aceita evento HMAC válido usando bytes brutos; janela de 5 minutos; estados de pagamento/reembolso/chargeback gravados no Redis quando configurado. Se indisponível, responde 503 para o provedor tentar reenviar. Sem Redis, funciona como endpoint informativo, sem fornecer sinal compartilhado de aprovação.
- Proteções de volume com Redis: limites por minuto de até 30 criações + 25 consultas ao provedor, deixando margem sobre a documentação da BravoPay (60 req/min por chave). São limites de **requisições**, não de 30/25 vendas aprovadas. Webhooks e cache evitam consultas diretas em massa. Atingir a cota apresenta mensagem de aguardar; **não há fila de vendas**.
- Checkout: 30s + jitter entre consultas *ao backend* quando há Redis, 180s sem Redis; pausa com aba oculta/offline; respeita resposta 429/Retry-After; consulta manual com intervalo mínimo; reuso da tentativa após timeout. Não gera PIX silenciosamente ao voltar.
- Obrigado: valida PAID no servidor, tenta novamente quando a consulta falha, e só libera botão do WhatsApp comercial `5512988859882` com mensagem pronta depois de PAID. Entrega de ingresso é manual.

## Limitações, sem promessas de homologação

1. **Não houve PIX real pago neste ambiente.** Publicar, criar cobrança autorizada, pagar, verificar `PAID`, tela de obrigado e WhatsApp. Testar também webhook real no painel do provedor e comportamento de retries.
2. Sem Redis, não anunciar o site como homologado para centenas de compradores simultâneos: não há limite compartilhado entre funções serverless nem status compartilhado por webhook; o checkout consulta a BravoPay com maior intervalo.
3. Mesmo com Redis, limite oficial do provedor é 60 requisições/min por chave, possivelmente compartilhado com outros aplicativos que usam a mesma chave. Uma campanha com mais de 30 novas criações por minuto pode receber mensagens de espera; solicitar aumento de limite ao provedor ou planejar a campanha.
4. Webhook precisa ser testado na **Vercel real**, inclusive acesso ao corpo bruto da requisição, assinaturas e sincronização do horário.
5. A compra pode não ser recuperada em outro dispositivo/aba sem um banco de pedidos. A organização pode localizar a referência no painel da BravoPay e atender manualmente.
6. Teste visual automatizado no Chromium local não concluiu neste ambiente; validar Safari/Chrome reais em 320–430px, QR, teclado virtual e botão WhatsApp.

## Teste local

`npm install && npm test`

Os testes usam *mocks* de pagamento e Redis — não movimentam dinheiro.

## Documentação técnica consultada

- BravoPay: https://www.bravopay.club/docs
- Vercel Node.js Functions: https://vercel.com/docs/functions/runtimes/node-js

## Ajuste de continuidade do checkout

Ao atualizar a página durante um PIX pendente, o checkout agora restaura visualmente o tipo e a quantidade de ingressos da mesma cobrança (no mesmo navegador), sem criar novo PIX. A validação e a confirmação continuam exclusivamente no servidor.

## Correção de exibição PIX (21/09/2026)

- Corrigida a rejeição de cobranças válidas quando a resposta de **criação** omite campos acessórios (`method`, `currency` e `external_reference`). Se algum desses campos vier preenchido de forma incompatível, a resposta ainda é rejeitada.
- `amount_cents` divergente **sempre bloqueia**. Se estiver ausente, a API consulta a transação por referência e confere ID, valor, método e moeda no servidor **antes** de entregar PIX ao comprador.
- Código `pix.copy_paste` e identificador da transação continuam obrigatórios; QR Code é gerado localmente a partir do copia-e-cola.
- Erros técnicos mostram apenas um código de motivo nos logs de `/api/create-pix`, sem chave, nome, CPF, código PIX ou outros dados privados.
- O webhook, o status `PAID` e a tela de obrigado permanecem separados da simples criação da cobrança.
- **Ainda é necessário teste real após deploy**: PIX gerado e visível, pagamento de teste, confirmação `PAID`, obrigado e WhatsApp.

## Combo Amigo retirado

Removido da oferta e bloqueado para novas cobranças. A confirmação de pedidos antigos continua disponível.

## Ingresso +16 anos

Para 16 e 17 anos: R$ 25,00 + R$ 4,49 de taxa por ingresso. Open bar apenas de refrigerante, água e energético, sem bebidas alcoólicas. O tipo e a descrição são mantidos na cobrança, confirmação e mensagem de entrega. Produto opcional: `BRAVOPAY_PRODUCT_ID_JOVEM`.

## Cupons

DOLCE25, MARIF25, BRUNOJ25 e PROMO25 dão 25% de desconto no subtotal de qualquer categoria. Taxas não recebem desconto. Um cupom por compra; códigos normalizados e validados no servidor. Cupom integra a referência idempotente, os metadados e o token assinado. PIX gerado trava a edição do cupom e recupera o desconto ao recarregar. Pedidos antigos sem cupom continuam válidos.
