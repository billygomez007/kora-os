import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CashSessionReviewOutcome } from '../../../generated/prisma/client.js';

export class ReviewCashSessionDto {
  @IsEnum(CashSessionReviewOutcome)
  outcome!: CashSessionReviewOutcome;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
