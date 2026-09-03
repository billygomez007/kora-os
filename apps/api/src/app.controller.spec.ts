import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('service information', () => {
    it('returns the Kora API identity', () => {
      expect(appController.getServiceInfo()).toEqual({
        name: 'kora-api',
        version: '0.1.0',
        status: 'ok',
      });
    });
  });
});
