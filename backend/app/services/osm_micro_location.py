from __future__ import annotations

import math
import os
from typing import Any, Optional

import httpx
from pydantic import BaseModel

from app.services.micro_location import MicroLocationEvidenceInput


DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"


class OsmMicroLocationInput(BaseModel):
    latitude: float
    longitude: float
    radius_meters: int = 3000
    elements: Optional[list[dict[str, Any]]] = None


def build_overpass_micro_location_query(latitude: float, longitude: float, radius_meters: int = 3000) -> str:
    around = f"(around:{radius_meters},{latitude},{longitude})"
    return f"""
[out:json][timeout:25];
(
  nwr["railway"~"station|halt|tram_stop|subway_entrance"]{around};
  nwr["station"~"subway|light_rail|s-bahn"]{around};
  nwr["public_transport"~"station|stop_position|platform"]{around};
  nwr["highway"="bus_stop"]{around};
  nwr["amenity"="bus_station"]{around};
  nwr["shop"~"supermarket|convenience"]{around};
  nwr["amenity"~"pharmacy|doctors|dentist|clinic|school|kindergarten|childcare|university|hospital|exhibition_centre"]{around};
  nwr["amenity"~"conference_centre|events_venue"]{around};
  nwr["leisure"~"park|sports_centre|fitness_centre|playground"]{around};
  nwr["amenity"~"cinema|theatre|arts_centre|restaurant|cafe"]{around};
  nwr["tourism"~"museum|attraction|theme_park|zoo|aquarium"]{around};
  nwr["tourism"="hotel"]{around};
  nwr["leisure"~"water_park|stadium"]{around};
  nwr["aeroway"~"aerodrome|terminal"]{around};
  nwr["natural"="water"]{around};
  nwr["waterway"~"river|canal"]{around};
  nwr["amenity"~"bar|pub|nightclub"]{around};
  nwr["highway"~"motorway|trunk|primary|secondary"]{around};
  nwr["railway"="rail"]{around};
  nwr["landuse"="industrial"]{around};
);
out center tags;
""".strip()


def fetch_overpass_elements(latitude: float, longitude: float, radius_meters: int = 3000) -> list[dict[str, Any]]:
    endpoint = os.getenv("OVERPASS_API_URL", DEFAULT_OVERPASS_ENDPOINT)
    query = build_overpass_micro_location_query(latitude, longitude, radius_meters)
    response = httpx.post(endpoint, data={"data": query}, timeout=30)
    response.raise_for_status()
    payload = response.json()
    return list(payload.get("elements") or [])


def evidence_from_osm_input(payload: OsmMicroLocationInput) -> MicroLocationEvidenceInput:
    elements = payload.elements
    if elements is None:
        elements = fetch_overpass_elements(payload.latitude, payload.longitude, payload.radius_meters)
    return micro_location_evidence_from_osm_elements(payload.latitude, payload.longitude, elements)


def micro_location_evidence_from_osm_elements(
    latitude: float, longitude: float, elements: list[dict[str, Any]]
) -> MicroLocationEvidenceInput:
    classified = [classify_osm_element(latitude, longitude, element) for element in elements]
    classified = [item for item in classified if item is not None]

    return MicroLocationEvidenceInput(
        nearest_rapid_transit_meters=nearest_distance(classified, "rapid_transit"),
        nearest_regional_rail_meters=nearest_distance(classified, "regional_rail"),
        nearest_bus_stop_meters=nearest_distance(classified, "bus_stop"),
        supermarkets_1000m=count_within(classified, "supermarket", 1000),
        pharmacies_1000m=count_within(classified, "pharmacy", 1000),
        doctors_1500m=count_within(classified, "doctor", 1500),
        schools_1500m=count_within(classified, "school", 1500),
        major_employers_3000m=count_within(classified, "demand_anchor", 3000),
        nearest_university_meters=nearest_distance(classified, "university"),
        nearest_hospital_meters=nearest_distance(classified, "hospital"),
        nearest_trade_fair_meters=nearest_distance(classified, "trade_fair"),
        nearest_event_venue_meters=nearest_distance(classified, "event_venue"),
        hotels_1500m=count_within(classified, "hotel", 1500),
        nearest_airport_meters=nearest_distance(classified, "airport"),
        parks_1000m=count_within(classified, "park", 1000),
        leisure_pois_1500m=count_within(classified, "leisure", 1500),
        cultural_pois_1500m=count_within(classified, "culture", 1500),
        restaurants_1000m=count_within(classified, "restaurant", 1000),
        cafes_1000m=count_within(classified, "cafe", 1000),
        nearest_recreation_anchor_meters=nearest_distance(classified, "recreation_anchor"),
        waterfront_meters=nearest_distance(classified, "waterfront"),
        tourist_anchor_meters=nearest_distance(classified, "tourist_anchor"),
        short_term_rental_legal_status="unclear",
        main_road_meters=nearest_distance(classified, "main_road"),
        rail_noise_meters=nearest_distance(classified, "rail_noise"),
        nightlife_pois_500m=count_within(classified, "nightlife", 500),
        industrial_landuse_meters=nearest_distance(classified, "industrial"),
        source="openstreetmap/overpass",
    )


def classify_osm_element(latitude: float, longitude: float, element: dict[str, Any]) -> Optional[dict[str, Any]]:
    point = element_point(element)
    if point is None:
        return None
    tags = element.get("tags") or {}
    categories = element_categories(tags)
    if not categories:
        return None
    return {
        "categories": categories,
        "distance_meters": int(round(haversine_meters(latitude, longitude, point["lat"], point["lon"]))),
    }


def element_point(element: dict[str, Any]) -> Optional[dict[str, float]]:
    if "lat" in element and "lon" in element:
        return {"lat": float(element["lat"]), "lon": float(element["lon"])}
    center = element.get("center")
    if isinstance(center, dict) and "lat" in center and "lon" in center:
        return {"lat": float(center["lat"]), "lon": float(center["lon"])}
    return None


def element_categories(tags: dict[str, Any]) -> set[str]:
    categories: set[str] = set()
    railway = tags.get("railway")
    public_transport = tags.get("public_transport")
    station = tags.get("station")
    highway = tags.get("highway")
    amenity = tags.get("amenity")
    shop = tags.get("shop")
    leisure = tags.get("leisure")
    tourism = tags.get("tourism")
    natural = tags.get("natural")
    waterway = tags.get("waterway")
    landuse = tags.get("landuse")
    aeroway = tags.get("aeroway")

    if railway in {"station", "halt", "tram_stop", "subway_entrance"} or public_transport in {
        "station",
        "stop_position",
        "platform",
    } or station in {"subway", "light_rail", "s-bahn"}:
        categories.add("rapid_transit")
    if railway == "station":
        categories.add("regional_rail")
    if highway == "bus_stop" or amenity == "bus_station":
        categories.add("bus_stop")
    if shop in {"supermarket", "convenience"}:
        categories.add("supermarket")
    if amenity == "pharmacy":
        categories.add("pharmacy")
    if amenity in {"doctors", "dentist", "clinic"}:
        categories.add("doctor")
    if amenity in {"school", "kindergarten", "childcare"}:
        categories.add("school")
    if amenity == "university":
        categories.update({"university", "demand_anchor"})
    if amenity == "hospital":
        categories.update({"hospital", "demand_anchor"})
    if amenity == "exhibition_centre":
        categories.update({"trade_fair", "demand_anchor"})
    if amenity in {"conference_centre", "events_venue"}:
        categories.update({"trade_fair", "event_venue", "demand_anchor", "tourist_anchor"})
    if tourism == "hotel":
        categories.add("hotel")
    if leisure == "park":
        categories.update({"park", "leisure"})
    if leisure in {"sports_centre", "fitness_centre", "playground"}:
        categories.add("leisure")
    if amenity in {"cinema", "theatre", "arts_centre"} or tourism == "museum":
        categories.update({"culture", "leisure", "tourist_anchor"})
    if amenity == "restaurant":
        categories.update({"restaurant", "leisure"})
    if amenity == "cafe":
        categories.update({"cafe", "leisure"})
    if tourism == "attraction":
        categories.add("tourist_anchor")
    if tourism in {"theme_park", "zoo", "aquarium"} or leisure in {"water_park", "stadium"}:
        categories.update({"recreation_anchor", "tourist_anchor", "leisure"})
    if aeroway in {"aerodrome", "terminal"}:
        categories.update({"airport", "tourist_anchor"})
    if natural == "water" or waterway in {"river", "canal"}:
        categories.add("waterfront")
    if amenity in {"bar", "pub", "nightclub"}:
        categories.add("nightlife")
    if highway in {"motorway", "trunk", "primary", "secondary"}:
        categories.add("main_road")
    if railway == "rail":
        categories.add("rail_noise")
    if landuse == "industrial":
        categories.add("industrial")

    return categories


def nearest_distance(items: list[dict[str, Any]], category: str) -> Optional[int]:
    distances = [int(item["distance_meters"]) for item in items if category in item["categories"]]
    return min(distances) if distances else None


def count_within(items: list[dict[str, Any]], category: str, radius_meters: int) -> int:
    return sum(1 for item in items if category in item["categories"] and int(item["distance_meters"]) <= radius_meters)


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return earth_radius_m * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
