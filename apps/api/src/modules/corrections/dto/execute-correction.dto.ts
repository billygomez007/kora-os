import { IsOptional, IsUUID } from 'class-validator';

/** Only meaningful when the correction's declared `returnMethod` is
 * CASH — required when the branch's cash policy is REQUIRED, validated
 * when supplied under OPTIONAL (docs task Phase 3, mirroring
 * RecordPaymentDto.cashSessionId). */
export class ExecuteCorrectionDto {
  @IsOptional()
  @IsUUID()
  cashSessionId?: string;
}
