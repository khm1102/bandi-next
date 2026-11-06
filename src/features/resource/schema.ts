import { char, check, index, integer, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, deletedAt, fkCol, pk, ts, updatedAt } from "@/db/columns";
import { storedFile } from "@/features/file/schema";
import { member } from "@/features/member/schema";

export const resource = pgTable(
  "resource",
  {
    id: pk(),
    title: varchar("title", { length: 200 }).notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    createdByMemberId: fkCol("created_by_member_id")
      .notNull()
      .references(() => member.id),
    updatedByMemberId: fkCol("updated_by_member_id")
      .notNull()
      .references(() => member.id),
    shareToken: varchar("share_token", { length: 43 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("uk_resource_share_token").on(t.shareToken),
    index("idx_resource_created_by").on(t.createdByMemberId),
    index("idx_resource_visible_updated")
      .on(t.updatedAt, t.id)
      .where(sql`${t.deletedAt} is null`),
    index("idx_resource_title_trgm").using("gin", sql`${t.title} gin_trgm_ops`),
  ],
);

export const resourceFile = pgTable(
  "resource_file",
  {
    id: pk(),
    resourceId: fkCol("resource_id")
      .notNull()
      .references(() => resource.id),
    storedFileId: fkCol("stored_file_id")
      .notNull()
      .references(() => storedFile.id),
    displayOrder: integer("display_order").notNull(),
    uploadedByMemberId: fkCol("uploaded_by_member_id")
      .notNull()
      .references(() => member.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uk_resource_file_resource_file").on(t.resourceId, t.storedFileId),
    uniqueIndex("uk_resource_file_resource_order").on(t.resourceId, t.displayOrder),
    index("idx_resource_file_stored_file").on(t.storedFileId),
    check("ck_resource_file_order", sql`${t.displayOrder} >= 0`),
  ],
);

/** 본문 단독 줄 HTTPS URL의 Open Graph 스냅샷. 열람자 브라우저는 외부를 직접 요청하지 않는다. */
export const resourceLinkPreview = pgTable(
  "resource_link_preview",
  {
    id: pk(),
    resourceId: fkCol("resource_id")
      .notNull()
      .references(() => resource.id),
    normalizedUrl: varchar("normalized_url", { length: 2048 }).notNull(),
    urlHash: char("url_hash", { length: 64 }).notNull(),
    domain: varchar("domain", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }),
    description: varchar("description", { length: 1000 }),
    previewImageFileId: fkCol("preview_image_file_id").references(() => storedFile.id),
    fetchedAt: ts("fetched_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_resource_link_preview_url").on(t.resourceId, t.urlHash),
    index("idx_resource_link_preview_image").on(t.previewImageFileId),
  ],
);
