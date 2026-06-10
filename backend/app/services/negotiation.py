from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from pydantic import BaseModel, ConfigDict


# Rough full-renovation cost per sqm to lift a unit's energy performance to
# roughly class C (heating, windows, insulation share for the unit). These are
# negotiation anchors, not a Sanierungsfahrplan.
ENERGY_RETROFIT_COST_PER_SQM = {
    "H": Decimal("950"),
    "G": Decimal("800"),
    "F": Decimal("650"),
    "E": Decimal("450"),
    "D": Decimal("250"),
}

NON_RECOVERABLE_BENCHMARK_PER_SQM = Decimal("0.60")  # EUR per sqm per month

SELLER_ANGLES = {
    "inheritance": "Erbengemeinschaften wollen meist schnell und konfliktfrei verkaufen. Betone: GmbH-Kaeufer, Finanzierung steht, Notartermin in 4 Wochen moeglich, keine Finanzierungsvorbehalts-Hängepartie.",
    "divorce": "Bei Trennungsverkaeufen zaehlt Abwicklungssicherheit. Betone Diskretion, feste Timeline und Verzicht auf Nachverhandlung nach Besichtigung - gegen einen fairen Abschlag heute.",
    "financing_pressure": "Bei Anschlussfinanzierungs- oder Liquiditaetsdruck ist Geschwindigkeit das Produkt. Biete schnellen Notartermin und kurze Zahlungsfrist gegen Preisabschlag.",
    "tired_landlord": "Vermuedete Vermieter kaufen sich Ruhe. Betone: Kauf im vermieteten Zustand, keine Bedingungen, Uebernahme aller Unterlagenbeschaffung.",
    "relocation": "Bei Wegzug zaehlt Planbarkeit. Flexibler Uebergabetermin als Zugestaendnis, Preis als Gegenleistung.",
    "unknown": "Verkaeufermotiv unbekannt - im Erstgespraech offen fragen, warum verkauft wird und seit wann. Das Motiv bestimmt, welches Zugestaendnis (Tempo, Sicherheit, Flexibilitaet) du gegen Preis tauschen kannst.",
}


class NegotiationContext(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    asking_price: Decimal
    living_area_sqm: Optional[Decimal] = None
    energy_class: Optional[str] = None
    construction_year: Optional[int] = None
    price_per_sqm: Optional[Decimal] = None
    market_price_per_sqm: Optional[Decimal] = None
    monthly_cold_rent: Optional[Decimal] = None
    market_rent_monthly: Optional[Decimal] = None
    legally_plausible_target_rent_per_sqm: Optional[Decimal] = None
    rent_control_area: bool = False
    house_money_monthly: Optional[Decimal] = None
    non_recoverable_costs_monthly: Optional[Decimal] = None
    maintenance_reserve_weg: Optional[Decimal] = None
    expected_initial_capex: Optional[Decimal] = None
    monthly_cashflow_before_tax: Optional[Decimal] = None
    dscr: Optional[Decimal] = None
    target_net_yield_percent: Decimal = Decimal("4.0")
    maximum_purchase_price_for_target_yield: Optional[Decimal] = None
    days_on_market: Optional[int] = None
    price_reduction_total_percent: Optional[Decimal] = None
    price_reduction_count: int = 0
    weg_health_score: Optional[int] = None
    weg_flags: list[str] = []
    weg_unfunded_measures_eur: Optional[Decimal] = None
    seller_motive: Optional[str] = None


class NegotiationArgument(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    code: str
    title: str
    evidence: str
    estimated_discount_eur: Optional[Decimal] = None
    script_line: str
    strength: str  # hard | medium | soft


class PriceLadder(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    asking_price: Decimal
    anchor_price: Decimal
    target_price: Decimal
    walk_away_price: Decimal
    notes: list[str]


class NegotiationDossier(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    arguments: list[NegotiationArgument]
    leverage: list[str]
    total_justified_discount_eur: Decimal
    price_ladder: PriceLadder
    seller_angle: str
    opening_script: list[str]
    disclaimer: str


def _round_price(value: Decimal) -> Decimal:
    # Precise-looking numbers (147.500 statt 150.000) signal a calculated
    # position; round to 500.
    return (value / Decimal("500")).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * Decimal("500")


def build_negotiation_dossier(ctx: NegotiationContext) -> NegotiationDossier:
    arguments: list[NegotiationArgument] = []
    leverage: list[str] = []
    yield_rate = ctx.target_net_yield_percent / Decimal("100")

    # 1) Energy class: retrofit cost belongs to the buyer's price.
    energy = (ctx.energy_class or "").upper()
    if energy in ENERGY_RETROFIT_COST_PER_SQM and ctx.living_area_sqm:
        cost = ENERGY_RETROFIT_COST_PER_SQM[energy] * ctx.living_area_sqm
        arguments.append(
            NegotiationArgument(
                code="energy_retrofit",
                title=f"Energieklasse {energy}: Sanierungskosten einpreisen",
                evidence=(
                    f"Sanierung auf ~Klasse C kostet ueberschlaegig {ENERGY_RETROFIT_COST_PER_SQM[energy]} EUR/m2 "
                    f"x {ctx.living_area_sqm} m2. Ab 2030+ drohen zudem regulatorische Anforderungen (EU-Gebaeuderichtlinie)."
                ),
                estimated_discount_eur=cost,
                script_line=(
                    f"Der Energieausweis weist Klasse {energy} aus. Jeder Kaeufer muss hier mittelfristig sanieren - "
                    f"das sind realistisch rund {int(cost):,} Euro, die vom Preis abgehen muessen.".replace(",", ".")
                ),
                strength="hard",
            )
        )

    # 2) Open capex is a euro-for-euro deduction.
    if ctx.expected_initial_capex and ctx.expected_initial_capex > 0:
        arguments.append(
            NegotiationArgument(
                code="initial_capex",
                title="Investitionsstau / Anfangsinvestitionen",
                evidence=f"Identifizierter Sofort-Capex: {ctx.expected_initial_capex} EUR (Bad, Elektrik, Boeden o.ae.).",
                estimated_discount_eur=ctx.expected_initial_capex,
                script_line="Die Wohnung ist nicht vermietbar-fertig. Was ich sofort investieren muss, kann ich nicht zweimal bezahlen - einmal im Preis und einmal auf der Baustelle.",
                strength="hard",
            )
        )

    # 3) Excess non-recoverable costs, capitalized at the target yield.
    if (
        ctx.non_recoverable_costs_monthly is not None
        and ctx.living_area_sqm
        and ctx.living_area_sqm > 0
        and yield_rate > 0
    ):
        benchmark = NON_RECOVERABLE_BENCHMARK_PER_SQM * ctx.living_area_sqm
        excess = ctx.non_recoverable_costs_monthly - benchmark
        if excess > 0:
            capitalized = excess * Decimal("12") / yield_rate
            arguments.append(
                NegotiationArgument(
                    code="non_recoverable_costs",
                    title="Ueberhoehte nicht umlagefaehige Kosten",
                    evidence=(
                        f"Nicht umlagefaehig: {ctx.non_recoverable_costs_monthly} EUR/Monat vs. ~{benchmark.quantize(Decimal('1'))} EUR Benchmark. "
                        f"Mehrkosten kapitalisiert mit {ctx.target_net_yield_percent}% Zielrendite."
                    ),
                    estimated_discount_eur=capitalized,
                    script_line="Das Hausgeld enthaelt ungewoehnlich hohe nicht umlagefaehige Kosten. Die mindern dauerhaft den Ertrag und damit den Wert.",
                    strength="medium",
                )
            )

    # 4) Rent upside is legally capped: kill the 'market rent potential' pitch.
    if (
        ctx.rent_control_area
        and ctx.legally_plausible_target_rent_per_sqm is not None
        and ctx.market_rent_monthly is not None
        and ctx.living_area_sqm
        and yield_rate > 0
    ):
        legal_rent_monthly = ctx.legally_plausible_target_rent_per_sqm * ctx.living_area_sqm
        gap = ctx.market_rent_monthly - legal_rent_monthly
        if gap > 0:
            capitalized = gap * Decimal("12") / yield_rate
            arguments.append(
                NegotiationArgument(
                    code="rent_legally_capped",
                    title="Mietsteigerung rechtlich gedeckelt",
                    evidence=(
                        f"Marktmiete {ctx.market_rent_monthly} EUR vs. rechtlich plausible Miete "
                        f"{legal_rent_monthly.quantize(Decimal('1'))} EUR (Mietpreisbremse). Differenz kapitalisiert."
                    ),
                    estimated_discount_eur=capitalized,
                    script_line="Das Expose rechnet mit Marktmiete - die Mietpreisbremse laesst das hier aber nicht zu. Ich kann nur bewerten, was ich legal einnehmen darf.",
                    strength="medium",
                )
            )

    # 5) Overpricing vs. market benchmark per sqm.
    if (
        ctx.price_per_sqm
        and ctx.market_price_per_sqm
        and ctx.market_price_per_sqm > 0
        and ctx.living_area_sqm
    ):
        premium = ctx.price_per_sqm - ctx.market_price_per_sqm
        if premium > 0:
            arguments.append(
                NegotiationArgument(
                    code="above_market_price",
                    title="Preis ueber Vergleichsniveau",
                    evidence=(
                        f"Angebot: {ctx.price_per_sqm.quantize(Decimal('1'))} EUR/m2, Vergleichsniveau: "
                        f"{ctx.market_price_per_sqm.quantize(Decimal('1'))} EUR/m2."
                    ),
                    estimated_discount_eur=premium * ctx.living_area_sqm,
                    script_line="Vergleichbare Wohnungen in der Lage handeln deutlich darunter. Ich kaufe regelmaessig und kenne die Abschluesse - nicht die Angebotspreise.",
                    strength="medium",
                )
            )

    # 6) WEG findings.
    if ctx.weg_unfunded_measures_eur and ctx.weg_unfunded_measures_eur > 0:
        arguments.append(
            NegotiationArgument(
                code="weg_unfunded_measures",
                title="Beschlossene Massnahmen ohne Ruecklagendeckung",
                evidence=f"Nicht durch Ruecklage gedeckte Massnahmen: {ctx.weg_unfunded_measures_eur} EUR (anteilige Sonderumlage droht).",
                estimated_discount_eur=ctx.weg_unfunded_measures_eur,
                script_line="In den Protokollen stehen Massnahmen, die die Ruecklage nicht hergibt. Die Sonderumlage zahlt der neue Eigentuemer - also gehoert sie in den Preis.",
                strength="hard",
            )
        )
    elif ctx.weg_health_score is not None and ctx.weg_health_score < 50:
        arguments.append(
            NegotiationArgument(
                code="weg_health_weak",
                title="Schwache WEG-Substanz",
                evidence=f"WEG-Gesundheitsscore {ctx.weg_health_score}/100 (Ruecklage, Rueckstaende, Governance). Flags: {', '.join(ctx.weg_flags) or 'siehe Detail'}.",
                estimated_discount_eur=None,
                script_line="Die Gemeinschaft ist das eigentliche Risiko bei einer Eigentumswohnung. Hier kaufe ich erkennbare Probleme mit - das geht nur ueber den Preis.",
                strength="medium",
            )
        )

    # 7) Cashflow reality check: the asking price simply doesn't carry itself.
    if ctx.monthly_cashflow_before_tax is not None and ctx.monthly_cashflow_before_tax < 0:
        arguments.append(
            NegotiationArgument(
                code="negative_cashflow",
                title="Objekt traegt sich zum Angebotspreis nicht",
                evidence=(
                    f"Cashflow vor Steuern: {ctx.monthly_cashflow_before_tax} EUR/Monat bei marktueblicher Finanzierung"
                    + (f", DSCR {ctx.dscr}" if ctx.dscr is not None else "")
                    + "."
                ),
                estimated_discount_eur=None,
                script_line="Bei diesem Preis ist die Wohnung mit aktueller Finanzierung ein Zuschussgeschaeft. Das rechnet keinem professionellen Kaeufer - und Eigennutzer kaufen diese Lage selten.",
                strength="medium",
            )
        )

    # Leverage from listing history.
    if ctx.days_on_market is not None and ctx.days_on_market >= 60:
        leverage.append(
            f"Objekt ist seit {ctx.days_on_market} Tagen am Markt - der Markt hat den Preis bereits beantwortet."
        )
    if ctx.price_reduction_count > 0 and ctx.price_reduction_total_percent:
        leverage.append(
            f"Bereits {ctx.price_reduction_count}x reduziert (insgesamt {ctx.price_reduction_total_percent}%). Weitere Wartezeit kostet den Verkaeufer Geld."
        )
    if not leverage:
        leverage.append("Keine Markthistorie verfuegbar - Angebotsdauer und fruehere Preise beim Makler erfragen.")

    quantified = [a.estimated_discount_eur for a in arguments if a.estimated_discount_eur]
    total_discount = sum(quantified, Decimal("0"))
    # Cap the openly claimed discount at 30% of asking to stay credible.
    credible_discount = min(total_discount, ctx.asking_price * Decimal("0.30"))

    walk_away = ctx.maximum_purchase_price_for_target_yield or (ctx.asking_price - credible_discount)
    target = min(ctx.asking_price - credible_discount, walk_away)
    target = max(target, Decimal("0"))
    anchor = target * Decimal("0.93")

    ladder_notes = [
        f"Walk-away = maximaler Preis fuer {ctx.target_net_yield_percent}% Nettoanfangsrendite. Darueber wird nicht gekauft.",
        "Zielpreis = Angebotspreis minus belegbare Abschlaege (gedeckelt bei 30%), nie ueber Walk-away.",
        "Anker = Zielpreis minus Verhandlungsspielraum (~7%). Praezise Zahl nennen, nicht runden.",
    ]
    if walk_away >= ctx.asking_price:
        ladder_notes.append(
            "Achtung: Walk-away liegt ueber dem Angebotspreis - der Deal funktioniert schon zum Angebotspreis. Trotzdem Abschlaege mitnehmen."
        )

    motive = (ctx.seller_motive or "unknown").lower()
    seller_angle = SELLER_ANGLES.get(motive, SELLER_ANGLES["unknown"])

    opening_script = [
        "1. Interesse bestaetigen, dann Motiv erfragen: 'Was ist der Hintergrund des Verkaufs - und bis wann wollen Sie abgeschlossen haben?'",
        "2. Staerkstes Hard-Argument zuerst, mit Zahl und Quelle. Nie alle Argumente auf einmal verbrennen.",
        f"3. Anker setzen: {_round_price(anchor)} EUR, begruendet ueber die Abschlagsliste.",
        "4. Zugestaendnisse nur tauschen, nie schenken: Tempo/Sicherheit gegen Preis.",
        f"5. Bei {_round_price(walk_away)} EUR ist Schluss - freundlich, aber endgueltig.",
    ]

    return NegotiationDossier(
        arguments=arguments,
        leverage=leverage,
        total_justified_discount_eur=total_discount.quantize(Decimal("1")),
        price_ladder=PriceLadder(
            asking_price=ctx.asking_price,
            anchor_price=_round_price(anchor),
            target_price=_round_price(target),
            walk_away_price=_round_price(walk_away),
            notes=ladder_notes,
        ),
        seller_angle=seller_angle,
        opening_script=opening_script,
        disclaimer=(
            "Alle Betraege sind Modellwerte als Verhandlungsgrundlage, keine Gutachten. "
            "Sanierungskosten vor Abgabe eines bindenden Angebots durch Handwerker/Gutachter verifizieren."
        ),
    )
