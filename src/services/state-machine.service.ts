import { OrderStatus } from '../types';
import { BusinessError } from '../utils';

type StateTransition = {
  from: OrderStatus[];
  to: OrderStatus;
  action: string;
};

class OrderStateMachine {
  private transitions: StateTransition[] = [
    { from: [OrderStatus.PENDING_PAYMENT], to: OrderStatus.PENDING_SHIPMENT, action: 'pay' },
    { from: [OrderStatus.PENDING_PAYMENT], to: OrderStatus.CLOSED, action: 'cancel' },
    { from: [OrderStatus.PENDING_SHIPMENT], to: OrderStatus.SHIPPED, action: 'ship' },
    { from: [OrderStatus.PENDING_SHIPMENT], to: OrderStatus.REFUNDING, action: 'applyRefund' },
    { from: [OrderStatus.SHIPPED], to: OrderStatus.COMPLETED, action: 'confirm' },
    { from: [OrderStatus.SHIPPED], to: OrderStatus.REFUNDING, action: 'applyRefund' },
    { from: [OrderStatus.REFUNDING], to: OrderStatus.REFUNDED, action: 'refundSuccess' },
    { from: [OrderStatus.REFUNDING], to: OrderStatus.PENDING_SHIPMENT, action: 'rejectRefund' },
    { from: [OrderStatus.REFUNDING], to: OrderStatus.SHIPPED, action: 'rejectRefund' },
    { from: [OrderStatus.PENDING_SHIPMENT], to: OrderStatus.REFUNDING, action: 'merchantRefund' },
    { from: [OrderStatus.COMPLETED], to: OrderStatus.REFUNDING, action: 'applyRefund' },
  ];

  canTransition(currentStatus: OrderStatus, targetStatus: OrderStatus): boolean {
    return this.transitions.some(
      t => t.to === targetStatus && t.from.includes(currentStatus)
    );
  }

  canDoAction(currentStatus: OrderStatus, action: string): boolean {
    return this.transitions.some(
      t => t.action === action && t.from.includes(currentStatus)
    );
  }

  getTargetStatusByAction(currentStatus: OrderStatus, action: string): OrderStatus | null {
    const transition = this.transitions.find(
      t => t.action === action && t.from.includes(currentStatus)
    );
    return transition ? transition.to : null;
  }

  assertCanTransition(currentStatus: OrderStatus, targetStatus: OrderStatus): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new BusinessError(
        `非法状态流转: ${currentStatus} -> ${targetStatus}`,
        400
      );
    }
  }

  assertCanDoAction(currentStatus: OrderStatus, action: string): void {
    if (!this.canDoAction(currentStatus, action)) {
      throw new BusinessError(
        `当前状态 ${currentStatus} 不允许执行操作: ${action}`,
        400
      );
    }
  }

  getAllStatuses(): OrderStatus[] {
    return Object.values(OrderStatus);
  }

  getValidActions(status: OrderStatus): string[] {
    return this.transitions
      .filter(t => t.from.includes(status))
      .map(t => t.action);
  }
}

export const orderStateMachine = new OrderStateMachine();
