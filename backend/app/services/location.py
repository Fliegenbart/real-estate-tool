from __future__ import annotations

from typing import Optional

from app.services.scoring import LocationMetricsInput


class LocationEnrichmentService:
    def enrich(self, city: Optional[str], postal_code: Optional[str]) -> LocationMetricsInput:
        raise NotImplementedError


class MockLocationEnrichmentService(LocationEnrichmentService):
    """Placeholder for future licensed/open-data location enrichment."""

    city_profiles = {
        "Leipzig": LocationMetricsInput(
            population_trend_score=82,
            vacancy_risk_score=74,
            purchasing_power_score=67,
            public_transport_score=80,
            employer_access_score=75,
            micro_location_score=78,
            noise_risk_score=68,
            flood_risk_score=72,
        ),
        "Dresden": LocationMetricsInput(
            population_trend_score=76,
            vacancy_risk_score=72,
            purchasing_power_score=72,
            public_transport_score=78,
            employer_access_score=76,
            micro_location_score=74,
            noise_risk_score=70,
            flood_risk_score=76,
        ),
        "Dortmund": LocationMetricsInput(
            population_trend_score=63,
            vacancy_risk_score=64,
            purchasing_power_score=61,
            public_transport_score=70,
            employer_access_score=68,
            micro_location_score=62,
            noise_risk_score=58,
            flood_risk_score=70,
        ),
        "Berlin": LocationMetricsInput(
            population_trend_score=88,
            vacancy_risk_score=86,
            purchasing_power_score=78,
            public_transport_score=92,
            employer_access_score=90,
            micro_location_score=84,
            noise_risk_score=54,
            flood_risk_score=75,
        ),
        "Hamburg": LocationMetricsInput(
            population_trend_score=82,
            vacancy_risk_score=80,
            purchasing_power_score=82,
            public_transport_score=86,
            employer_access_score=84,
            micro_location_score=78,
            noise_risk_score=58,
            flood_risk_score=62,
        ),
        "Munich": LocationMetricsInput(
            population_trend_score=86,
            vacancy_risk_score=88,
            purchasing_power_score=92,
            public_transport_score=90,
            employer_access_score=92,
            micro_location_score=86,
            noise_risk_score=62,
            flood_risk_score=78,
        ),
        "Essen": LocationMetricsInput(
            population_trend_score=58,
            vacancy_risk_score=61,
            purchasing_power_score=59,
            public_transport_score=68,
            employer_access_score=66,
            micro_location_score=56,
            noise_risk_score=60,
            flood_risk_score=68,
        ),
        "Hannover": LocationMetricsInput(
            population_trend_score=67,
            vacancy_risk_score=68,
            purchasing_power_score=69,
            public_transport_score=78,
            employer_access_score=73,
            micro_location_score=69,
            noise_risk_score=64,
            flood_risk_score=72,
        ),
    }

    def enrich(self, city: Optional[str], postal_code: Optional[str]) -> LocationMetricsInput:
        if city in self.city_profiles:
            return self.city_profiles[city]
        return LocationMetricsInput()
