import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { hideDisabledDevTools } from "./common/swagger-document.js";
import { toNodeHandler } from "better-auth/node";
import { json, urlencoded } from "express";
import { ApiExceptionFilter } from "./api-exception.filter.js";
import { auth } from "./auth/auth.js";
import { AppModule } from "./app.module.js";
import { InvoiceStatus, OrderStatus, PaymentReportStatus, UserRole } from "./generated/prisma/enums.js";

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance();

  // TLS terminates at the Cloudflare edge, and both cloudflared and the web nginx
  // forward the protocol and the client address, so Express must trust the proxy
  // chain; otherwise secure cookies and request IPs are wrong.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy === "true") {
    expressApp.set("trust proxy", true);
  } else if (trustProxy && /^\d+$/u.test(trustProxy)) {
    expressApp.set("trust proxy", Number(trustProxy));
  }

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:6200",
    credentials: true,
  });

  expressApp.all("/api/auth/*splat", toNodeHandler(auth));
  expressApp.use(json(), urlencoded({ extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Order Desk API")
    .setDescription(
      "REST API for the order board.\n\n" +
        "**Enum values are uppercase and case-sensitive** — `ADMIN`, not `admin`. " +
        "Wherever a field or parameter accepts a fixed set of values, Swagger shows all allowed " +
        "values (dropdown for parameters, enum plus example for request body fields).",
    )
    .setVersion("1.0")
    .addCookieAuth("better-auth.session_token")
    .addTag(
      "categories",
      "Work categories used by the order form. Deactivated categories stay attached to existing " +
        "orders but disappear from the order form.",
    )
    .addTag(
      "orders",
      `Order statuses: ${Object.values(OrderStatus).join(", ")}. ` +
        "Every transition is stored in the statusHistory of the order.",
    )
    .addTag(
      "order-files",
      "Order attachments: uploads are limited to 1 MB and stored in SeaweedFS; the attachment id " +
        "comes from the attachments array of GET /api/orders/:id.",
    )
    .addTag(
      "invoices",
      `Invoice statuses: ${Object.values(InvoiceStatus).join(", ")}. ` +
        `Payment report statuses: ${Object.values(PaymentReportStatus).join(", ")}.`,
    )
    .addTag(
      "users",
      `Roles: ${Object.values(UserRole).join(", ")} (case-sensitive). ` +
        "Listing inactive accounts requires includeInactive=true and the ADMIN role.",
    )
    .addTag(
      "health",
      "Unauthenticated liveness probe used by the container healthcheck.",
    )
    .addTag(
      "devtools",
      "Development helpers. The whole group answers 404 while DEVTOOLS_ENABLED is false and is " +
        "hidden from this document; with the flag on it requires the x-devtools-api-key header " +
        "(401 without it). Roles accepted here: CUSTOMER, EXECUTOR, ADMIN.",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  hideDisabledDevTools(document, process.env.DEVTOOLS_ENABLED === "true");
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.PORT ?? 6201);
  await app.listen(port, "0.0.0.0");
}
