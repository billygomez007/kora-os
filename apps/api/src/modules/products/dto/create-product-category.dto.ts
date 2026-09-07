import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateProductCategoryDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
