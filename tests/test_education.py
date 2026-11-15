"""Honesty, readability and determinism tests for the educational layer (docs/EDUCACAO_ODS.md §10.5).
Pure functions only: no database needed."""
import itertools
import re
from datetime import date

import pytest

from api import education as edu
from api.schemas import Learn

SENT = re.compile(r"(?<=[.!?])\s+")


def all_texts(learn: Learn) -> list[str]:
    return ([c.texto for c in learn.cards] + learn.nao_diz + [a.texto for a in learn.avisos]
            + [p.texto for p in learn.perguntas]
            + [learn.acessivel.alt_curto, learn.acessivel.descricao_longa, learn.acessivel.falavel])


def check_learn(learn: Learn, nivel: str) -> None:
    assert learn.cards, "every view explains something"
    assert learn.nao_diz, "'o que este dado NÃO diz' is mandatory"
    assert len(learn.acessivel.alt_curto) <= 150
    for t in all_texts(learn):
        assert not edu.violations(t), edu.violations(t)
    for ch in "−≥≤~×":
        assert ch not in learn.acessivel.falavel
    if nivel == "simples":
        for c in learn.cards:
            for j in edu.JARGON_SIMPLES:
                assert j not in c.texto, f"jargon {j!r} in simples card {c.id}: {c.texto}"
            for s in SENT.split(c.texto):
                assert len(s.split()) <= 40, f"long sentence in {c.id}: {s}"
    from api.main import app  # noqa: F401  (glossary ids must exist)
    ids = {t.id for t in edu.glossary()}
    assert set(learn.glossario) <= ids


def facts(cat_pct, partial, provisional, n_ref, extremo=None, top=False):
    n_lower = {"min": 0, "max": n_ref}.get(extremo, n_ref // 2) if n_ref else 0
    n_higher = n_ref - n_lower
    return edu.MonthFacts(year=2026, month=9, value=1234.0, daily_mean=41.13, percentile=cat_pct,
                          zscore=None if cat_pct is None else 0.8, is_partial=partial, obs_days=14 if partial else 30,
                          days_in_month=30, n_ref=n_ref, ref_min=2003 if n_ref else None,
                          ref_max=2025 if n_ref else None, n_lower=n_lower, n_higher=n_higher,
                          is_provisional=provisional, is_top=top)


PCTS = [None, 5.0, 20.0, 50.0, 80.0, 95.0]


@pytest.mark.parametrize("nivel", edu.NIVEIS)
def test_month_combinations(nivel):
    """6 categories × partial × provisional × region/custom × synthetic × MODIS era × n_ref."""
    for p, partial, prov, custom, synth, start, n_ref in itertools.product(
            PCTS, (False, True), (False, True), (False, True), (False, True),
            (date(2003, 1, 1), date(2015, 1, 1)), (3, 8, 23)):
        f = facts(p, partial, prov, n_ref, extremo="min" if p == 5.0 else None)
        ctx = edu.Ctx(nivel=nivel, area_label="Cerrado — Matopiba", custom=custom, is_synthetic=synth,
                      provisional_from=date(2026, 9, 10) if prov else None)
        learn = edu.learn_calendar(f, ctx, start, date(2026, 9, 30), 12, f, 0.75, 5)
        check_learn(learn, nivel)
        txt = " ".join(all_texts(learn))
        codes = {a.codigo for a in learn.avisos}
        if partial:
            assert "incompleto" in txt and "por dia" in txt
        if prov:
            assert "nrt" in codes and "provisóri" in txt
        if synth:
            assert "sintetico" in codes and "sintética" in txt   # also on custom areas (A12)
        if start < edu.VIIRS_START:
            assert "era_modis" in codes and "estimativa" in txt
            assert ("custom_pre2012" in codes) == custom
        if p is not None:
            core = edu.anomaly_core(f, ctx.area_label, nivel)
            assert str(n_ref) in core and "2003" in core and "2025" in core   # reference always explicit
        else:
            assert learn.cards[0].id == "cal.indisponivel"
        if 3 <= n_ref < 10 and p is not None:
            assert any(c.id == "cal.n_pequeno" for c in learn.cards)


def test_anomaly_texts_partial_uses_daily_mean_and_keep_unit():
    f = facts(95.0, True, True, 23)
    t = edu.anomaly_texts(f, "Cerrado — Matopiba")
    assert set(t) == set(edu.NIVEIS)
    assert "por dia" in t["tecnico"] and "41,1" in t["tecnico"] and "1.234" not in t["tecnico"]
    assert "células-dia" in t["tecnico"] and "z =" in t["tecnico"]
    assert "z =" not in t["simples"] and "percentil" not in t["simples"]
    assert "provisóri" in t["simples"]


def test_extremo_never_claims_history():
    f = facts(0.0, False, True, 23, extremo="min")
    cards = edu.month_cards(f, edu.Ctx(area_label="X"))
    ext = next(c for c in cards if c.id == "cal.extremo")
    assert "menor" in ext.texto and "23 anos" in ext.texto and "todos os tempos" in ext.texto
    assert "provisórios" in ext.texto


@pytest.mark.parametrize("nivel", edu.NIVEIS)
def test_hexgrid_concentration_seed_text(nivel):
    ctx = edu.Ctx(nivel=nivel, area_label="Cerrado — Matopiba")
    learn = edu.learn_hexgrid(ctx, date(2026, 10, 1), date(2026, 10, 30), "day", 120, 900.0, 0.62,
                              (-9.5, -47.3), 100, 500, 20)
    check_learn(learn, nivel)
    conc = next(c for c in learn.cards if c.id == "mapa.concentracao.alta")
    if nivel != "tecnico":
        assert "não significa que toda a área esteja em chamas" in conc.texto
        assert "62%" in conc.texto
    assert {"mapa.sensor", "mapa.recorrencia"} <= {c.id for c in learn.cards}


def test_hexgrid_empty_and_monthly_and_modis_era():
    ctx = edu.Ctx(area_label="X")
    empty = edu.learn_hexgrid(ctx, date(2026, 10, 1), date(2026, 10, 30), "day", 0, 0.0, None, None, 0, 0, None)
    check_learn(empty, "simples")
    assert empty.cards[0].id == "mapa.vazio" and "não garante" in empty.cards[0].texto
    old = edu.learn_hexgrid(ctx, date(2010, 8, 1), date(2010, 9, 30), "month", 5, 10.0, None, None, 5, 0, 3)
    assert {"mapa.mensal", "mapa.era_modis"} <= {c.id for c in old.cards}


def test_hex_facts():
    import pandas as pd
    n, tot, top = edu.hex_facts(pd.Series([10.0] + [1.0] * 19))
    assert n == 20 and tot == 29 and top == pytest.approx(11 / 29)
    assert edu.hex_facts(pd.Series([3.0, 1.0]))[2] is None          # < 10 cells: no concentration claim


@pytest.mark.parametrize("nivel", edu.NIVEIS)
def test_other_views(nivel):
    ctx = edu.Ctx(nivel=nivel, area_label="X", provisional_from=date(2026, 11, 1), method="quantile_mapping")
    s, e = date(2003, 1, 1), date(2026, 11, 13)
    for learn in [
        edu.learn_comparison(ctx, s, e, 2.4, 3.9, True, 120),
        edu.learn_comparison(ctx, s, e, 1.2, 1.3, False, 6),
        edu.learn_comparison(ctx, s, e, None, None, True, 3),
        edu.learn_harmonization(ctx, s, e, True, True, [2012, 2023], True, 0.98, 1481.0, -300.0, 1600.0, 4000.0),
        edu.learn_recent(ctx, date(2026, 11, 7), e, 68, 4, 0.13, [11, 12], True, [date(2026, 11, 8)], True),
        edu.learn_forecast(ctx, False, 7, 0, None),
        edu.learn_forecast(ctx, True, 7, 50, 0.31),
    ]:
        check_learn(learn, nivel)


def test_comparison_cards():
    ctx = edu.Ctx(area_label="X")
    ids = {c.id for c in edu.learn_comparison(ctx, date(2010, 1, 1), date(2016, 12, 31), 2.4, 3.9, True, 84).cards}
    assert ids == {"comp.razao", "comp.pre_viirs", "comp.focos_vs_celulas"}
    odd = edu.learn_comparison(ctx, date(2015, 1, 1), date(2015, 12, 31), 1.5, 1.5, False, 12).cards[0]
    assert odd.id == "comp.razao_atipica" and "2022" not in odd.texto.split("Possíveis motivos")[1]


def test_forecast_only_unavailable_card_and_probability_wording():
    ctx = edu.Ctx(area_label="X")
    off = edu.learn_forecast(ctx, False, 7, 0, None)
    assert [c.id for c in off.cards] == ["prev.indisponivel"]
    on = edu.learn_forecast(ctx, True, 7, 50, 0.31)
    t = " ".join(all_texts(on))
    assert "probabilidade" in t.lower() and "em cada 10" not in t


def test_violations_detects_and_allows_negation():
    assert edu.violations("A área queimada foi enorme.")
    assert edu.violations("Isso comprova o crime.")
    assert edu.violations("Foi o menor da história.")
    assert edu.violations("O hexágono está sem fogo.")
    assert not edu.violations("Foco de calor não é área queimada.")
    assert not edu.violations("Isso não significa que toda a área esteja em chamas.")


def test_static_texts_are_honest():
    for t in edu.LIMITATIONS + edu.LIMITATIONS_SIMPLES:
        assert not edu.violations(t), t
    assert len(edu.LIMITATIONS) == len(edu.LIMITATIONS_SIMPLES)
    for g in edu.glossary():
        assert not edu.violations(g.simples) and not edu.violations(g.tecnico), g.id
        assert g.armadilha and g.ods


def test_falavel_and_formatting():
    assert edu.falavel("z = −0,8; ≥ 3; ~36 km²; 2012–2023") == \
        "z = menos 0,8; pelo menos 3; cerca de 36 quilômetros quadrados; 2012 a 2023"
    assert edu.br_int(12345.6) == "12.346" and edu.br_num(-0.83, 1, sign=True) == "−0,8"
    assert edu.br_num(1481.23, 1) == "1.481,2"
    assert edu.fmt_date(date(2026, 11, 1)) == "1º de novembro de 2026"


def test_determinism():
    f = facts(80.0, True, True, 8)
    ctx = edu.Ctx(area_label="X", provisional_from=date(2026, 9, 1))
    a = edu.learn_calendar(f, ctx, date(2003, 1, 1), date(2026, 9, 30), 12, f, 0.8, 5)
    b = edu.learn_calendar(f, ctx, date(2003, 1, 1), date(2026, 9, 30), 12, f, 0.8, 5)
    assert a.model_dump() == b.model_dump()


def test_learning_paths_reference_known_cards_or_terms():
    paths = edu.learning_paths("matopiba")
    assert {p.id for p in paths} >= {"t1", "t2", "t3", "t4"}
    t4 = next(p for p in paths if p.id == "t4")
    assert t4.bloqueada and not t4.etapas
    for p in paths:
        assert p.bncc_status == "a verificar por docente"
        for e in p.etapas:
            assert e.params["region"] == "matopiba"
