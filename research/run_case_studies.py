"""Run the three case studies and the validation checks behind RESEARCH.md.

Uses exactly the same functions as the web API (server/services/analysis.py), so the
numbers in the paper are the numbers the app produces.

Outputs
  research/results/case_studies.json   every number quoted in RESEARCH.md
  research/figures/*.png               figures
  client/public/demo/*.json|png        precomputed results for the static web demo

Usage:  python research/run_case_studies.py [--project YOUR_GCP_PROJECT]
"""
import argparse
import json
import math
import os
import sys
import time
import urllib.request

import ee

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "server"))
from services import analysis as A  # noqa: E402
from services.stats import compute_accuracy_metrics  # noqa: E402

RESULTS = os.path.join(HERE, "results")
FIGURES = os.path.join(HERE, "figures")
DEMO = os.path.join(ROOT, "client", "public", "demo")

SITES = {
    "maddhapara": dict(name="Maddhapara Granite Mine", country="Bangladesh", season="nov_feb"),
    "hambach": dict(name="Hambach Surface Mine", country="Germany", season="jun_sep"),
    "bingham-canyon": dict(name="Bingham Canyon Mine", country="USA", season="jun_sep"),
}
START, END = 1990, 2024
VALIDATION_YEAR = 2022
OVERLAP_YEARS = list(range(A.S2_FIRST_YEAR, END + 1))
PLACEBO_BEARINGS = 10   # x 2 distances = 20 placebo sites per mine
SEED = 7


def load_site(key):
    with open(os.path.join(HERE, "sites", f"{key}.geojson")) as f:
        return json.load(f)["geometry"]


def area_km2(geom):
    return ee.Geometry(geom).area(10).getInfo() / 1e6


def retry(fn, tries=4):
    for i in range(tries):
        try:
            return fn()
        except ee.EEException as e:
            if i == tries - 1:
                raise
            print("   EE error, retrying:", str(e)[:120])
            time.sleep(20 * (i + 1))


# ─── analyses ─────────────────────────────────────────────────────────

def run_site(key, cfg):
    geom = load_site(key)
    print(f"[{key}] full analysis {START}-{END} ({cfg['season']})")
    res = retry(lambda: A.compute_analysis(geom, START, END, cfg["season"]))
    if not res["success"]:
        raise RuntimeError(res["error"])
    return geom, res["data"]


def placebo_tests(key, geom, season):
    """
    Apply the same site-vs-control analysis to copies of the footprint moved to nearby land
    (10 bearings x 2 distances). This gives (i) the false-positive rate of the Mann-Kendall
    test on the difference series and (ii) a reference distribution: the mine's difference
    trend is judged against the placebo trends (an empirical, permutation-style p-value).
    """
    lon0, lat0 = ee.Geometry(geom).centroid(1).coordinates().getInfo()
    radius_km = math.sqrt(area_km2(geom) / math.pi)
    d1 = max(8.0, 3 * radius_km + 5)
    out = []
    for dist_km in (d1, 1.75 * d1):
        for i in range(PLACEBO_BEARINGS):
            bearing = 2 * math.pi * (i + (0.5 if dist_km != d1 else 0)) / PLACEBO_BEARINGS
            dlat = dist_km * math.cos(bearing) / 111.32
            dlon = dist_km * math.sin(bearing) / (111.32 * math.cos(math.radians(lat0)))

            def shift(c):
                return ([[round(x + dlon, 6), round(y + dlat, 6)] for x, y in c]
                        if isinstance(c[0][0], (int, float)) else [shift(r) for r in c])

            g = {"type": geom["type"], "coordinates": shift(geom["coordinates"])}
            regions = A.study_regions(g)
            rec = {"bearing_deg": round(math.degrees(bearing)), "distance_km": round(dist_km, 1)}
            # skip copies on open water or on other surface mines/quarries (Dynamic World)
            lc = retry(lambda: A._compute_land_cover(regions["site"], VALIDATION_YEAR, season))
            shares = {d["class"]: d["value"] for d in lc}
            if not shares or shares.get("Water", 0) > 30 or shares.get("Bare Ground", 0) > 30:
                out.append({**rec, "skipped": "water/bare ground or no data", "land_cover": shares})
                continue
            s = retry(lambda: A.ndvi_series(regions, list(range(START, END + 1)), season))
            st = A.series_statistics(s["site"], s["control"])
            d = st["difference"]
            print(f"   placebo {dist_km:.0f} km {rec['bearing_deg']}°: diff slope {d and d['sens_slope']}, p={d and d['p_value']}")
            out.append({**rec, "difference_trend": d, "site_trend": st["site"], "n_years": len(st["differenceSeries"])})
    return out


def placebo_inference(site_diff, placebos):
    """Share of placebo sites whose |difference slope| is at least the mine's (with +1 correction)."""
    slopes = [p["difference_trend"]["sens_slope"] for p in placebos if p.get("difference_trend")]
    if not site_diff or not slopes:
        return None
    s = abs(site_diff["sens_slope"])
    k = sum(abs(x) >= s for x in slopes)
    return {"n_placebos": len(slopes), "n_at_least_as_extreme": k,
            "empirical_p": round((k + 1) / (len(slopes) + 1), 4),
            "placebo_mk_significant": sum(p["difference_trend"]["p_value"] < 0.05 for p in placebos if p.get("difference_trend")),
            "site_slope_per_decade": round(10 * site_diff["sens_slope"], 4),
            "placebo_slopes_per_decade": sorted(round(10 * x, 4) for x in slopes)}


def cross_sensor(key, geom, season):
    """Harmonised Landsat vs Sentinel-2 NDVI in the years both exist."""
    regions = A.study_regions(geom)
    ls = retry(lambda: A.ndvi_series(regions, OVERLAP_YEARS, season, "landsat", 30))
    s2 = retry(lambda: A.ndvi_series(regions, OVERLAP_YEARS, season, "sentinel2", 30))
    pairs = []
    for region in regions:
        s2y = {r["year"]: r["ndvi"] for r in s2[region]}
        pairs += [{"region": region, "year": r["year"], "landsat": r["ndvi"], "sentinel2": s2y[r["year"]]}
                  for r in ls[region] if r["year"] in s2y]

    # pixel-level agreement in the validation year
    roi = regions["site"].union(regions["control"], 30)
    l_img, _ = A.composite(roi, VALIDATION_YEAR, season, "landsat")
    s_img, _ = A.composite(roi, VALIDATION_YEAR, season, "sentinel2")
    img = ee.Image.cat([l_img.rename("landsat"), s_img.reproject(l_img.projection().atScale(30)).rename("sentinel2")])
    pts = retry(lambda: img.sample(roi, 30, numPixels=1500, seed=SEED, geometries=False).getInfo()["features"])
    pix = [(p["properties"]["landsat"], p["properties"]["sentinel2"]) for p in pts
           if p["properties"].get("landsat") is not None and p["properties"].get("sentinel2") is not None]
    return {"annual": pairs, "annual_stats": agreement([(p["landsat"], p["sentinel2"]) for p in pairs]),
            "pixel_stats": agreement(pix), "pixel_year": VALIDATION_YEAR}


def agreement(pairs):
    n = len(pairs)
    if n < 3:
        return None
    x, y = [p[0] for p in pairs], [p[1] for p in pairs]
    mx, my = sum(x) / n, sum(y) / n
    sx = math.sqrt(sum((a - mx) ** 2 for a in x))
    sy = math.sqrt(sum((b - my) ** 2 for b in y))
    r = sum((a - mx) * (b - my) for a, b in pairs) / (sx * sy) if sx and sy else float("nan")
    bias = sum(a - b for a, b in pairs) / n
    rmse = math.sqrt(sum((a - b) ** 2 for a, b in pairs) / n)
    return {"n": n, "r": round(r, 3), "bias_landsat_minus_s2": round(bias, 4), "rmse": round(rmse, 4)}


VEG = [1, 2, 3, 4, 5]  # Dynamic World: trees, grass, flooded vegetation, crops, shrub & scrub


def threshold_accuracy(key, geom, season):
    """NDVI > 0.3 'vegetated' vs Dynamic World vegetated classes, simple random sample."""
    regions = A.study_regions(geom)
    roi = regions["site"].union(regions["control"], 30)
    ndvi, _ = A.composite(roi, VALIDATION_YEAR, season)
    dw = A.dynamic_world_mode(roi, VALIDATION_YEAR, season)
    ref = dw.remap(VEG, [1] * len(VEG), 0).rename("ref")
    img = ee.Image.cat([ndvi.gt(A.NDVI_VEG_THRESHOLD).rename("pred"), ref])
    pts = retry(lambda: img.sample(roi, 30, numPixels=1500, seed=SEED, geometries=False).getInfo()["features"])
    pred = [int(p["properties"]["pred"]) for p in pts if "pred" in p["properties"] and "ref" in p["properties"]]
    refv = [int(p["properties"]["ref"]) for p in pts if "pred" in p["properties"] and "ref" in p["properties"]]
    return compute_accuracy_metrics(pred, refv, ["non-vegetated", "vegetated"])


# ─── demo export (static web app) ─────────────────────────────────────

def demo_images(key, geom, season, start, end):
    """NDVI (start, end) and change PNG overlays for a box around the site."""
    regions = A.study_regions(geom)
    box = regions["site"].buffer(A.CONTROL_RING_M[1] + 1000, 100).bounds(100)
    coords = box.coordinates().getInfo()[0]
    w, s = min(c[0] for c in coords), min(c[1] for c in coords)
    e, n = max(c[0] for c in coords), max(c[1] for c in coords)
    out = {"bounds": [[w, n], [e, n], [e, s], [w, s]]}
    jobs = {}
    for label, y in (("ndvi_start", start), ("ndvi_end", end)):
        src = A.map_source(y)
        img, _ = A.composite(box, y, season, src)
        jobs[label] = (img.visualize(**A.NDVI_VIS), {"year": y, "source": src})
    src = A.map_source(start, end)
    a, _ = A.composite(box, start, season, src)
    b, _ = A.composite(box, end, season, src)
    jobs["change"] = (b.subtract(a).visualize(**A.CHANGE_VIS), {"years": [start, end], "source": src})
    for label, (img, meta) in jobs.items():
        url = img.getThumbURL({"region": box, "dimensions": 900, "format": "png"})
        fname = f"{key}_{label}.png"
        urllib.request.urlretrieve(url, os.path.join(DEMO, fname))
        out[label] = {"file": fname, **meta}
    return out


# ─── figures ──────────────────────────────────────────────────────────

def fmt_p(p):
    return "p<0.001" if p < 0.001 else f"p={p:.3f}"


def figures(all_results):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(2, 3, figsize=(14, 7), sharex=True)
    for col, (key, r) in enumerate(all_results["sites"].items()):
        d = r["analysis"]
        ts = d["timeSeries"]
        ax = axes[0, col]
        ax.plot([t["year"] for t in ts], [t["ndvi"] for t in ts], "o-", ms=3, color="#c0392b", label="mine footprint")
        ctrl = [t for t in ts if t["controlNdvi"] is not None]
        ax.plot([t["year"] for t in ctrl], [t["controlNdvi"] for t in ctrl], "s-", ms=3, color="#27ae60",
                label="control ring (0.5–3 km)")
        ax.set_title(f"{SITES[key]['name']} ({d['seasonLabel']})", fontsize=10)
        ax.set_ylabel("NDVI")
        ax.grid(alpha=0.3)
        if col == 0:
            ax.legend(fontsize=8)
        ax = axes[1, col]
        diff = [(t["year"], t["ndvi"] - t["controlNdvi"]) for t in ctrl]
        ax.plot([a for a, _ in diff], [b for _, b in diff], "o-", ms=3, color="#34495e")
        cp = d.get("changePoint")
        if cp and cp["change_year"]:
            ax.axvline(cp["change_year"] - 0.5, color="#e67e22", ls="--",
                       label=f"Pettitt change {cp['change_year']} ({fmt_p(cp['p_value'])})")
            ax.legend(fontsize=8)
        dt = d.get("differenceTrend")
        if dt:
            ax.text(0.02, 0.04, f"Sen's slope {dt['sens_slope'] * 10:+.3f}/decade, MK {fmt_p(dt['p_value'])}",
                    transform=ax.transAxes, fontsize=8)
        ax.set_ylabel("NDVI footprint − control")
        ax.set_xlabel("year")
        ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(FIGURES, "ndvi_series.png"), dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(5, 5))
    for key, r in all_results["sites"].items():
        pts = r["cross_sensor"]["annual"]
        ax.scatter([p["sentinel2"] for p in pts], [p["landsat"] for p in pts], s=18, label=SITES[key]["name"])
    ax.plot([0, 0.9], [0, 0.9], "k--", lw=1)
    ax.set_xlabel("Sentinel-2 NDVI (annual composite)")
    ax.set_ylabel("Harmonised Landsat NDVI")
    ax.set_title(f"Cross-sensor agreement {OVERLAP_YEARS[0]}–{OVERLAP_YEARS[-1]}", fontsize=10)
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(os.path.join(FIGURES, "cross_sensor.png"), dpi=150)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=os.getenv("EE_PROJECT_ID"))
    ap.add_argument("--only", nargs="*", help="site keys to (re)run")
    args = ap.parse_args()
    ee.Initialize(project=args.project)
    for d in (RESULTS, FIGURES, DEMO):
        os.makedirs(d, exist_ok=True)

    path = os.path.join(RESULTS, "case_studies.json")
    allr = json.load(open(path)) if os.path.exists(path) else {"sites": {}}
    for key, cfg in SITES.items():
        if args.only and key not in args.only:
            continue
        geom, data = run_site(key, cfg)
        print(f"[{key}] cross-sensor, accuracy, placebo")
        r = {
            "config": {**cfg, "start": START, "end": END},
            "footprint_km2": round(area_km2(geom), 3),
            "analysis": data,
            "cross_sensor": cross_sensor(key, geom, cfg["season"]),
            "accuracy": threshold_accuracy(key, geom, cfg["season"]),
            "placebo": placebo_tests(key, geom, cfg["season"]),
        }
        r["placebo_inference"] = placebo_inference(data["differenceTrend"], r["placebo"])
        allr["sites"][key] = r
        with open(path, "w") as f:
            json.dump(allr, f, indent=1)

        print(f"[{key}] demo export")
        imgs = demo_images(key, geom, cfg["season"], START, END)
        with open(os.path.join(DEMO, f"{key}.json"), "w") as f:
            json.dump({"id": key, **cfg, "geometry": geom,
                       "analysis": {**data, "placebo": r["placebo_inference"]}, "overlays": imgs}, f)

    # pooled placebo false-positive rate
    pl = [p for r in allr["sites"].values() for p in r["placebo"] if p.get("difference_trend")]
    allr["placebo_summary"] = {"n": len(pl), "significant_at_0.05": sum(p["difference_trend"]["p_value"] < 0.05 for p in pl)}
    with open(os.path.join(DEMO, "index.json"), "w") as f:
        json.dump([{"id": k, **SITES[k]} for k in SITES if k in allr["sites"]], f)
    allr["generated"] = time.strftime("%Y-%m-%d")
    with open(path, "w") as f:
        json.dump(allr, f, indent=1)
    with open(os.path.join(DEMO, "index.json"), "w") as f:
        json.dump([{"id": k, **SITES[k]} for k in SITES if k in allr["sites"]], f)
    figures(allr)
    print("done ->", path)


if __name__ == "__main__":
    main()
