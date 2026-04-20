export function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";

  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
}

export function scoreColor(score) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "yellow";
  }

  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

export function scorePillStyle(color) {
  if (color === "green") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    };
  }

  if (color === "red") {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    };
  }

  return {
    background: "#fef3c7",
    color: "#92400e",
    border: "1px solid #fde68a",
  };
}

export function driverCardStyle(color) {
  if (color === "green") {
    return {
      background: "#f0fdf4",
      border: "1px solid #bbf7d0",
    };
  }

  if (color === "red") {
    return {
      background: "#fef2f2",
      border: "1px solid #fecaca",
    };
  }

  return {
    background: "#fffbeb",
    border: "1px solid #fde68a",
  };
}
