import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpsertBookingPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  slotIntervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minBookingLeadTimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBookingHorizonDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferBeforeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferAfterMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cancellationCutoffMinutes?: number;

  @IsOptional()
  @IsBoolean()
  allowCustomerProviderSelection?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAnyProvider?: boolean;
}
