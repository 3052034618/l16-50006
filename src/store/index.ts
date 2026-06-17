import { Order, Product, StockReservation, PaymentRecord, RefundRecord, OrderEvent } from '../types';

class InMemoryStore {
  private products: Map<string, Product> = new Map();
  private orders: Map<string, Order> = new Map();
  private reservations: Map<string, StockReservation> = new Map();
  private paymentRecords: Map<string, PaymentRecord> = new Map();
  private refundRecords: Map<string, RefundRecord> = new Map();
  private orderEvents: Map<string, OrderEvent> = new Map();
  private locks: Map<string, { value: string; expireAt: number }> = new Map();

  private static instance: InMemoryStore;

  private constructor() {}

  static getInstance(): InMemoryStore {
    if (!InMemoryStore.instance) {
      InMemoryStore.instance = new InMemoryStore();
    }
    return InMemoryStore.instance;
  }

  getProducts(): Product[] {
    return Array.from(this.products.values());
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  addProduct(product: Product): void {
    this.products.set(product.id, product);
  }

  updateProduct(id: string, updates: Partial<Product>): Product | undefined {
    const product = this.products.get(id);
    if (!product) return undefined;
    const updated = { ...product, ...updates };
    this.products.set(id, updated);
    return updated;
  }

  getOrders(): Order[] {
    return Array.from(this.orders.values()).sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }

  getOrderByNo(orderNo: string): Order | undefined {
    return Array.from(this.orders.values()).find(o => o.orderNo === orderNo);
  }

  getOrdersByUserId(userId: string): Order[] {
    return Array.from(this.orders.values())
      .filter(o => o.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  addOrder(order: Order): void {
    this.orders.set(order.id, order);
  }

  updateOrder(id: string, updates: Partial<Order>): Order | undefined {
    const order = this.orders.get(id);
    if (!order) return undefined;
    const updated = { ...order, ...updates, updatedAt: new Date() };
    this.orders.set(id, updated);
    return updated;
  }

  getReservation(id: string): StockReservation | undefined {
    return this.reservations.get(id);
  }

  getReservationsByOrderId(orderId: string): StockReservation[] {
    return Array.from(this.reservations.values()).filter(r => r.orderId === orderId);
  }

  addReservation(reservation: StockReservation): void {
    this.reservations.set(reservation.id, reservation);
  }

  updateReservation(id: string, updates: Partial<StockReservation>): StockReservation | undefined {
    const reservation = this.reservations.get(id);
    if (!reservation) return undefined;
    const updated = { ...reservation, ...updates };
    this.reservations.set(id, updated);
    return updated;
  }

  getExpiredReservations(now: Date): StockReservation[] {
    return Array.from(this.reservations.values()).filter(
      r => r.status === 'ACTIVE' && r.expiresAt <= now
    );
  }

  getPaymentRecord(id: string): PaymentRecord | undefined {
    return this.paymentRecords.get(id);
  }

  getPaymentRecordsByOrderId(orderId: string): PaymentRecord[] {
    return Array.from(this.paymentRecords.values())
      .filter(p => p.orderId === orderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  addPaymentRecord(record: PaymentRecord): void {
    this.paymentRecords.set(record.id, record);
  }

  updatePaymentRecord(id: string, updates: Partial<PaymentRecord>): PaymentRecord | undefined {
    const record = this.paymentRecords.get(id);
    if (!record) return undefined;
    const updated = { ...record, ...updates };
    this.paymentRecords.set(id, updated);
    return updated;
  }

  getRefundRecord(id: string): RefundRecord | undefined {
    return this.refundRecords.get(id);
  }

  getRefundRecordsByOrderId(orderId: string): RefundRecord[] {
    return Array.from(this.refundRecords.values())
      .filter(r => r.orderId === orderId)
      .sort((a, b) => b.applyTime.getTime() - a.applyTime.getTime());
  }

  addRefundRecord(record: RefundRecord): void {
    this.refundRecords.set(record.id, record);
  }

  updateRefundRecord(id: string, updates: Partial<RefundRecord>): RefundRecord | undefined {
    const record = this.refundRecords.get(id);
    if (!record) return undefined;
    const updated = { ...record, ...updates };
    this.refundRecords.set(id, updated);
    return updated;
  }

  setLock(key: string, value: string, expireMs: number): boolean {
    const existing = this.locks.get(key);
    const now = Date.now();
    if (existing && existing.expireAt > now) {
      return false;
    }
    this.locks.set(key, { value, expireAt: now + expireMs });
    return true;
  }

  releaseLock(key: string, value: string): boolean {
    const lock = this.locks.get(key);
    if (!lock || lock.value !== value) return false;
    this.locks.delete(key);
    return true;
  }

  cleanExpiredLocks(): void {
    const now = Date.now();
    for (const [key, lock] of this.locks) {
      if (lock.expireAt <= now) {
        this.locks.delete(key);
      }
    }
  }

  addOrderEvent(event: OrderEvent): void {
    this.orderEvents.set(event.id, event);
  }

  getOrderEventsByOrderId(orderId: string): OrderEvent[] {
    return Array.from(this.orderEvents.values())
      .filter(e => e.orderId === orderId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getAllRefundRecords(): RefundRecord[] {
    return Array.from(this.refundRecords.values())
      .sort((a, b) => b.applyTime.getTime() - a.applyTime.getTime());
  }

  getRefundRecordsByStatus(status: string): RefundRecord[] {
    return Array.from(this.refundRecords.values())
      .filter(r => r.status === status)
      .sort((a, b) => b.applyTime.getTime() - a.applyTime.getTime());
  }

  getAllPaymentRecords(): PaymentRecord[] {
    return Array.from(this.paymentRecords.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getPaymentRecordsByStatus(status: string): PaymentRecord[] {
    return Array.from(this.paymentRecords.values())
      .filter(p => status === 'ALL' ? true : p.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getPaymentSummary(): {
    total: { count: number; amount: number };
    paid: { count: number; amount: number };
    refunding: { count: number; amount: number };
    refunded: { count: number; amount: number };
    failed: { count: number; amount: number };
  } {
    const all = Array.from(this.paymentRecords.values());
    const sumBy = (filter: (p: PaymentRecord) => boolean) =>
      all.filter(filter).reduce((s, p) => ({ count: s.count + 1, amount: s.amount + p.amount }),
        { count: 0, amount: 0 });
    return {
      total: sumBy(() => true),
      paid: sumBy(p => p.status === 'PAID'),
      refunding: sumBy(p => p.status === 'REFUNDING'),
      refunded: sumBy(p => p.status === 'REFUNDED'),
      failed: sumBy(p => p.status === 'FAILED'),
    };
  }

  getReservationsByProductId(productId: string): StockReservation[] {
    return Array.from(this.reservations.values())
      .filter(r => r.productId === productId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getReservationsByProductIdWithOrder(productId: string): Array<StockReservation & {
    orderStatus?: string;
    orderNo?: string;
    reservationCategory?: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCEL_RELEASED' | 'TIMEOUT_RELEASED';
  }> {
    return this.getReservationsByProductId(productId).map(r => {
      const order = this.getOrder(r.orderId);
      let category: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCEL_RELEASED' | 'TIMEOUT_RELEASED' | undefined;
      if (r.status === 'ACTIVE') {
        category = 'PENDING_PAYMENT';
      } else if (r.status === 'CONFIRMED') {
        category = 'CONFIRMED';
      } else if (r.status === 'RELEASED') {
        if (order?.status === 'CLOSED' && order?.remark === '超时自动关闭') {
          category = 'TIMEOUT_RELEASED';
        } else {
          category = 'CANCEL_RELEASED';
        }
      }
      return {
        ...r,
        orderStatus: order?.status,
        orderNo: order?.orderNo,
        reservationCategory: category,
      };
    });
  }

  getAllReservations(): StockReservation[] {
    return Array.from(this.reservations.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export const db = InMemoryStore.getInstance();
