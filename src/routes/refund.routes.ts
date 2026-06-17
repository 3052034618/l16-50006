import { Router, Request, Response } from 'express';
import { refundService } from '../services/refund.service';
import { BusinessError } from '../utils';

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

router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { orderId, userId, reason } = req.body;

    if (!orderId || !userId || !reason) {
      return res.status(400).json(error('缺少必要参数'));
    }

    const refund = await refundService.applyRefund(orderId, userId, reason);
    res.json(success(refund, '退款申请提交成功'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('退款申请失败', 500));
    }
  }
});

router.post('/:refundId/approve', async (req: Request, res: Response) => {
  try {
    const { refundId } = req.params;
    const refund = await refundService.approveRefund(refundId);
    res.json(success(refund, '退款审批通过'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('退款审批失败', 500));
    }
  }
});

router.post('/:refundId/reject', async (req: Request, res: Response) => {
  try {
    const { refundId } = req.params;
    const { reason } = req.body;
    const refund = await refundService.rejectRefund(refundId, reason || '商家拒绝');
    res.json(success(refund, '退款已拒绝'));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('拒绝退款失败', 500));
    }
  }
});

router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const refunds = await refundService.getRefundRecordsByOrderId(orderId);
    res.json(success(refunds));
  } catch (e: any) {
    res.status(500).json(error('获取退款记录失败', 500));
  }
});

router.get('/:refundId', async (req: Request, res: Response) => {
  try {
    const { refundId } = req.params;
    const refund = await refundService.getRefundRecord(refundId);
    res.json(success(refund));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('获取退款记录失败', 500));
    }
  }
});

export default router;
