# Changelog

## 3.7.0

Movimento do painel: 7 efeitos com nome, todos desligados com movimento reduzido.

- Novos: cartão que vira a tela, gráfico que responde, período em um clique, números de roleta, gráfico que se transforma, meta batida e tabela que reordena (`starter-kit/public/assets/css/efeitos.css` e um módulo por efeito em `public/assets/js/lib/`).
- Meta batida mais forte: cartão inteiro acende na cor da marca, faixa de luz atravessa, clarão na barra, pulso no número e selo com peso, uma vez por cruzamento, cerca de 1,9 s. Medido no navegador: 96% dos pixels do cartão mudam no meio do efeito (mínimo 25%) e no fim ele volta ao normal com o selo.
- Tabela que reordena: a ordem escolhida sobrevive a filtro, troca de período e Atualizar, até novo clique ou troca de aba.
- Roleta mais limpa: cada casa é uma janela de uma linha só com o dígito que sai e o que entra, sem dígito de passagem; separadores não rolam; a largura não varia.
- Travas de movimento e presença passam a cobrir o `efeitos.css` (só `transform`, `opacity`, `stroke-dashoffset` e `clip-path`; sem filtro, caixa alta, letra espaçada nem sombra de texto; sem opacidade 0 fora de keyframes). Os limites existentes não mudaram. Faixa própria dos efeitos em `test/efeitos-duracao.test.js`: até 2,4 s, troca de período até 1,0 s.
- Teste no navegador: `scripts/test-efeitos-no-navegador.cjs` (bancada em `scripts/efeitos-harness.cjs`).
- Roteiro de vídeo padrão: troca dois atalhos de período e passa o mouse no gráfico (passos opcionais, 10 a 15 s).

## 3.6.0

Vídeo de prova no painel, com prancha de quadros (`scripts/gravar-video.js`).
