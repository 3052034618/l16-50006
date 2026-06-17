import { db } from '../store';
import {
  Order,
  OrderStatus,
  OrderItem,
  ShippingAddress,
  PaymentStatus,
} from '../types';
import { generateId, generateOrderNo, BusinessError, Logger } from '../utils';
import { orderStateMachine } from './state-machine.service';
import { stockService } from './stock.service';
import { withLock } from './lock.service';
import { orderEventService } from './order-event.service';
import { OrderEventType } from '../types';

const ORDER_LOCK_PREFIX = 'order:';

function withOrderLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  return withLock(`${ORDER_LOCK_PREFIX}${orderId}`, fn, 10000, 3, 200);
}

export class OrderService {
  async createOrder(
    userId: string,
    items: { productId: string; quantity: number }[],
    shippingAddress: ShippingAddress
  ): Promise<Order> {
    if (items.length === 0) {
      throw new BusinessError('订单项不能为空', 400);
    }

    const mergedMap = new Map<string, number>();
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new BusinessError('商品数量必须大于0', 400);
      }
      mergedMap.set(item.productId, (mergedMap.get(item.productId) || 0) + item.quantity);
    }

    const mergedItems = Array.from(mergedMap.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));

    const orderItems: OrderItem[] = [];
    let totalAmount = 0;

    for (const item of mergedItems) {
      const product = db.getProduct(item.productId);
      if (!product) {
        throw new BusinessError(`商品不存在: ${item.productId}`, 404);
      }
      orderItems.push({
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: item.quantity,
      });
      totalAmount += product.price * item.quantity;
    }

    const orderId = generateId();
    const orderNo = generateOrderNo();

    const reservations = await stockService.reserveStock(orderId, mergedItems);

    try {
      const order: Order = {
        id: orderId,
        orderNo,
        userId,
        items: orderItems,
        totalAmount,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.UNPAID,
        shippingAddress,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      db.addOrder(order);

      orderEventService.recordEvent(orderId, OrderEventType.CREATED, `创建订单 ${orderNo}，金额 ¥${totalAmount}`, userId, { totalAmount, itemCount: orderItems.length });
      orderEventService.recordEvent(orderId, OrderEventType.STOCK_RESERVED, `库存预占成功，${orderItems.map(i => `${i.productName}x${i.quantity}`).join('、')}`, 'system');

      Logger.info(`Order created: ${orderNo}`, { userId, totalAmount });

      return order;
    } catch (e) {
      await stockService.rollbackReservations(reservations);
      throw e;
    }
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = db.getOrder(orderId);
    if (!order) {
      throw new BusinessError('订单不存在', 404);
    }
    return order;
  }

  async getOrderByNo(orderNo: string): Promise<Order> {
    const order = db.getOrderByNo(orderNo);
    if (!order) {
      throw new BusinessError('订单不存在', 404);
    }
    return order;
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return db.getOrdersByUserId(userId);
  }

  async getAllOrders(): Promise<Order[]> {
    return db.getOrders();
  }

  async updateOrderStatus(
    orderId: string,
    targetStatus: OrderStatus,
    remark?: string
  ): Promise<Order> {
    const order = await this.getOrder(orderId);

    orderStateMachine.assertCanTransition(order.status, targetStatus);

    const updates: Partial<Order> = {
      status: targetStatus,
    };

    if (remark) {
      updates.remark = remark;
    }

    const updated = db.updateOrder(orderId, updates);

    Logger.info(`Order status updated: ${order.orderNo}`, {
      from: order.status,
      to: targetStatus,
    });

    return updated!;
  }

  async cancelOrder(orderId: string, userId: string): Promise<Order> {
    return await withOrderLock(orderId, async () => {
      const order = await this.getOrder(orderId);

      if (order.userId !== userId) {
        throw new BusinessError('无权操作该订单', 403);
      }

      orderStateMachine.assertCanDoAction(order.status, 'cancel');

      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new BusinessError(`订单状态为${order.status}，无法取消`, 400);
      }

      await stockService.releaseReservation(orderId);

      const updated = db.updateOrder(orderId, {
        status: OrderStatus.CLOSED,
        paymentStatus: PaymentStatus.UNPAID,
        remark: '用户取消',
      });

      orderEventService.recordEvent(orderId, OrderEventType.STOCK_RELEASED, '取消订单，库存预占释放', 'system');
      orderEventService.recordEvent(orderId, OrderEventType.CANCELLED, '用户取消订单', userId);

      Logger.info(`Order cancelled: ${order.orderNo}`);

      return updated!;
    });
  }

  async shipOrder(
    orderId: string,
    trackingNumber: string,
    logisticsCompany: string
  ): Promise<Order> {
    const order = await this.getOrder(orderId);

    orderStateMachine.assertCanDoAction(order.status, 'ship');

    const updated = db.updateOrder(orderId, {
      status: OrderStatus.SHIPPED,
      trackingNumber,
      logisticsCompany,
    });

    orderEventService.recordEvent(orderId, OrderEventType.SHIPPED, `已发货，${logisticsCompany} 单号 ${trackingNumber}`, 'merchant', { trackingNumber, logisticsCompany });

    Logger.info(`Order shipped: ${order.orderNo}`, { trackingNumber, logisticsCompany });

    return updated!;
  }

  async confirmReceive(orderId: string, userId: string): Promise<Order> {
    const order = await this.getOrder(orderId);

    if (order.userId !== userId) {
      throw new BusinessError('无权操作该订单', 403);
    }

    orderStateMachine.assertCanDoAction(order.status, 'confirm');

    const updated = await this.updateOrderStatus(orderId, OrderStatus.COMPLETED, '用户确认收货');

    orderEventService.recordEvent(orderId, OrderEventType.COMPLETED, '用户确认收货', userId);

    return updated;
  }

  async closeExpiredOrder(orderId: string): Promise<Order | null> {
    const order = db.getOrder(orderId);
    if (!order) return null;
    if (order.status !== OrderStatus.PENDING_PAYMENT) return null;

    try {
      return await withOrderLock(orderId, async () => {
        const freshOrder = await this.getOrder(orderId);
        if (freshOrder.status !== OrderStatus.PENDING_PAYMENT) {
          return null;
        }

        orderStateMachine.assertCanDoAction(freshOrder.status, 'cancel');

        await stockService.releaseReservation(orderId);

        const closed = db.updateOrder(orderId, {
          status: OrderStatus.CLOSED,
          paymentStatus: PaymentStatus.UNPAID,
          remark: '超时自动关闭',
        });

        orderEventService.recordEvent(orderId, OrderEventType.STOCK_RELEASED, '超时自动关闭，库存预占释放', 'system');
        orderEventService.recordEvent(orderId, OrderEventType.AUTO_CLOSED, '订单超时未支付，自动关闭', 'system');

        Logger.info(`Order auto-closed: ${freshOrder.orderNo}`);
        return closed!;
      });
    } catch (e) {
      Logger.error(`Failed to close expired order ${orderId}`, e);
      return null;
    }
  }

  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<Order> {
    return await withOrderLock(orderId, async () => {
      const order = await this.getOrder(orderId);

      if (paymentStatus === PaymentStatus.PAID) {
        if (order.status !== OrderStatus.PENDING_PAYMENT) {
          throw new BusinessError(`订单状态为${order.status}，无法标记为已支付`, 400);
        }

        const updated = db.updateOrder(orderId, { paymentStatus });

        await this.updateOrderStatus(orderId, OrderStatus.PENDING_SHIPMENT, '支付成功');
        await stockService.confirmReservation(orderId);

        orderEventService.recordEvent(orderId, OrderEventType.PAYMENT_SUCCESS, `支付成功，金额 ¥${order.totalAmount}`, 'payment', { amount: order.totalAmount });
        orderEventService.recordEvent(orderId, OrderEventType.STOCK_CONFIRMED, '支付确认，库存预占转为已成交', 'system');

        const finalOrder = await this.getOrder(orderId);
        return finalOrder;
      }

      if (paymentStatus === PaymentStatus.REFUNDED) {
        db.updateOrder(orderId, { paymentStatus: PaymentStatus.REFUNDED });
        const finalOrder = await this.getOrder(orderId);
        return finalOrder;
      }

      const updated = db.updateOrder(orderId, { paymentStatus });
      return updated!;
    });
  }
}

export const orderService = new OrderService();
