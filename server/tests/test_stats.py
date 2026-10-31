"""Checks the hand-written statistics against reference implementations."""
import math
import random
import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.stats import (  # noqa: E402
    compute_accuracy_metrics, mann_kendall_test, pettitt_test, sens_slope, _norm_cdf,
)

pymk = pytest.importorskip("pymannkendall")
scipy_stats = pytest.importorskip("scipy.stats")


def series(seed, n=25, slope=-0.004, noise=0.02, ties=False):
    rng = random.Random(seed)
    xs = [0.6 + slope * i + rng.gauss(0, noise) for i in range(n)]
    return [round(x, 2) for x in xs] if ties else xs


@pytest.mark.parametrize("seed", range(20))
@pytest.mark.parametrize("ties", [False, True])
def test_mann_kendall_matches_pymannkendall(seed, ties):
    x = series(seed, ties=ties)
    ours = mann_kendall_test(x, autocorrelation=False)
    ref = pymk.original_test(x)
    assert ours["s"] == ref.s
    assert ours["p_value"] == pytest.approx(ref.p, abs=1e-3)
    assert ours["sens_slope"] == pytest.approx(ref.slope, abs=1e-6)
    assert ours["tau"] == pytest.approx(ref.Tau, abs=1e-4)


def test_sens_slope_uses_actual_years():
    years = [1990, 1991, 1995, 2000, 2010]
    x = [2 * (y - 1990) for y in years]          # exactly 2 per year despite gaps
    assert sens_slope(x, years) == pytest.approx(2.0)
    assert sens_slope(x) != pytest.approx(2.0)   # index-based slope would be wrong


@pytest.mark.parametrize("seed", range(20))
def test_hamed_rao_matches_pymannkendall(seed):
    rng = random.Random(seed)
    e, x = 0.0, []
    for i in range(30):
        e = 0.6 * e + rng.gauss(0, 0.02)
        x.append(0.5 - 0.002 * i + e)
    ours = mann_kendall_test(x)
    ref = pymk.hamed_rao_modification_test(x)
    if math.isnan(ref.p):  # negative variance factor: pymannkendall gives NaN, we keep Var(S)
        pytest.skip("negative variance factor")
    assert ours["p_value"] == pytest.approx(ref.p, abs=1e-3)


def test_autocorrelation_correction_reduces_false_positives():
    """AR(1) noise with no trend: plain MK rejects too often, the corrected test much less."""
    rng = random.Random(0)
    plain = pw = 0
    trials = 300
    for _ in range(trials):
        e, x = 0.0, []
        for _ in range(30):
            e = 0.7 * e + rng.gauss(0, 1)
            x.append(e)
        plain += mann_kendall_test(x, autocorrelation=False)["p_value"] < 0.05
        pw += mann_kendall_test(x)["p_value"] < 0.05
    # the correction helps but cannot fully restore the 5% level for strong AR(1), n = 30
    assert pw < 0.75 * plain


def _pettitt_bruteforce(x):
    n = len(x)
    best_k, best = 0, 0
    for k in range(n - 1):
        u = sum((x[i] > x[j]) - (x[i] < x[j]) for i in range(k + 1) for j in range(k + 1, n))
        if abs(u) > abs(best):
            best_k, best = k, u
    return best_k, abs(best)


@pytest.mark.parametrize("seed", range(10))
def test_pettitt_matches_definition(seed):
    rng = random.Random(seed)
    x = [rng.gauss(0, 1) + (1.5 if i > 12 else 0) for i in range(30)]
    years = list(range(1990, 2020))
    k, K = _pettitt_bruteforce(x)
    r = pettitt_test(x, years)
    assert r["k"] == K
    assert r["change_year"] == years[k + 1]


def test_pettitt_finds_obvious_step():
    x = [0.6] * 10 + [0.3] * 10
    x = [v + 0.001 * i for i, v in enumerate(x)]
    r = pettitt_test(x, list(range(2000, 2020)))
    assert r["change_year"] == 2010
    assert r["p_value"] < 0.01


def test_accuracy_metrics_against_sklearn():
    metrics = pytest.importorskip("sklearn.metrics")
    rng = random.Random(1)
    ref = [rng.randint(0, 1) for _ in range(500)]
    pred = [r if rng.random() < 0.85 else 1 - r for r in ref]
    ours = compute_accuracy_metrics(pred, ref)
    assert ours["overall_accuracy"] == pytest.approx(metrics.accuracy_score(ref, pred), abs=1e-4)
    assert ours["kappa"] == pytest.approx(metrics.cohen_kappa_score(ref, pred), abs=1e-4)


def test_norm_cdf():
    for z in (-3, -1.96, -0.5, 0, 0.5, 1.96, 3):
        assert _norm_cdf(z) == pytest.approx(scipy_stats.norm.cdf(z), abs=1e-6)
