export const config = {
  server: {
    port: process.env.PORT || 3000,
  },
  payment: {
    sandbox: true,
    appId: 'sandbox_app_001',
    appSecret: 'sandbox_secret_key_2024',
    callbackUrl: 'http://localhost:3000/api/payment/callback',
    refundCallbackUrl: 'http://localhost:3000/api/payment/refund-callback',
    payExpireMinutes: 30,
  },
  order: {
    autoCloseMinutes: 30,
    autoConfirmDays: 7,
  },
  stock: {
    reservationExpireSeconds: 1800,
    lockKeyPrefix: 'stock:lock:',
    reservationKeyPrefix: 'stock:reservation:',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: 0,
  },
  logistics: {
    apiKey: 'sandbox_logistics_key',
    baseUrl: 'https://sandbox.logistics.com/api',
  },
};
