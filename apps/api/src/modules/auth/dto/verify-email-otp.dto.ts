import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class VerifyEmailOtpDto {
  @IsUUID()
  challengeId!: string;

  // Digits only; length is validated against configuration inside
  // EmailOtpService (an incorrect length simply fails digest comparison
  // like any other wrong code, so no separate length check is needed
  // here beyond rejecting obviously-malformed input).
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{4,10}$/, { message: 'code must be 4 to 10 digits' })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}
