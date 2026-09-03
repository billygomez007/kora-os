import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBranchDiscoveryDto {
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  publicPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  publicEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  openingHoursNote?: string;

  @IsOptional()
  @IsBoolean()
  isDiscoverable?: boolean;
}
