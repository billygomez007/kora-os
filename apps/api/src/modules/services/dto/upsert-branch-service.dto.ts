import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpsertBranchServiceDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceOverrideMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationOverrideMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isBookableByCustomerOverride?: boolean;
}
