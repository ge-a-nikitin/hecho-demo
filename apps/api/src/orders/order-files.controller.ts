import {
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { UserRole } from "../generated/prisma/enums.js";
import { OrderFilesService, type UploadedOrderFile } from "./order-files.service.js";

type RequestUser = { id: string; role: UserRole };

const ORDER_ID_PARAM = {
  name: "orderId",
  description: "Order id from GET /api/orders",
  example: "cm8x2k4c50003qwer1234asdf",
};

const ATTACHMENT_ID_PARAM = {
  name: "attachmentId",
  description: "Attachment id from the attachments array of GET /api/orders/:id",
  example: "cm8x2k4c50007qwer1234asdf",
};

@ApiTags("order-files")
@ApiCookieAuth("better-auth.session_token")
@UseGuards(SessionGuard)
@Controller("orders/:orderId/attachments")
export class OrderFilesController {
  constructor(private readonly files: OrderFilesService) {}

  @Post()
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "Upload an order attachment (maximum 1 MB)" })
  @ApiParam(ORDER_ID_PARAM)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Photo, drawing or document, maximum 1 MB; the file is stored in SeaweedFS",
        },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 1_048_576 } }))
  upload(
    @Param("orderId") orderId: string,
    @UploadedFile() file: UploadedOrderFile,
    @CurrentUser() user: RequestUser,
  ) {
    return this.files.upload(orderId, file, user);
  }

  @Get(":attachmentId")
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "Download an order attachment" })
  @ApiParam(ORDER_ID_PARAM)
  @ApiParam(ATTACHMENT_ID_PARAM)
  async download(
    @Param("orderId") orderId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const attachment = await this.files.download(orderId, attachmentId, user);
    const encodedFilename = encodeURIComponent(attachment.filename);
    return new StreamableFile(attachment.bytes, {
      type: attachment.contentType,
      disposition: `attachment; filename*=UTF-8''${encodedFilename}`,
    });
  }
}
