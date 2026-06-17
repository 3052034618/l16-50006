import { db } from '../store';
import { config } from '../config';
import {
  generateId,
  generateSign,
  verifySign,
  BusinessError,
  Logger,
  addMinutes,
} from '../utils';
import { PaymentStatus, PaymentRecord, Order, OrderStatus } from '../types';
import { orderService } from './order.service';

export class PaymentService {
  private processedCallbacks: Set<string> = new Set();

  async createPayment(
    orderId: string,
    paymentMethod: string = 'alipay'
  ): Promise<{ paymentRecord: PaymentRecord; payUrl: string }> {
    const order = await orderService.getOrder(orderId);

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BusinessError('订单已支付', 400);
    }

    const existingRecords = db.getPaymentRecordsByOrderId(orderId);
    const activeRecord = existingRecords.find(r => r.status === PaymentStatus.UNPAID);

    let paymentRecord: PaymentRecord;
    if (activeRecord) {
      paymentRecord = activeRecord;
    } else {
      paymentRecord = {
        id: generateId(),
        orderId,
        amount: order.totalAmount,
        paymentMethod,
        status: PaymentStatus.UNPAID,
        createdAt: new Date(),
      };
      db.addPaymentRecord(paymentRecord);
    }

    const payUrl = this.generateSandboxPayUrl(paymentRecord, order);

    Logger.info(`Payment created: ${paymentRecord.id}`, {
      orderId,
      amount: order.totalAmount,
      method: paymentMethod,
    });

    return { paymentRecord, payUrl };
  }

  private generateSandboxPayUrl(paymentRecord: PaymentRecord, order: Order): string {
    const params = {
      appId: config.payment.appId,
      outTradeNo: paymentRecord.id,
      totalAmount: order.totalAmount.toFixed(2),
      subject: `订单支付-${order.orderNo}`,
      body: order.items.map(i => i.productName).join(','),
      returnUrl: config.payment.callbackUrl,
      notifyUrl: config.payment.callbackUrl,
      timestamp: Date.now().toString(),
    };

    const sign = generateSign(params, config.payment.appSecret);
    const queryString = Object.entries({ ...params, sign })
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');

    return `/sandbox/pay?${queryString}`;
  }

  async verifyCallback(params: Record<string, any>): Promise<boolean> {
    return verifySign(params, config.payment.appSecret);
  }

  async handlePaymentCallback(params: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const outTradeNo = params.outTradeNo;
    const transactionId = params.transactionId;
    const tradeStatus = params.tradeStatus;

    if (!outTradeNo || !tradeStatus) {
      return { success: false, message: '参数不完整' };
    }

    const callbackKey = `${outTradeNo}_${tradeStatus}`;
    if (this.processedCallbacks.has(callbackKey)) {
      Logger.warn(`Duplicate payment callback ignored: ${callbackKey}`);
      return { success: true, message: '重复通知，已处理' };
    }

    const validSign = await this.verifyCallback(params);
    if (!validSign) {
      Logger.error('Payment callback signature verification failed', params);
      return { success: false, message: '签名验证失败' };
    }

    const paymentRecord = db.getPaymentRecord(outTradeNo);
    if (!paymentRecord) {
      return { success: false, message: '支付记录不存在' };
    }

    this.processedCallbacks.add(callbackKey);

    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      if (paymentRecord.status !== PaymentStatus.PAID) {
        db.updatePaymentRecord(outTradeNo, {
          status: PaymentStatus.PAID,
          transactionId,
          paidAt: new Date(),
        });

        await orderService.updatePaymentStatus(paymentRecord.orderId, PaymentStatus.PAID);

        Logger.info(`Payment success: ${outTradeNo}`, { transactionId });
      }
    } else if (tradeStatus === 'TRADE_CLOSED') {
      db.updatePaymentRecord(outTradeNo, {
        status: PaymentStatus.FAILED,
      });
    }

    return { success: true, message: '处理成功' };
  }

  async simulateSandboxPayment(paymentId: string, success: boolean = true): Promise<PaymentRecord> {
    const paymentRecord = db.getPaymentRecord(paymentId);
    if (!paymentRecord) {
      throw new BusinessError('支付记录不存在', 404);
    }

    if (paymentRecord.status !== PaymentStatus.UNPAID) {
      throw new BusinessError('该支付已处理', 400);
    }

    const transactionId = `SANDBOX_${generateId()}`;

    if (success) {
      const callbackParams = {
        outTradeNo: paymentId,
        transactionId,
        tradeStatus: 'TRADE_SUCCESS',
        totalAmount: paymentRecord.amount.toFixed(2),
        timestamp: Date.now().toString(),
        appId: config.payment.appId,
      };

      const sign = generateSign(callbackParams, config.payment.appSecret);
      const paramsWithSign = { ...callbackParams, sign };

      await this.handlePaymentCallback(paramsWithSign);
    } else {
      db.updatePaymentRecord(paymentId, {
        status: PaymentStatus.FAILED,
        transactionId,
      });
    }

    const updated = db.getPaymentRecord(paymentId);
    return updated!;
  }

  async refund(paymentId: string, reason: string): Promise<{ refundId: string; status: string }> {
    const paymentRecord = db.getPaymentRecord(paymentId);
    if (!paymentRecord) {
      throw new BusinessError('支付记录不存在', 404);
    }

    if (paymentRecord.status !== PaymentStatus.PAID) {
      throw new BusinessError('仅已支付订单可退款', 400);
    }

    const refundId = `REFUND_${generateId()}`;
    const transactionId = `SANDBOX_REFUND_${generateId()}`;

    db.updatePaymentRecord(paymentId, {
      status: PaymentStatus.REFUNDING,
    });

    Logger.info(`Refund initiated: ${refundId}`, { paymentId, amount: paymentRecord.amount });

    setTimeout(async () => {
      const callbackParams = {
        refundId,
        outTradeNo: paymentId,
        refundAmount: paymentRecord.amount.toFixed(2),
        tradeStatus: 'REFUND_SUCCESS',
        transactionId,
        timestamp: Date.now().toString(),
        appId: config.payment.appId,
      };

      const sign = generateSign(callbackParams, config.payment.appSecret);
      await this.handleRefundCallback({ ...callbackParams, sign });
    }, 2000);

    return { refundId, status: 'PROCESSING' };
  }

  async handleRefundCallback(params: Record<string, any>): Promise<{ success: boolean; message: string }> {
    const validSign = verifySign(params, config.payment.appSecret);
    if (!validSign) {
      return { success: false, message: '签名验证失败' };
    }

    const refundId = params.refundId;
    const outTradeNo = params.outTradeNo;
    const tradeStatus = params.tradeStatus;

    const paymentRecord = db.getPaymentRecord(outTradeNo);
    if (!paymentRecord) {
      return { success: false, message: '支付记录不存在' };
    }

    if (tradeStatus === 'REFUND_SUCCESS') {
      db.updatePaymentRecord(outTradeNo, {
        status: PaymentStatus.REFUNDED,
      });

      try {
        const order = await orderService.getOrder(paymentRecord.orderId);
        if (order.status === OrderStatus.REFUNDING) {
          await orderService.updateOrderStatus(paymentRecord.orderId, OrderStatus.REFUNDED, '退款完成');
        }
      } catch (e) {
        Logger.error('Failed to update order status after refund', e);
      }

      Logger.info(`Refund success: ${refundId}`);
    }

    return { success: true, message: '处理成功' };
  }

  getPaymentRecordsByOrderId(orderId: string): PaymentRecord[] {
    return db.getPaymentRecordsByOrderId(orderId);
  }
}

export const paymentService = new PaymentService();
