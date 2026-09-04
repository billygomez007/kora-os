import { IsEnum } from 'class-validator';
import { CashPolicyMode } from '../../../generated/prisma/client.js';

export class UpdateCashPolicyDto {
  @IsEnum(CashPolicyMode)
  mode!: CashPolicyMode;
}
