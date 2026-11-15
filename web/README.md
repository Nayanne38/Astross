# Web (Phase 4)
Next.js App Router + TypeScript + Tailwind + shadcn/ui + Recharts + react-leaflet.
If a v0 export exists, drop it here and keep `lib/fire-data.ts` names/interfaces.

## Camada educativa (`learn`), obrigatória em cada visualização
Toda resposta de visualização da API traz `learn` (ver `api/schemas.py`, classe `Learn`, e `docs/EDUCACAO_ODS.md` §10.2).
- Painel **"Entenda esta visualização"** ao lado de cada gráfico ou mapa: `learn.cards` (agrupados por `slot`:
  situação, cautela, contexto) e `learn.avisos`.
- Bloco **"O que este dado NÃO diz"** (`learn.nao_diz`): sempre visível, nunca escondido atrás de um clique.
- Seletor de nível: `?nivel=simples|estudante|tecnico` (padrão `simples`). `dica_professor` só aparece no modo professor.
- Acessibilidade: `learn.acessivel.alt_curto` vai em `aria-label`; `descricao_longa` em `aria-describedby`/`<details>`;
  `falavel` para leitor de tela.
- Termos de `learn.glossario` viram tooltips ligados a `GET /glossary/{id}`.
- Cartão fixo "Foco de calor não é área queimada"; meses parciais com hachura (nunca só cor);
  paletas seguras para daltonismo (azul↔laranja para anomalias, nunca verde↔vermelho).
- Requisitos: foco visível, alvos ≥ 24×24 px, sem animação automática, `prefers-reduced-motion`,
  link "pular mapa", página inicial < 500 KB.
