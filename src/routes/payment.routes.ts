import { Router, Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { BusinessError, Logger } from '../utils';

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

router.post('/create', async (req: Request, res: Response) => {
  try {
    const { orderId, paymentMethod } = req.body;

    if (!orderId) {
      return res.status(400).json(error('缺少订单ID'));
    }

    const result = await paymentService.createPayment(orderId, paymentMethod);
    res.json(success(result, '支付创建成功'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('支付创建失败', 500));
    }
  }
});

router.post('/callback', async (req: Request, res: Response) => {
  try {
    Logger.info('Payment callback received', req.body);
    const result = await paymentService.handlePaymentCallback(req.body);

    if (result.success) {
      res.send('success');
    } else {
      res.status(400).send('fail');
    }
  } catch (e: any) {
    Logger.error('Payment callback error', e);
    res.status(500).send('fail');
  }
});

router.post('/refund-callback', async (req: Request, res: Response) => {
  try {
    Logger.info('Refund callback received', req.body);
    const result = await paymentService.handleRefundCallback(req.body);

    if (result.success) {
      res.send('success');
    } else {
      res.status(400).send('fail');
    }
  } catch (e: any) {
    Logger.error('Refund callback error', e);
    res.status(500).send('fail');
  }
});

router.post('/sandbox/pay', async (req: Request, res: Response) => {
  try {
    const { paymentId, success } = req.body;

    if (!paymentId) {
      return res.status(400).json(error('缺少支付ID'));
    }

    const result = await paymentService.simulateSandboxPayment(paymentId, success !== false);
    res.json(success(result, '模拟支付完成'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('模拟支付失败', 500));
    }
  }
});

router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const records = paymentService.getPaymentRecordsByOrderId(orderId);
    res.json(success(records));
  } catch (e: any) {
    res.status(500).json(error('获取支付记录失败', 500));
  }
});

export default router;
