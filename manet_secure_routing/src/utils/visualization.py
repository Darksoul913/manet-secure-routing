import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

MARKERS = "osD^v<>p*h"


def plot_lines(x, series, xlabel, ylabel, title, path):
    """series: {name: y-values}. One marked line per series."""
    fig, ax = plt.subplots(figsize=(6, 4))
    for (name, y), m in zip(series.items(), MARKERS):
        ax.plot(x, y, marker=m, label=name, linewidth=1.8 if name == "HCDSO" else 1.2)
    ax.set(xlabel=xlabel, ylabel=ylabel, title=title)
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_metric_bars(table, metrics, title, path):
    """table: DataFrame indexed by model name with one column per metric."""
    ax = table[metrics].plot.bar(figsize=(7, 4), rot=0)
    ax.set(title=title, ylabel="score")
    ax.grid(axis="y", alpha=0.3)
    ax.legend(loc="lower right", fontsize=8)
    ax.figure.tight_layout()
    ax.figure.savefig(path, dpi=150)
    plt.close(ax.figure)


def plot_histories(histories, key, title, path):
    """histories: {model: [{"epoch":..., key:...}, ...]}"""
    series = {name: [h[key] for h in hist] for name, hist in histories.items()}
    fig, ax = plt.subplots(figsize=(6, 4))
    for name, y in series.items():
        ax.plot(range(1, len(y) + 1), y, marker="o", label=name)
    ax.set(xlabel="epoch", ylabel=key, title=title)
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
