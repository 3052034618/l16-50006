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

export class OrderService {
  async createOrder(
    userId: string,
    items: { productId: string; quantity: number }[],
    shippingAddress: ShippingAddress
  ): Promise<Order> {
    if (items.length === 0) {
      throw new BusinessError('订单项不能为空', 400);
    }

    const orderItems: OrderItem[] = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = db.getProduct(item.productId);
      if (!product) {
        throw new BusinessError(`商品不存在: ${item.productId}`, 404);
      }
      if (item.quantity <= 0) {
        throw new BusinessError(`商品数量必须大于0: ${product.name}`, 400);
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

    const reservations = await stockService.reserveStock(orderId, items);

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
    const order = await this.getOrder(orderId);

    if (order.userId !== userId) {
      throw new BusinessError('无权操作该订单', 403);
    }

    orderStateMachine.assertCanDoAction(order.status, 'cancel');

    const targetStatus = OrderStatus.CLOSED;
    const updated = await this.updateOrderStatus(orderId, targetStatus, '用户取消');

    await stockService.releaseReservation(orderId);

    return updated;
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

    return updated;
  }

  async closeExpiredOrder(orderId: string): Promise<Order | null> {
    const order = db.getOrder(orderId);
    if (!order) return null;

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      return null;
    }

    try {
      orderStateMachine.assertCanDoAction(order.status, 'cancel');
      const updated = await this.updateOrderStatus(orderId, OrderStatus.CLOSED, '超时自动关闭');
      await stockService.releaseReservation(orderId);
      Logger.info(`Order auto-closed: ${order.orderNo}`);
      return updated;
    } catch (e) {
      Logger.error(`Failed to close expired order ${orderId}`, e);
      return null;
    }
  }

  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<Order> {
    const order = await this.getOrder(orderId);
    const updated = db.updateOrder(orderId, { paymentStatus });

    if (paymentStatus === PaymentStatus.PAID && order.status === OrderStatus.PENDING_PAYMENT) {
      await this.updateOrderStatus(orderId, OrderStatus.PENDING_SHIPMENT, '支付成功');
      await stockService.confirmReservation(orderId);
    }

    return updated!;
  }
}

export const orderService = new OrderService();
