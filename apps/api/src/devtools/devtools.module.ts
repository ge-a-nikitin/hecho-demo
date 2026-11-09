import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { DevToolsController } from "./devtools.controller.js";
import { DevToolsGuard } from "./devtools.guard.js";
import { DevToolsService } from "./devtools.service.js";

@Module({
  imports: [StorageModule],
  controllers: [DevToolsController],
  providers: [DevToolsGuard, DevToolsService],
})
export class DevToolsModule {}
