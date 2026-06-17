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

export default router;
