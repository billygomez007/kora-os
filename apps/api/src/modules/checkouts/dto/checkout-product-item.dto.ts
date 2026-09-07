import { IsInt, IsUUID, Min } from 'class-validator';

export class CheckoutProductItemDto {
  @IsUUID()
  productVariantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
