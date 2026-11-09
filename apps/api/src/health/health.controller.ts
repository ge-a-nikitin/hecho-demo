import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Check API availability" })
  @ApiOkResponse({
    description: "The API is running; a failed database or storage check surfaces as an error",
    schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["ok"], example: "ok" } },
      required: ["status"],
    },
  })
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }
}
