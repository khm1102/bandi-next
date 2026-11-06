CREATE TABLE "rate_limit_bucket" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_rate_limit_reset" ON "rate_limit_bucket" USING btree ("reset_at");