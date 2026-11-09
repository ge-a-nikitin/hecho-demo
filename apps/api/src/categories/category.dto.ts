import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateCategoryDto {
  /**
   * Category name shown to customers in the order form. Must be unique.
   *
   * @example "Plumbing"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;
}

export class UpdateCategoryDto {
  /**
   * New category name. The category keeps its id, so existing orders are not affected.
   *
   * @example "Plumbing and heating"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;
}
