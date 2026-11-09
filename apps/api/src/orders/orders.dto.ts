import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
} from "class-validator";

export class CreateOrderDto {
  /**
   * Short order title shown on the board.
   *
   * @example "Fix leaking kitchen tap"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  title!: string;

  /**
   * Detailed task description for the executor.
   *
   * @example "The tap under the sink drips constantly; please replace the cartridge."
   */
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  @Matches(/\S/)
  description!: string;

  /**
   * Category id from GET /api/categories.
   *
   * @example "cm8x2k4c50000qwer1234asdf"
   */
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  categoryId!: string;

  /**
   * Give the draft straight to an executor; omit it to publish the order to the executor pool.
   *
   * @example "cm8x2k4c50001qwer1234asdf"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  executorId?: string;

  /**
   * Optional deadline as an ISO-8601 date-time.
   *
   * @example "2026-12-01T00:00:00.000Z"
   */
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /**
   * Optional site address or location note.
   *
   * @example "Berlin, Alexanderplatz 1"
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;
}

export class UpdateDraftOrderDto {
  /**
   * New title; omit to keep the current one.
   *
   * @example "Fix leaking kitchen tap and replace the seal"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  title?: string;

  /**
   * New description; omit to keep the current one.
   *
   * @example "The tap under the sink drips constantly; please replace the cartridge and the seal."
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  @Matches(/\S/)
  description?: string;

  /**
   * New category id from GET /api/categories; omit to keep the current one.
   *
   * @example "cm8x2k4c50002qwer1234asdf"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  categoryId?: string;

  /**
   * New executor id, or null to detach the executor and return the order to the pool.
   *
   * @example "cm8x2k4c50001qwer1234asdf"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  executorId?: string | null;

  /**
   * New deadline as an ISO-8601 date-time, or null to clear it.
   *
   * @example "2026-12-15T00:00:00.000Z"
   */
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  /**
   * New location, or null to clear it.
   *
   * @example "Berlin, Alexanderplatz 1"
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;
}

export class AssignOrderDto {
  /**
   * Executor account id from GET /api/users/executors.
   *
   * @example "cm8x2k4c50001qwer1234asdf"
   */
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  executorId!: string;
}

export class DeclineAssignmentDto {
  /**
   * Optional reason; stored in the assignment history and visible in the order.
   *
   * @example "No availability this week"
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ProposeEstimateDto {
  /**
   * Planned hours, up to 4 decimal places; the amount is hours multiplied by the hourly rate.
   *
   * @example 3.5
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100_000)
  hours!: number;
}

export class RespondToEstimateDto {
  /**
   * true accepts the estimate and starts the work, false rejects it.
   *
   * @example true
   */
  @IsBoolean()
  accepted!: boolean;

  /**
   * Optional customer comment stored with the response.
   *
   * @example "Agreed, please start on Monday"
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class WorkTimeDto {
  /**
   * Total minutes spent on the order; overwrites the previous value.
   *
   * @example 90
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minutes!: number;

  /**
   * Optional note stored with the time entry.
   *
   * @example "Worked together with a second technician"
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class RevisionRequestDto {
  /**
   * What must be changed before the executor submits the work again.
   *
   * @example "Please repaint the window frame"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  comment!: string;
}

export class CreateOrderCommentDto {
  /**
   * Comment text.
   *
   * @example "The spare part has arrived"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  @Matches(/\S/)
  content!: string;
}
