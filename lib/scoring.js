// ADD THIS NEW FUNCTION
// Place directly BELOW calcExtensionRisk()

function lateStageChasePenalty(row = {}) {
  let penalty = 0;

  const extensionRisk = calcExtensionRisk(row);
  const day = num(row.dayChangePct);
  const rv = relativeVolume(row);

  const { pctFrom50, pctFrom200 } = trendData(row);

  if (pctFrom50 != null) {
    if (pctFrom50 > 30) penalty += 35;
    else if (pctFrom50 > 24) penalty += 24;
    else if (pctFrom50 > 18) penalty += 14;
  }

  if (pctFrom200 != null) {
    if (pctFrom200 > 120) penalty += 24;
    else if (pctFrom200 > 80) penalty += 14;
  }

  if (day != null) {
    if (day >= 12) penalty += 24;
    else if (day >= 8) penalty += 14;
  }

  if (rv != null && day != null) {
    if (rv >= 5 && day >= 8) penalty += 20;
    else if (rv >= 3.5 && day >= 6) penalty += 12;
  }

  if (extensionRisk >= 65) penalty += 30;
  else if (extensionRisk >= 50) penalty += 16;

  return roundScore(penalty);
}
