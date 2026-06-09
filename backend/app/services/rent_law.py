from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from pydantic import BaseModel, ConfigDict


def round_rent(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class RentLawInput(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    current_rent_per_sqm: Optional[Decimal] = None
    market_rent_per_sqm: Optional[Decimal] = None
    local_reference_rent_per_sqm: Optional[Decimal] = None
    rent_control_area: bool = True
    new_building_exception: bool = False
    comprehensive_modernization_exception: bool = False
    previous_rent_exception: bool = False
    tolerance_percent: Decimal = Decimal("10")


class RentLawResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    legally_plausible_target_rent_per_sqm: Optional[Decimal]
    status: str
    confidence: str
    requires_legal_verification: bool
    risk_flags: list[str]
    notes: list[str]


def check_rent_law_plausibility(data: RentLawInput) -> RentLawResult:
    notes: list[str] = []
    risk_flags: list[str] = []
    has_exception = (
        data.new_building_exception
        or data.comprehensive_modernization_exception
        or data.previous_rent_exception
    )

    if has_exception:
        if data.market_rent_per_sqm is None:
            risk_flags.append("missing_market_rent_for_exception_check")
            return RentLawResult(
                legally_plausible_target_rent_per_sqm=None,
                status="missing_data",
                confidence="low",
                requires_legal_verification=True,
                risk_flags=risk_flags,
                notes=["Exception flag is set, but market rent is missing."],
            )
        notes.append("Exception flag set; market rent may be usable but requires legal verification.")
        return RentLawResult(
            legally_plausible_target_rent_per_sqm=round_rent(data.market_rent_per_sqm),
            status="exception_requires_verification",
            confidence="medium",
            requires_legal_verification=True,
            risk_flags=["legal_exception_requires_verification"],
            notes=notes,
        )

    if data.rent_control_area:
        if data.local_reference_rent_per_sqm is None:
            risk_flags.append("missing_local_reference_rent")
            return RentLawResult(
                legally_plausible_target_rent_per_sqm=None,
                status="missing_reference_rent",
                confidence="low",
                requires_legal_verification=True,
                risk_flags=risk_flags,
                notes=["Rent control area is true, but no local reference rent is available."],
            )
        target = data.local_reference_rent_per_sqm * (
            Decimal("1") + data.tolerance_percent / Decimal("100")
        )
        notes.append("Mietpreisbremse plausibility uses local reference rent plus configured tolerance.")
        return RentLawResult(
            legally_plausible_target_rent_per_sqm=round_rent(target),
            status="limited_by_reference_rent",
            confidence="medium",
            requires_legal_verification=True,
            risk_flags=[],
            notes=notes,
        )

    if data.market_rent_per_sqm is None:
        risk_flags.append("missing_market_rent")
        return RentLawResult(
            legally_plausible_target_rent_per_sqm=None,
            status="missing_market_rent",
            confidence="low",
            requires_legal_verification=False,
            risk_flags=risk_flags,
            notes=["No rent control area, but market rent estimate is missing."],
        )

    return RentLawResult(
        legally_plausible_target_rent_per_sqm=round_rent(data.market_rent_per_sqm),
        status="market_rent_plausible",
        confidence="medium",
        requires_legal_verification=False,
        risk_flags=[],
        notes=["No rent control area indicated; market rent is used as first plausibility estimate."],
    )
