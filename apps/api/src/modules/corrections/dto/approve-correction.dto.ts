import { IsOptional, IsString, MaxLength } from 'class-validator';

/** `overrideReason` is optional for an ordinary approval by an
 * independent approver, but mandatory for the solo-owner-override path
 * (docs task Phase 3 — see correction-decision-authorization.util.ts). */
export class ApproveCorrectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;
}
