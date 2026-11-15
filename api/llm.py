"""Claude layer for the risk forecast: turns model numbers into a pt-BR briefing.

Hybrid design (see docs/APRESENTACAO.md): the probabilities come ONLY from the statistical model
(ml/, table risk_forecasts). Claude reads those numbers plus the historical context and writes the
interpretation. It is instructed never to invent figures. The API key stays on the server.
"""
from __future__ import annotations

import json
import os
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5-5")


class PriorityArea(BaseModel):
    nome: str = Field(description="rótulo curto, ex.: 'Sul do Maranhão (perto de Balsas)'")
    lat: float
    lon: float
    probabilidade: float = Field(description="copiada do dado de entrada, 0-1")
    motivo: str


class Insight(BaseModel):
    titulo: str
    resumo: str = Field(description="2 a 4 frases")
    areas_prioritarias: list[PriorityArea]
    fatores: list[str]
    confianca: Literal["baixa", "media", "alta"]
    justificativa_confianca: str
    limitacoes: list[str]
    recomendacoes: list[str]


class InsightUnavailable(RuntimeError):
    """Raised when Claude cannot be called (no key, refusal, API error) — mapped to HTTP 503."""


SYSTEM = """Você é analista de risco de queimadas do projeto Calendário de Queimadas (NASA Space Apps), \
que harmoniza focos de calor MODIS e VIIRS (NASA FIRMS) em células hexagonais H3.

Você recebe, em JSON, a saída de um modelo estatístico (LightGBM) que estima, para cada célula, a \
probabilidade de ao menos um dia com fogo nos próximos N dias, junto com métricas de avaliação do \
modelo contra baselines e o contexto histórico da região.

Regras obrigatórias:
- Você NÃO faz a previsão: interpreta a previsão do modelo. Nunca invente números, probabilidades, \
datas, municípios ou contagens que não estejam no JSON. Ao citar um número, copie-o do JSON.
- Para nomear áreas, use apenas referências geográficas amplas e seguras a partir de lat/lon (estado, \
região do estado, grandes cidades próximas). Se não tiver certeza, descreva pela posição \
(ex.: "extremo sul da região, ~-11,5° / -46,0°").
- A confiança deve refletir as métricas do modelo (PR-AUC e ROC-AUC contra persistência e \
climatologia) e as limitações informadas. Nunca diga "alta" se o modelo não supera os baselines.
- Foco de calor detectado por satélite não é o mesmo que área queimada ou incêndio confirmado.
- Escreva em português do Brasil, com frases claras e objetivas."""

AUDIENCE = {
    "geral": "Público: gestores, brigadistas e cidadãos. Recomendações práticas de prevenção e monitoramento.",
    "professor": ("Público: professores do ensino fundamental e médio. Use linguagem didática, explique "
                  "termos técnicos em poucas palavras e transforme as recomendações em ideias de "
                  "atividades e perguntas para discutir em sala de aula."),
}


def _client() -> anthropic.Anthropic:
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")):
        raise InsightUnavailable("ANTHROPIC_API_KEY não configurada no servidor (.env).")
    return anthropic.Anthropic()


def generate_insight(context: dict, audience: str = "geral") -> Insight:
    client = _client()
    user = (f"{AUDIENCE.get(audience, AUDIENCE['geral'])}\n\n"
            "Dados (JSON):\n" + json.dumps(context, ensure_ascii=False, default=str))
    try:
        resp = client.beta.messages.parse(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": user}],
            output_format=Insight,
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError as e:
        raise InsightUnavailable("Chave da Anthropic inválida.") from e
    except anthropic.RateLimitError as e:
        raise InsightUnavailable("Limite de uso da API da Anthropic atingido; tente novamente em instantes.") from e
    except anthropic.APIStatusError as e:
        raise InsightUnavailable(f"Erro da API da Anthropic ({e.status_code}).") from e
    except anthropic.APIConnectionError as e:
        raise InsightUnavailable("Sem conexão com a API da Anthropic.") from e
    if resp.stop_reason == "refusal":
        raise InsightUnavailable("O modelo recusou gerar a análise para estes dados.")
    if resp.parsed_output is None:
        raise InsightUnavailable(f"Resposta incompleta do modelo (stop_reason={resp.stop_reason}).")
    return resp.parsed_output
