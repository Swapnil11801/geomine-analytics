"""
Earth Engine Analysis Service

Remote sensing computations for a study area (normally a mine footprint):
  * an annual NDVI series from harmonised Landsat 5/7/8/9 (1990 onward), for the
    footprint AND a surrounding control ring, so that regional changes (climate,
    agriculture) can be separated from changes at the mine;
  * Mann-Kendall / Sen's slope trends and a Pettitt change point;
  * vegetation loss, NDWI, Sentinel-5P NO2 and Dynamic World land cover.

One sensor family (Landsat, harmonised to OLI with Roy et al., 2016) is used for every
year of the time series. Sentinel-2 is used only for the 10 m map overlays, because
mixing Sentinel-2 and Landsat in one series introduces an artificial step at the switch.

Includes in-memory caching to avoid redundant Earth Engine calls.
"""

import ee
import logging
import hashlib
import json
import time

from services.stats import mann_kendall_test, pettitt_test

logger = logging.getLogger(__name__)

# In-memory cache: key -> { "data": result, "timestamp": epoch }
_analysis_cache: dict = {}
_CACHE_TTL_SECONDS = 3600  # 1 hour


def _cache_key(prefix: str, *args) -> str:
    """Generate a deterministic cache key from a prefix and arguments."""
    raw = json.dumps([prefix] + list(args), sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def _get_cached(key: str):
    """Return cached result if it exists and hasn't expired, else None."""
    entry = _analysis_cache.get(key)
    if entry and (time.time() - entry["timestamp"]) < _CACHE_TTL_SECONDS:
        logger.info(f"Cache HIT for key {key[:12]}…")
        return entry["data"]
    if entry:
        del _analysis_cache[key]  # expired
    return None


def _set_cache(key: str, data):
    """Store a result in the cache."""
    _analysis_cache[key] = {"data": data, "timestamp": time.time()}
    # Evict old entries if cache grows too large (>100 entries)
    if len(_analysis_cache) > 100:
        oldest_key = min(_analysis_cache, key=lambda k: _analysis_cache[k]["timestamp"])
        del _analysis_cache[oldest_key]


# ─── Compositing windows ──────────────────────────────────────────────
# The same months are used every year so that years are comparable. Which window is
# right depends on the site: Nov–Feb is the dry, low-cloud season in South Asia, while
# Jun–Sep is the growing season in the northern mid-latitudes.
SEASON_MONTHS = {
    "nov_feb":   (11, 2),   # November – February (crosses the year boundary)
    "jun_sep":   (6, 9),    # June – September
    "full_year": (1, 12),   # January – December (seasonal mix differs between years)
}
SEASON_ALIASES = {"dry": "nov_feb", "wet": "jun_sep"}  # names used by older clients
SEASON_LABELS = {"nov_feb": "Nov–Feb", "jun_sep": "Jun–Sep", "full_year": "Full year"}

FIRST_YEAR = 1990
NDVI_VEG_THRESHOLD = 0.3
MIN_COVERAGE = 0.5          # a year needs ≥50% cloud-free pixels in a region to count
CONTROL_RING_M = (500, 3000)  # control ring: 0.5–3 km outside the footprint
YEARS_PER_REQUEST = 6


def normalise_season(season: str) -> str:
    season = SEASON_ALIASES.get(season, season)
    return season if season in SEASON_MONTHS else "nov_feb"


def _next_month_start(year: int, month: int) -> str:
    """Return the 1st day of the month after (year, month) as 'YYYY-MM-DD'.
    GEE filterDate is start-inclusive, end-exclusive, so this gives us the
    full calendar month without hardcoding day-of-month."""
    if month == 12:
        return f"{year + 1}-01-01"
    return f"{year}-{month + 1:02d}-01"


def _season_date_ranges(year: int, season: str) -> list:
    """
    Returns a list of (start_date, end_date) strings for a given year+season.
    Dates are start-inclusive, end-exclusive (matching GEE filterDate semantics).
    A season that crosses the year boundary (Nov–Feb) is labelled by its first year:
    2020 means Nov 2020 – Feb 2021.
    """
    start_month, end_month = SEASON_MONTHS[normalise_season(season)]

    if start_month <= end_month:
        return [(f"{year}-{start_month:02d}-01", _next_month_start(year, end_month))]
    return [
        (f"{year}-{start_month:02d}-01", f"{year + 1}-01-01"),
        (f"{year + 1}-01-01", _next_month_start(year + 1, end_month)),
    ]


def _merge(collections):
    merged = collections[0]
    for c in collections[1:]:
        merged = merged.merge(c)
    return merged


# ─── Landsat (harmonised surface reflectance) ─────────────────────────
BANDS = ["blue", "green", "red", "nir"]
LANDSAT = {
    # sensor: (collection, [blue, green, red, nir], years used)
    "LT05": ("LANDSAT/LT05/C02/T1_L2", ["SR_B1", "SR_B2", "SR_B3", "SR_B4"], (1984, 2011)),
    # Landsat 7 fills gaps only up to 2016: SLC-off stripes after 2003 are masked as
    # no-data, and the satellite's orbit drifted to earlier overpass times after 2017.
    "LE07": ("LANDSAT/LE07/C02/T1_L2", ["SR_B1", "SR_B2", "SR_B3", "SR_B4"], (1999, 2016)),
    "LC08": ("LANDSAT/LC08/C02/T1_L2", ["SR_B2", "SR_B3", "SR_B4", "SR_B5"], (2013, 2100)),
    "LC09": ("LANDSAT/LC09/C02/T1_L2", ["SR_B2", "SR_B3", "SR_B4", "SR_B5"], (2021, 2100)),
}
# Collection 2 Level-2 scaling: reflectance = DN * 0.0000275 - 0.2
L2_SCALE, L2_OFFSET = 0.0000275, -0.2
# Roy et al. (2016), Table 2, reduced-major-axis TM/ETM+ -> OLI (blue, green, red, nir)
ETM_TO_OLI_SLOPE = [0.8474, 0.8483, 0.9047, 0.8462]
ETM_TO_OLI_INTERCEPT = [0.0003, 0.0088, 0.0061, 0.0412]
# QA_PIXEL bits 1-4: dilated cloud, cirrus, cloud, cloud shadow
QA_MASK = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4)


def landsat_sensors(year: int) -> list[str]:
    return [s for s, (_, _, (y0, y1)) in LANDSAT.items() if y0 <= year <= y1]


def _prep_landsat(sensor: str):
    _, bands, _ = LANDSAT[sensor]

    def prep(image):
        qa = image.select("QA_PIXEL")
        clear = qa.bitwiseAnd(QA_MASK).eq(0).And(image.select("QA_RADSAT").eq(0))
        sr = image.select(bands, BANDS).multiply(L2_SCALE).add(L2_OFFSET)
        if sensor in ("LT05", "LE07"):
            sr = sr.multiply(ee.Image.constant(ETM_TO_OLI_SLOPE)).add(ee.Image.constant(ETM_TO_OLI_INTERCEPT))
        return ee.Image(sr.updateMask(clear).copyProperties(image, ["system:time_start"]))

    return prep


def landsat_collection(roi: ee.Geometry, year: int, season: str) -> ee.ImageCollection:
    """Cloud-masked, scaled and harmonised Landsat images for one year + season."""
    cols = []
    for sensor in landsat_sensors(year):
        collection_id = LANDSAT[sensor][0]
        for start, end in _season_date_ranges(year, season):
            cols.append(ee.ImageCollection(collection_id)
                        .filterBounds(roi)
                        .filterDate(start, end)
                        .filter(ee.Filter.lt("CLOUD_COVER", 60))
                        .map(_prep_landsat(sensor)))
    return _merge(cols)


# ─── Sentinel-2 (10 m, maps only) ─────────────────────────────────────
S2_FIRST_YEAR = 2017  # Level-2A surface reflectance is global from 2017


def _prep_s2(image):
    scl = image.select("SCL")
    # keep vegetation, bare soil, water, unclassified and dark-area pixels
    clear = scl.neq(0).And(scl.neq(1)).And(scl.neq(3)).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
    sr = image.select(["B2", "B3", "B4", "B8"], BANDS).divide(10000)
    return ee.Image(sr.updateMask(clear).copyProperties(image, ["system:time_start"]))


def s2_collection(roi: ee.Geometry, year: int, season: str) -> ee.ImageCollection:
    return _merge([
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(roi)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 60))
        .map(_prep_s2)
        for start, end in _season_date_ranges(year, season)
    ])


def _ndvi(image):
    return image.normalizedDifference(["nir", "red"]).rename("NDVI")


def _ndwi(image):
    return image.normalizedDifference(["green", "nir"]).rename("NDWI")


def composite(roi, year, season, source="landsat", index=_ndvi):
    """Per-pixel median of the index over the season (robust to residual cloud)."""
    col = landsat_collection(roi, year, season) if source == "landsat" else s2_collection(roi, year, season)
    # a fully masked placeholder keeps the band present when a year has no usable image
    empty = index(ee.Image.constant([0] * len(BANDS)).rename(BANDS).toFloat().updateMask(0))
    return col.map(index).merge(ee.ImageCollection([empty])).median(), col.size()


# ─── Study regions ────────────────────────────────────────────────────

def study_regions(geojson_geometry: dict) -> dict:
    """The footprint and a control ring around it (0.5–3 km outside)."""
    roi = ee.Geometry(geojson_geometry)
    inner, outer = CONTROL_RING_M
    control = roi.buffer(outer, 30).difference(roi.buffer(inner, 30), 30)
    return {"site": roi, "control": control}


def ndvi_series(regions: dict, years: list[int], season: str, source="landsat", scale=30) -> dict:
    """
    Annual median-composite NDVI averaged over each region. Years are requested in small
    batches to stay within Earth Engine's limit on concurrent aggregations. Years whose
    cloud-free coverage of a region is below MIN_COVERAGE are dropped for that region.
    Returns {region: [{year, ndvi, coverage, imageCount}, ...]}.
    """
    union = list(regions.values())[0]
    for g in list(regions.values())[1:]:
        union = union.union(g, 30)

    def batch(batch_years):
        feats = []
        for y in batch_years:
            comp, n = composite(union, y, season, source)
            # 'valid' is 1 where a cloud-free composite exists and 0 elsewhere, so its mean over
            # a region is the cloud-free coverage; NDVI's mean ignores masked pixels.
            img = ee.Image.cat([comp, comp.mask().unmask(0).rename("valid")])
            for name, g in regions.items():
                st = img.reduceRegion(ee.Reducer.mean(), g, scale, maxPixels=1e10, tileScale=4)
                feats.append(ee.Feature(None, st).set({"year": y, "region": name, "images": n}))
        for attempt in range(6):
            try:
                return ee.FeatureCollection(feats).getInfo()["features"]
            except ee.EEException as e:
                if "concurrent" not in str(e).lower() and "rate" not in str(e).lower() or attempt == 5:
                    raise
                time.sleep(15 * (attempt + 1))

    rows = []
    for k in range(0, len(years), YEARS_PER_REQUEST):
        rows += batch(years[k:k + YEARS_PER_REQUEST])

    out = {name: [] for name in regions}
    for r in rows:
        p = r["properties"]
        mean, coverage = p.get("NDVI"), p.get("valid") or 0
        if mean is None or coverage < MIN_COVERAGE:
            continue
        out[p["region"]].append({"year": p["year"], "ndvi": round(mean, 4),
                                 "coverage": round(coverage, 3), "imageCount": p["images"]})
    for v in out.values():
        v.sort(key=lambda d: d["year"])
    return out


def series_statistics(site: list, control: list) -> dict:
    """Trends for the site, the control ring and their difference (site − control)."""
    def mk(rows):
        return mann_kendall_test([r["ndvi"] for r in rows], [r["year"] for r in rows]) if len(rows) >= 4 else None

    ctrl = {r["year"]: r["ndvi"] for r in control}
    diff = [{"year": r["year"], "ndvi": round(r["ndvi"] - ctrl[r["year"]], 4)} for r in site if r["year"] in ctrl]
    return {
        "site": mk(site),
        "control": mk(control),
        "difference": mk(diff),
        "changePoint": pettitt_test([d["ndvi"] for d in diff], [d["year"] for d in diff]) if len(diff) >= 8 else None,
        "differenceSeries": diff,
    }


def compute_analysis(geojson_geometry: dict, start_year: int, end_year: int, season: str = "nov_feb") -> dict:
    """
    Run the full suite of Earth Engine geospatial analysis.

    Args:
        geojson_geometry: A valid GeoJSON geometry dict representing the ROI.
        start_year: Start year for the analysis (≥ 1990).
        end_year: End year for the analysis.
        season: Compositing window — "nov_feb", "jun_sep" or "full_year".

    Returns:
        A dictionary containing the computed statistics and time series data.
    """
    season = normalise_season(season)
    start_year = max(FIRST_YEAR, start_year)

    try:
        ckey = _cache_key("analysis-v2", geojson_geometry, start_year, end_year, season)
        cached = _get_cached(ckey)
        if cached:
            return cached

        regions = study_regions(geojson_geometry)
        series = ndvi_series(regions, list(range(start_year, end_year + 1)), season)
        stats = series_statistics(series["site"], series["control"])

        ctrl = {r["year"]: r["ndvi"] for r in series["control"]}
        time_series = [{**r, "controlNdvi": ctrl.get(r["year"]), "source": "Landsat (harmonised)",
                        "resolution": 30} for r in series["site"]]

        veg_loss = _compute_vegetation_loss(regions, start_year, end_year, season)
        water_index = _compute_water_index(regions["site"], end_year, season)
        no2_level = _compute_no2(regions["site"], start_year, end_year, season)
        lc_year = end_year if end_year >= DW_FIRST_YEAR else None
        land_cover = _compute_land_cover(regions["site"], lc_year, season) if lc_year else []

        result = {
            "success": True,
            "data": {
                "timeSeries": time_series,
                "summary": {
                    "vegetationLoss": veg_loss["site_ha"],
                    "vegetationLossPct": veg_loss["site_pct"],
                    "controlVegetationLossPct": veg_loss["control_pct"],
                    "averageNdvi": _calculate_average(time_series, "ndvi"),
                    "no2Level": no2_level,
                    "waterIndex": water_index,
                },
                "landCover": land_cover,
                "landCoverYear": lc_year,
                "season": season,
                "seasonLabel": SEASON_LABELS[season],
                "mannKendall": stats["site"],
                "controlTrend": stats["control"],
                "differenceTrend": stats["difference"],
                "changePoint": stats["changePoint"],
                "yearRange": {"start": start_year, "end": end_year},
                "controlGeometry": regions["control"].getInfo(),
                "method": {
                    "series": "Landsat 5/7/8/9 Collection 2 L2, harmonised to OLI (Roy et al., 2016)",
                    "controlRingMetres": list(CONTROL_RING_M),
                    "minCoverage": MIN_COVERAGE,
                },
            }
        }

        _set_cache(ckey, result)
        return result

    except Exception as e:
        logger.error(f"Error computing analysis: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def _compute_vegetation_loss(regions: dict, start_year: int, end_year: int, season: str) -> dict:
    """
    Area that was vegetated (NDVI > 0.3) in the start year and is not in the end year,
    from harmonised Landsat composites, for the site and (as a percentage) the control ring.
    """
    site, control = regions["site"], regions["control"]
    roi = site.union(control, 30)
    start_ndvi, _ = composite(roi, start_year, season)
    end_ndvi, _ = composite(roi, end_year, season)
    loss = start_ndvi.gt(NDVI_VEG_THRESHOLD).And(end_ndvi.lte(NDVI_VEG_THRESHOLD)).unmask(0)
    valid = start_ndvi.mask().And(end_ndvi.mask())
    img = ee.Image.cat([loss.multiply(ee.Image.pixelArea()).rename("loss"),
                        valid.multiply(ee.Image.pixelArea()).rename("valid")])

    def area(g):
        return img.reduceRegion(ee.Reducer.sum(), g, 30, maxPixels=1e10, tileScale=4)

    r = ee.Dictionary({"site": area(site), "control": area(control)}).getInfo()

    def pct(d):
        return round(100 * d["loss"] / d["valid"], 2) if d.get("valid") else None

    return {"site_ha": round((r["site"].get("loss") or 0) / 10000, 2),
            "site_pct": pct(r["site"]), "control_pct": pct(r["control"])}


def _compute_water_index(roi: ee.Geometry, year: int, season: str) -> float | None:
    """Mean NDWI (McFeeters, 1996) over the ROI for one year, harmonised Landsat."""
    ndwi, _ = composite(roi, year, season, index=_ndwi)
    val = ndwi.reduceRegion(ee.Reducer.mean(), roi, 30, maxPixels=1e10, tileScale=4).get("NDWI").getInfo()
    return round(val, 4) if val is not None else None


def _compute_no2(roi: ee.Geometry, start_year: int, end_year: int, season: str) -> float | None:
    """
    Mean tropospheric NO2 column (µmol/m²) from Sentinel-5P TROPOMI (offline product),
    same months as the NDVI composites, 2019 onward. The ROI is buffered by 10 km because
    TROPOMI pixels are ~5.5 × 3.5 km; values describe the surrounding area, not the mine alone.
    """
    years = range(max(start_year, 2019), end_year + 1)
    cols = [ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
            .filterDate(start, end)
            .select("tropospheric_NO2_column_number_density")
            for y in years for start, end in _season_date_ranges(y, season)]
    if not cols:
        return None
    area = roi.buffer(10000, 100)
    val = (_merge(cols).filterBounds(area).mean()
           .reduceRegion(ee.Reducer.mean(), area, 1113.2, maxPixels=1e9)
           .get("tropospheric_NO2_column_number_density").getInfo())
    return round(val * 1e6, 1) if val is not None else None


DW_FIRST_YEAR = 2016  # Dynamic World starts in mid-2015
DW_CLASSES = {
    0: 'Water',
    1: 'Trees',
    2: 'Grass',
    3: 'Flooded Vegetation',
    4: 'Crops',
    5: 'Shrub & Scrub',
    6: 'Built Area',
    7: 'Bare Ground',
    8: 'Snow & Ice',
}


def dynamic_world_mode(roi: ee.Geometry, year: int, season: str) -> ee.Image:
    """Most frequent Dynamic World class per pixel over the season."""
    return _merge([
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(roi).filterDate(start, end).select("label")
        for start, end in _season_date_ranges(year, season)
    ]).mode()


def _compute_land_cover(roi: ee.Geometry, year: int, season: str) -> list:
    """Land cover shares (%) from Google Dynamic World for the same months (2016 onward)."""
    try:
        hist = (dynamic_world_mode(roi, year, season)
                .reduceRegion(ee.Reducer.frequencyHistogram(), roi, 10, maxPixels=1e10, tileScale=4)
                .get("label").getInfo()) or {}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Dynamic World failed: {e}")
        return []
    total = sum(hist.values())
    return [{"class": DW_CLASSES.get(int(float(k)), f"Class {k}"), "value": round(100 * v / total, 1)}
            for k, v in sorted(hist.items(), key=lambda kv: -kv[1]) if v > 0] if total else []


def _calculate_average(ts_data: list, key: str) -> float:
    if not ts_data:
        return 0.0
    vals = [d[key] for d in ts_data if key in d]
    if not vals:
        return 0.0
    return round(sum(vals) / len(vals), 4)


NDVI_VIS = {
    'min': -0.1,
    'max': 0.8,
    'palette': [
        '#d73027', '#f46d43', '#fdae61', '#fee08b',
        '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837',
    ]
}
CHANGE_VIS = {
    'min': -0.3,
    'max': 0.3,
    'palette': ['#d73027', '#f46d43', '#fdae61', '#ffffbf', '#a6d96a', '#66bd63', '#1a9850']
}


def map_source(*years: int) -> str:
    """Sentinel-2 (10 m) when every year has it, otherwise harmonised Landsat (30 m)."""
    return "sentinel2" if min(years) >= S2_FIRST_YEAR else "landsat"


def ndvi_image(roi, year, season):
    src = map_source(year)
    img, n = composite(roi, year, season, src)
    return img.clip(roi), n, src


def change_image(roi, start_year, end_year, season):
    src = map_source(start_year, end_year)
    a, _ = composite(roi, start_year, season, src)
    b, _ = composite(roi, end_year, season, src)
    return b.subtract(a).clip(roi), src


def generate_ndvi_tiles(geojson_geometry: dict, year: int, season: str = "nov_feb") -> dict:
    """
    Generate Earth Engine map tile URLs for NDVI visualization, using the same
    months and cloud masking as the analysis.
    """
    season = normalise_season(season)
    try:
        ckey = _cache_key("ndvi_tiles-v2", geojson_geometry, year, season)
        cached = _get_cached(ckey)
        if cached:
            return cached

        roi = ee.Geometry(geojson_geometry)
        img, n, src = ndvi_image(roi, year, season)
        count = n.getInfo()
        if count == 0:
            return {"success": False, "error": f"No imagery found for {year}"}

        map_id = img.getMapId(NDVI_VIS)
        result = {
            "success": True,
            "tile_url": map_id['tile_fetcher'].url_format,
            "year": year,
            "image_count": count,
            "source": src,
            "vis_params": NDVI_VIS,
        }

        _set_cache(ckey, result)
        return result

    except Exception as e:
        logger.error(f"Error generating NDVI tiles: {e}")
        return {"success": False, "error": str(e)}


def generate_change_tiles(geojson_geometry: dict, start_year: int, end_year: int, season: str = "nov_feb") -> dict:
    """
    Generate Earth Engine map tiles showing NDVI change between two years.
    Red = vegetation loss, Green = vegetation gain.
    """
    season = normalise_season(season)
    try:
        ckey = _cache_key("change_tiles-v2", geojson_geometry, start_year, end_year, season)
        cached = _get_cached(ckey)
        if cached:
            return cached

        roi = ee.Geometry(geojson_geometry)
        diff, src = change_image(roi, start_year, end_year, season)
        map_id = diff.getMapId(CHANGE_VIS)
        result = {
            "success": True,
            "tile_url": map_id['tile_fetcher'].url_format,
            "type": "change",
            "start_year": start_year,
            "end_year": end_year,
            "source": src,
            "vis_params": CHANGE_VIS,
        }

        _set_cache(ckey, result)
        return result

    except Exception as e:
        logger.error(f"Error generating change tiles: {e}")
        return {"success": False, "error": str(e)}
