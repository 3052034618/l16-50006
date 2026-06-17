import { Router, Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { orderEventService } from '../services/order-event.service';
import { BusinessError } from '../utils';
import { OrderStatus } from '../types';

const router = Router();

interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

function success(data: any, message: string = 'success'): ApiResponse {
  return { code: 0, message, data };
}

function error(message: string, code: number = 400): ApiResponse {
  return { code, message };
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, items, shippingAddress } = req.body;

    if (!userId || !items || !shippingAddress) {
      return res.status(400).json(error('缺少必要参数'));
    }

    const order = await orderService.createOrder(userId, items, shippingAddress);
    res.json(success(order, '订单创建成功'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('订单创建失败', 500));
    }
  }
});

router.get('/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await orderService.getOrder(orderId);
    res.json(success(order));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('获取订单失败', 500));
    }
  }
});

router.get('/:orderId/timeline', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const events = orderEventService.getOrderTimeline(orderId);
    res.json(success(events));
  } catch (e: any) {
    res.status(500).json(error('获取订单时间线失败', 500));
  }
});

router.get('/no/:orderNo', async (req: Request, res: Response) => {
  try {
    const { orderNo } = req.params;
    const order = await orderService.getOrderByNo(orderNo);
    res.json(success(order));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('获取订单失败', 500));
    }
  }
});

router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const orders = await orderService.getUserOrders(userId);
    res.json(success(orders));
  } catch (e: any) {
    res.status(500).json(error('获取订单列表失败', 500));
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const orders = await orderService.getAllOrders();
    res.json(success(orders));
  } catch (e: any) {
    res.status(500).json(error('获取订单列表失败', 500));
  }
});

router.post('/:orderId/cancel', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json(error('缺少用户ID'));
    }

    const order = await orderService.cancelOrder(orderId, userId);
    res.json(success(order, '订单取消成功'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('取消订单失败', 500));
    }
  }
});

router.post('/:orderId/ship', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { trackingNumber, logisticsCompany } = req.body;

    if (!trackingNumber || !logisticsCompany) {
      return res.status(400).json(error('缺少物流信息'));
    }

    const order = await orderService.shipOrder(orderId, trackingNumber, logisticsCompany);
    res.json(success(order, '发货成功'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('发货失败', 500));
    }
  }
});

router.post('/:orderId/confirm', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json(error('缺少用户ID'));
    }

    const order = await orderService.confirmReceive(orderId, userId);
    res.json(success(order, '确认收货成功'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('确认收货失败', 500));
    }
  }
});

router.get('/statuses', (_req: Request, res: Response) => {
  res.json(success(Object.values(OrderStatus)));
});

export default router;
