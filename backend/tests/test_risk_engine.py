from app.services.risk_engine import build_risk_matrix


def test_matrix_maps_flags_to_mitigations_and_sorts_by_severity():
    matrix = build_risk_matrix(
        ["missing_house_money", "negative_cashflow_base_case", "weg_unfunded_measures"],
        ["POSSIBLE_DISTRESSED_SALE"],
    )

    assert matrix.high_count == 2
    assert matrix.items[0].severity == "high"
    codes = [item.code for item in matrix.items]
    assert codes.index("negative_cashflow_base_case") < codes.index("missing_house_money")

    unfunded = next(item for item in matrix.items if item.code == "weg_unfunded_measures")
    assert unfunded.due_diligence_actions
    assert unfunded.mitigations
    assert unfunded.price_consequence


def test_pure_opportunity_signals_are_excluded_unknown_flags_get_generic_entry():
    matrix = build_risk_matrix(["custom_manual_flag"], ["LONG_TIME_ON_MARKET", "PRICE_REDUCTION"])

    codes = [item.code for item in matrix.items]
    assert "LONG_TIME_ON_MARKET" not in codes
    assert "PRICE_REDUCTION" not in codes
    generic = next(item for item in matrix.items if item.code == "custom_manual_flag")
    assert generic.title == "Manuelle Pruefung erforderlich"


def test_empty_input_gives_calm_summary():
    matrix = build_risk_matrix([])
    assert matrix.items == []
    assert "Keine geflaggten Risiken" in matrix.summary


def test_signal_aliases_resolve_to_catalog_entries():
    matrix = build_risk_matrix([], ["ENERGY_RISK", "MISSING_WEG_DOCUMENTS"])
    titles = {item.title for item in matrix.items}
    assert "Schlechte Energieklasse ohne Capex-Puffer" in titles
    assert "Instandhaltungsruecklage unbekannt" in titles
