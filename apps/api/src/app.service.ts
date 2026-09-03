import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getServiceInfo() {
    return {
      name: 'kora-api',
      version: '0.1.0',
      status: 'ok',
    } as const;
  }
}
