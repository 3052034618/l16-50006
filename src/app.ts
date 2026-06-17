import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';

import orderRoutes from './routes/order.routes';
import paymentRoutes from './routes/payment.routes';
import refundRoutes from './routes/refund.routes';
import productRoutes from './routes/product.routes';
import logisticsRoutes from './routes/logistics.routes';

import { schedulerService } from './services/scheduler.service';
import { seedProducts } from './seed';
import { config } from './config';
import { Logger } from './utils';

const app = express();
const PORT = config.server.port;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/products', productRoutes);
app.use('/api/logistics', logisticsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: schedulerService['isRunning'] ? 'running' : 'stopped',
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  Logger.error('Unhandled error', err);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`
============================================
  电商订单管理系统已启动
  服务端口: ${PORT}
  管理后台: http://localhost:${PORT}
  API文档: http://localhost:${PORT}/api/health
============================================
  `);

  seedProducts();

  schedulerService.start();

  Logger.info('Application started successfully');
});

process.on('SIGINT', () => {
  Logger.info('Shutting down...');
  schedulerService.stop();
  process.exit(0);
});

export default app;
