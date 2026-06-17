import { Router, Request, Response } from 'express';
import { logisticsService } from '../services/logistics.service';
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

router.get('/track', async (req: Request, res: Response) => {
  try {
    const { trackingNumber, company } = req.query;

    if (!trackingNumber || !company) {
      return res.status(400).json(error('缺少物流单号或快递公司'));
    }

    const info = await logisticsService.getLogisticsInfo(
      String(trackingNumber),
      String(company)
    );
    res.json(success(info));
  } catch (e: any) {
    if (e instanceof BusinessError) {
      res.status(e.code).json(error(e.message, e.code));
    } else {
      res.status(500).json(error('查询物流失败', 500));
    }
  }
});

router.get('/companies', (_req: Request, res: Response) => {
  const companies = logisticsService.getSupportedCompanies();
  res.json(success(companies));
});

router.post('/update', async (req: Request, res: Response) => {
  try {
    const { trackingNumber, company } = req.body;

    if (!trackingNumber || !company) {
      return res.status(400).json(error('缺少必要参数'));
    }

    const info = await logisticsService.updateLogistics(trackingNumber, company);
    res.json(success(info, '物流信息已更新'));
  } catch (e: any) {
    res.status(500).json(error('更新物流信息失败', 500));
  }
});

export default router;
