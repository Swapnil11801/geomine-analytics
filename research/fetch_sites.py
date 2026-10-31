"""Download mine footprints from OpenStreetMap (Overpass API) into research/sites/.

Footprints are the mapped outlines of each mine (© OpenStreetMap contributors, ODbL).
They reflect the mine's extent when it was last mapped, not its historical extent.
Run once; the GeoJSON files are committed so the study is reproducible without OSM.
"""
import json
import os
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sites")
OVERPASS = "https://overpass-api.de/api/interpreter"
HEADERS = {"User-Agent": "geomine-analytics research script (github.com/Swapnil11801/geomine-analytics)"}

SITES = {
    "maddhapara": ("way", 299707978),      # "Parbatipur Hard Rock Mine" (Maddhapara Granite Mine)
    "hambach": ("relation", 2606647),      # "Braunkohle-Tagebau Hambach"
    "bingham-canyon": ("way", 844044375),  # "Bingham Canyon Mine" (pit + dumps)
}


def _ring(coords):
    ring = [[round(p["lon"], 6), round(p["lat"], 6)] for p in coords]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def _join(ways):
    """Stitch relation member ways into closed rings."""
    segs = [[(p["lon"], p["lat"]) for p in w] for w in ways]
    rings = []
    while segs:
        ring = segs.pop(0)
        while ring[0] != ring[-1]:
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                else:
                    continue
                segs.pop(i)
                break
            else:
                raise ValueError("could not close ring")
        rings.append([[round(x, 6), round(y, 6)] for x, y in ring])
    return rings


def fetch(kind, osm_id):
    q = f"[out:json][timeout:90];{kind}({osm_id});out geom;"
    for attempt in range(5):
        r = requests.post(OVERPASS, data={"data": q}, headers=HEADERS, timeout=120)
        if r.ok:
            break
        time.sleep(10 * (attempt + 1))
    r.raise_for_status()
    el = r.json()["elements"][0]
    if kind == "way":
        geom = {"type": "Polygon", "coordinates": [_ring(el["geometry"])]}
    else:
        outer = [m["geometry"] for m in el["members"] if m["type"] == "way" and m["role"] == "outer"]
        inner = [m["geometry"] for m in el["members"] if m["type"] == "way" and m["role"] == "inner"]
        outers, inners = _join(outer), (_join(inner) if inner else [])
        if len(outers) == 1:
            geom = {"type": "Polygon", "coordinates": outers + inners}
        else:
            geom = {"type": "MultiPolygon", "coordinates": [[o] for o in outers]}
    return {"type": "Feature", "geometry": geom,
            "properties": {"osm": f"{kind}/{osm_id}", "name": el.get("tags", {}).get("name"),
                           "source": "© OpenStreetMap contributors (ODbL)"}}


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for site, (kind, osm_id) in SITES.items():
        f = fetch(kind, osm_id)
        with open(os.path.join(OUT, f"{site}.geojson"), "w") as fh:
            json.dump(f, fh)
        print(site, f["properties"]["name"], f["geometry"]["type"])
        time.sleep(3)
