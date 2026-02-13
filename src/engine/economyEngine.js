function demandByPrice(prices, item, baseline) {
  const ratio = prices[item] / baseline;
  if (ratio <= 1) {
    return 1 + (1 - ratio) * 0.15;
  }
  return Math.max(0.6, 1 - (ratio - 1) * 0.25);
}

function sellFromInventory(inventory, item, wanted) {
  const sold = Math.min(wanted, inventory[item]);
  inventory[item] -= sold;
  return sold;
}

export {
  demandByPrice,
  sellFromInventory
};
