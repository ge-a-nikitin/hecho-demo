import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { CategoriesController } from "./categories/categories.controller.js";
import { CategoriesService } from "./categories/categories.service.js";
import { OrdersController } from "./orders/orders.controller.js";
import { OrdersService } from "./orders/orders.service.js";
import { UsersModule } from "./users/users.module.js";
import { InvoicesController } from "./invoices/invoices.controller.js";
import { InvoicesService } from "./invoices/invoices.service.js";
import { StorageModule } from "./storage/storage.module.js";
import { OrderFilesController } from "./orders/order-files.controller.js";
import { OrderFilesService } from "./orders/order-files.service.js";
import { DevToolsModule } from "./devtools/devtools.module.js";

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule, UsersModule, DevToolsModule],
  controllers: [
    HealthController,
    CategoriesController,
    OrdersController,
    InvoicesController,
    OrderFilesController,
  ],
  providers: [
    CategoriesService,
    OrdersService,
    InvoicesService,
    OrderFilesService,
  ],
})
export class AppModule {}
