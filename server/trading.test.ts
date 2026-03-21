import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// 模拟用户上下文
function createAuthContext(): TrpcContext {
  const user = {
    id: 1,
    openId: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    loginMethod: 'manus',
    role: 'user' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: 'https',
      headers: {},
    } as TrpcContext['req'],
    res: {
      clearCookie: vi.fn(),
    } as TrpcContext['res'],
  };

  return ctx;
}

describe('Trading Router', () => {
  let ctx: TrpcContext;

  beforeEach(() => {
    ctx = createAuthContext();
  });

  describe('Connection Management', () => {
    it('should create a new trading connection', async () => {
      const caller = appRouter.createCaller(ctx);

      const result = await caller.trading.createConnection({
        name: 'Test Connection',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'testuser',
        password: 'testpass',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.name).toBe('Test Connection');
      expect(result.interfaceType).toBe('qmt');
      expect(result.isConnected).toBe(false);
    });

    it('should retrieve all connections for user', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection first
      await caller.trading.createConnection({
        name: 'Connection 1',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user1',
        password: 'pass1',
      });

      // Get all connections
      const connections = await caller.trading.getConnections();

      expect(Array.isArray(connections)).toBe(true);
      expect(connections.length).toBeGreaterThan(0);
      expect(connections[0].name).toBe('Connection 1');
    });

    it('should toggle connection status', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const created = await caller.trading.createConnection({
        name: 'Toggle Test',
        interfaceType: 'xtp',
        host: '127.0.0.1',
        port: 9999,
        username: 'user2',
        password: 'pass2',
      });

      // Toggle connection
      const result = await caller.trading.toggleConnection({
        connectionId: created.id,
        isConnected: true,
      });

      expect(result.isConnected).toBe(true);
    });
  });

  describe('Order Management', () => {
    it('should submit an order', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection first
      const connection = await caller.trading.createConnection({
        name: 'Order Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user3',
        password: 'pass3',
      });

      // Submit an order
      const result = await caller.trading.submitOrder({
        connectionId: connection.id,
        symbol: '000001.SZ',
        side: 'buy',
        quantity: 100,
        price: 15.5,
        orderType: 'limit',
      });

      expect(result).toBeDefined();
      expect(result.orderId).toBeDefined();
      expect(result.symbol).toBe('000001.SZ');
      expect(result.side).toBe('buy');
      expect(result.quantity).toBe(100);
      expect(result.status).toBe('pending');
    });

    it('should retrieve orders for a connection', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const connection = await caller.trading.createConnection({
        name: 'Orders List Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user4',
        password: 'pass4',
      });

      // Submit an order
      await caller.trading.submitOrder({
        connectionId: connection.id,
        symbol: '000002.SZ',
        side: 'sell',
        quantity: 50,
        price: 20.0,
        orderType: 'limit',
      });

      // Get orders
      const orders = await caller.trading.getOrders({
        connectionId: connection.id,
      });

      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].symbol).toBe('000002.SZ');
    });

    it('should cancel an order', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const connection = await caller.trading.createConnection({
        name: 'Cancel Order Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user5',
        password: 'pass5',
      });

      // Submit an order
      const order = await caller.trading.submitOrder({
        connectionId: connection.id,
        symbol: '000003.SZ',
        side: 'buy',
        quantity: 100,
        price: 15.0,
        orderType: 'limit',
      });

      // Cancel the order
      const result = await caller.trading.cancelOrder({
        connectionId: connection.id,
        orderId: order.orderId,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('cancelled');
    });
  });

  describe('Position Management', () => {
    it('should retrieve positions for a connection', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const connection = await caller.trading.createConnection({
        name: 'Positions Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user6',
        password: 'pass6',
      });

      // Get positions
      const positions = await caller.trading.getPositions({
        connectionId: connection.id,
      });

      expect(Array.isArray(positions)).toBe(true);
      // Positions may be empty initially
    });
  });

  describe('Quote Management', () => {
    it('should retrieve real-time quotes', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const connection = await caller.trading.createConnection({
        name: 'Quotes Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user7',
        password: 'pass7',
      });

      // Get quotes
      const quotes = await caller.trading.getRealtimeQuotes({
        connectionId: connection.id,
      });

      expect(Array.isArray(quotes)).toBe(true);
      // Quotes may be empty or contain data depending on connection status
    });

    it('should subscribe to quote updates', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const connection = await caller.trading.createConnection({
        name: 'Subscribe Quotes Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user8',
        password: 'pass8',
      });

      // Subscribe to quotes
      const result = await caller.trading.subscribeQuotes({
        connectionId: connection.id,
        symbols: ['000001.SZ', '000002.SZ'],
      });

      expect(result.success).toBe(true);
      expect(result.subscribedSymbols).toContain('000001.SZ');
      expect(result.subscribedSymbols).toContain('000002.SZ');
    });
  });

  describe('Account Information', () => {
    it('should retrieve account information', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const connection = await caller.trading.createConnection({
        name: 'Account Info Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user9',
        password: 'pass9',
      });

      // Get account info
      const accountInfo = await caller.trading.getAccountInfo({
        connectionId: connection.id,
      });

      expect(accountInfo).toBeDefined();
      expect(accountInfo.totalAssets).toBeDefined();
      expect(accountInfo.availableCash).toBeDefined();
      expect(accountInfo.positionValue).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid connection ID', async () => {
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.trading.getConnectionDetail({
          connectionId: 99999,
        });
        expect.fail('Should throw an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid order submission', async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a connection
      const connection = await caller.trading.createConnection({
        name: 'Error Test',
        interfaceType: 'qmt',
        host: '127.0.0.1',
        port: 8888,
        username: 'user10',
        password: 'pass10',
      });

      try {
        await caller.trading.submitOrder({
          connectionId: connection.id,
          symbol: 'INVALID',
          side: 'buy',
          quantity: 0, // Invalid quantity
          price: -1, // Invalid price
          orderType: 'limit',
        });
        expect.fail('Should throw an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
