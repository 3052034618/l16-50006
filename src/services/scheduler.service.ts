import * as schedule from 'node-schedule';
import { db } from '../store';
import { config } from '../config';
import { Logger, addMinutes } from '../utils';
import { orderService } from './order.service';
import { stockService } from './stock.service';
import { OrderStatus } from '../types';

export class SchedulerService {
  private jobs: schedule.Job[] = [];
  private isRunning: boolean = false;

  start(): void {
    if (this.isRunning) return;

    this.startOrderAutoCloseJob();
    this.startStockReservationCleanupJob();
    this.startAutoConfirmReceiveJob();

    this.isRunning = true;
    Logger.info('Scheduler service started');
  }

  stop(): void {
    this.jobs.forEach(job => job.cancel());
    this.jobs = [];
    this.isRunning = false;
    Logger.info('Scheduler service stopped');
  }

  private startOrderAutoCloseJob(): void {
    const job = schedule.scheduleJob('*/1 * * * *', async () => {
      try {
        await this.closeExpiredOrders();
      } catch (e) {
        Logger.error('Order auto-close job failed', e);
      }
    });
    this.jobs.push(job);
    Logger.info('Order auto-close job scheduled (every minute)');
  }

  private startStockReservationCleanupJob(): void {
    const job = schedule.scheduleJob('*/5 * * * *', async () => {
      try {
        const count = await stockService.releaseExpiredReservations();
        if (count > 0) {
          Logger.info(`Stock reservation cleanup job completed, released ${count} reservations`);
        }
      } catch (e) {
        Logger.error('Stock reservation cleanup job failed', e);
      }
    });
    this.jobs.push(job);
    Logger.info('Stock reservation cleanup job scheduled (every 5 minutes)');
  }

  private startAutoConfirmReceiveJob(): void {
    const job = schedule.scheduleJob('0 2 * * *', async () => {
      try {
        await this.autoConfirmShippedOrders();
      } catch (e) {
        Logger.error('Auto confirm receive job failed', e);
      }
    });
    this.jobs.push(job);
    Logger.info('Auto confirm receive job scheduled (daily at 2 AM)');
  }

  private async closeExpiredOrders(): Promise<number> {
    const orders = db.getOrders().filter(o => o.status === OrderStatus.PENDING_PAYMENT);

    const now = new Date();
    let closedCount = 0;

    for (const order of orders) {
      const expireTime = addMinutes(order.createdAt, config.order.autoCloseMinutes);
      if (expireTime <= now) {
        try {
          const result = await orderService.closeExpiredOrder(order.id);
          if (result) {
            closedCount++;
          }
        } catch (e) {
          Logger.error(`Failed to close expired order ${order.orderNo}`, e);
        }
      }
    }

    if (closedCount > 0) {
      Logger.info(`Closed ${closedCount} expired orders`);
    }

    return closedCount;
  }

  private async autoConfirmShippedOrders(): Promise<number> {
    const orders = db.getOrders().filter(o => o.status === OrderStatus.SHIPPED);

    let confirmedCount = 0;
    const now = new Date();

    for (const order of orders) {
      if (!order.updatedAt) continue;

      const autoConfirmTime = new Date(order.updatedAt.getTime() + config.order.autoConfirmDays * 24 * 60 * 60 * 1000);

      if (autoConfirmTime <= now) {
        try {
          await orderService.updateOrderStatus(order.id, OrderStatus.COMPLETED, '系统自动确认收货');
          confirmedCount++;
        } catch (e) {
          Logger.error(`Failed to auto-confirm order ${order.orderNo}`, e);
        }
      }
    }

    if (confirmedCount > 0) {
      Logger.info(`Auto-confirmed ${confirmedCount} orders`);
    }

    return confirmedCount;
  }

  async runCloseExpiredOrdersNow(): Promise<number> {
    return this.closeExpiredOrders();
  }

  async runStockCleanupNow(): Promise<number> {
    return stockService.releaseExpiredReservations();
  }
}

export const schedulerService = new SchedulerService();
