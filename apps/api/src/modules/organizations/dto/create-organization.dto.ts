import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class PrimaryBranchDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(20)
  code!: string;
}

export class CreateOrganizationDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and single hyphens',
  })
  slug!: string;

  @IsString()
  @MaxLength(80)
  businessType!: string;

  @IsString()
  @Length(3, 3)
  defaultCurrency!: string;

  @IsString()
  @MaxLength(80)
  timeZone!: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @ValidateNested()
  @Type(() => PrimaryBranchDto)
  primaryBranch!: PrimaryBranchDto;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  trialPlanCode?: string;
}
