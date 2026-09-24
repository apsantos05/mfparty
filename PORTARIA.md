# Ingressos e portaria — MF PARTY

## Ativação na Vercel

Projeto: https://vercel.com/acerto/mfparty/settings/environment-variables

1. Manter BRAVOPAY_API_KEY, ORDER_SIGNING_SECRET (32+ caracteres), BRAVOPAY_WEBHOOK_SECRET, UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN configurados e válidos.
2. Cadastrar GATE_PASSWORD como Secret em Production: senha exclusiva com pelo menos 16 caracteres. Quem possuir essa senha poderá registrar entradas. Não enviar a senha pelo chat nem gravar no GitHub.
3. Opcional: TICKET_SIGNING_SECRET (32+ caracteres). Sem ele, a aplicação deriva uma chave exclusiva de ORDER_SIGNING_SECRET.
4. Fazer um novo deployment após alterar variáveis.
5. Acessar https://mfparty.vercel.app/portaria pelo celular e entrar com o nome da portaria e a senha. A câmera requer HTTPS e autorização do aparelho.

O Redis é obrigatório para emissão e validação. Use banco com persistência, sem política de expulsão de chaves (eviction), monitore espaço e não limpe os registros antes do evento. As chaves possuem prefixo mf:{halloween2026}: e ficam até 30 dias depois do prazo de validação. A perda do banco impede validar ingressos; não existe autorização offline.

## Compra e entrega

Depois da confirmação do PIX, a página de confirmação emite um QR por entrada. Compras múltiplas têm códigos diferentes; o combo legado gera duas entradas por unidade. O comprador pode baixar cada ingresso em PNG ou imprimir/salvar todos em PDF. Não há envio automático por e-mail ou WhatsApp.

O QR contém somente um código aleatório não adivinhável, sem CPF, telefone ou e-mail. O banco guarda o nome do comprador, a categoria e os dados mínimos para conciliação. O nome é do comprador, não necessariamente de cada acompanhante; a portaria deve verificar a categoria e idade no documento.

Reabrir a confirmação na mesma aba permite recuperar os códigos enquanto houver a referência da compra. Para novos pedidos, a referência é válida pelo menos até o fim do evento. Compras antigas com referência já vencida não são reemitidas automaticamente: precisam de atendimento da organização. Oriente o cliente a salvar os ingressos antes de fechar a aba. Cada arquivo é um ingresso ao portador: uma cópia não serve como segunda entrada e a primeira confirmação válida consome o código.

## Na entrada

- Abra a câmera ou envie uma imagem do QR. Também é possível colar o código MF1-….
- “Ingresso válido” é apenas consulta. Confira documento e categoria e toque em “Confirmar entrada”.
- Somente “Entrada confirmada” autoriza a entrada.
- “Já utilizado” mostra horário e portaria do primeiro registro. Não libere outra entrada.
- Em falha de rede, consulte novamente o mesmo código. Uma resposta perdida pode ter registrado a entrada; o sistema nunca autoriza por suposição.
- Use “Ler próximo ingresso” para limpar a consulta. Ao sair do aparelho, use “Sair”.

Sessão: cookie Secure, HttpOnly e SameSite=Strict, duração de 8 horas, logout com revogação e invalidação ao trocar GATE_PASSWORD. A senha é compartilhada pela equipe; o nome da portaria é informado pelo operador e não é uma identidade individual verificada.

## Validade e cancelamento

Padrão: até 02/11/2026 às 12h de Brasília, configurável por TICKET_VALID_UNTIL. Não há bloqueio antes do dia do evento: quem possui acesso da portaria pode consumir ingressos desde a emissão. Evite testar “Confirmar entrada” com ingresso de cliente.

Pagamento é consultado novamente no provedor ao emitir, consultar e confirmar. Sem resposta válida, não há entrada. Webhooks autenticados de reembolso/chargeback gravam bloqueio durável, inclusive fora de ordem. A confirmação é atômica no Redis: dois aparelhos não conseguem consumir o mesmo código. Não há desfazer entrada pela interface.

## Verificações

`npm test`: regressões de pagamento e testes de emissão, autenticação, códigos falsos, reemissão, concorrência, reembolso, expiração e indisponibilidade. São testes locais com fronteiras de rede simuladas; não representam uma cobrança real aprovada.

Leitor: jsQR 1.4.0 servido localmente com licença em js/vendor. Referências: https://github.com/cozmo/jsQR ; https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia ; https://upstash.com/docs/redis/features/restapi
