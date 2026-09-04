import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectCorrectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rejectionReason!: string;

  /** Mandatory only for the solo-owner-override path — see
   * ApproveCorrectionDto. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;
}
