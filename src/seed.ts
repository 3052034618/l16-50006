import { db } from './store';
import { generateId } from './utils';
import { Product } from './types';

export function seedProducts(): Product[] {
  const products: Product[] = [
    {
      id: generateId(),
      name: 'iPhone 15 Pro Max',
      price: 9999,
      stock: 100,
      description: 'Apple 最新旗舰手机，钛金属边框，A17 Pro芯片',
    },
    {
      id: generateId(),
      name: 'MacBook Pro 14寸',
      price: 14999,
      stock: 50,
      description: 'M3 Pro芯片，专业级性能，18小时续航',
    },
    {
      id: generateId(),
      name: 'AirPods Pro 2',
      price: 1899,
      stock: 200,
      description: '主动降噪，空间音频，无线充电',
    },
    {
      id: generateId(),
      name: 'iPad Air',
      price: 4799,
      stock: 80,
      description: 'M1芯片，10.9英寸显示屏，支持Apple Pencil',
    },
    {
      id: generateId(),
      name: 'Apple Watch Series 9',
      price: 2999,
      stock: 120,
      description: 'S9芯片，双指互点手势，健康监测',
    },
  ];

  products.forEach(p => db.addProduct(p));

  console.log(`Seeded ${products.length} products`);
  return products;
}

export function seedAll(): void {
  seedProducts();
  console.log('All seed data loaded successfully');
}

if (require.main === module) {
  seedAll();
}
