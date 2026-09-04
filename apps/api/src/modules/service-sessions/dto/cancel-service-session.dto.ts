import { IsEnum, IsString, MaxLength } from 'class-validator';
import { ServiceSessionCancelDisposition } from '../../../generated/prisma/client.js';

/** Both fields are required (docs task Phase 5: "Cancelling an
 * in-progress session must require a reason and a disposition"). */
export class CancelServiceSessionDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsEnum(ServiceSessionCancelDisposition)
  disposition!: ServiceSessionCancelDisposition;
}
