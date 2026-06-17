import { v4 as uuidv4 } from 'uuid';
import * as CryptoJS from 'crypto-js';

export function generateOrderNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}${random}`;
}

export function generateId(): string {
  return uuidv4();
}

export function generateSign(params: Record<string, any>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  const signStr = sortedKeys
    .filter(key => params[key] !== undefined && params[key] !== '' && key !== 'sign')
    .map(key => `${key}=${params[key]}`)
    .join('&') + `&key=${secret}`;
  return CryptoJS.MD5(signStr).toString().toUpperCase();
}

export function verifySign(params: Record<string, any>, secret: string): boolean {
  const receivedSign = params.sign;
  if (!receivedSign) return false;
  const calculatedSign = generateSign(params, secret);
  return receivedSign === calculatedSign;
}

export function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export class Logger {
  static info(message: string, data?: any): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data || '');
  }

  static error(message: string, error?: any): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '');
  }

  static warn(message: string, data?: any): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data || '');
  }

  static debug(message: string, data?: any): void {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, data || '');
  }
}

export class BusinessError extends Error {
  code: number;
  constructor(message: string, code: number = 400) {
    super(message);
    this.code = code;
    this.name = 'BusinessError';
  }
}
