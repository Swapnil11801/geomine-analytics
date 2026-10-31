"""Earth-Engine-free checks of the compositing and sensor configuration."""
import os
import sys

import pytest

pytest.importorskip("ee")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services import analysis as a  # noqa: E402


def test_cross_year_season_covers_nov_to_feb_including_leap_day():
    assert a._season_date_ranges(2023, "nov_feb") == [("2023-11-01", "2024-01-01"), ("2024-01-01", "2024-03-01")]


def test_simple_season_and_aliases():
    assert a._season_date_ranges(2020, "jun_sep") == [("2020-06-01", "2020-10-01")]
    assert a.normalise_season("dry") == "nov_feb" and a.normalise_season("wet") == "jun_sep"
    assert a.normalise_season("bogus") == "nov_feb"


@pytest.mark.parametrize("year,expected", [
    (1990, ["LT05"]), (2005, ["LT05", "LE07"]), (2012, ["LE07"]),
    (2014, ["LE07", "LC08"]), (2018, ["LC08"]), (2023, ["LC08", "LC09"]),
])
def test_every_year_has_a_landsat_sensor(year, expected):
    assert a.landsat_sensors(year) == expected
    assert all(a.landsat_sensors(y) for y in range(a.FIRST_YEAR, 2026))


def _ndvi(nir, red):
    return (nir - red) / (nir + red)


def test_scaling_matters_for_ndvi():
    """NDVI from raw Collection 2 DNs is badly biased because of the -0.2 offset."""
    nir_r, red_r = 0.30, 0.05
    dn = lambda r: (r - a.L2_OFFSET) / a.L2_SCALE  # noqa: E731
    assert _ndvi(nir_r, red_r) == pytest.approx(0.714, abs=1e-3)
    assert _ndvi(dn(nir_r), dn(red_r)) == pytest.approx(0.333, abs=1e-3)


def test_harmonisation_coefficients_are_roy_2016_rma():
    assert a.ETM_TO_OLI_SLOPE == [0.8474, 0.8483, 0.9047, 0.8462]
    assert a.ETM_TO_OLI_INTERCEPT == [0.0003, 0.0088, 0.0061, 0.0412]


def test_map_source_switches_to_sentinel2_only_when_all_years_have_it():
    assert a.map_source(2018, 2024) == "sentinel2"
    assert a.map_source(2000, 2024) == "landsat"
