import { db } from '../store';
import { RefundRecord, OrderStatus, PaymentStatus } from '../types';
import { generateId, BusinessError, Logger } from '../utils';
import { orderService } from './order.service';
import { paymentService } from './payment.service';
import { orderStateMachine } from './state-machine.service';

export class RefundService {
  async applyRefund(orderId: string, userId: string, reason: string): Promise<RefundRecord> {
    const order = await orderService.getOrder(orderId);

    if (order.userId !== userId) {
      throw new BusinessError('无权操作该订单', 403);
    }

    orderStateMachine.assertCanDoAction(order.status, 'applyRefund');

    const existingRefunds = db.getRefundRecordsByOrderId(orderId);
    const activeRefund = existingRefunds.find(
      r => r.status === 'PENDING' || r.status === 'APPROVED' || r.status === 'PROCESSING'
    );

    if (activeRefund) {
      throw new BusinessError('已有进行中的退款申请', 400);
    }

    const refundRecord: RefundRecord = {
      id: generateId(),
      orderId,
      amount: order.totalAmount,
      reason,
      status: 'PENDING',
      applyTime: new Date(),
    };

    db.addRefundRecord(refundRecord);

    await orderService.updateOrderStatus(orderId, OrderStatus.REFUNDING, `用户申请退款: ${reason}`);

    Logger.info(`Refund application submitted: ${refundRecord.id}`, { orderId, amount: order.totalAmount });

    return refundRecord;
  }

  async approveRefund(refundId: string): Promise<RefundRecord> {
    const refundRecord = db.getRefundRecord(refundId);
    if (!refundRecord) {
      throw new BusinessError('退款记录不存在', 404);
    }

    if (refundRecord.status !== 'PENDING') {
      throw new BusinessError('退款申请状态不允许审批', 400);
    }

    db.updateRefundRecord(refundId, {
      status: 'APPROVED',
      approveTime: new Date(),
    });

    const paymentRecords = paymentService.getPaymentRecordsByOrderId(refundRecord.orderId);
    const paidRecord = paymentRecords.find(p => p.status === PaymentStatus.PAID || p.status === PaymentStatus.REFUNDING);

    if (paidRecord) {
      try {
        db.updateRefundRecord(refundId, { status: 'PROCESSING' });

        const result = await paymentService.refund(paidRecord.id, refundRecord.reason);

        db.updateRefundRecord(refundId, {
          transactionId: result.refundId,
        });

        const checkRefund = setInterval(() => {
          const updated = db.getRefundRecord(refundId);
          const updatedPayment = db.getPaymentRecord(paidRecord.id);

          if (updatedPayment?.status === PaymentStatus.REFUNDED && updated) {
            clearInterval(checkRefund);
            db.updateRefundRecord(refundId, {
              status: 'COMPLETED',
              refundTime: new Date(),
            });
          }
        }, 1000);

        setTimeout(() => clearInterval(checkRefund), 10000);
      } catch (e) {
        db.updateRefundRecord(refundId, { status: 'FAILED' });
        Logger.error(`Refund processing failed: ${refundId}`, e);
      }
    }

    const updated = db.getRefundRecord(refundId);
    Logger.info(`Refund approved: ${refundId}`);
    return updated!;
  }

  async rejectRefund(refundId: string, reason: string): Promise<RefundRecord> {
    const refundRecord = db.getRefundRecord(refundId);
    if (!refundRecord) {
      throw new BusinessError('退款记录不存在', 404);
    }

    if (refundRecord.status !== 'PENDING') {
      throw new BusinessError('退款申请状态不允许拒绝', 400);
    }

    db.updateRefundRecord(refundId, {
      status: 'REJECTED',
    });

    const order = await orderService.getOrder(refundRecord.orderId);

    let targetStatus: OrderStatus;
    if (order.items.length > 0) {
      if (order.trackingNumber) {
        targetStatus = OrderStatus.SHIPPED;
      } else {
        targetStatus = OrderStatus.PENDING_SHIPMENT;
      }
    } else {
      targetStatus = OrderStatus.PENDING_SHIPMENT;
    }

    try {
      orderStateMachine.assertCanTransition(order.status, targetStatus);
      await orderService.updateOrderStatus(
        refundRecord.orderId,
        targetStatus,
        `退款被拒绝: ${reason}`
      );
    } catch (e) {
      Logger.warn(`Could not restore order status after refund rejection`, e);
    }

    Logger.info(`Refund rejected: ${refundId}`, { reason });

    return { ...refundRecord, status: 'REJECTED' };
  }

  async getRefundRecordsByOrderId(orderId: string): Promise<RefundRecord[]> {
    return db.getRefundRecordsByOrderId(orderId);
  }

  async getRefundRecord(refundId: string): Promise<RefundRecord> {
    const record = db.getRefundRecord(refundId);
    if (!record) {
      throw new BusinessError('退款记录不存在', 404);
    }
    return record;
  }
}

export const refundService = new RefundService();
