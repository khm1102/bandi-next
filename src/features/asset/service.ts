import { and, asc, eq, ilike, isNotNull, isNull, sql } from "drizzle-orm";
import { koSort } from "@/db/columns";
import type { Db, DbOrTx } from "@/db/types";
import { recordAudit } from "@/features/audit/service";
import type { createFileService } from "@/features/file/service";
import { member } from "@/features/member/schema";
import type { MemberStatus, Role } from "@/features/member/codes";
import { MemberNotFoundError } from "@/features/member/errors";
import { accessFor, type AccessContext } from "@/lib/policy";
import {
  AssetAccessDeniedError,
  AssetNotFoundError,
  InvalidAssetError,
  actionForStatus,
  assertStatus,
  validateItemFields,
  validateUnitFields,
  type AssetItemFields,
} from "./model";
import { assetHistory, assetItem, assetUnit, ASSET_TRACKING_TYPES, type AssetStatus } from "./schema";

type FileService = ReturnType<typeof createFileService>;
type ItemRow = typeof assetItem.$inferSelect;

export interface AssetServiceDeps {
  db: Db;
  files: FileService;
  now?: () => Date;
}

const PAGE_SIZE = 20;
const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const toItem = (row: ItemRow) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  trackingType: row.trackingType as (typeof ASSET_TRACKING_TYPES)[number],
  ownerType: row.ownerType,
  ownerMemberId: row.ownerMemberId,
  externalOwnerName: row.externalOwnerName,
  totalQuantity: row.totalQuantity,
  storageLocation: row.storageLocation,
  status: row.status as AssetStatus,
  hasPhoto: row.photoFileId !== null,
  note: row.note,
  deleted: row.deletedAt !== null,
});

export function createAssetService(deps: AssetServiceDeps) {
  const { db, files } = deps;
  const now = deps.now ?? (() => new Date());

  async function access(executor: DbOrTx, actorId: number): Promise<AccessContext> {
    const [row] = await executor.select().from(member).where(eq(member.id, actorId));
    if (!row) throw new MemberNotFoundError();
    return accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus });
  }
  const admin = async (executor: DbOrTx, actorId: number) => {
    const context = await access(executor, actorId);
    if (!context.canManageGlobal()) throw new AssetAccessDeniedError();
    return context;
  };
  const reader = async (executor: DbOrTx, actorId: number) => {
    const context = await access(executor, actorId);
    if (!context.canReadInternal()) throw new AssetAccessDeniedError();
    return context;
  };

  async function lockItem(tx: DbOrTx, id: number, deleted = false): Promise<ItemRow> {
    const [row] = await tx
      .select()
      .from(assetItem)
      .where(and(eq(assetItem.id, id), deleted ? isNotNull(assetItem.deletedAt) : isNull(assetItem.deletedAt)))
      .for("update");
    if (!row) throw new AssetNotFoundError();
    return row;
  }

  async function findItem(executor: DbOrTx, id: number): Promise<ItemRow> {
    const [row] = await executor.select().from(assetItem).where(and(eq(assetItem.id, id), isNull(assetItem.deletedAt)));
    if (!row) throw new AssetNotFoundError();
    return row;
  }

  /** 사진은 본인이 올린 private 이미지만 연결할 수 있다. */
  async function assertPhoto(tx: DbOrTx, fileId: number, actorId: number) {
    const ref = await files.assertPrivateReadyOwnedBy(fileId, actorId, tx);
    if (!ref.contentType.startsWith("image/")) throw new InvalidAssetError("사진은 이미지 파일이어야 합니다.");
  }

  async function assertOwnerExists(tx: DbOrTx, ownerMemberId: number | null) {
    if (ownerMemberId === null) return;
    const [row] = await tx.select({ id: member.id }).from(member).where(eq(member.id, ownerMemberId));
    if (!row) throw new InvalidAssetError("소유 멤버를 찾을 수 없습니다.");
  }

  async function history(
    tx: DbOrTx,
    entry: { itemId: number; unitId?: number | null; action: (typeof assetHistory.$inferInsert)["action"]; quantity: number; previous?: string | null; next?: string | null; note?: string | null; actorId: number; at: Date },
  ) {
    await tx.insert(assetHistory).values({
      assetItemId: entry.itemId,
      assetUnitId: entry.unitId ?? null,
      action: entry.action,
      quantity: entry.quantity,
      previousStatus: entry.previous ?? null,
      newStatus: entry.next ?? null,
      note: entry.note ?? null,
      changedByMemberId: entry.actorId,
      changedAt: entry.at,
    });
  }

  return {
    async registerItem(actorId: number, input: AssetItemFields & { trackingType: string; photoFileId?: number | null }): Promise<number> {
      return db.transaction(async (tx) => {
        await admin(tx, actorId);
        const fields = validateItemFields(input);
        if (!ASSET_TRACKING_TYPES.includes(input.trackingType as never)) throw new InvalidAssetError("관리 방식이 올바르지 않습니다.");
        await assertOwnerExists(tx, fields.ownerMemberId);
        if (input.photoFileId) await assertPhoto(tx, input.photoFileId, actorId);
        const [created] = await tx
          .insert(assetItem)
          .values({ ...fields, trackingType: input.trackingType, status: "AVAILABLE", photoFileId: input.photoFileId ?? null })
          .returning({ id: assetItem.id });
        await history(tx, { itemId: created.id, action: "REGISTER", quantity: fields.totalQuantity, next: "AVAILABLE", note: fields.note, actorId, at: now() });
        return created.id;
      });
    },

    async registerUnit(actorId: number, itemId: number, input: { managementNo: string; storageLocation: string }): Promise<number> {
      return db.transaction(async (tx) => {
        await admin(tx, actorId);
        const item = await lockItem(tx, itemId);
        if (item.trackingType !== "INDIVIDUAL") throw new InvalidAssetError("개별 관리 품목에만 장비를 등록할 수 있습니다.");
        const fields = validateUnitFields(input);
        const [created] = await tx
          .insert(assetUnit)
          .values({ assetItemId: itemId, ...fields, status: "AVAILABLE" })
          .onConflictDoNothing()
          .returning({ id: assetUnit.id });
        if (!created) throw new InvalidAssetError("이미 사용 중인 관리번호입니다.");
        await history(tx, { itemId, unitId: created.id, action: "REGISTER", quantity: 1, next: "AVAILABLE", actorId, at: now() });
        return created.id;
      });
    },

    async searchItems(
      actorId: number,
      filter: { keyword?: string; category?: string; status?: AssetStatus; trackingType?: string; deleted?: boolean; page?: number } = {},
    ) {
      if (filter.deleted) await admin(db, actorId);
      else await reader(db, actorId);
      const page = Math.max(1, Math.floor(filter.page ?? 1));
      const keyword = filter.keyword?.trim();
      const where = and(
        filter.deleted ? isNotNull(assetItem.deletedAt) : isNull(assetItem.deletedAt),
        keyword ? ilike(assetItem.name, like(keyword)) : undefined,
        filter.category ? eq(assetItem.category, filter.category) : undefined,
        filter.status ? eq(assetItem.status, filter.status) : undefined,
        filter.trackingType ? eq(assetItem.trackingType, filter.trackingType) : undefined,
      );
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(assetItem).where(where);
      const rows = await db
        .select()
        .from(assetItem)
        .where(where)
        .orderBy(koSort(assetItem.name), asc(assetItem.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return { total, page, pageSize: PAGE_SIZE, items: rows.map(toItem) };
    },

    /** 개인 소유 품목의 소유 멤버를 학번으로 찾는다 (ADMIN 전용). */
    async findMemberIdByStudentNo(actorId: number, studentNo: string): Promise<number> {
      await admin(db, actorId);
      const [row] = await db.select({ id: member.id }).from(member).where(eq(member.studentNo, studentNo.trim()));
      if (!row) throw new InvalidAssetError("해당 학번의 멤버를 찾을 수 없습니다.");
      return row.id;
    },

    async lookupItem(actorId: number, itemId: number) {
      await reader(db, actorId);
      return toItem(await findItem(db, itemId));
    },

    async searchUnits(actorId: number, itemId: number) {
      await reader(db, actorId);
      await findItem(db, itemId);
      return db.select().from(assetUnit).where(eq(assetUnit.assetItemId, itemId)).orderBy(asc(assetUnit.managementNo));
    },

    async searchHistories(actorId: number, itemId: number) {
      await reader(db, actorId);
      await findItem(db, itemId);
      return db
        .select({ h: assetHistory, actorName: member.name })
        .from(assetHistory)
        .innerJoin(member, eq(member.id, assetHistory.changedByMemberId))
        .where(eq(assetHistory.assetItemId, itemId))
        .orderBy(asc(assetHistory.changedAt), asc(assetHistory.id))
        .then((rows) => rows.map((r) => ({ ...r.h, actorName: r.actorName })));
    },

    async openPhoto(actorId: number, itemId: number) {
      await reader(db, actorId);
      const item = await findItem(db, itemId);
      if (item.photoFileId === null) throw new AssetNotFoundError();
      return files.openPrivate(item.photoFileId, true);
    },

    async updateItem(actorId: number, itemId: number, input: AssetItemFields & { photoFileId?: number | null }): Promise<void> {
      await db.transaction(async (tx) => {
        await admin(tx, actorId);
        const current = await lockItem(tx, itemId);
        const fields = validateItemFields(input);
        await assertOwnerExists(tx, fields.ownerMemberId);
        if (input.photoFileId) await assertPhoto(tx, input.photoFileId, actorId);
        const at = now();
        await tx
          .update(assetItem)
          .set({ ...fields, photoFileId: input.photoFileId ?? current.photoFileId })
          .where(eq(assetItem.id, itemId));
        if (current.totalQuantity !== fields.totalQuantity) {
          await history(tx, { itemId, action: "ADJUST", quantity: Math.abs(fields.totalQuantity - current.totalQuantity), previous: current.status, next: current.status, note: fields.note, actorId, at });
        }
        if (current.storageLocation !== fields.storageLocation) {
          await history(tx, { itemId, action: "MOVE", quantity: fields.totalQuantity, previous: current.status, next: current.status, note: fields.note, actorId, at });
        }
      });
    },

    async changeItemStatus(actorId: number, itemId: number, rawStatus: string, note: string | null = null): Promise<void> {
      const status = assertStatus(rawStatus);
      await db.transaction(async (tx) => {
        await admin(tx, actorId);
        const current = await lockItem(tx, itemId);
        if (current.status === status) return;
        await tx.update(assetItem).set({ status }).where(eq(assetItem.id, itemId));
        await history(tx, { itemId, action: actionForStatus(current.status as AssetStatus, status), quantity: current.totalQuantity, previous: current.status, next: status, note, actorId, at: now() });
      });
    },

    async updateUnit(actorId: number, unitId: number, input: { status: string; storageLocation: string }, note: string | null = null): Promise<void> {
      const status = assertStatus(input.status);
      await db.transaction(async (tx) => {
        await admin(tx, actorId);
        const [current] = await tx.select().from(assetUnit).where(eq(assetUnit.id, unitId)).for("update");
        if (!current) throw new AssetNotFoundError();
        const location = validateUnitFields({ managementNo: current.managementNo, storageLocation: input.storageLocation }).storageLocation;
        await tx.update(assetUnit).set({ status, storageLocation: location }).where(eq(assetUnit.id, unitId));
        const at = now();
        if (current.status !== status) {
          await history(tx, { itemId: current.assetItemId, unitId, action: actionForStatus(current.status as AssetStatus, status), quantity: 1, previous: current.status, next: status, note, actorId, at });
        }
        if (current.storageLocation !== location) {
          await history(tx, { itemId: current.assetItemId, unitId, action: "MOVE", quantity: 1, previous: current.status, next: status, note, actorId, at });
        }
      });
    },

    /** 소프트 삭제: 개별 장비와 이력은 보존하고 일반 목록·상세·사진에서만 제외한다. */
    async deleteItem(actorId: number, itemId: number): Promise<void> {
      await db.transaction(async (tx) => {
        await admin(tx, actorId);
        const item = await lockItem(tx, itemId);
        const at = now();
        await tx.update(assetItem).set({ deletedAt: at }).where(eq(assetItem.id, itemId));
        await history(tx, { itemId, action: "DELETE", quantity: item.totalQuantity, previous: item.status, next: item.status, note: "품목을 삭제했습니다.", actorId, at });
        await recordAudit(tx, { actorMemberId: actorId, action: "ASSET_DELETED", targetType: "ASSET", targetId: itemId, summary: "소품·장비 품목을 삭제했습니다.", occurredAt: at });
      });
    },

    async restoreItem(actorId: number, itemId: number): Promise<void> {
      await db.transaction(async (tx) => {
        await admin(tx, actorId);
        const item = await lockItem(tx, itemId, true);
        const at = now();
        await tx.update(assetItem).set({ deletedAt: null }).where(eq(assetItem.id, itemId));
        await history(tx, { itemId, action: "RESTORE", quantity: item.totalQuantity, previous: item.status, next: item.status, note: "품목을 복구했습니다.", actorId, at });
        await recordAudit(tx, { actorMemberId: actorId, action: "ASSET_RESTORED", targetType: "ASSET", targetId: itemId, summary: "소품·장비 품목을 복구했습니다.", occurredAt: at });
      });
    },
  };
}
