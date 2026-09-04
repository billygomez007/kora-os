import { ArrayMaxSize, ArrayMinSize, IsUUID } from 'class-validator';

/** Ordered — array index becomes `displayOrder` (docs task Phase 4:
 * "preserve deterministic display order"). */
export class ReplaceServiceSessionItemsDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds!: string[];
}
