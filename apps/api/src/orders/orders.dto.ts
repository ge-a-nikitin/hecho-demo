import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  MinLength,
  Min,
} from "class-validator";

export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  description!: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsOptional()
  @IsString()
  executorId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;
}

export class UpdateDraftOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;

  @IsOptional()
  @IsString()
  executorId?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;
}

export class AssignOrderDto {
  @IsString()
  @MinLength(1)
  executorId!: string;
}

export class DeclineAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ProposeEstimateDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100_000)
  hours!: number;
}

export class RespondToEstimateDto {
  @IsBoolean()
  accepted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class WorkTimeDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class RevisionRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment!: string;
}

export class CreateOrderCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  content!: string;
}
