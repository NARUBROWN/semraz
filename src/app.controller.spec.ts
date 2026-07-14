import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API health', () => {
      expect(appController.getHealth()).toEqual({
        name: 'Semraz API',
        status: 'ok',
        tagline: 'Measure seven times, cut once.',
      });
    });
  });

  describe('locale', () => {
    it('uses Korean for a Korean IP location', () => {
      expect(appController.getLocale('KR')).toEqual({ locale: 'ko' });
    });

    it('uses English for all other IP locations', () => {
      expect(appController.getLocale('US')).toEqual({ locale: 'en' });
    });
  });
});
