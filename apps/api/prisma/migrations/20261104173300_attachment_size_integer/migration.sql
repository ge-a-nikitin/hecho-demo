ALTER TABLE "OrderAttachment"
ALTER COLUMN "sizeBytes" TYPE INTEGER USING "sizeBytes"::INTEGER;
