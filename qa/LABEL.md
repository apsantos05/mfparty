# Site da label MF PARTY

## Estrutura

- index.html: evento atual (Halloween) com identidade permanente MF PARTY na navegação.
- eventos.html: arquivo de edições e galerias.
- biografia.html: história da label e espaço para imagem institucional.
- contatos.html: Instagram, WhatsApp e e-mail.
- js/label-content.js: conteúdo institucional e cores compartilhadas, separado de preços, PIX e portaria.

Os dados ainda não fornecidos ficam explicitamente como “em breve”. Não existem eventos históricos nem fotografias fictícias publicados. Nenhum formulário envia mensagens ou coleta dados.

## Preencher conteúdo

Edite biography com uma lista de parágrafos. Em contacts, informe a URL completa do Instagram, WhatsApp com país/DDD (somente dígitos) e endereço de e-mail. Campos vazios continuam como espaços preparados.

Para adicionar galerias, preencha pastEvents neste formato (exemplo de estrutura, não dados reais):

```js
{
  title: 'Nome real do evento',
  dateLabel: 'Data do evento',
  description: 'Descrição aprovada',
  photos: [
    { src: 'images/eventos/edicao/foto-01.webp', alt: 'Descrição da foto', caption: 'Legenda e crédito' }
  ]
}
```

Armazene imagens em images/eventos/ usando nomes novos quando substituí-las (cache imutável da Vercel). O visualizador suporta ampliação, anterior/próxima, setas do teclado, Escape e devolução do foco. A estrutura é editada no projeto; não é um painel de upload.

## Próximo tema

A marca, navegação e páginas institucionais permanecem. theme.accent e theme.secondary centralizam as duas cores, e currentEvent controla os destaques nas páginas institucionais. A campanha principal continua no index.html e css/home.css: atualizar arte/preload, textos, data do contador em js/script.js e metadados para a próxima edição. A configuração de ingressos, prazos e integrações de um novo evento exige atualização própria no servidor; trocar o tema não altera cobranças nem ingressos existentes.

## Verificação

node qa/check-label.cjs: quatro páginas em 320, 390, 768 e 1440 px; navegação visível, estado ativo, sem overflow ou erros JS; galeria testada com imagens locais injetadas somente no navegador do teste, incluindo teclado/Escape/foco.
npm test: 27 testes aprovados de pagamentos e portaria. Sem cobranças reais.
