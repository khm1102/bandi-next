import { check, index, integer, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, deletedAt, fkCol, inList, pk, ts, updatedAt } from "@/db/columns";
import { storedFile } from "@/features/file/schema";
import { member } from "@/features/member/schema";

export const ASSET_STATUSES = ["AVAILABLE", "IN_USE", "LOANED", "REPAIR", "LOST", "DISPOSED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_TRACKING_TYPES = ["QUANTITY", "INDIVIDUAL"] as const;
export const ASSET_OWNER_TYPES = ["CLUB", "MEMBER", "EXTERNAL"] as const;
export const ASSET_ACTIONS = [
  "REGISTER",
  "ADJUST",
  "MOVE",
  "LOAN",
  "RETURN",
  "REPAIR",
  "DAMAGE",
  "LOST",
  "DISPOSE",
  "DELETE",
  "RESTORE",
] as const;

export const assetItem = pgTable(
  "asset_item",
  {
    id: pk(),
    name: varchar("name", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    trackingType: varchar("tracking_type", { length: 30 }).notNull(),
    ownerType: varchar("owner_type", { length: 30 }).notNull(),
    ownerMemberId: fkCol("owner_member_id").references(() => member.id),
    externalOwnerName: varchar("external_owner_name", { length: 100 }),
    totalQuantity: integer("total_quantity").notNull(),
    storageLocation: varchar("storage_location", { length: 200 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    photoFileId: fkCol("photo_file_id").references(() => storedFile.id),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("idx_asset_item_category_status").on(t.category, t.status),
    index("idx_asset_item_owner_member").on(t.ownerMemberId),
    index("idx_asset_item_name")
      .on(t.name, t.id)
      .where(sql`${t.deletedAt} is null`),
    index("idx_asset_item_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    check("ck_asset_item_tracking", inList(t.trackingType, ASSET_TRACKING_TYPES)),
    check("ck_asset_item_owner_type", inList(t.ownerType, ASSET_OWNER_TYPES)),
    check("ck_asset_item_status", inList(t.status, ASSET_STATUSES)),
    check("ck_asset_item_quantity", sql`${t.totalQuantity} > 0`),
    check(
      "ck_asset_item_owner_scope",
      sql`(${t.ownerType} = 'CLUB' and ${t.ownerMemberId} is null and ${t.externalOwnerName} is null)
        or (${t.ownerType} = 'MEMBER' and ${t.ownerMemberId} is not null and ${t.externalOwnerName} is null)
        or (${t.ownerType} = 'EXTERNAL' and ${t.ownerMemberId} is null and ${t.externalOwnerName} is not null)`,
    ),
  ],
);

export const assetUnit = pgTable(
  "asset_unit",
  {
    id: pk(),
    assetItemId: fkCol("asset_item_id")
      .notNull()
      .references(() => assetItem.id),
    managementNo: varchar("management_no", { length: 50 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    storageLocation: varchar("storage_location", { length: 200 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uk_asset_unit_item_management_no").on(t.assetItemId, t.managementNo),
    check("ck_asset_unit_status", inList(t.status, ASSET_STATUSES)),
  ],
);

export const assetHistory = pgTable(
  "asset_history",
  {
    id: pk(),
    assetItemId: fkCol("asset_item_id")
      .notNull()
      .references(() => assetItem.id),
    assetUnitId: fkCol("asset_unit_id").references(() => assetUnit.id),
    action: varchar("action", { length: 30 }).notNull(),
    quantity: integer("quantity").notNull(),
    previousStatus: varchar("previous_status", { length: 30 }),
    newStatus: varchar("new_status", { length: 30 }),
    note: varchar("note", { length: 500 }),
    changedByMemberId: fkCol("changed_by_member_id")
      .notNull()
      .references(() => member.id),
    changedAt: ts("changed_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_asset_history_item_changed").on(t.assetItemId, t.changedAt, t.id),
    index("idx_asset_history_unit").on(t.assetUnitId),
    check("ck_asset_history_action", inList(t.action, ASSET_ACTIONS)),
    check("ck_asset_history_quantity", sql`${t.quantity} > 0`),
    check(
      "ck_asset_history_statuses",
      sql`(${t.previousStatus} is null or ${inList(t.previousStatus, ASSET_STATUSES)}) and (${t.newStatus} is null or ${inList(t.newStatus, ASSET_STATUSES)})`,
    ),
  ],
);
