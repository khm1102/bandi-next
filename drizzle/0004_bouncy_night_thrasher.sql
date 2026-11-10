CREATE TABLE "password_setup_ticket" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_setup_ticket_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"member_id" bigint NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "password_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "password_setup_ticket" ADD CONSTRAINT "password_setup_ticket_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_password_setup_ticket_hash" ON "password_setup_ticket" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_password_setup_ticket_member" ON "password_setup_ticket" USING btree ("member_id");