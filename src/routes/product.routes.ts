import { Router, Request, Response } from 'express';
import { db } from '../store';
import { BusinessError } from '../utils';
import { stockService } from '../services/stock.service';

const router = Router();

interface ApiResponse {
  code: number;
  message: string;
  data?: any;
}

function success(data: any, message: string = 'success'): ApiResponse {
  return { code: 0, message, data };
}

function error(message: string, code: number = 400): ApiResponse {
  return { code, message };
}

router.get('/', (_req: Request, res: Response) => {
  const products = db.getProducts();
  res.json(success(products));
});

router.get('/stock/reservations', (_req: Request, res: Response) => {
  try {
    const reservations = db.getAllReservations();
    res.json(success(reservations));
  } catch (e: any) {
    res.status(500).json(error('获取预占明细失败', 500));
  }
});

router.get('/:productId', (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const product = db.getProduct(productId);

    if (!product) {
      return res.status(404).json(error('商品不存在', 404));
    }

    res.json(success(product));
  } catch (e: any) {
    res.status(500).json(error('获取商品失败', 500));
  }
});

router.get('/:productId/stock', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const stock = await stockService.getProductStock(productId);
    res.json(success({ productId, stock }));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('获取库存失败', 500));
    }
  }
});

router.get('/:productId/reservations', (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { category } = req.query;
    const reservations = db.getReservationsByProductIdWithOrder(productId);
    const filtered = category
      ? reservations.filter(r => r.reservationCategory === category)
      : reservations;
    const active = filtered.filter(r => r.status === 'ACTIVE');
    const confirmed = filtered.filter(r => r.status === 'CONFIRMED');
    const released = filtered.filter(r => r.status === 'RELEASED');
    const pendingPay = reservations.filter(r => r.reservationCategory === 'PENDING_PAYMENT');
    const confirmedTrade = reservations.filter(r => r.reservationCategory === 'CONFIRMED');
    const cancelReleased = reservations.filter(r => r.reservationCategory === 'CANCEL_RELEASED');
    const timeoutReleased = reservations.filter(r => r.reservationCategory === 'TIMEOUT_RELEASED');
    res.json(success({
      productId,
      summary: {
        activeCount: active.length,
        activeQuantity: active.reduce((s, r) => s + r.quantity, 0),
        confirmedCount: confirmed.length,
        confirmedQuantity: confirmed.reduce((s, r) => s + r.quantity, 0),
        releasedCount: released.length,
        releasedQuantity: released.reduce((s, r) => s + r.quantity, 0),
      },
      categorySummary: {
        pendingPayment: { count: pendingPay.length, quantity: pendingPay.reduce((s, r) => s + r.quantity, 0) },
        confirmedTrade: { count: confirmedTrade.length, quantity: confirmedTrade.reduce((s, r) => s + r.quantity, 0) },
        cancelReleased: { count: cancelReleased.length, quantity: cancelReleased.reduce((s, r) => s + r.quantity, 0) },
        timeoutReleased: { count: timeoutReleased.length, quantity: timeoutReleased.reduce((s, r) => s + r.quantity, 0) },
      },
      reservations: filtered,
    }));
  } catch (e: any) {
    res.status(500).json(error('获取预占明细失败', 500));
  }
});

export default router;
