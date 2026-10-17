// Only the prospective position-count gate changes; all qualifications,
// sizing, exposure, exits, rank thresholds and lifecycle code stay unchanged.
module.exports=[
 ['      const portfolioRiskPaused = activeSessionNumber <= portfolioRiskPausedThrough;',
  '      const portfolioRiskPaused = activeSessionNumber <= portfolioRiskPausedThrough;\n      const deferredCapacityOrders = new Set();'],
 ['        const orderSector = existing?.sector || order.sector || "Other";',
  '        if(!completion && positions.size>=config.maxPositions && actualReplay?.additionalCapacityAllowed(session.date,order.symbol,order.action) && !deferredCapacityOrders.has(order)){\n          deferredCapacityOrders.add(order);buyOrders.push(order);continue;\n        }\n        const orderSector = existing?.sector || order.sector || "Other";'],
 ['(!completion && positions.size >= config.maxPositions)',
  '(!completion && positions.size >= config.maxPositions && !actualReplay?.additionalCapacityAllowed(session.date,order.symbol,order.action))'],
 ["(!completion&&positions.size>=config.maxPositions)?'position-limit'",
  "(!completion&&positions.size>=config.maxPositions&&!actualReplay?.additionalCapacityAllowed(session.date,order.symbol,order.action))?'position-limit'"]
];
