/**
 * 模拟交易引擎 - 使用真实行情数据进行模拟交易
 */

interface SimOrder {
  orderId: string;
  accountId: number;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  status: 'pending' | 'filled' | 'cancelled';
  submitTime: Date;
  filledTime?: Date;
}

interface SimPosition {
  symbol: string;
  quantity: number;
  avgPrice: number;
  marketValue: number;
}

const simOrders = new Map<string, SimOrder>();
const simPositions = new Map<number, Map<string, SimPosition>>();

export function submitSimOrder(accountId: number, symbol: string, side: 'buy' | 'sell', quantity: number, price: number) {
  const orderId = `SIM${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const order: SimOrder = {
    orderId,
    accountId,
    symbol,
    side,
    quantity,
    price,
    status: 'filled',
    submitTime: new Date(),
    filledTime: new Date(),
  };
  simOrders.set(orderId, order);

  updateSimPosition(accountId, symbol, side, quantity, price);
  return { orderId, status: 'filled' };
}

function updateSimPosition(accountId: number, symbol: string, side: 'buy' | 'sell', quantity: number, price: number) {
  if (!simPositions.has(accountId)) {
    simPositions.set(accountId, new Map());
  }
  const positions = simPositions.get(accountId)!;
  const pos = positions.get(symbol) || { symbol, quantity: 0, avgPrice: 0, marketValue: 0 };

  if (side === 'buy') {
    const totalCost = pos.quantity * pos.avgPrice + quantity * price;
    pos.quantity += quantity;
    pos.avgPrice = pos.quantity > 0 ? totalCost / pos.quantity : 0;
  } else {
    pos.quantity -= quantity;
    if (pos.quantity < 0) pos.quantity = 0;
  }

  pos.marketValue = pos.quantity * price;
  positions.set(symbol, pos);
}

export function getSimOrders(accountId: number, limit = 50) {
  return Array.from(simOrders.values())
    .filter(o => o.accountId === accountId)
    .sort((a, b) => b.submitTime.getTime() - a.submitTime.getTime())
    .slice(0, limit);
}

export function getSimPositions(accountId: number) {
  const positions = simPositions.get(accountId);
  return positions ? Array.from(positions.values()).filter(p => p.quantity > 0) : [];
}

export function cancelSimOrder(orderId: string) {
  const order = simOrders.get(orderId);
  if (order && order.status === 'pending') {
    order.status = 'cancelled';
    return true;
  }
  return false;
}
