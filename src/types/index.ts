export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PENDING_SHIPMENT = 'PENDING_SHIPMENT',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED'
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED'
}

export interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderNo: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  paymentTime?: Date;
  shippingAddress: ShippingAddress;
  trackingNumber?: string;
  logisticsCompany?: string;
  createdAt: Date;
  updatedAt: Date;
  remark?: string;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  description: string;
}

export interface StockReservation {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  status: 'ACTIVE' | 'RELEASED' | 'CONFIRMED';
  expiresAt: Date;
  createdAt: Date;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  status: PaymentStatus;
  paidAt?: Date;
  createdAt: Date;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  applyTime: Date;
  approveTime?: Date;
  refundTime?: Date;
  transactionId?: string;
}

export interface LogisticsTrace {
  time: string;
  status: string;
  location: string;
  description: string;
}

export interface LogisticsInfo {
  trackingNumber: string;
  company: string;
  status: string;
  traces: LogisticsTrace[];
}

export enum OrderEventType {
  CREATED = 'CREATED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  AUTO_CLOSED = 'AUTO_CLOSED',
  REFUND_APPLIED = 'REFUND_APPLIED',
  REFUND_APPROVED = 'REFUND_APPROVED',
  REFUND_REJECTED = 'REFUND_REJECTED',
  REFUND_COMPLETED = 'REFUND_COMPLETED',
  STOCK_RESERVED = 'STOCK_RESERVED',
  STOCK_RELEASED = 'STOCK_RELEASED',
  STOCK_CONFIRMED = 'STOCK_CONFIRMED',
}

export interface OrderEvent {
  id: string;
  orderId: string;
  eventType: OrderEventType;
  description: string;
  operator: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}
