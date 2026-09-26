# Redesign de setembro de 2026

Homepage com tipografia de cartaz, verde ácido/vermelho, tickets recortados e nova ordem das seções. GSAP e ScrollTrigger locais: profundidade no hero, faixa lateral, cena fixada no desktop, zoom, títulos e entradas dos ingressos. Mobile sem cena fixada; preferência de movimento reduzido desativa os efeitos. Conteúdo utilizável se as bibliotecas falharem.

Verificação: qa/check-home.cjs (320/768/1440, âncoras, imagens, FAQ, checkout), qa/check-motion.cjs (rolagem 390/1440 sem erros ou overflow), qa/check-motion-fallback.cjs (movimento reduzido e bibliotecas indisponíveis). npm test: 27 testes passaram. Nenhuma cobrança real foi realizada. Preços e taxas preservados.
