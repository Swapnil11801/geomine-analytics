"""
Statistical Analysis Utilities

Provides non-parametric trend tests and accuracy assessment metrics
for remote sensing time series analysis. No external dependencies
beyond the Python standard library.

References:
- Mann, H.B. (1945). Nonparametric tests against trend. Econometrica, 13(3), 245-259.
- Kendall, M.G. (1975). Rank Correlation Methods. London: Charles Griffin.
- Sen, P.K. (1968). Estimates of the regression coefficient based on Kendall's tau.
  Journal of the American Statistical Association, 63(324), 1379-1389.
- Hamed, K.H., Rao, A.R. (1998). A modified Mann-Kendall trend test for autocorrelated data.
  Journal of Hydrology, 204(1-4), 182-196.
- Pettitt, A.N. (1979). A non-parametric approach to the change-point problem.
  Journal of the Royal Statistical Society C, 28(2), 126-135.
"""

import math
from itertools import combinations


def _mk_core(data: list[float]) -> tuple[int, float, float]:
    """Return (S, Var(S) with tie correction, two-sided p) for a series."""
    n = len(data)
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            diff = data[j] - data[i]
            if diff > 0:
                s += 1
            elif diff < 0:
                s -= 1

    counts = {}
    for v in data:
        counts[v] = counts.get(v, 0) + 1
    tie_correction = sum(c * (c - 1) * (2 * c + 5) for c in counts.values() if c > 1)
    var_s = (n * (n - 1) * (2 * n + 5) - tie_correction) / 18

    if var_s == 0:
        return s, var_s, 1.0
    # continuity-corrected normal approximation
    z = (s - 1) / math.sqrt(var_s) if s > 0 else (s + 1) / math.sqrt(var_s) if s < 0 else 0.0
    return s, var_s, 2 * (1 - _norm_cdf(abs(z)))


def _ranks(data: list[float]) -> list[float]:
    """Average ranks (1-based), ties share the mean rank."""
    order = sorted(range(len(data)), key=lambda i: data[i])
    ranks = [0.0] * len(data)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and data[order[j + 1]] == data[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def _acf(data: list[float]) -> list[float]:
    n = len(data)
    m = sum(data) / n
    y = [x - m for x in data]
    c0 = sum(v * v for v in y)
    if c0 == 0:
        return [1.0] + [0.0] * (n - 1)
    return [sum(y[i] * y[i + k] for i in range(n - k)) / c0 for k in range(n)]


def mann_kendall_test(data: list[float], years: list[float] | None = None,
                      autocorrelation: bool = True) -> dict:
    """
    Mann-Kendall trend test with Sen's slope.

    Annual NDVI is often serially correlated, which inflates the false-positive rate of the
    plain test. By default the variance of S is corrected for autocorrelation following
    Hamed & Rao (1998): significant autocorrelations of the ranks of the detrended series
    inflate Var(S) by n/n*.

    Args:
        data: values in chronological order.
        years: the time of each value. Missing years (e.g. no cloud-free image) are then
            handled correctly by Sen's slope; defaults to 0, 1, 2, ...
        autocorrelation: apply the Hamed-Rao correction.

    Returns: tau, p_value, s, significance, trend, sens_slope (per unit of `years`),
        r1 (lag-1 autocorrelation of the detrended ranks) and variance_factor (n/n*).
    """
    n = len(data)
    years = list(range(n)) if years is None else list(years)
    if n < 4:
        return {
            "tau": 0.0,
            "p_value": 1.0,
            "s": 0,
            "significance": "insufficient_data",
            "trend": "no_trend",
            "sens_slope": 0.0,
            "r1": 0.0,
            "variance_factor": 1.0,
        }

    slope = sens_slope(data, years)
    s, var_s, p_value = _mk_core(data)

    # rank autocorrelation of the detrended series (index-based, as in Hamed & Rao)
    rho = _acf(_ranks([x - slope * i for i, x in enumerate(data)]))
    factor = 1.0
    if autocorrelation and n >= 3:
        bound = 1.959964 / math.sqrt(n)
        acc = sum((n - i) * (n - i - 1) * (n - i - 2) * rho[i]
                  for i in range(1, n) if abs(rho[i]) > bound)
        factor = 1 + 2 / (n * (n - 1) * (n - 2)) * acc
        if factor > 0 and var_s > 0:
            v = var_s * factor
            z = (s - 1) / math.sqrt(v) if s > 0 else (s + 1) / math.sqrt(v) if s < 0 else 0.0
            p_value = 2 * (1 - _norm_cdf(abs(z)))

    tau = s / (n * (n - 1) / 2)

    if p_value < 0.05:
        significance = "significant"
    elif p_value < 0.10:
        significance = "marginal"
    else:
        significance = "not_significant"

    if significance in ("significant", "marginal"):
        trend = "increasing" if tau > 0 else "decreasing"
    else:
        trend = "no_trend"

    return {
        "tau": round(tau, 4),
        "p_value": round(p_value, 4),
        "s": s,
        "significance": significance,
        "trend": trend,
        "sens_slope": round(slope, 6),
        "r1": round(rho[1], 4),
        "variance_factor": round(factor, 4),
    }


def pettitt_test(data: list[float], years: list[float] | None = None) -> dict:
    """
    Pettitt (1979) non-parametric test for a single change point in the median.

    Returns the most likely change year (the last year of the 'before' segment is
    years[k]; the change takes effect from years[k+1]), the statistic K and its
    approximate p-value p = 2 exp(-6K^2 / (n^3 + n^2)).
    """
    n = len(data)
    years = list(range(n)) if years is None else list(years)
    if n < 4:
        return {"change_year": None, "k": 0, "p_value": 1.0, "mean_before": None, "mean_after": None}
    best_k, best_u, u = 0, 0, 0
    for t in range(n - 1):
        # U_t = U_{t-1} + sum_j sgn(x_t - x_j)
        u += sum((data[t] > x) - (data[t] < x) for x in data)
        if abs(u) > abs(best_u):
            best_k, best_u = t, u
    K = abs(best_u)
    p = min(1.0, 2 * math.exp(-6 * K ** 2 / (n ** 3 + n ** 2)))
    before, after = data[: best_k + 1], data[best_k + 1:]
    return {
        "change_year": years[best_k + 1],
        "k": K,
        "p_value": round(p, 4),
        "mean_before": round(sum(before) / len(before), 4),
        "mean_after": round(sum(after) / len(after), 4),
    }


def sens_slope(data: list[float], years: list[float] | None = None) -> float:
    """
    Sen's slope estimator: the median of all pairwise slopes (x_j - x_i) / (t_j - t_i).

    Args:
        data: values in chronological order.
        years: time of each value; defaults to unit steps.
    """
    n = len(data)
    years = list(range(n)) if years is None else list(years)
    if n < 2:
        return 0.0

    slopes = []
    for i in range(n):
        for j in range(i + 1, n):
            dt = years[j] - years[i]
            if dt != 0:
                slopes.append((data[j] - data[i]) / dt)

    if not slopes:
        return 0.0

    slopes.sort()
    mid = len(slopes) // 2
    if len(slopes) % 2 == 0:
        return (slopes[mid - 1] + slopes[mid]) / 2
    else:
        return slopes[mid]


def compute_accuracy_metrics(
    predicted: list[int], reference: list[int], class_labels: list[str] | None = None
) -> dict:
    """
    Compute accuracy assessment metrics from predicted vs. reference classifications.

    Args:
        predicted: List of predicted class labels (integers).
        reference: List of reference (ground truth) class labels (integers).
        class_labels: Optional list of human-readable class names.

    Returns:
        Dictionary with overall accuracy, kappa, and per-class metrics.
    """
    if len(predicted) != len(reference):
        return {"error": "Predicted and reference lists must have the same length"}

    # Get all unique classes
    classes = sorted(set(predicted) | set(reference))
    n_classes = len(classes)
    n_samples = len(predicted)

    if n_samples == 0:
        return {"error": "No samples provided"}

    # Build confusion matrix
    class_to_idx = {c: i for i, c in enumerate(classes)}
    matrix = [[0] * n_classes for _ in range(n_classes)]

    for p, r in zip(predicted, reference):
        pi = class_to_idx[p]
        ri = class_to_idx[r]
        matrix[pi][ri] += 1

    # Overall accuracy
    correct = sum(matrix[i][i] for i in range(n_classes))
    overall_accuracy = correct / n_samples if n_samples > 0 else 0.0

    # Cohen's Kappa
    row_sums = [sum(matrix[i]) for i in range(n_classes)]
    col_sums = [sum(matrix[j][i] for j in range(n_classes)) for i in range(n_classes)]
    expected = sum(row_sums[i] * col_sums[i] for i in range(n_classes)) / (n_samples ** 2)
    kappa = (overall_accuracy - expected) / (1 - expected) if expected != 1 else 0.0

    # Per-class metrics
    per_class = []
    for i, cls in enumerate(classes):
        tp = matrix[i][i]
        # Producer's accuracy (recall): tp / column total
        col_total = col_sums[i]
        producers = tp / col_total if col_total > 0 else 0.0
        # User's accuracy (precision): tp / row total
        row_total = row_sums[i]
        users = tp / row_total if row_total > 0 else 0.0

        label = class_labels[i] if class_labels and i < len(class_labels) else f"Class {cls}"
        per_class.append({
            "class": label,
            "class_id": cls,
            "producers_accuracy": round(producers, 4),
            "users_accuracy": round(users, 4),
            "sample_count": col_total,
        })

    return {
        "overall_accuracy": round(overall_accuracy, 4),
        "kappa": round(kappa, 4),
        "n_samples": n_samples,
        "n_classes": n_classes,
        "confusion_matrix": matrix,
        "per_class": per_class,
        "kappa_interpretation": _interpret_kappa(kappa),
    }


def _interpret_kappa(kappa: float) -> str:
    """Interpret Kappa coefficient using Landis & Koch (1977) scale."""
    if kappa < 0:
        return "Poor"
    elif kappa < 0.21:
        return "Slight"
    elif kappa < 0.41:
        return "Fair"
    elif kappa < 0.61:
        return "Moderate"
    elif kappa < 0.81:
        return "Substantial"
    else:
        return "Almost Perfect"


def _norm_cdf(x: float) -> float:
    """Standard normal CDF approximation (Abramowitz & Stegun, 1964)."""
    # Constants
    a1 = 0.254829592
    a2 = -0.284496736
    a3 = 1.421413741
    a4 = -1.453152027
    a5 = 1.061405429
    p = 0.3275911

    sign = 1 if x >= 0 else -1
    x = abs(x) / math.sqrt(2)

    t = 1.0 / (1.0 + p * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x * x)

    return 0.5 * (1.0 + sign * y)
