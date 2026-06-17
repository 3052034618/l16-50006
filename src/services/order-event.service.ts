import { db } from '../store';
import { OrderEvent, OrderEventType } from '../types';
import { generateId, Logger } from '../utils';

export class OrderEventService {
  recordEvent(
    orderId: string,
    eventType: OrderEventType,
    description: string,
    operator: string = 'system',
    metadata?: Record<string, any>
  ): OrderEvent {
    const event: OrderEvent = {
      id: generateId(),
      orderId,
      eventType,
      description,
      operator,
      metadata,
      createdAt: new Date(),
    };

    db.addOrderEvent(event);
    Logger.info(`Order event: [${eventType}] ${description}`, { orderId });
    return event;
  }

  getOrderTimeline(orderId: string): OrderEvent[] {
    return db.getOrderEventsByOrderId(orderId);
  }
}

export const orderEventService = new OrderEventService();
