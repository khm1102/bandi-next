CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "activity_record" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_record_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"team_id" bigint NOT NULL,
	"activity_at" timestamp with time zone NOT NULL,
	"title" varchar(150) NOT NULL,
	"body" text NOT NULL,
	"participant_count" integer NOT NULL,
	"status" varchar(30) NOT NULL,
	"created_by_member_id" bigint NOT NULL,
	"updated_by_member_id" bigint NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_member_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_activity_record_status" CHECK ("activity_record"."status" in ('DRAFT', 'SUBMITTED', 'TEAM_APPROVED', 'APPROVED', 'REVISION_REQUESTED', 'ARCHIVED')),
	CONSTRAINT "ck_activity_record_participants" CHECK ("activity_record"."participant_count" > 0),
	CONSTRAINT "ck_activity_record_status_times" CHECK ((
        ("activity_record"."status" = 'DRAFT' and "activity_record"."submitted_at" is null and "activity_record"."reviewed_at" is null and "activity_record"."reviewed_by_member_id" is null)
        or ("activity_record"."status" = 'SUBMITTED' and "activity_record"."submitted_at" is not null and "activity_record"."reviewed_at" is null and "activity_record"."reviewed_by_member_id" is null)
        or ("activity_record"."status" in ('TEAM_APPROVED', 'APPROVED', 'REVISION_REQUESTED') and "activity_record"."submitted_at" is not null and "activity_record"."reviewed_at" is not null and "activity_record"."reviewed_by_member_id" is not null)
        or "activity_record"."status" = 'ARCHIVED'
      ))
);
--> statement-breakpoint
CREATE TABLE "activity_record_file" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_record_file_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"activity_record_id" bigint NOT NULL,
	"stored_file_id" bigint NOT NULL,
	"file_role" varchar(20) NOT NULL,
	"display_order" integer NOT NULL,
	"uploaded_by_member_id" bigint NOT NULL,
	"replaced_by_file_id" bigint,
	"replaced_at" timestamp with time zone,
	"replaced_by_member_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_activity_record_file_role" CHECK ("activity_record_file"."file_role" in ('EVIDENCE', 'ADDITIONAL', 'DOCUMENT')),
	CONSTRAINT "ck_activity_record_file_order" CHECK ("activity_record_file"."display_order" >= 0),
	CONSTRAINT "ck_activity_record_file_replaced" CHECK (("activity_record_file"."replaced_by_file_id" is null and "activity_record_file"."replaced_at" is null and "activity_record_file"."replaced_by_member_id" is null) or ("activity_record_file"."replaced_by_file_id" is not null and "activity_record_file"."replaced_at" is not null and "activity_record_file"."replaced_by_member_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "activity_record_revision" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_record_revision_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"activity_record_id" bigint NOT NULL,
	"revision_no" integer NOT NULL,
	"activity_at" timestamp with time zone NOT NULL,
	"title" varchar(150) NOT NULL,
	"body" text NOT NULL,
	"participant_count" integer NOT NULL,
	"changed_by_member_id" bigint NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"change_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_activity_record_revision_no" CHECK ("activity_record_revision"."revision_no" > 0),
	CONSTRAINT "ck_activity_record_revision_participants" CHECK ("activity_record_revision"."participant_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "activity_report_document" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_report_document_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"activity_record_id" bigint NOT NULL,
	"representative" varchar(20) NOT NULL,
	"location" varchar(50) NOT NULL,
	"participants" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_activity_report_participants" CHECK (jsonb_typeof("activity_report_document"."participants") = 'array' and jsonb_array_length("activity_report_document"."participants") between 1 and 14)
);
--> statement-breakpoint
CREATE TABLE "activity_review_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_review_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"activity_record_id" bigint NOT NULL,
	"previous_status" varchar(30) NOT NULL,
	"new_status" varchar(30) NOT NULL,
	"comment" text,
	"reviewed_by_member_id" bigint NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_activity_review_previous" CHECK ("activity_review_history"."previous_status" in ('DRAFT', 'SUBMITTED', 'TEAM_APPROVED', 'APPROVED', 'REVISION_REQUESTED', 'ARCHIVED')),
	CONSTRAINT "ck_activity_review_new" CHECK ("activity_review_history"."new_status" in ('DRAFT', 'SUBMITTED', 'TEAM_APPROVED', 'APPROVED', 'REVISION_REQUESTED', 'ARCHIVED')),
	CONSTRAINT "ck_activity_review_change" CHECK ("activity_review_history"."previous_status" <> "activity_review_history"."new_status"),
	CONSTRAINT "ck_activity_review_comment" CHECK ("activity_review_history"."new_status" <> 'REVISION_REQUESTED' or "activity_review_history"."comment" is not null)
);
--> statement-breakpoint
CREATE TABLE "asset_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "asset_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"asset_item_id" bigint NOT NULL,
	"asset_unit_id" bigint,
	"action" varchar(30) NOT NULL,
	"quantity" integer NOT NULL,
	"previous_status" varchar(30),
	"new_status" varchar(30),
	"note" varchar(500),
	"changed_by_member_id" bigint NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_asset_history_action" CHECK ("asset_history"."action" in ('REGISTER', 'ADJUST', 'MOVE', 'LOAN', 'RETURN', 'REPAIR', 'DAMAGE', 'LOST', 'DISPOSE', 'DELETE', 'RESTORE')),
	CONSTRAINT "ck_asset_history_quantity" CHECK ("asset_history"."quantity" > 0),
	CONSTRAINT "ck_asset_history_statuses" CHECK (("asset_history"."previous_status" is null or "asset_history"."previous_status" in ('AVAILABLE', 'IN_USE', 'LOANED', 'REPAIR', 'LOST', 'DISPOSED')) and ("asset_history"."new_status" is null or "asset_history"."new_status" in ('AVAILABLE', 'IN_USE', 'LOANED', 'REPAIR', 'LOST', 'DISPOSED')))
);
--> statement-breakpoint
CREATE TABLE "asset_item" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "asset_item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"tracking_type" varchar(30) NOT NULL,
	"owner_type" varchar(30) NOT NULL,
	"owner_member_id" bigint,
	"external_owner_name" varchar(100),
	"total_quantity" integer NOT NULL,
	"storage_location" varchar(200) NOT NULL,
	"status" varchar(30) NOT NULL,
	"photo_file_id" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_asset_item_tracking" CHECK ("asset_item"."tracking_type" in ('QUANTITY', 'INDIVIDUAL')),
	CONSTRAINT "ck_asset_item_owner_type" CHECK ("asset_item"."owner_type" in ('CLUB', 'MEMBER', 'EXTERNAL')),
	CONSTRAINT "ck_asset_item_status" CHECK ("asset_item"."status" in ('AVAILABLE', 'IN_USE', 'LOANED', 'REPAIR', 'LOST', 'DISPOSED')),
	CONSTRAINT "ck_asset_item_quantity" CHECK ("asset_item"."total_quantity" > 0),
	CONSTRAINT "ck_asset_item_owner_scope" CHECK (("asset_item"."owner_type" = 'CLUB' and "asset_item"."owner_member_id" is null and "asset_item"."external_owner_name" is null)
        or ("asset_item"."owner_type" = 'MEMBER' and "asset_item"."owner_member_id" is not null and "asset_item"."external_owner_name" is null)
        or ("asset_item"."owner_type" = 'EXTERNAL' and "asset_item"."owner_member_id" is null and "asset_item"."external_owner_name" is not null))
);
--> statement-breakpoint
CREATE TABLE "asset_unit" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "asset_unit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"asset_item_id" bigint NOT NULL,
	"management_no" varchar(50) NOT NULL,
	"status" varchar(30) NOT NULL,
	"storage_location" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_asset_unit_status" CHECK ("asset_unit"."status" in ('AVAILABLE', 'IN_USE', 'LOANED', 'REPAIR', 'LOST', 'DISPOSED'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_member_id" bigint,
	"action" varchar(50) NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"target_id" bigint NOT NULL,
	"summary" varchar(500) NOT NULL,
	"detail" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_audit_log_action" CHECK ("audit_log"."action" in ('MEMBER_TEAM_CHANGED', 'MEMBER_COHORT_CHANGED', 'MEMBER_ROLE_CHANGED', 'MEMBER_STATUS_CHANGED', 'ASSET_DELETED', 'ASSET_RESTORED')),
	CONSTRAINT "ck_audit_log_target_type" CHECK ("audit_log"."target_type" in ('MEMBER', 'ASSET'))
);
--> statement-breakpoint
CREATE TABLE "calendar_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calendar_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"team_id" bigint,
	"title" varchar(150) NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"place" varchar(200),
	"color" varchar(20) DEFAULT 'NAVY' NOT NULL,
	"created_by_member_id" bigint NOT NULL,
	"updated_by_member_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_calendar_event_color" CHECK ("calendar_event"."color" in ('NAVY', 'MINT', 'BLUE', 'PLUM', 'AMBER', 'ROSE')),
	CONSTRAINT "ck_calendar_event_period" CHECK ("calendar_event"."end_at" > "calendar_event"."start_at")
);
--> statement-breakpoint
CREATE TABLE "file_retirement_queue" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "file_retirement_queue_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"stored_file_id" bigint NOT NULL,
	"reason" varchar(30) NOT NULL,
	"storage_scope" varchar(20) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_file_retirement_reason" CHECK ("file_retirement_queue"."reason" in ('PROFILE_PHOTO', 'LINK_PREVIEW_IMAGE')),
	CONSTRAINT "ck_file_retirement_status" CHECK ("file_retirement_queue"."status" in ('PENDING', 'DELETED', 'FAILED')),
	CONSTRAINT "ck_file_retirement_scope" CHECK ("file_retirement_queue"."storage_scope" in ('PRIVATE', 'PUBLIC')),
	CONSTRAINT "ck_file_retirement_attempt" CHECK ("file_retirement_queue"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stored_file" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stored_file_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"original_name" varchar(255) NOT NULL,
	"storage_scope" varchar(20) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" char(64) NOT NULL,
	"upload_status" varchar(20) NOT NULL,
	"purpose" varchar(30) DEFAULT 'GENERAL' NOT NULL,
	"uploaded_by_member_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_stored_file_scope" CHECK ("stored_file"."storage_scope" in ('PRIVATE', 'PUBLIC')),
	CONSTRAINT "ck_stored_file_status" CHECK ("stored_file"."upload_status" in ('PENDING', 'READY', 'FAILED', 'QUARANTINED')),
	CONSTRAINT "ck_stored_file_purpose" CHECK ("stored_file"."purpose" in ('GENERAL', 'PROFILE_IMAGE')),
	CONSTRAINT "ck_stored_file_size" CHECK ("stored_file"."size_bytes" > 0),
	CONSTRAINT "ck_stored_file_sha256" CHECK ("stored_file"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "club_officer" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "club_officer_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"position" varchar(30) NOT NULL,
	"member_id" bigint NOT NULL,
	"appointed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_club_officer_position" CHECK ("club_officer"."position" in ('PRESIDENT'))
);
--> statement-breakpoint
CREATE TABLE "cohort" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cohort_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_no" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"department" varchar(100),
	"phone_number" varchar(20),
	"academic_status" varchar(30),
	"academic_status_verified_at" timestamp with time zone,
	"team_id" bigint NOT NULL,
	"cohort_id" bigint NOT NULL,
	"role" varchar(30) NOT NULL,
	"status" varchar(30) NOT NULL,
	"sso_link_status" varchar(30) NOT NULL,
	"sso_linked_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"registered_by_member_id" bigint,
	"profile_photo_file_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_member_role" CHECK ("member"."role" in ('ADMIN', 'LEADER', 'MEMBER')),
	CONSTRAINT "ck_member_status" CHECK ("member"."status" in ('PRE_REGISTERED', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'REGISTRATION_CANCELLED')),
	CONSTRAINT "ck_member_sso_link_status" CHECK ("member"."sso_link_status" in ('WAITING', 'LINKED', 'REVIEW_REQUIRED')),
	CONSTRAINT "ck_member_academic_status" CHECK ("member"."academic_status" is null or "member"."academic_status" in ('ENROLLED', 'LEAVE_OF_ABSENCE', 'GRADUATED', 'UNKNOWN'))
);
--> statement-breakpoint
CREATE TABLE "member_change_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "member_change_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"member_id" bigint NOT NULL,
	"field" varchar(20) NOT NULL,
	"old_value" varchar(50) NOT NULL,
	"new_value" varchar(50) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"changed_by_member_id" bigint NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_member_change_field" CHECK ("member_change_history"."field" in ('TEAM', 'COHORT', 'ROLE', 'STATUS'))
);
--> statement-breakpoint
CREATE TABLE "school_login_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "school_login_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_no_hash" char(64) NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"first_failure_at" timestamp with time zone,
	"blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_school_login_attempt_count" CHECK ("school_login_attempt"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"token_hash" char(64) PRIMARY KEY NOT NULL,
	"member_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "team_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(50) NOT NULL,
	"display_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_notice" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "internal_notice_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"target_scope" varchar(20) NOT NULL,
	"team_id" bigint,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"is_important" boolean DEFAULT false NOT NULL,
	"publish_start_at" timestamp with time zone,
	"publish_end_at" timestamp with time zone,
	"created_by_member_id" bigint NOT NULL,
	"updated_by_member_id" bigint NOT NULL,
	"published_by_member_id" bigint,
	"share_token" varchar(43),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_internal_notice_scope" CHECK ("internal_notice"."target_scope" in ('ALL', 'TEAM')),
	CONSTRAINT "ck_internal_notice_status" CHECK ("internal_notice"."status" in ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'CLOSED', 'ARCHIVED')),
	CONSTRAINT "ck_internal_notice_scope_team" CHECK (("internal_notice"."target_scope" = 'ALL' and "internal_notice"."team_id" is null) or ("internal_notice"."target_scope" = 'TEAM' and "internal_notice"."team_id" is not null)),
	CONSTRAINT "ck_internal_notice_publish_period" CHECK ("internal_notice"."publish_start_at" is null or "internal_notice"."publish_end_at" is null or "internal_notice"."publish_start_at" <= "internal_notice"."publish_end_at"),
	CONSTRAINT "ck_internal_notice_publish_state" CHECK ("internal_notice"."status" in ('DRAFT', 'ARCHIVED') or ("internal_notice"."publish_start_at" is not null and "internal_notice"."published_by_member_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "internal_notice_attachment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "internal_notice_attachment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"internal_notice_id" bigint NOT NULL,
	"stored_file_id" bigint NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_notice_attachment_order" CHECK ("internal_notice_attachment"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "internal_notice_read" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "internal_notice_read_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"internal_notice_id" bigint NOT NULL,
	"member_id" bigint NOT NULL,
	"first_read_at" timestamp with time zone NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_notice_read_period" CHECK ("internal_notice_read"."first_read_at" <= "internal_notice_read"."last_read_at")
);
--> statement-breakpoint
CREATE TABLE "resource" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" varchar(200) NOT NULL,
	"body_markdown" text NOT NULL,
	"created_by_member_id" bigint NOT NULL,
	"updated_by_member_id" bigint NOT NULL,
	"share_token" varchar(43),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resource_file" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_file_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"resource_id" bigint NOT NULL,
	"stored_file_id" bigint NOT NULL,
	"display_order" integer NOT NULL,
	"uploaded_by_member_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_resource_file_order" CHECK ("resource_file"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "resource_link_preview" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_link_preview_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"resource_id" bigint NOT NULL,
	"normalized_url" varchar(2048) NOT NULL,
	"url_hash" char(64) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"title" varchar(500),
	"description" varchar(1000),
	"preview_image_file_id" bigint,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_updated_by_member_id_member_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_reviewed_by_member_id_member_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record_file" ADD CONSTRAINT "activity_record_file_activity_record_id_activity_record_id_fk" FOREIGN KEY ("activity_record_id") REFERENCES "public"."activity_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record_file" ADD CONSTRAINT "activity_record_file_stored_file_id_stored_file_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record_file" ADD CONSTRAINT "activity_record_file_uploaded_by_member_id_member_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record_file" ADD CONSTRAINT "activity_record_file_replaced_by_file_id_activity_record_file_id_fk" FOREIGN KEY ("replaced_by_file_id") REFERENCES "public"."activity_record_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record_file" ADD CONSTRAINT "activity_record_file_replaced_by_member_id_member_id_fk" FOREIGN KEY ("replaced_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record_revision" ADD CONSTRAINT "activity_record_revision_activity_record_id_activity_record_id_fk" FOREIGN KEY ("activity_record_id") REFERENCES "public"."activity_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record_revision" ADD CONSTRAINT "activity_record_revision_changed_by_member_id_member_id_fk" FOREIGN KEY ("changed_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_report_document" ADD CONSTRAINT "activity_report_document_activity_record_id_activity_record_id_fk" FOREIGN KEY ("activity_record_id") REFERENCES "public"."activity_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_review_history" ADD CONSTRAINT "activity_review_history_activity_record_id_activity_record_id_fk" FOREIGN KEY ("activity_record_id") REFERENCES "public"."activity_record"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_review_history" ADD CONSTRAINT "activity_review_history_reviewed_by_member_id_member_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_asset_item_id_asset_item_id_fk" FOREIGN KEY ("asset_item_id") REFERENCES "public"."asset_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_asset_unit_id_asset_unit_id_fk" FOREIGN KEY ("asset_unit_id") REFERENCES "public"."asset_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_changed_by_member_id_member_id_fk" FOREIGN KEY ("changed_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_item" ADD CONSTRAINT "asset_item_owner_member_id_member_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_item" ADD CONSTRAINT "asset_item_photo_file_id_stored_file_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."stored_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_unit" ADD CONSTRAINT "asset_unit_asset_item_id_asset_item_id_fk" FOREIGN KEY ("asset_item_id") REFERENCES "public"."asset_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_member_id_member_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_updated_by_member_id_member_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_retirement_queue" ADD CONSTRAINT "file_retirement_queue_stored_file_id_stored_file_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_uploaded_by_member_id_member_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_officer" ADD CONSTRAINT "club_officer_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_registered_by_member_id_member_id_fk" FOREIGN KEY ("registered_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_profile_photo_file_id_stored_file_id_fk" FOREIGN KEY ("profile_photo_file_id") REFERENCES "public"."stored_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_change_history" ADD CONSTRAINT "member_change_history_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_change_history" ADD CONSTRAINT "member_change_history_changed_by_member_id_member_id_fk" FOREIGN KEY ("changed_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice" ADD CONSTRAINT "internal_notice_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice" ADD CONSTRAINT "internal_notice_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice" ADD CONSTRAINT "internal_notice_updated_by_member_id_member_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice" ADD CONSTRAINT "internal_notice_published_by_member_id_member_id_fk" FOREIGN KEY ("published_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice_attachment" ADD CONSTRAINT "internal_notice_attachment_internal_notice_id_internal_notice_id_fk" FOREIGN KEY ("internal_notice_id") REFERENCES "public"."internal_notice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice_attachment" ADD CONSTRAINT "internal_notice_attachment_stored_file_id_stored_file_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice_read" ADD CONSTRAINT "internal_notice_read_internal_notice_id_internal_notice_id_fk" FOREIGN KEY ("internal_notice_id") REFERENCES "public"."internal_notice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notice_read" ADD CONSTRAINT "internal_notice_read_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_updated_by_member_id_member_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_file" ADD CONSTRAINT "resource_file_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_file" ADD CONSTRAINT "resource_file_stored_file_id_stored_file_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_file" ADD CONSTRAINT "resource_file_uploaded_by_member_id_member_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_link_preview" ADD CONSTRAINT "resource_link_preview_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_link_preview" ADD CONSTRAINT "resource_link_preview_preview_image_file_id_stored_file_id_fk" FOREIGN KEY ("preview_image_file_id") REFERENCES "public"."stored_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_record_team_status_date" ON "activity_record" USING btree ("team_id","status","activity_at");--> statement-breakpoint
CREATE INDEX "idx_activity_record_creator_status" ON "activity_record" USING btree ("created_by_member_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activity_record_status_updated" ON "activity_record" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activity_record_file_current" ON "activity_record_file" USING btree ("activity_record_id","file_role","replaced_at");--> statement-breakpoint
CREATE INDEX "idx_activity_record_file_stored" ON "activity_record_file" USING btree ("stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_activity_record_revision" ON "activity_record_revision" USING btree ("activity_record_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_activity_report_document_record" ON "activity_report_document" USING btree ("activity_record_id");--> statement-breakpoint
CREATE INDEX "idx_activity_review_history_record" ON "activity_review_history" USING btree ("activity_record_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "idx_asset_history_item_changed" ON "asset_history" USING btree ("asset_item_id","changed_at","id");--> statement-breakpoint
CREATE INDEX "idx_asset_history_unit" ON "asset_history" USING btree ("asset_unit_id");--> statement-breakpoint
CREATE INDEX "idx_asset_item_category_status" ON "asset_item" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "idx_asset_item_owner_member" ON "asset_item" USING btree ("owner_member_id");--> statement-breakpoint
CREATE INDEX "idx_asset_item_name" ON "asset_item" USING btree ("name","id") WHERE "asset_item"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_asset_item_name_trgm" ON "asset_item" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uk_asset_unit_item_management_no" ON "asset_unit" USING btree ("asset_item_id","management_no");--> statement-breakpoint
CREATE INDEX "idx_audit_log_actor" ON "audit_log" USING btree ("actor_member_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_target" ON "audit_log" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_calendar_event_team_start" ON "calendar_event" USING btree ("team_id","start_at");--> statement-breakpoint
CREATE INDEX "idx_calendar_event_period" ON "calendar_event" USING gist (tstzrange("start_at", "end_at")) WHERE "calendar_event"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_calendar_event_created_by" ON "calendar_event" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_event_updated_by" ON "calendar_event" USING btree ("updated_by_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_file_retirement_file" ON "file_retirement_queue" USING btree ("stored_file_id");--> statement-breakpoint
CREATE INDEX "idx_file_retirement_status_created" ON "file_retirement_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_stored_file_scope_key" ON "stored_file" USING btree ("storage_scope","storage_key");--> statement-breakpoint
CREATE INDEX "idx_stored_file_hash_size" ON "stored_file" USING btree ("sha256","size_bytes");--> statement-breakpoint
CREATE INDEX "idx_stored_file_uploader_created" ON "stored_file" USING btree ("uploaded_by_member_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_stored_file_status_created" ON "stored_file" USING btree ("upload_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_club_officer_position" ON "club_officer" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_club_officer_member" ON "club_officer" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_cohort_name" ON "cohort" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_member_student_no" ON "member" USING btree ("student_no");--> statement-breakpoint
CREATE INDEX "idx_member_team_status" ON "member" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "idx_member_cohort_status" ON "member" USING btree ("cohort_id","status");--> statement-breakpoint
CREATE INDEX "idx_member_registered_by" ON "member" USING btree ("registered_by_member_id");--> statement-breakpoint
CREATE INDEX "idx_member_profile_photo" ON "member" USING btree ("profile_photo_file_id");--> statement-breakpoint
CREATE INDEX "idx_member_change_member_field_changed" ON "member_change_history" USING btree ("member_id","field","changed_at");--> statement-breakpoint
CREATE INDEX "idx_member_change_changed_by" ON "member_change_history" USING btree ("changed_by_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_school_login_attempt_hash" ON "school_login_attempt" USING btree ("student_no_hash");--> statement-breakpoint
CREATE INDEX "idx_session_member" ON "session" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_session_expires" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_team_name" ON "team" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_team_active_order" ON "team" USING btree ("is_active","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_internal_notice_share_token" ON "internal_notice" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "idx_internal_notice_scope_publish" ON "internal_notice" USING btree ("target_scope","team_id","status","publish_start_at");--> statement-breakpoint
CREATE INDEX "idx_internal_notice_visible_order" ON "internal_notice" USING btree ("status","is_important","publish_start_at","id") WHERE "internal_notice"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_internal_notice_created_by" ON "internal_notice" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "idx_internal_notice_title_trgm" ON "internal_notice" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uk_notice_attachment_notice_file" ON "internal_notice_attachment" USING btree ("internal_notice_id","stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_notice_attachment_notice_order" ON "internal_notice_attachment" USING btree ("internal_notice_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_notice_attachment_file" ON "internal_notice_attachment" USING btree ("stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_notice_read_notice_member" ON "internal_notice_read" USING btree ("internal_notice_id","member_id");--> statement-breakpoint
CREATE INDEX "idx_notice_read_member_last" ON "internal_notice_read" USING btree ("member_id","last_read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_resource_share_token" ON "resource" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "idx_resource_created_by" ON "resource" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "idx_resource_visible_updated" ON "resource" USING btree ("updated_at","id") WHERE "resource"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_resource_title_trgm" ON "resource" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uk_resource_file_resource_file" ON "resource_file" USING btree ("resource_id","stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_resource_file_resource_order" ON "resource_file" USING btree ("resource_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_resource_file_stored_file" ON "resource_file" USING btree ("stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_resource_link_preview_url" ON "resource_link_preview" USING btree ("resource_id","url_hash");--> statement-breakpoint
CREATE INDEX "idx_resource_link_preview_image" ON "resource_link_preview" USING btree ("preview_image_file_id");
--> statement-breakpoint
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_team_updated_at BEFORE UPDATE ON "team" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_cohort_updated_at BEFORE UPDATE ON "cohort" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_member_updated_at BEFORE UPDATE ON "member" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_club_officer_updated_at BEFORE UPDATE ON "club_officer" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_school_login_attempt_updated_at BEFORE UPDATE ON "school_login_attempt" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_stored_file_updated_at BEFORE UPDATE ON "stored_file" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_file_retirement_queue_updated_at BEFORE UPDATE ON "file_retirement_queue" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_calendar_event_updated_at BEFORE UPDATE ON "calendar_event" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_internal_notice_updated_at BEFORE UPDATE ON "internal_notice" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_resource_updated_at BEFORE UPDATE ON "resource" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_resource_link_preview_updated_at BEFORE UPDATE ON "resource_link_preview" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_activity_record_updated_at BEFORE UPDATE ON "activity_record" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_activity_report_document_updated_at BEFORE UPDATE ON "activity_report_document" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_asset_item_updated_at BEFORE UPDATE ON "asset_item" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_asset_unit_updated_at BEFORE UPDATE ON "asset_unit" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
INSERT INTO "team" ("name", "display_order") VALUES ('연출', 1), ('조연출', 2), ('배우', 3), ('무대팀', 4), ('오퍼팀', 5), ('디자인팀', 6), ('영상팀', 7), ('영상 배우', 8), ('영상 촬영', 9), ('영상 연출', 10), ('영상 편집', 11);
