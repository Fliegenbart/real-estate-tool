from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.services.germany import transfer_tax_percent_for_state


CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


FREMDVERGLEICH_CHECKLIST = [
    "Schriftlicher Darlehensvertrag VOR Auszahlung (Betrag, Laufzeit, Zins, Tilgung, Kuendigung).",
    "Marktueblicher Zinssatz dokumentieren (z.B. Bankangebot oder Bundesbank-Zinsstatistik als Referenz beilegen).",
    "Besicherung regeln (Grundschuld oder Rangruecktritt explizit vereinbaren und begruenden).",
    "Zins- und Tilgungszahlungen tatsaechlich und puenktlich ausfuehren (Dauerauftrag).",
    "Gesellschafterbeschluss in beiden GmbHs dokumentieren.",
    "Vertrag dem Steuerberater VOR Unterschrift vorlegen (vGA-Risiko bei Schwestergesellschaften).",
]


class Tranche(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    kind: Literal["bank_loan", "shareholder_loan", "seller_loan", "equity"]
    label: str = ""
    amount: Decimal
    interest_rate_percent: Decimal = Decimal("0")
    amortization_rate_percent: Decimal = Decimal("0")
    interest_fixation_years: int = 10


class CapitalStackInput(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = "Stack A"
    all_in_purchase_price: Decimal
    net_operating_income: Decimal
    tranches: list[Tranche]
    borrower_effective_tax_rate_percent: Decimal = Decimal("15.825")
    lender_effective_tax_rate_percent: Decimal = Decimal("30.0")
    annual_depreciation: Decimal = Decimal("0")


class TrancheResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    kind: str
    label: str
    amount: Decimal
    year_one_interest: Decimal
    year_one_payment: Decimal


class CapitalStackResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    total_debt: Decimal
    total_equity: Decimal
    funding_gap: Decimal
    blended_interest_rate_percent: Optional[Decimal]
    annual_debt_service: Decimal
    dscr: Optional[Decimal]
    monthly_cashflow_before_tax: Decimal
    monthly_cashflow_after_tax_approx: Decimal
    annual_tax_approx: Decimal
    tranches: list[TrancheResult]
    intercompany_interest_annual: Decimal
    intercompany_tax_leakage_annual: Decimal
    intercompany_note: Optional[str]
    fremdvergleich_checklist: list[str]
    warnings: list[str]


def analyze_capital_stack(data: CapitalStackInput) -> CapitalStackResult:
    warnings: list[str] = []
    tranche_results: list[TrancheResult] = []
    total_debt = Decimal("0")
    total_equity = Decimal("0")
    annual_debt_service = Decimal("0")
    annual_interest = Decimal("0")
    intercompany_interest = Decimal("0")

    for tranche in data.tranches:
        if tranche.kind == "equity":
            total_equity += tranche.amount
            tranche_results.append(
                TrancheResult(
                    kind=tranche.kind,
                    label=tranche.label or "Eigenkapital",
                    amount=money(tranche.amount),
                    year_one_interest=Decimal("0.00"),
                    year_one_payment=Decimal("0.00"),
                )
            )
            continue
        total_debt += tranche.amount
        interest = tranche.amount * tranche.interest_rate_percent / Decimal("100")
        payment = tranche.amount * (
            tranche.interest_rate_percent + tranche.amortization_rate_percent
        ) / Decimal("100")
        annual_interest += interest
        annual_debt_service += payment
        if tranche.kind == "shareholder_loan":
            intercompany_interest += interest
        tranche_results.append(
            TrancheResult(
                kind=tranche.kind,
                label=tranche.label or tranche.kind,
                amount=money(tranche.amount),
                year_one_interest=money(interest),
                year_one_payment=money(payment),
            )
        )

    funding_gap = data.all_in_purchase_price - total_debt - total_equity
    if funding_gap > Decimal("0.5"):
        warnings.append(
            f"Finanzierungsluecke von {money(funding_gap)} EUR: Tranchen decken den All-in-Kaufpreis nicht."
        )
    elif funding_gap < Decimal("-0.5"):
        warnings.append(
            f"Ueberfinanzierung von {money(-funding_gap)} EUR: Tranchen uebersteigen den All-in-Kaufpreis."
        )

    blended_rate = (
        (annual_interest / total_debt * Decimal("100")) if total_debt > 0 else None
    )

    cashflow_before_tax = data.net_operating_income - annual_debt_service
    taxable = data.net_operating_income - annual_interest - data.annual_depreciation
    annual_tax = max(taxable, Decimal("0")) * data.borrower_effective_tax_rate_percent / Decimal("100")
    cashflow_after_tax = cashflow_before_tax - annual_tax

    dscr = (
        data.net_operating_income / annual_debt_service if annual_debt_service > 0 else None
    )
    if dscr is not None and dscr < Decimal("1.10"):
        warnings.append("DSCR unter 1,10 - die Bank wird das Objekt so kaum finanzieren, Stack anpassen.")

    # Intercompany loans cost the group money: interest income is taxed at the
    # operating GmbH's full rate, the deduction at the vvGmbH only saves the
    # reduced rate.
    leakage_rate = (
        data.lender_effective_tax_rate_percent - data.borrower_effective_tax_rate_percent
    ) / Decimal("100")
    leakage = intercompany_interest * leakage_rate if intercompany_interest > 0 else Decimal("0")
    intercompany_note = None
    if intercompany_interest > 0:
        intercompany_note = (
            f"Jeder Euro Zins an die operative GmbH kostet die Gruppe netto ~{data.lender_effective_tax_rate_percent - data.borrower_effective_tax_rate_percent}% Steuern "
            f"(Zinsertrag dort voll steuerpflichtig, Abzug in der vvGmbH nur zu {data.borrower_effective_tax_rate_percent}%). "
            "Gesellschafterdarlehen daher fremdueblich, aber so niedrig verzinst wie vertretbar - und eher als Bruecke statt Dauerfinanzierung nutzen."
        )

    return CapitalStackResult(
        name=data.name,
        total_debt=money(total_debt),
        total_equity=money(total_equity),
        funding_gap=money(funding_gap),
        blended_interest_rate_percent=blended_rate.quantize(CENT) if blended_rate is not None else None,
        annual_debt_service=money(annual_debt_service),
        dscr=dscr.quantize(CENT) if dscr is not None else None,
        monthly_cashflow_before_tax=money(cashflow_before_tax / Decimal("12")),
        monthly_cashflow_after_tax_approx=money(cashflow_after_tax / Decimal("12")),
        annual_tax_approx=money(annual_tax),
        tranches=tranche_results,
        intercompany_interest_annual=money(intercompany_interest),
        intercompany_tax_leakage_annual=money(leakage),
        intercompany_note=intercompany_note,
        fremdvergleich_checklist=FREMDVERGLEICH_CHECKLIST if intercompany_interest > 0 else [],
        warnings=warnings,
    )


class GiftPropertyInput(BaseModel):
    """A paid-off property gifted by parents (held > 10 years), evaluated as an
    equity lever for the vvGmbH. Defaults reflect the Chemnitz case."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    market_value: Decimal = Decimal("80000")
    building_share_percent: Decimal = Decimal("80")
    achievable_cold_rent_monthly: Decimal = Decimal("400")
    non_recoverable_costs_monthly: Decimal = Decimal("60")
    federal_state: str = "Sachsen"
    donor_holding_years: int = 20
    personal_marginal_tax_rate_percent: Decimal = Decimal("42")
    gmbh_effective_tax_rate_percent: Decimal = Decimal("15.825")
    depreciation_rate_percent: Decimal = Decimal("2.0")
    notary_percent: Decimal = Decimal("1.5")
    remaining_private_afa_annual: Decimal = Decimal("0")


class GiftPropertyStrategy(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    code: str
    title: str
    one_time_costs_eur: Decimal
    annual_tax_on_rent_eur: Decimal
    annual_afa_tax_shield_eur: Decimal
    liquidity_unlocked_eur: Decimal
    net_annual_rent_after_tax_eur: Decimal
    pros: list[str]
    cons: list[str]
    steuerberater_questions: list[str]


class GiftPropertyComparison(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    assumptions: dict
    prerequisite_warning: str
    strategies: list[GiftPropertyStrategy]
    disclaimer: str


def compare_gift_property_strategies(data: GiftPropertyInput) -> GiftPropertyComparison:
    grest_percent = transfer_tax_percent_for_state(data.federal_state) or Decimal("6.5")
    annual_rent = (data.achievable_cold_rent_monthly - data.non_recoverable_costs_monthly) * Decimal("12")
    annual_rent = max(annual_rent, Decimal("0"))
    transaction_costs = data.market_value * (grest_percent + data.notary_percent) / Decimal("100")
    new_afa = (
        data.market_value
        * data.building_share_percent
        / Decimal("100")
        * data.depreciation_rate_percent
        / Decimal("100")
    )

    personal_rate = data.personal_marginal_tax_rate_percent / Decimal("100")
    gmbh_rate = data.gmbh_effective_tax_rate_percent / Decimal("100")

    # A: keep private
    private_taxable = max(annual_rent - data.remaining_private_afa_annual, Decimal("0"))
    private_tax = private_taxable * personal_rate
    keep_private = GiftPropertyStrategy(
        code="keep_private",
        title="Privat behalten und vermieten",
        one_time_costs_eur=Decimal("0"),
        annual_tax_on_rent_eur=money(private_tax),
        annual_afa_tax_shield_eur=money(data.remaining_private_afa_annual * personal_rate),
        liquidity_unlocked_eur=Decimal("0"),
        net_annual_rent_after_tax_eur=money(annual_rent - private_tax),
        pros=[
            "Keine Transaktionskosten, kein Aufwand.",
            "Privater Verkauf bleibt jederzeit steuerfrei (Spekulationsfrist der Eltern laeuft mit, 20 Jahre > 10).",
        ],
        cons=[
            "Mieteinkuenfte zum persoenlichen Spitzensteuersatz.",
            "AfA-Basis der Eltern ist nach 20 Jahren weitgehend verbraucht (Fussstapfentheorie) - kaum Abschreibung.",
            "Eigenkapital bleibt in der Wohnung gebunden.",
        ],
        steuerberater_questions=[
            "Wie hoch ist die uebernommene Rest-AfA aus der Anschaffung der Eltern tatsaechlich?",
        ],
    )

    # B: sell to own vvGmbH at market value
    gmbh_taxable = max(annual_rent - new_afa, Decimal("0"))
    gmbh_tax = gmbh_taxable * gmbh_rate
    sell_to_gmbh = GiftPropertyStrategy(
        code="sell_to_gmbh",
        title="An die eigene vvGmbH verkaufen (AfA-Step-up)",
        one_time_costs_eur=money(transaction_costs),
        annual_tax_on_rent_eur=money(gmbh_tax),
        annual_afa_tax_shield_eur=money(new_afa * gmbh_rate),
        liquidity_unlocked_eur=money(data.market_value),
        net_annual_rent_after_tax_eur=money(annual_rent - gmbh_tax),
        pros=[
            "Verkauf ist privat steuerfrei (geerbte Haltefrist der Eltern > 10 Jahre, Paragraf 23 EStG).",
            f"GmbH schreibt neu auf den vollen Verkehrswert ab: ~{money(new_afa)} EUR AfA/Jahr statt fast null.",
            "Kaufpreisforderung wird zum Verkaeuferdarlehen: steuerfrei entnehmbares Eigenkapital fuer weitere Kaeufe.",
            "Mietertrag kuenftig nur mit ~15,8% in der vvGmbH besteuert.",
        ],
        cons=[
            f"Einmalkosten ~{money(transaction_costs)} EUR (GrESt {grest_percent}% {data.federal_state} + Notar/Grundbuch).",
            "Verkehrswert muss belastbar dokumentiert sein (Gutachten/Maklerwertermittlung), sonst vGA/verdeckte Einlage.",
            "Wohnung haengt danach in der GmbH - spaetere Entnahme nur ueber Verkauf oder Ausschuettung.",
        ],
        steuerberater_questions=[
            "Bestaetigen: Schenkung an mich persoenlich, NICHT an die GmbH (Freibetrag 400k je Elternteil, sonst Klasse III).",
            "Bestaetigen: Veraeusserung an die vvGmbH nach Schenkung ist privat steuerfrei (Fussstapfentheorie Paragraf 23 EStG).",
            "Kaufpreis fremdueblich dokumentieren - reicht eine Maklerwertermittlung oder braucht es ein Kurzgutachten?",
            "Zaehlt der Verkauf an die eigene GmbH fuer die 3-Objekt-Grenze (gewerblicher Grundstueckshandel)?",
            "Verkaeuferdarlehen: Konditionen und Rangruecktritt so gestalten, dass die Bankfinanzierung nicht leidet.",
            "Gefaehrdet irgendetwas die erweiterte Gewerbesteuerkuerzung der vvGmbH (Paragraf 9 Nr. 1 S. 2 GewStG)?",
        ],
    )

    # C: contribute (Einlage)
    contribute = GiftPropertyStrategy(
        code="contribute_to_gmbh",
        title="In die vvGmbH einlegen (Sacheinlage)",
        one_time_costs_eur=money(transaction_costs),
        annual_tax_on_rent_eur=money(gmbh_tax),
        annual_afa_tax_shield_eur=money(new_afa * gmbh_rate),
        liquidity_unlocked_eur=Decimal("0"),
        net_annual_rent_after_tax_eur=money(annual_rent - gmbh_tax),
        pros=[
            "Staerkt das Eigenkapital der GmbH fuer Bankgespraeche (Bilanz statt Darlehen).",
            "AfA-Step-up auf den Teilwert moeglich, Mietertrag zu ~15,8%.",
        ],
        cons=[
            "GrESt faellt trotzdem an, aber es fliesst kein Kaufpreis - kein Liquiditaetshebel.",
            "Bewertung und bilanzielle Behandlung (offene vs. verdeckte Einlage) sind fehleranfaellig.",
        ],
        steuerberater_questions=[
            "Offene Einlage gegen neue Anteile vs. Zuzahlung in die Kapitalruecklage - was passt hier?",
            "AfA-Bemessungsgrundlage nach Einlage bestaetigen.",
        ],
    )

    # D: keep private, pledge as collateral
    collateral = GiftPropertyStrategy(
        code="pledge_as_collateral",
        title="Privat behalten, als Zusatzsicherheit fuer Bankfinanzierung",
        one_time_costs_eur=money(data.market_value * Decimal("0.005")),
        annual_tax_on_rent_eur=money(private_tax),
        annual_afa_tax_shield_eur=money(data.remaining_private_afa_annual * personal_rate),
        liquidity_unlocked_eur=money(data.market_value * Decimal("0.6")),
        net_annual_rent_after_tax_eur=money(annual_rent - private_tax),
        pros=[
            "Keine GrESt, nur Grundschuldbestellung (~0,5%).",
            "Ermoeglicht 100%+-Finanzierung des naechsten GmbH-Kaufs ohne Eigenkapitalverzehr.",
            "Wohnung bleibt privat und steuerfrei veraeusserbar.",
        ],
        cons=[
            "Privates Vermoegen haftet fuer GmbH-Schulden - das ist genau das, was die GmbH eigentlich trennen soll.",
            "Banken akzeptieren Drittsicherheiten nicht immer und bewerten sie konservativ (~60% Beleihungswert).",
            "Steuerlich aendert sich nichts: hohe Besteuerung der Miete, kaum AfA.",
        ],
        steuerberater_questions=[
            "Haftungsrisiko Drittsicherheit vs. Buergschaft - was ist im Ernstfall begrenzbarer?",
        ],
    )

    return GiftPropertyComparison(
        assumptions={
            "market_value": float(data.market_value),
            "federal_state": data.federal_state,
            "transfer_tax_percent": float(grest_percent),
            "achievable_cold_rent_monthly": float(data.achievable_cold_rent_monthly),
            "annual_net_rent": float(annual_rent),
            "new_afa_annual": float(money(new_afa)),
            "personal_marginal_tax_rate_percent": float(data.personal_marginal_tax_rate_percent),
            "gmbh_effective_tax_rate_percent": float(data.gmbh_effective_tax_rate_percent),
        },
        prerequisite_warning=(
            "Voraussetzung fuer alle GmbH-Varianten: Die Schenkung der Eltern geht an dich PERSOENLICH "
            "(Freibetrag 400.000 EUR je Elternteil), erst danach Verkauf/Einlage in die GmbH. "
            "Reihenfolge und Fristen unbedingt mit dem Steuerberater festlegen, bevor irgendetwas beurkundet wird."
        ),
        strategies=[keep_private, sell_to_gmbh, contribute, collateral],
        disclaimer=(
            "Vereinfachte Modellrechnung, keine Steuerberatung. Saemtliche Werte (Verkehrswert, AfA-Satz, "
            "Gebaeudeanteil, persoenlicher Steuersatz) mit dem Steuerberater verifizieren."
        ),
    )
