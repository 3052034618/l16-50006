import { db } from '../store';
import { config } from '../config';
import { generateId, addSeconds, BusinessError, Logger } from '../utils';
import { StockReservation } from '../types';
import { withLock } from './lock.service';

export class StockService {
  async getProductStock(productId: string): Promise<number> {
    const product = db.getProduct(productId);
    if (!product) {
      throw new BusinessError('商品不存在', 404);
    }
    return product.stock;
  }

  async reserveStock(
    orderId: string,
    items: { productId: string; quantity: number }[]
  ): Promise<StockReservation[]> {
    const reservations: StockReservation[] = [];

    for (const item of items) {
      const reservation = await this.reserveSingleProduct(orderId, item.productId, item.quantity);
      reservations.push(reservation);
    }

    Logger.info(`Stock reserved for order ${orderId}`, {
      itemCount: items.length,
    });

    return reservations;
  }

  private async reserveSingleProduct(
    orderId: string,
    productId: string,
    quantity: number
  ): Promise<StockReservation> {
    return await withLock(
      `product:${productId}`,
      async (): Promise<StockReservation> => {
        const product = db.getProduct(productId);
        if (!product) {
          throw new BusinessError(`商品不存在: ${productId}`, 404);
        }

        if (product.stock < quantity) {
          throw new BusinessError(`商品库存不足: ${product.name}`, 409);
        }

        db.updateProduct(productId, { stock: product.stock - quantity });

        const reservation: StockReservation = {
          id: generateId(),
          orderId,
          productId,
          quantity,
          status: 'ACTIVE',
          expiresAt: addSeconds(new Date(), config.stock.reservationExpireSeconds),
          createdAt: new Date(),
        };

        db.addReservation(reservation);
        return reservation;
      },
      5000
    );
  }

  async releaseReservation(orderId: string): Promise<void> {
    const reservations = db.getReservationsByOrderId(orderId).filter(r => r.status === 'ACTIVE');

    for (const reservation of reservations) {
      await withLock(
        `product:${reservation.productId}`,
        async () => {
          const product = db.getProduct(reservation.productId);
          if (product) {
            db.updateProduct(reservation.productId, {
              stock: product.stock + reservation.quantity,
            });
          }
          db.updateReservation(reservation.id, { status: 'RELEASED' });
        },
        5000
      );
    }

    Logger.info(`Stock reservation released for order ${orderId}`);
  }

  async confirmReservation(orderId: string): Promise<void> {
    const reservations = db.getReservationsByOrderId(orderId).filter(r => r.status === 'ACTIVE');

    for (const reservation of reservations) {
      db.updateReservation(reservation.id, { status: 'CONFIRMED' });
    }

    Logger.info(`Stock reservation confirmed for order ${orderId}`);
  }

  async releaseExpiredReservations(): Promise<number> {
    const now = new Date();
    const expiredReservations = db.getExpiredReservations(now);

    let releasedCount = 0;
    for (const reservation of expiredReservations) {
      try {
        await withLock(
          `product:${reservation.productId}`,
          async () => {
            const product = db.getProduct(reservation.productId);
            if (product) {
              db.updateProduct(reservation.productId, {
                stock: product.stock + reservation.quantity,
              });
            }
            db.updateReservation(reservation.id, { status: 'RELEASED' });
            releasedCount++;
          },
          5000
        );
      } catch (e) {
        Logger.error(`Failed to release expired reservation ${reservation.id}`, e);
      }
    }

    if (releasedCount > 0) {
      Logger.info(`Released ${releasedCount} expired stock reservations`);
    }

    return releasedCount;
  }

  async rollbackReservations(reservations: StockReservation[]): Promise<void> {
    for (const reservation of reservations) {
      if (reservation.status === 'ACTIVE') {
        try {
          await withLock(
            `product:${reservation.productId}`,
            async () => {
              const product = db.getProduct(reservation.productId);
              if (product) {
                db.updateProduct(reservation.productId, {
                  stock: product.stock + reservation.quantity,
                });
              }
              db.updateReservation(reservation.id, { status: 'RELEASED' });
            },
            5000
          );
        } catch (e) {
          Logger.error(`Failed to rollback reservation ${reservation.id}`, e);
        }
      }
    }
  }
}

export const stockService = new StockService();
