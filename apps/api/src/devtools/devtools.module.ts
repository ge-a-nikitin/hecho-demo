import { Module } from "@nestjs/common";
import { DevToolsController } from "./devtools.controller.js";
import { DevToolsGuard } from "./devtools.guard.js";
import { DevToolsService } from "./devtools.service.js";

@Module({
  controllers: [DevToolsController],
  providers: [DevToolsGuard, DevToolsService],
})
export class DevToolsModule {}
