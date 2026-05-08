// lib/scoring.js

export function getMomentumLabel(value) {
  if (value >= 70) {
    return "Strong";
  }

  if (value >= 50) {
    return "Building";
  }

  return "Weak";
}

export function getMomentumColor(value) {
  if (value >= 70) {
    return "green";
  }

  if (value >= 50) {
    return "yellow";
  }

  return "red";
}

export function getScoreColor(score) {
  if (score >= 75) {
    return "green";
  }

  if (score >= 55) {
    return "yellow";
  }

  return "red";
}

export function getTriggerColor(trigger) {
  if (trigger >= 80) {
    return "green";
  }

  if (trigger >= 60) {
    return "yellow";
  }

  return "red";
}

function isIncomeOrREIT(stock) {
  const text = `
    ${stock?.symbol || ""}
    ${stock?.name || ""}
    ${stock?.sector || ""}
    ${stock?.industry || ""}
  `.toLowerCase();

  const blockedTerms = [
    "reit",
    "real estate",
    "mortgage",
    "income",
    "property",
    "capital trust",
    "realty",
  ];

  return blockedTerms.some((term) => text.includes(term));
}

export function getTradeAction(stock) {
  const score = Number(stock?.score || 0);
  const trigger = Number(stock?.trigger || 0);
  const momentumValue = Number(stock?.momentumValue || 0);

  const scoreGreen = score >= 75;
  const triggerGreen = trigger >= 80;
  const momentumGreen = momentumValue >= 70;
  const momentumBuilding = momentumValue >= 50;

  const blockedArchetype = isIncomeOrREIT(stock);

  // FULL BUY NOW REQUIREMENTS
  if (
    scoreGreen &&
    triggerGreen &&
    momentumGreen &&
    !blockedArchetype
  ) {
    return "Buy Now";
  }

  // GOOD SETUPS BUT NOT FULLY CONFIRMED
  if (
    scoreGreen &&
    triggerGreen &&
    momentumBuilding
  ) {
    return "Watch for Entry";
  }

  if (
    triggerGreen &&
    momentumBuilding
  ) {
    return "Watch for Entry";
  }

  if (trigger >= 70) {
    return "Watch for Entry";
  }

  return "Avoid for Now";
}

export function getWhyText(stock) {
  const action = getTradeAction(stock);

  if (action === "Buy Now") {
    return "High-quality asymmetric setup with strong momentum, confirmation, and technical alignment.";
  }

  if (action === "Watch for Entry") {
    if (isIncomeOrREIT(stock)) {
      return "REIT / Income setup has positive technical characteristics, but this category is capped below Buy Now for your trading style.";
    }

    return "Setup is improving, but confirmation and momentum are not yet fully aligned.";
  }

  return "Momentum and/or technical alignment remain below preferred trading thresholds.";
}

export function getEntryNote(stock) {
  const action = getTradeAction(stock);

  if (action === "Buy Now") {
    return "Momentum, trigger, and composite quality are all aligned. Buying now is reasonable.";
  }

  if (action === "Watch for Entry") {
    if (isIncomeOrREIT(stock)) {
      return "REIT / Income names are intentionally capped below Buy Now under your asymmetric trading framework.";
    }

    return "Monitor for stronger momentum confirmation before aggressive sizing.";
  }

  return "Wait for stronger technical and momentum confirmation.";
}
