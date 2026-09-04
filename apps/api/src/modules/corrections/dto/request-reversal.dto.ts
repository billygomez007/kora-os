import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/client.js';

/** No line-level input — a reversal always corrects every original line
 * at its full original amount (docs task Phase 3: "fully negates an
 * erroneous or duplicate sale"), generated server-side from the
 * original Transaction's own immutable line items. */
export class RequestReversalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsEnum(PaymentMethod)
  returnMethod!: PaymentMethod;
}
