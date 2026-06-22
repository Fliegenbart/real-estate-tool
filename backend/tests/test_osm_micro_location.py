from app.services.osm_micro_location import (
    build_overpass_micro_location_query,
    micro_location_evidence_from_osm_elements,
)


def test_build_overpass_query_targets_core_micro_location_tags():
    query = build_overpass_micro_location_query(latitude=52.0, longitude=13.0)

    assert "[out:json]" in query
    assert "(around:3000,52.0,13.0)" in query
    assert '["railway"~"station|halt|tram_stop|subway_entrance"]' in query
    assert '["station"~"subway|light_rail|s-bahn"]' in query
    assert '["shop"~"supermarket|convenience"]' in query
    assert '["amenity"~"pharmacy|doctors|dentist|clinic|school|kindergarten|childcare|university|hospital|exhibition_centre"]' in query
    assert '["amenity"~"conference_centre|events_venue"]' in query
    assert '["tourism"="hotel"]' in query
    assert '["aeroway"~"aerodrome|terminal"]' in query
    assert '["amenity"~"bar|pub|nightclub"]' in query


def test_osm_elements_are_converted_into_micro_location_evidence():
    elements = [
        {"type": "node", "id": 1, "lat": 52.003, "lon": 13.0, "tags": {"railway": "station"}},
        {"type": "node", "id": 2, "lat": 52.001, "lon": 13.0, "tags": {"highway": "bus_stop"}},
        {"type": "node", "id": 3, "lat": 52.002, "lon": 13.0, "tags": {"shop": "supermarket"}},
        {"type": "node", "id": 4, "lat": 52.003, "lon": 13.0, "tags": {"shop": "convenience"}},
        {"type": "node", "id": 5, "lat": 52.004, "lon": 13.0, "tags": {"amenity": "pharmacy"}},
        {"type": "node", "id": 6, "lat": 52.006, "lon": 13.0, "tags": {"amenity": "doctors"}},
        {"type": "node", "id": 7, "lat": 52.007, "lon": 13.0, "tags": {"amenity": "school"}},
        {"type": "node", "id": 8, "lat": 52.012, "lon": 13.0, "tags": {"amenity": "university"}},
        {"type": "node", "id": 9, "lat": 52.020, "lon": 13.0, "tags": {"amenity": "hospital"}},
        {"type": "node", "id": 10, "lat": 52.025, "lon": 13.0, "tags": {"amenity": "exhibition_centre"}},
        {"type": "node", "id": 11, "lat": 52.004, "lon": 13.001, "tags": {"leisure": "park"}},
        {"type": "node", "id": 12, "lat": 52.005, "lon": 13.001, "tags": {"amenity": "cinema"}},
        {"type": "node", "id": 13, "lat": 52.006, "lon": 13.001, "tags": {"tourism": "museum"}},
        {"type": "node", "id": 14, "lat": 52.007, "lon": 13.001, "tags": {"natural": "water"}},
        {"type": "node", "id": 15, "lat": 52.001, "lon": 13.001, "tags": {"amenity": "bar"}},
        {"type": "node", "id": 16, "lat": 52.0015, "lon": 13.001, "tags": {"amenity": "pub"}},
        {"type": "node", "id": 20, "lat": 52.002, "lon": 13.001, "tags": {"amenity": "restaurant"}},
        {"type": "node", "id": 21, "lat": 52.003, "lon": 13.001, "tags": {"amenity": "cafe"}},
        {"type": "way", "id": 22, "center": {"lat": 52.009, "lon": 13.0}, "tags": {"tourism": "theme_park"}},
        {"type": "way", "id": 17, "center": {"lat": 52.001, "lon": 13.0}, "tags": {"highway": "primary"}},
        {"type": "way", "id": 18, "center": {"lat": 52.006, "lon": 13.0}, "tags": {"railway": "rail"}},
        {"type": "way", "id": 19, "center": {"lat": 52.020, "lon": 13.0}, "tags": {"landuse": "industrial"}},
    ]

    evidence = micro_location_evidence_from_osm_elements(52.0, 13.0, elements)

    assert evidence.nearest_rapid_transit_meters is not None
    assert evidence.nearest_rapid_transit_meters <= 340
    assert evidence.nearest_bus_stop_meters is not None
    assert evidence.nearest_bus_stop_meters <= 120
    assert evidence.supermarkets_1000m == 2
    assert evidence.pharmacies_1000m == 1
    assert evidence.doctors_1500m == 1
    assert evidence.schools_1500m == 1
    assert evidence.nearest_university_meters is not None
    assert evidence.nearest_university_meters <= 1400
    assert evidence.parks_1000m == 1
    assert evidence.cultural_pois_1500m == 2
    assert evidence.restaurants_1000m == 1
    assert evidence.cafes_1000m == 1
    assert evidence.nearest_recreation_anchor_meters is not None
    assert evidence.nearest_recreation_anchor_meters <= 1100
    assert evidence.nightlife_pois_500m == 2
    assert evidence.main_road_meters is not None
    assert evidence.main_road_meters <= 120
    assert evidence.source == "openstreetmap/overpass"


def test_osm_elements_capture_messe_hotel_airport_and_subway_signals():
    elements = [
        {"type": "node", "id": 31, "lat": 52.0008, "lon": 13.0, "tags": {"railway": "station", "station": "subway"}},
        {"type": "way", "id": 32, "center": {"lat": 52.015, "lon": 13.0}, "tags": {"amenity": "conference_centre"}},
        {"type": "way", "id": 33, "center": {"lat": 52.012, "lon": 13.0}, "tags": {"amenity": "events_venue"}},
        {"type": "node", "id": 34, "lat": 52.005, "lon": 13.0, "tags": {"tourism": "hotel"}},
        {"type": "node", "id": 35, "lat": 52.006, "lon": 13.0, "tags": {"tourism": "hotel"}},
        {"type": "way", "id": 36, "center": {"lat": 52.020, "lon": 13.0}, "tags": {"aeroway": "terminal"}},
    ]

    evidence = micro_location_evidence_from_osm_elements(52.0, 13.0, elements)

    assert evidence.nearest_rapid_transit_meters is not None
    assert evidence.nearest_rapid_transit_meters <= 100
    assert evidence.nearest_trade_fair_meters is not None
    assert evidence.nearest_event_venue_meters is not None
    assert evidence.major_employers_3000m == 2
    assert evidence.hotels_1500m == 2
    assert evidence.nearest_airport_meters is not None


def test_osm_elements_count_dentists_and_childcare_as_daily_needs():
    elements = [
        {"type": "node", "id": 41, "lat": 52.002, "lon": 13.0, "tags": {"amenity": "doctors"}},
        {"type": "node", "id": 42, "lat": 52.003, "lon": 13.0, "tags": {"amenity": "dentist"}},
        {"type": "node", "id": 43, "lat": 52.004, "lon": 13.0, "tags": {"amenity": "school"}},
        {"type": "node", "id": 44, "lat": 52.005, "lon": 13.0, "tags": {"amenity": "childcare"}},
    ]

    evidence = micro_location_evidence_from_osm_elements(52.0, 13.0, elements)

    assert evidence.doctors_1500m == 2
    assert evidence.schools_1500m == 2
