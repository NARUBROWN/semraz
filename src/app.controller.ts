import { Controller, Get, Headers } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('api/locale')
  getLocale(
    @Headers('cf-ipcountry') cloudflareCountry?: string,
    @Headers('x-vercel-ip-country') vercelCountry?: string,
    @Headers('cloudfront-viewer-country') cloudFrontCountry?: string,
  ) {
    const country = [cloudflareCountry, vercelCountry, cloudFrontCountry].find(
      (value) => typeof value === 'string' && /^[a-z]{2}$/i.test(value),
    );

    return { locale: country?.toUpperCase() === 'KR' ? 'ko' : 'en' };
  }
}
