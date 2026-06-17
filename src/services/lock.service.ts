import { db } from '../store';
import { config } from '../config';
import { generateId, Logger } from '../utils';

export class DistributedLock {
  private lockKey: string;
  private lockValue: string;
  private locked: boolean = false;

  constructor(resourceKey: string) {
    this.lockKey = `${config.stock.lockKeyPrefix}${resourceKey}`;
    this.lockValue = generateId();
  }

  async tryLock(expireMs: number = 30000): Promise<boolean> {
    const success = db.setLock(this.lockKey, this.lockValue, expireMs);
    if (success) {
      this.locked = true;
      Logger.debug(`Lock acquired: ${this.lockKey}`);
    }
    return success;
  }

  async unlock(): Promise<void> {
    if (!this.locked) return;
    db.releaseLock(this.lockKey, this.lockValue);
    this.locked = false;
    Logger.debug(`Lock released: ${this.lockKey}`);
  }

  isLocked(): boolean {
    return this.locked;
  }
}

export async function withLock<T>(
  resourceKey: string,
  fn: () => Promise<T>,
  expireMs: number = 30000,
  maxRetries: number = 5,
  retryDelayMs: number = 100
): Promise<T> {
  const lock = new DistributedLock(resourceKey);
  let retries = 0;

  while (retries < maxRetries) {
    const acquired = await lock.tryLock(expireMs);
    if (acquired) {
      try {
        return await fn();
      } finally {
        await lock.unlock();
      }
    }
    retries++;
    if (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * retries));
    }
  }

  throw new Error(`Failed to acquire lock for ${resourceKey} after ${maxRetries} retries`);
}
