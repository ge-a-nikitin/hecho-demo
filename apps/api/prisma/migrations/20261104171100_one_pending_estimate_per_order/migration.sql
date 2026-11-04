CREATE UNIQUE INDEX "OrderEstimate_one_pending_per_order_key"
ON "OrderEstimate"("orderId")
WHERE "status" = 'PENDING';
