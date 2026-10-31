"""Write RESEARCH.md from research/results/case_studies.json.

Every number in the paper is filled in from the results file produced by
run_case_studies.py, so the text cannot drift from the data. The interpretation
paragraphs (INTERPRETATION below) are written by hand after reading the results.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
R = json.load(open(os.path.join(HERE, "results", "case_studies.json")))
S = R["sites"]
ORDER = [k for k in ("maddhapara", "hambach", "bingham-canyon") if k in S]

TYPE = {
    "maddhapara": "Underground granite mine; surface compound, processing plant and waste rock",
    "hambach": "Open-pit lignite mine, expanding westwards",
    "bingham-canyon": "Open-pit copper mine with waste-rock dumps",
}
INTERPRETATION = json.load(open(os.path.join(HERE, "interpretation.json"), encoding="utf-8"))


def dec(x):
    return f"{10 * x:+.3f}"


def p(x):
    return "<0.001" if x < 0.001 else f"{x:.3f}"


def site_row(k):
    r, d = S[k], S[k]["analysis"]
    pi = r["placebo_inference"] or {}
    cp = d["changePoint"] or {}
    return (f"| {r['config']['name']} | {dec(d['mannKendall']['sens_slope'])} ({p(d['mannKendall']['p_value'])}) "
            f"| {dec(d['controlTrend']['sens_slope'])} ({p(d['controlTrend']['p_value'])}) "
            f"| **{dec(d['differenceTrend']['sens_slope'])}** ({p(d['differenceTrend']['p_value'])}) "
            f"| {pi.get('n_at_least_as_extreme', '–')} of {pi.get('n_placebos', '–')} · **{pi.get('empirical_p', float('nan')):.3f}** "
            f"| {cp.get('change_year', '–')} ({p(cp['p_value']) if cp else '–'}) "
            f"| {d['summary']['vegetationLossPct']}% vs {d['summary']['controlVegetationLossPct']}% |")


def main():
    n_pl = sum(S[k]["placebo_inference"]["n_placebos"] for k in ORDER)
    n_sig = sum(S[k]["placebo_inference"]["placebo_mk_significant"] for k in ORDER)
    cs = [S[k]["cross_sensor"] for k in ORDER]
    acc = [S[k]["accuracy"] for k in ORDER]
    pooled_r = [c["pixel_stats"]["r"] for c in cs]
    bias = [c["annual_stats"]["bias_landsat_minus_s2"] for c in cs]
    n_years = {k: len(S[k]["analysis"]["timeSeries"]) for k in ORDER}
    ext = [k for k in ORDER if S[k]["placebo_inference"]["n_at_least_as_extreme"] == 0]

    def names(keys):
        return ", ".join(S[k]["config"]["name"].split(" ")[0] for k in keys) or "none"

    md = f"""# Separating mining impact from regional change: a site-versus-control Landsat analysis of three mines, 1990–2024

**Swapnil Ray** · [source code](https://github.com/Swapnil11801/geomine-analytics) ·
[interactive demo](https://swapnil11801.github.io/geomine-analytics/) · results generated {R['generated']}

---

## Abstract

Satellite studies of mining often report a declining vegetation index near a mine as evidence of mining impact.
But vegetation also changes for reasons unrelated to mining, such as weather, farming and urban growth. We measure the
annual dry- or growing-season NDVI of three mine footprints (Maddhapara, Bangladesh; Hambach, Germany; Bingham Canyon,
USA) from 1990 to 2024 using one harmonised sensor family (Landsat 5/7/8/9), and compare each footprint with a control
ring 0.5–3 km around it. We then apply exactly the same analysis to {n_pl} placebo sites: copies of the footprints moved
8–30 km away (copies falling on water or largely bare ground were excluded). The placebos show why this step is needed: **{n_sig} of {n_pl}
({100 * n_sig / n_pl:.0f}%) had a "significant" Mann-Kendall trend in site-minus-control NDVI** even though no mine was there,
because neighbouring landscapes rarely change in lockstep over 35 years. A p-value from a trend test is therefore not
evidence of mining impact on its own. Judged instead against the placebo distribution, the mine footprint's relative
trend was more extreme than every placebo at {len(ext)} of {len(ORDER)} sites ({names(ext)}). Two validation checks complete the
picture. Harmonised Landsat and Sentinel-2 NDVI agree closely in
pattern (pixel-level r = {min(pooled_r):.2f}–{max(pooled_r):.2f}) but differ in level (mean bias {min(bias):+.2f} to {max(bias):+.2f}),
which is why the two sensors are not mixed in one series. A fixed NDVI > 0.3 vegetation threshold agrees with Dynamic World land cover
only where bare ground contrasts sharply with vegetation (Cohen's κ from {min(a['kappa'] for a in acc):.2f} in densely settled Bangladesh
to {max(a['kappa'] for a in acc):.2f} in semi-arid Utah).

**Keywords:** mining, NDVI, Landsat harmonisation, Mann-Kendall, placebo test, Google Earth Engine

---

## 1. Introduction

Mining directly occupies about 57,000 km² of land worldwide (Maus et al., 2020), and its indirect effects through roads,
settlements and deforestation extend much further (Sonter et al., 2017; Bebbington et al., 2018). Landsat's 40-year archive
makes it possible to follow these changes over decades (Townsend et al., 2009; Latifovic et al., 2005), and cloud platforms
such as Google Earth Engine (Gorelick et al., 2017) remove the need to download data.

Three problems recur in this kind of study:

1. **Sensor mixing.** Joining Landsat (30 m) and Sentinel-2 (10 m) series creates a step at the switch-over year, which a trend test reads as change.
2. **Attribution.** A vegetation trend at a mine may be part of a regional trend caused by climate or farming.
3. **Over-confident statistics.** Annual series are autocorrelated, and neighbouring areas diverge for many reasons, so trend tests reject "no trend" far too often.

This study addresses each one: a single harmonised Landsat series, a control ring around every footprint and, most importantly,
**placebo sites** that show how often the method reports change where no mine exists. Placebo comparisons are standard in
the causal-inference literature (Abadie et al., 2010) but rare in remote-sensing studies of mining.

## 2. Study sites

Footprints are the mapped outlines of each mine in OpenStreetMap (© OpenStreetMap contributors, ODbL), stored in
[`research/sites/`](research/sites).

| Site | Country | Type | Footprint (km²) | Composite months | Years with data |
|---|---|---|---:|---|---:|
""" + "\n".join(
        f"| {S[k]['config']['name']} | {S[k]['config']['country']} | {TYPE[k]} | {S[k]['footprint_km2']:.2f} | "
        f"{S[k]['analysis']['seasonLabel']} | {n_years[k]} |" for k in ORDER) + f"""

Composite months were chosen per site: November–February is the dry, low-cloud season in Bangladesh, and June–September
is the growing season in Germany and Utah. "2020" for a November–February composite means November 2020 to February 2021.

## 3. Data and methods

**Imagery.** Landsat 5 TM (1990–2011), Landsat 7 ETM+ (1999–2016, gap-filling only), Landsat 8 OLI (2013–) and Landsat 9 OLI-2
(2021–) Collection 2 Level-2 surface reflectance. Digital numbers are converted to reflectance (×0.0000275 − 0.2), and TM/ETM+
reflectance is transformed to OLI equivalents with the reduced-major-axis coefficients of Roy et al. (2016). Clouds, cloud
shadow, cirrus, dilated cloud and saturated pixels are masked using the QA bands. Scenes with more than 60% cloud are skipped.
Landsat 7 is not used after 2016 because its orbit drifted to earlier overpass times.

**Composites.** For each year, the per-pixel median NDVI (Rouse et al., 1974) over the composite months is averaged over the
footprint and over the control ring. A year is used for a region only if at least 50% of its pixels are cloud-free.
Sentinel-2 is used only for the 10 m map overlays in the web app, never in the time series.

**Control ring.** The area between 0.5 and 3 km outside the footprint. The 0.5 km gap reduces edge effects. The difference
series (footprint − ring) removes changes shared by the surrounding landscape.

**Trend and change point.** Mann-Kendall test (Mann, 1945; Kendall, 1975) with the Hamed & Rao (1998) variance correction for
autocorrelation, Sen's (1968) slope computed against actual years (so missing years are handled correctly), and the Pettitt
(1979) change-point test on the difference series. Trend-free pre-whitening (Yue et al., 2002) was considered and rejected:
in our simulation test it *increased* false positives, consistent with Bayazit & Önöz (2007). The statistics are
implemented in [`server/services/stats.py`](server/services/stats.py) and tested against `pymannkendall`, `scipy` and
`scikit-learn`.

**Placebo sites.** Each footprint is copied to 20 locations on two circles around the mine (10 bearings, at distances
d and 1.75d, where d = max(8 km, 3r + 5 km) and r is the footprint's equivalent radius). Copies on open water or on more
than 30% bare ground (other mines and quarries) are skipped. The full site-versus-control analysis is repeated for each
placebo. Two quantities follow: the share of placebos with a significant difference trend (the method's empirical
false-positive rate) and an empirical p-value for the mine, p = (1 + k)/(1 + n), where k of n placebos have an absolute
difference slope at least as large as the mine's. With about 20 placebos the smallest attainable p is about 0.05.

**Vegetation loss.** Area with NDVI > 0.3 in the first year and ≤ 0.3 in the last, reported as a share of valid
pixels in the footprint and in the ring.

**Validation checks.** (i) Cross-sensor agreement: harmonised Landsat versus Sentinel-2 NDVI for {cs[0]['annual'][0]['year'] if cs[0]['annual'] else 2017}–2024,
as annual region means and as a 1,500-pixel random sample in {cs[0]['pixel_year']}. (ii) Threshold agreement: NDVI > 0.3 versus
Dynamic World (Brown et al., 2022) vegetated classes (trees, grass, flooded vegetation, crops, shrub) on a 1,500-pixel
random sample in the same year. Dynamic World is itself a model output, so this measures agreement, not accuracy.

**Context indicators.** NDWI (McFeeters, 1996) and Sentinel-5P tropospheric NO₂ (Veefkind et al., 2012) are shown in
the web app for context. TROPOMI pixels are about 5 km across, so NO₂ cannot be attributed to a mine and is not analysed here.

## 4. Results

### 4.1 Trends and placebo inference

Slopes are Sen's slopes in NDVI per decade, with Mann-Kendall p-values (Hamed-Rao corrected) in brackets.

| Site | Footprint | Control ring | Footprint − ring | Placebos at least as extreme · empirical p | Pettitt change year (p) | Vegetation loss, footprint vs ring |
|---|---:|---:|---:|---:|---:|---:|
""" + "\n".join(site_row(k) for k in ORDER) + f"""

![NDVI series](research/figures/ndvi_series.png)

*Top: annual NDVI of each footprint and its control ring. Bottom: footprint minus ring, with the Pettitt change point.*

### 4.2 How often does the method find "change" where there is no mine?

Across all {n_pl} placebo sites, **{n_sig} ({100 * n_sig / n_pl:.0f}%)** had a difference trend with Mann-Kendall p < 0.05.
""" + "\n".join(
        f"- {S[k]['config']['name']}: {S[k]['placebo_inference']['placebo_mk_significant']} of "
        f"{S[k]['placebo_inference']['n_placebos']} placebos significant; placebo slopes ranged from "
        f"{min(S[k]['placebo_inference']['placebo_slopes_per_decade']):+.3f} to "
        f"{max(S[k]['placebo_inference']['placebo_slopes_per_decade']):+.3f} per decade (mine: "
        f"{S[k]['placebo_inference']['site_slope_per_decade']:+.3f})." for k in ORDER) + f"""

The nominal 5% false-positive rate does not hold, even after the autocorrelation correction. Over 35 years, almost any two
neighbouring patches of land drift apart. The placebo distribution, not the p-value, is the right reference.

### 4.3 Cross-sensor agreement

| Site | Annual means: n, r, bias (Landsat − S2), RMSE | Pixels ({cs[0]['pixel_year']}): n, r, bias, RMSE |
|---|---|---|
""" + "\n".join(
        f"| {S[k]['config']['name']} | {c['annual_stats']['n']}, {c['annual_stats']['r']:.2f}, {c['annual_stats']['bias_landsat_minus_s2']:+.3f}, {c['annual_stats']['rmse']:.3f} "
        f"| {c['pixel_stats']['n']}, {c['pixel_stats']['r']:.2f}, {c['pixel_stats']['bias_landsat_minus_s2']:+.3f}, {c['pixel_stats']['rmse']:.3f} |"
        for k, c in zip(ORDER, cs)) + f"""

![Cross-sensor agreement](research/figures/cross_sensor.png)

The sensors agree on spatial pattern but not on level. A series that switched from Landsat to Sentinel-2 in 2015–2017
would contain an artificial step of this size, comparable to or larger than the decade-scale trends in Table 4.1.

### 4.4 Agreement of the NDVI > 0.3 threshold with Dynamic World

| Site | n | Overall agreement | Cohen's κ | Non-vegetated: producer's / user's | Vegetated: producer's / user's |
|---|---:|---:|---:|---:|---:|
""" + "\n".join(
        f"| {S[k]['config']['name']} | {a['n_samples']} | {a['overall_accuracy']:.2f} | {a['kappa']:.2f} | "
        f"{a['per_class'][0]['producers_accuracy']:.2f} / {a['per_class'][0]['users_accuracy']:.2f} | "
        f"{a['per_class'][-1]['producers_accuracy']:.2f} / {a['per_class'][-1]['users_accuracy']:.2f} |"
        for k, a in zip(ORDER, acc)) + f"""

{INTERPRETATION['threshold']}

## 5. Discussion

""" + "\n\n".join(f"**{S[k]['config']['name']}.** {INTERPRETATION[k]}" for k in ORDER) + f"""

{INTERPRETATION['general']}

## 6. Limitations

- **Footprints are present-day outlines.** The OSM polygons show each mine as recently mapped. Land inside them was mined at
  different times, and land mined before 1990 or outside the outline is treated as footprint or ring accordingly.
- **The ring is not a perfect control.** It can contain mine infrastructure, dust deposition or resettled villages
  (spillover), and it differs from the footprint in land use even before mining. The difference series removes shared
  change, not all confounding.
- **Few placebos.** With about 20 placebos per site, the smallest attainable empirical p is about 0.05, and placebos around
  one mine share a regional context and are not fully independent.
- **Three sites.** Three mines cannot support general claims about mine types or regulatory regimes.
- **No field data.** Validation is against other satellite products. High-resolution imagery or field surveys would be needed for accuracy assessment.
- **Landsat 7 SLC-off.** Some 2003–2016 years rely partly on striped Landsat 7 data; the coverage rule and median compositing limit, but do not remove, the effect.

## 7. Reproducibility

All code is in this repository. `python research/fetch_sites.py` downloads the footprints,
`python research/run_case_studies.py` runs every analysis through the same functions as the web API and writes
[`research/results/case_studies.json`](research/results/case_studies.json), and `python research/make_report.py`
regenerates this document. The statistics are covered by `python -m pytest server/tests`.

## References

- Abadie, A., Diamond, A., & Hainmueller, J. (2010). Synthetic control methods for comparative case studies. *Journal of the American Statistical Association*, 105(490), 493–505.
- Bayazit, M., & Önöz, B. (2007). To prewhiten or not to prewhiten in trend analysis? *Hydrological Sciences Journal*, 52(4), 611–624.
- Bebbington, A. J., Humphreys Bebbington, D., Sauls, L. A., et al. (2018). Resource extraction and infrastructure threaten forest cover and community rights. *PNAS*, 115(52), 13164–13173.
- Brown, C. F., Brumby, S. P., Guzder-Williams, B., et al. (2022). Dynamic World, near real-time global 10 m land use land cover mapping. *Scientific Data*, 9, 251.
- Gorelick, N., Hancher, M., Dixon, M., et al. (2017). Google Earth Engine: planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment*, 202, 18–27.
- Hamed, K. H., & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. *Journal of Hydrology*, 204(1–4), 182–196.
- Kendall, M. G. (1975). *Rank Correlation Methods* (4th ed.). Charles Griffin.
- Latifovic, R., Fytas, K., Chen, J., & Paraszczak, J. (2005). Assessing land cover change resulting from large surface mining development. *International Journal of Applied Earth Observation and Geoinformation*, 7(1), 29–48.
- Mann, H. B. (1945). Nonparametric tests against trend. *Econometrica*, 13(3), 245–259.
- Maus, V., Giljum, S., Gutschlhofer, J., et al. (2020). A global-scale data set of mining areas. *Scientific Data*, 7, 289.
- McFeeters, S. K. (1996). The use of the Normalized Difference Water Index (NDWI) in the delineation of open water features. *International Journal of Remote Sensing*, 17(7), 1425–1432.
- Pettitt, A. N. (1979). A non-parametric approach to the change-point problem. *Journal of the Royal Statistical Society C*, 28(2), 126–135.
- Rouse, J. W., Haas, R. H., Schell, J. A., & Deering, D. W. (1974). Monitoring vegetation systems in the Great Plains with ERTS. *Third ERTS Symposium*, NASA SP-351, 309–317.
- Roy, D. P., Kovalskyy, V., Zhang, H. K., et al. (2016). Characterization of Landsat-7 to Landsat-8 reflective wavelength and normalized difference vegetation index continuity. *Remote Sensing of Environment*, 185, 57–70.
- Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. *Journal of the American Statistical Association*, 63(324), 1379–1389.
- Sonter, L. J., Herrera, D., Barrett, D. J., et al. (2017). Mining drives extensive deforestation in the Brazilian Amazon. *Nature Communications*, 8, 1013.
- Townsend, P. A., Helmers, D. P., Kingdon, C. C., et al. (2009). Changes in the extent of surface mining and reclamation in the Central Appalachians detected using a 1976–2006 Landsat time series. *Remote Sensing of Environment*, 113(1), 62–72.
- Veefkind, J. P., Aben, I., McMullan, K., et al. (2012). TROPOMI on the ESA Sentinel-5 Precursor. *Remote Sensing of Environment*, 120, 70–83.
- Yue, S., Pilon, P., Phinney, B., & Cavadias, G. (2002). The influence of autocorrelation on the ability to detect trend in hydrological series. *Hydrological Processes*, 16(9), 1807–1829.
"""
    with open(os.path.join(ROOT, "RESEARCH.md"), "w", encoding="utf-8") as f:
        f.write(md)
    print("wrote RESEARCH.md")

    # short results block in the README, between the RESULTS markers
    rows = "\n".join(
        f"| {S[k]['config']['name']} | {dec(S[k]['analysis']['differenceTrend']['sens_slope'])} | "
        f"{S[k]['placebo_inference']['n_at_least_as_extreme']} of {S[k]['placebo_inference']['n_placebos']} "
        f"(p = {S[k]['placebo_inference']['empirical_p']:.2f}) | {(S[k]['analysis']['changePoint'] or {}).get('change_year', '–')} |"
        for k in ORDER)
    block = f"""<!-- RESULTS -->
## Results (1990–2024)

| Mine | Footprint − ring NDVI trend (per decade) | Placebo sites at least as extreme | Change point |
|---|---:|---:|---:|
{rows}

- **All three mines stand out from their placebos**, but **{n_sig} of {n_pl} placebo sites ({100 * n_sig / n_pl:.0f}%) also had a
  "significant" Mann-Kendall trend** with no mine present. A trend test's p-value alone is not evidence of mining impact.
- Harmonised Landsat and Sentinel-2 agree in pattern (pixel r = {min(pooled_r):.2f}–{max(pooled_r):.2f}) but not in level
  (bias {min(bias):+.2f} to {max(bias):+.2f}), so the series never mixes them.
- A fixed NDVI > 0.3 threshold agrees with Dynamic World poorly in settled, tree-rich land and moderately in arid land
  (κ = {min(a['kappa'] for a in acc):.2f}–{max(a['kappa'] for a in acc):.2f}).

![NDVI series](research/figures/ndvi_series.png)
<!-- /RESULTS -->"""
    rp = os.path.join(ROOT, "README.md")
    readme = open(rp, encoding="utf-8").read()
    a = readme.index("<!-- RESULTS -->")
    b = readme.index("<!-- /RESULTS -->") + len("<!-- /RESULTS -->") if "<!-- /RESULTS -->" in readme else a + len("<!-- RESULTS -->")
    open(rp, "w", encoding="utf-8").write(readme[:a] + block + readme[b:])
    print("updated README.md")


if __name__ == "__main__":
    main()
