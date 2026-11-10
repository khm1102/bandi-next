CREATE TABLE "app_setting" (
	"key" varchar(50) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by_member_id" bigint
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "ck_audit_log_action";--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "ck_audit_log_target_type";--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_member_id_member_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "ck_audit_log_action" CHECK ("audit_log"."action" in ('MEMBER_TEAM_CHANGED', 'MEMBER_COHORT_CHANGED', 'MEMBER_ROLE_CHANGED', 'MEMBER_STATUS_CHANGED', 'ASSET_DELETED', 'ASSET_RESTORED', 'SETTINGS_CHANGED', 'MEMBER_PASSWORD_RESET', 'MEMBER_LOGIN_UNLOCKED', 'DATA_EXPORTED'));--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "ck_audit_log_target_type" CHECK ("audit_log"."target_type" in ('MEMBER', 'ASSET', 'SETTING', 'EXPORT'));