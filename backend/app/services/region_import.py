from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation
from statistics import median
from typing import Any, Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import DataSource, Listing, Region, RegionMetric

OWN_FLOW_SOURCE_NAME = "Eigener Listing-Zufluss"


class MetricColumn(BaseModel):
    column: str
    metric: str
    year: Optional[int] = None


class RegionImportConfig(BaseModel):
    """Flexible CSV mapping so INKAR-/Zensus-/Wegweiser-Exporte can be fed
    without code changes: name the AGS/name columns and map value columns to
    canonical metric keys."""

    content: str
    delimiter: str = ";"
    level: str = "gemeinde"
    source_name: str
    name_column: str
    ags_column: Optional[str] = None
    state_column: Optional[str] = None
    population_column: Optional[str] = None
    metrics: list[MetricColumn]


def parse_german_number(raw: Any) -> Optional[Decimal]:
    if raw is None:
        return None
    text = str(raw).strip().replace(" ", "")
    if text in ("", "-", ".", "x", "k.A."):
        return None
    text = text.replace(".", "").replace(",", ".") if "," in text else text
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def get_or_create_source(db: Session, name: str) -> DataSource:
    source = db.query(DataSource).filter(DataSource.name == name).first()
    if source is None:
        source = DataSource(name=name, data_type="region_metrics", reliability_score=60)
        db.add(source)
        db.flush()
    return source


def find_or_create_region(
    db: Session,
    name: str,
    level: str,
    ags: Optional[str] = None,
    federal_state: Optional[str] = None,
    population: Optional[int] = None,
) -> Region:
    region: Optional[Region] = None
    if ags:
        region = db.query(Region).filter(Region.ags == ags).first()
    if region is None:
        region = (
            db.query(Region)
            .filter(Region.level == level)
            .filter(Region.name.ilike(name.strip()))
            .first()
        )
    if region is None:
        region = Region(name=name.strip(), level=level)
        db.add(region)
        db.flush()
    if ags and not region.ags:
        region.ags = ags
    if federal_state and not region.federal_state:
        region.federal_state = federal_state
    if population:
        region.population = population
    return region


def set_metric(
    db: Session,
    region: Region,
    metric: str,
    value: Decimal,
    source_id: Optional[int],
    year: Optional[int] = None,
) -> None:
    """Latest value wins: one row per (region, metric)."""
    db.query(RegionMetric).filter(
        RegionMetric.region_id == region.id, RegionMetric.metric == metric
    ).delete()
    db.add(
        RegionMetric(region_id=region.id, metric=metric, value=value, year=year, source_id=source_id)
    )


def import_region_csv(db: Session, config: RegionImportConfig) -> dict[str, int]:
    source = get_or_create_source(db, config.source_name)
    reader = csv.DictReader(io.StringIO(config.content), delimiter=config.delimiter)
    regions_touched = 0
    metrics_written = 0
    for row in reader:
        name = (row.get(config.name_column) or "").strip()
        if not name:
            continue
        population = None
        if config.population_column:
            population_value = parse_german_number(row.get(config.population_column))
            population = int(population_value) if population_value is not None else None
        region = find_or_create_region(
            db,
            name=name,
            level=config.level,
            ags=(row.get(config.ags_column) or "").strip() or None if config.ags_column else None,
            federal_state=(row.get(config.state_column) or "").strip() or None
            if config.state_column
            else None,
            population=population,
        )
        regions_touched += 1
        for mapping in config.metrics:
            value = parse_german_number(row.get(mapping.column))
            if value is None:
                continue
            set_metric(db, region, mapping.metric, value, source.id, mapping.year)
            metrics_written += 1
    db.commit()
    return {"regions": regions_touched, "metrics": metrics_written}


def refresh_own_market_metrics(db: Session) -> dict[str, int]:
    """Aggregate the own listing flow into per-city metrics. Median price and
    rent per sqm, days on market, price-cut share - data nobody can buy."""
    source = get_or_create_source(db, OWN_FLOW_SOURCE_NAME)
    listings = (
        db.query(Listing)
        .filter(Listing.city.isnot(None), Listing.source != "demo_seed")
        .all()
    )
    by_city: dict[str, list[Listing]] = {}
    for listing in listings:
        by_city.setdefault(listing.city.strip().lower(), []).append(listing)

    cities_updated = 0
    for city_key, rows in by_city.items():
        if len(rows) < 3:
            continue  # below that, a median is noise
        display_name = rows[0].city.strip()
        region = find_or_create_region(db, name=display_name, level="gemeinde")

        prices = [
            row.purchase_price / row.living_area_sqm
            for row in rows
            if row.purchase_price and row.living_area_sqm and row.living_area_sqm > 0
        ]
        rents = [
            row.cold_rent_monthly / row.living_area_sqm
            for row in rows
            if row.cold_rent_monthly and row.living_area_sqm and row.living_area_sqm > 0
        ]
        if prices:
            set_metric(db, region, "own_median_price_eur_sqm", Decimal(str(round(median(prices), 2))), source.id)
        if rents:
            set_metric(db, region, "own_median_rent_eur_sqm", Decimal(str(round(median(rents), 2))), source.id)
        reductions = [row for row in rows if len(row.price_events) > 1]
        set_metric(
            db,
            region,
            "own_price_reduction_share_percent",
            Decimal(str(round(len(reductions) / len(rows) * 100, 1))),
            source.id,
        )
        set_metric(db, region, "own_listing_count", Decimal(len(rows)), source.id)
        cities_updated += 1
    db.commit()
    return {"cities_updated": cities_updated, "listings_considered": len(listings)}
