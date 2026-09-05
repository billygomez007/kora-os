import { IsEnum, IsOptional } from 'class-validator';
import { PaymentRecordStatus } from '../../../generated/prisma/client.js';

export class ListMyVerificationsQueryDto {
  @IsOptional()
  @IsEnum(PaymentRecordStatus)
  status?: PaymentRecordStatus;
}
