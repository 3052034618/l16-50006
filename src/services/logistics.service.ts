import { LogisticsInfo, LogisticsTrace } from '../types';
import { BusinessError, Logger } from '../utils';

const logisticsCompanies = [
  { code: 'SF', name: '顺丰速运' },
  { code: 'ZTO', name: '中通快递' },
  { code: 'YTO', name: '圆通速递' },
  { code: 'YD', name: '韵达快递' },
  { code: 'EMS', name: 'EMS' },
];

export class LogisticsService {
  private mockData: Map<string, LogisticsInfo> = new Map();

  async getLogisticsInfo(trackingNumber: string, company: string): Promise<LogisticsInfo> {
    if (!trackingNumber || !company) {
      throw new BusinessError('物流单号和快递公司不能为空', 400);
    }

    if (this.mockData.has(trackingNumber)) {
      return this.mockData.get(trackingNumber)!;
    }

    const info = this.generateMockLogistics(trackingNumber, company);
    this.mockData.set(trackingNumber, info);

    Logger.info(`Logistics info queried: ${trackingNumber}`, { company });

    return info;
  }

  private generateMockLogistics(trackingNumber: string, company: string): LogisticsInfo {
    const now = new Date();
    const traces: LogisticsTrace[] = [];

    const statuses = [
      { status: '已签收', description: '快件已被签收，感谢使用' },
      { status: '派送中', description: '快件正在派送中，请保持电话畅通' },
      { status: '到达目的地', description: '快件已到达目的地城市，正在分拣' },
      { status: '运输中', description: '快件正在运输途中' },
      { status: '已发出', description: '快件已从发货地发出' },
      { status: '已揽件', description: '快递员已揽收快件' },
    ];

    for (let i = 0; i < statuses.length; i++) {
      const time = new Date(now.getTime() - i * 6 * 60 * 60 * 1000);
      const locations = ['北京市朝阳区', '北京市', '上海市', '杭州市', '深圳市', '广州市'];

      traces.push({
        time: this.formatLogisticsTime(time),
        status: statuses[i].status,
        location: locations[i % locations.length],
        description: statuses[i].description,
      });
    }

    return {
      trackingNumber,
      company,
      status: traces[0].status,
      traces: traces,
    };
  }

  private formatLogisticsTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  async updateLogistics(trackingNumber: string, company: string): Promise<LogisticsInfo> {
    const info = this.generateMockLogistics(trackingNumber, company);
    this.mockData.set(trackingNumber, info);
    return info;
  }

  getSupportedCompanies(): { code: string; name: string }[] {
    return logisticsCompanies;
  }

  generateTrackingNumber(prefix: string = 'SF'): string {
    const random = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    return `${prefix}${random}`;
  }
}

export const logisticsService = new LogisticsService();
