import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { QrService } from './qr.service.js';

@Public()
@Controller('q')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get(':code')
  resolve(@Param('code') code: string) {
    return this.qrService.resolvePublic(code);
  }
}
