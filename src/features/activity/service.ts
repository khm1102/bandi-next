import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/types";
import type { createFileService } from "@/features/file/service";
import { storedFile } from "@/features/file/schema";
import { member, team } from "@/features/member/schema";
import type { MemberStatus, Role } from "@/features/member/codes";
import { InvalidTeamError, MemberNotFoundError } from "@/features/member/errors";
import { accessFor, type AccessContext } from "@/lib/policy";
import {
  ActivityAccessDeniedError,
  ActivityNotFoundError,
  InvalidActivityError,
  InvalidActivityStateError,
  canArchive,
  canEdit,
  canFinalApprove,
  canRequestRevision,
  canSubmit,
  canTeamApprove,
  csvCell,
  validateActivityFields,
  type ActivityFields,
} from "./model";
import {
  activityRecord,
  activityRecordFile,
  activityRecordRevision,
  activityReportDocument,
  activityReviewHistory,
  ACTIVITY_STATUSES,
  type ActivityFileRole,
  type ActivityStatus,
} from "./schema";

type FileService = ReturnType<typeof createFileService>;
type Row = typeof activityRecord.$inferSelect;

export interface ActivityServiceDeps {
  db: Db;
  files: FileService;
  now?: () => Date;
}

const PAGE_SIZE = 20;
const REVIEW_STATUSES = ACTIVITY_STATUSES.filter((s) => s !== "DRAFT");
const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface ReviewFilter {
  status?: ActivityStatus;
  teamId?: number;
  keyword?: string;
  from?: Date;
  to?: Date;
  page?: number;
}

export function createActivityService(deps: ActivityServiceDeps) {
  const { db, files } = deps;
  const now = deps.now ?? (() => new Date());

  const run = <T>(tx: DbOrTx | undefined, work: (t: DbOrTx) => Promise<T>): Promise<T> => (tx ?? db).transaction(work);

  async function access(executor: DbOrTx, actorId: number): Promise<AccessContext> {
    const [row] = await executor.select().from(member).where(eq(member.id, actorId));
    if (!row) throw new MemberNotFoundError();
    return accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus });
  }

  async function reader(executor: DbOrTx, actorId: number) {
    const context = await access(executor, actorId);
    if (!context.canReadInternal()) throw new ActivityAccessDeniedError();
    return context;
  }

  async function lock(tx: DbOrTx, id: number): Promise<Row> {
    const [row] = await tx.select().from(activityRecord).where(and(eq(activityRecord.id, id), isNull(activityRecord.deletedAt))).for("update");
    if (!row) throw new ActivityNotFoundError();
    return row;
  }

  /** 팀 소속 작성자 본인이거나 해당 팀 관리자(팀장·ADMIN)만 수정할 수 있다. */
  function assertEdit(context: AccessContext, record: Row, actorId: number) {
    const author = context.canReadInternal() && context.teamId === record.teamId && record.createdByMemberId === actorId;
    if (!context.canManageTeam(record.teamId) && !author) throw new ActivityAccessDeniedError();
  }

  /** 1차 검수는 해당 팀 팀장만, 본인 기록은 불가. */
  function assertTeamReview(context: AccessContext, record: Row, actorId: number) {
    if (!context.leader || !context.canManageTeam(record.teamId) || record.createdByMemberId === actorId) {
      throw new ActivityAccessDeniedError();
    }
  }

  async function assertActiveTeam(tx: DbOrTx, teamId: number) {
    const [row] = await tx.select().from(team).where(and(eq(team.id, teamId), eq(team.isActive, true)));
    if (!row) throw new InvalidTeamError();
  }

  async function currentFiles(executor: DbOrTx, recordId: number) {
    return executor
      .select({
        linkId: activityRecordFile.id,
        fileId: storedFile.id,
        name: storedFile.originalName,
        contentType: storedFile.contentType,
        sizeBytes: storedFile.sizeBytes,
        role: activityRecordFile.fileRole,
        order: activityRecordFile.displayOrder,
        uploadedByName: member.name,
        uploadedAt: activityRecordFile.createdAt,
      })
      .from(activityRecordFile)
      .innerJoin(storedFile, eq(storedFile.id, activityRecordFile.storedFileId))
      .innerJoin(member, eq(member.id, activityRecordFile.uploadedByMemberId))
      .where(and(eq(activityRecordFile.activityRecordId, recordId), isNull(activityRecordFile.replacedAt)))
      .orderBy(asc(activityRecordFile.fileRole), asc(activityRecordFile.displayOrder), asc(activityRecordFile.id));
  }

  async function hasCurrentFile(executor: DbOrTx, recordId: number, fileId: number) {
    const [row] = await executor
      .select({ id: activityRecordFile.id })
      .from(activityRecordFile)
      .where(and(eq(activityRecordFile.activityRecordId, recordId), eq(activityRecordFile.storedFileId, fileId), isNull(activityRecordFile.replacedAt)));
    return Boolean(row);
  }

  async function nextOrder(tx: DbOrTx, recordId: number, role: ActivityFileRole) {
    const [row] = await tx
      .select({ max: sql<number | null>`max(${activityRecordFile.displayOrder})` })
      .from(activityRecordFile)
      .where(and(eq(activityRecordFile.activityRecordId, recordId), eq(activityRecordFile.fileRole, role), isNull(activityRecordFile.replacedAt)));
    return (row.max ?? -1) + 1;
  }

  async function assertOwnedImage(tx: DbOrTx, fileId: number, actorId: number) {
    const ref = await files.assertPrivateReadyOwnedBy(fileId, actorId, tx);
    if (!ref.contentType.startsWith("image/")) throw new InvalidActivityError("사진은 이미지 파일이어야 합니다.");
  }

  async function assertGeneratedFile(tx: DbOrTx, fileId: number, actorId: number, role: ActivityFileRole) {
    const ref = await files.assertPrivateReadyOwnedBy(fileId, actorId, tx);
    const ok = (role === "EVIDENCE" && ref.contentType.startsWith("image/")) || (role === "DOCUMENT" && ref.contentType === "application/hwp+zip");
    if (!ok) throw new InvalidActivityError("생성된 파일 형식이 올바르지 않습니다.");
  }

  async function writeReview(tx: DbOrTx, recordId: number, previous: ActivityStatus, next: ActivityStatus, comment: string | null, actorId: number, at: Date) {
    await tx.insert(activityReviewHistory).values({ activityRecordId: recordId, previousStatus: previous, newStatus: next, comment, reviewedByMemberId: actorId, reviewedAt: at });
  }

  const toSummary = (r: { rec: Row; teamName: string; authorName: string }) => ({
    id: r.rec.id,
    teamId: r.rec.teamId,
    teamName: r.teamName,
    title: r.rec.title,
    activityAt: r.rec.activityAt,
    participantCount: r.rec.participantCount,
    status: r.rec.status as ActivityStatus,
    createdByMemberId: r.rec.createdByMemberId,
    authorName: r.authorName,
    updatedAt: r.rec.updatedAt,
  });

  async function list(where: SQL | undefined, page: number, order: "recent" | "activity" = "recent") {
    const p = Math.max(1, Math.floor(page));
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(activityRecord).where(where);
    const rows = await db
      .select({ rec: activityRecord, teamName: team.name, authorName: member.name })
      .from(activityRecord)
      .innerJoin(team, eq(team.id, activityRecord.teamId))
      .innerJoin(member, eq(member.id, activityRecord.createdByMemberId))
      .where(where)
      .orderBy(order === "recent" ? desc(activityRecord.updatedAt) : desc(activityRecord.activityAt), desc(activityRecord.id))
      .limit(PAGE_SIZE)
      .offset((p - 1) * PAGE_SIZE);
    return { total, page: p, pageSize: PAGE_SIZE, items: rows.map(toSummary) };
  }

  function reviewWhere(context: AccessContext, filter: ReviewFilter): SQL | undefined {
    if (!context.canManageGlobal() && !(context.leader && context.canManageTeam(context.teamId))) throw new ActivityAccessDeniedError();
    const keyword = filter.keyword?.trim();
    return and(
      isNull(activityRecord.deletedAt),
      inArray(activityRecord.status, REVIEW_STATUSES),
      context.canManageGlobal() ? (filter.teamId ? eq(activityRecord.teamId, filter.teamId) : undefined) : eq(activityRecord.teamId, context.teamId),
      filter.status ? eq(activityRecord.status, filter.status) : undefined,
      filter.from ? gte(activityRecord.activityAt, filter.from) : undefined,
      filter.to ? lte(activityRecord.activityAt, filter.to) : undefined,
      keyword ? or(ilike(activityRecord.title, like(keyword)), ilike(member.name, like(keyword))) : undefined,
    );
  }

  async function detail(tx: DbOrTx, id: number) {
    const [row] = await tx
      .select({ rec: activityRecord, teamName: team.name, authorName: member.name })
      .from(activityRecord)
      .innerJoin(team, eq(team.id, activityRecord.teamId))
      .innerJoin(member, eq(member.id, activityRecord.createdByMemberId))
      .where(and(eq(activityRecord.id, id), isNull(activityRecord.deletedAt)));
    if (!row) throw new ActivityNotFoundError();
    const [fileRows, history, report] = await Promise.all([
      currentFiles(tx, id),
      tx
        .select({ h: activityReviewHistory, reviewerName: member.name })
        .from(activityReviewHistory)
        .innerJoin(member, eq(member.id, activityReviewHistory.reviewedByMemberId))
        .where(eq(activityReviewHistory.activityRecordId, id))
        .orderBy(asc(activityReviewHistory.reviewedAt), asc(activityReviewHistory.id)),
      tx.select().from(activityReportDocument).where(eq(activityReportDocument.activityRecordId, id)),
    ]);
    return {
      ...toSummary(row),
      body: row.rec.body,
      submittedAt: row.rec.submittedAt,
      reviewedAt: row.rec.reviewedAt,
      files: fileRows,
      history: history.map((x) => ({ previousStatus: x.h.previousStatus, newStatus: x.h.newStatus, comment: x.h.comment, reviewerName: x.reviewerName, reviewedAt: x.h.reviewedAt })),
      isReportDocument: report.length > 0,
    };
  }

  async function openFileOf(recordId: number, fileId: number) {
    if (!(await hasCurrentFile(db, recordId, fileId))) throw new ActivityNotFoundError();
    return files.openPrivate(fileId, true);
  }

  return {
    async createDraft(actorId: number, input: ActivityFields, tx?: DbOrTx): Promise<number> {
      return run(tx, async (t) => {
        const context = await access(t, actorId);
        const fields = validateActivityFields(input);
        const allowed = context.canManageGlobal() || (context.canReadInternal() && context.teamId === fields.teamId);
        if (!allowed) throw new ActivityAccessDeniedError();
        await assertActiveTeam(t, fields.teamId);
        const [created] = await t
          .insert(activityRecord)
          .values({ ...fields, status: "DRAFT", createdByMemberId: actorId, updatedByMemberId: actorId })
          .returning({ id: activityRecord.id });
        return created.id;
      });
    },

    async update(actorId: number, id: number, input: Omit<ActivityFields, "teamId">, tx?: DbOrTx): Promise<void> {
      await run(tx, async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        assertEdit(context, record, actorId);
        if (!canEdit(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        const fields = validateActivityFields({ ...input, teamId: record.teamId });
        await t
          .update(activityRecord)
          .set({ activityAt: fields.activityAt, title: fields.title, body: fields.body, participantCount: fields.participantCount, updatedByMemberId: actorId })
          .where(eq(activityRecord.id, id));
      });
    },

    /** 증빙·추가 사진 첨부. DOCUMENT(HWPX)는 서버가 생성·관리하므로 직접 첨부할 수 없다. */
    async addFile(actorId: number, id: number, fileId: number, role: "EVIDENCE" | "ADDITIONAL"): Promise<void> {
      await db.transaction(async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        assertEdit(context, record, actorId);
        if (!canEdit(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        await assertOwnedImage(t, fileId, actorId);
        if (await hasCurrentFile(t, id, fileId)) throw new InvalidActivityError("이미 첨부된 파일입니다.");
        await t.insert(activityRecordFile).values({
          activityRecordId: id,
          storedFileId: fileId,
          fileRole: role,
          displayOrder: await nextOrder(t, id, role),
          uploadedByMemberId: actorId,
        });
      });
    },

    /**
     * 증빙·추가 사진 제거. 수정 가능한 상태에서만, HWPX(DOCUMENT)는 제거할 수 없다.
     * 연결을 지우고 파일은 파기 대기열로 보낸다(원본을 남기지 않는다).
     */
    async removeFile(actorId: number, id: number, fileId: number): Promise<void> {
      await db.transaction(async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        assertEdit(context, record, actorId);
        if (!canEdit(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        const [link] = await t
          .select()
          .from(activityRecordFile)
          .where(and(eq(activityRecordFile.activityRecordId, id), eq(activityRecordFile.storedFileId, fileId), isNull(activityRecordFile.replacedAt)))
          .for("update");
        if (!link) throw new ActivityNotFoundError();
        if (link.fileRole === "DOCUMENT") throw new InvalidActivityError("생성된 문서는 직접 제거할 수 없습니다.");
        await t.delete(activityRecordFile).where(eq(activityRecordFile.id, link.id));
        await files.enqueueRetirement(t, fileId, "ACTIVITY_PHOTO");
      });
      await files.runRetirements().catch(() => undefined);
    },

    async attachGeneratedFile(actorId: number, id: number, fileId: number, role: "EVIDENCE" | "DOCUMENT", tx?: DbOrTx): Promise<void> {
      await run(tx, async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        assertEdit(context, record, actorId);
        if (!canEdit(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        await assertGeneratedFile(t, fileId, actorId, role);
        if (await hasCurrentFile(t, id, fileId)) throw new InvalidActivityError("이미 첨부된 파일입니다.");
        await t.insert(activityRecordFile).values({
          activityRecordId: id,
          storedFileId: fileId,
          fileRole: role,
          displayOrder: await nextOrder(t, id, role),
          uploadedByMemberId: actorId,
        });
      });
    },

    /** 현재 파일을 새 파일로 교체한다. 이전 파일 연결은 이력으로 남긴다(replaced). */
    async replaceGeneratedFile(actorId: number, id: number, role: "EVIDENCE" | "DOCUMENT", newFileId: number, tx?: DbOrTx): Promise<void> {
      await run(tx, async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        assertEdit(context, record, actorId);
        if (!canEdit(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        await assertGeneratedFile(t, newFileId, actorId, role);
        const [original] = await t
          .select()
          .from(activityRecordFile)
          .where(and(eq(activityRecordFile.activityRecordId, id), eq(activityRecordFile.fileRole, role), isNull(activityRecordFile.replacedAt)))
          .for("update");
        if (!original) throw new ActivityNotFoundError();
        const [replacement] = await t
          .insert(activityRecordFile)
          .values({ activityRecordId: id, storedFileId: newFileId, fileRole: role, displayOrder: original.displayOrder, uploadedByMemberId: actorId })
          .returning({ id: activityRecordFile.id });
        await t
          .update(activityRecordFile)
          .set({ replacedByFileId: replacement.id, replacedAt: now(), replacedByMemberId: actorId })
          .where(eq(activityRecordFile.id, original.id));
      });
    },

    /** 제출: 리포트 문서 기록은 사진(EVIDENCE)과 HWPX(DOCUMENT)가 모두 있어야 한다. 스냅샷을 리비전으로 남긴다. */
    async submit(actorId: number, id: number, changeReason: string | null = null, tx?: DbOrTx): Promise<number> {
      return run(tx, async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        assertEdit(context, record, actorId);
        if (!canSubmit(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        const [report] = await t.select({ id: activityReportDocument.id }).from(activityReportDocument).where(eq(activityReportDocument.activityRecordId, id));
        if (report) {
          const current = await currentFiles(t, id);
          if (!current.some((f) => f.role === "EVIDENCE") || !current.some((f) => f.role === "DOCUMENT")) {
            throw new InvalidActivityError("활동 사진과 HWPX 문서가 모두 있어야 제출할 수 있습니다.");
          }
        }
        const [{ max }] = await t
          .select({ max: sql<number | null>`max(${activityRecordRevision.revisionNo})` })
          .from(activityRecordRevision)
          .where(eq(activityRecordRevision.activityRecordId, id));
        const revisionNo = (max ?? 0) + 1;
        const at = now();
        await t.insert(activityRecordRevision).values({
          activityRecordId: id,
          revisionNo,
          activityAt: record.activityAt,
          title: record.title,
          body: record.body,
          participantCount: record.participantCount,
          changedByMemberId: actorId,
          changedAt: at,
          changeReason: changeReason?.trim() || null,
        });
        // 제출 상태는 검수 정보가 비어 있어야 한다 (DB 제약).
        await t
          .update(activityRecord)
          .set({ status: "SUBMITTED", submittedAt: at, reviewedAt: null, reviewedByMemberId: null, updatedByMemberId: actorId })
          .where(eq(activityRecord.id, id));
        await writeReview(t, id, record.status as ActivityStatus, "SUBMITTED", null, actorId, at);
        return revisionNo;
      });
    },

    async teamApprove(actorId: number, id: number): Promise<void> {
      await db.transaction(async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        assertTeamReview(context, record, actorId);
        if (!canTeamApprove(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        const at = now();
        await t.update(activityRecord).set({ status: "TEAM_APPROVED", reviewedAt: at, reviewedByMemberId: actorId, updatedByMemberId: actorId }).where(eq(activityRecord.id, id));
        await writeReview(t, id, record.status as ActivityStatus, "TEAM_APPROVED", null, actorId, at);
      });
    },

    /** 최종 승인은 ADMIN만. 팀장 1차 승인을 건너뛰는 긴급 승인(SUBMITTED)은 사유가 필수다. */
    async finalApprove(actorId: number, id: number, emergencyReason: string | null = null): Promise<void> {
      await db.transaction(async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        if (!context.canManageGlobal()) throw new ActivityAccessDeniedError();
        const status = record.status as ActivityStatus;
        if (status === "SUBMITTED" && !emergencyReason?.trim()) throw new InvalidActivityError("긴급 최종 승인에는 사유가 필요합니다.");
        if (!canFinalApprove(status)) throw new InvalidActivityStateError(status);
        const at = now();
        await t.update(activityRecord).set({ status: "APPROVED", reviewedAt: at, reviewedByMemberId: actorId, updatedByMemberId: actorId }).where(eq(activityRecord.id, id));
        await writeReview(t, id, status, "APPROVED", status === "SUBMITTED" ? `긴급 최종 승인: ${emergencyReason!.trim()}` : null, actorId, at);
      });
    },

    /** 보완 요청: ADMIN은 누구의 기록이든, 팀장은 자기 팀의 타인 기록만. 코멘트 필수. */
    async requestRevision(actorId: number, id: number, comment: string): Promise<void> {
      if (!comment?.trim()) throw new InvalidActivityError("보완 요청 사유를 입력해 주세요.");
      await db.transaction(async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        if (!context.canManageGlobal()) {
          if (record.createdByMemberId === actorId) throw new ActivityAccessDeniedError();
          assertTeamReview(context, record, actorId);
        }
        if (!canRequestRevision(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        const at = now();
        await t.update(activityRecord).set({ status: "REVISION_REQUESTED", reviewedAt: at, reviewedByMemberId: actorId, updatedByMemberId: actorId }).where(eq(activityRecord.id, id));
        await writeReview(t, id, record.status as ActivityStatus, "REVISION_REQUESTED", comment.trim(), actorId, at);
      });
    },

    async archive(actorId: number, id: number): Promise<void> {
      await db.transaction(async (t) => {
        const context = await access(t, actorId);
        const record = await lock(t, id);
        if (!context.canManageGlobal()) throw new ActivityAccessDeniedError();
        if (!canArchive(record.status as ActivityStatus)) throw new InvalidActivityStateError(record.status as ActivityStatus);
        const at = now();
        await t.update(activityRecord).set({ status: "ARCHIVED", updatedByMemberId: actorId }).where(eq(activityRecord.id, id));
        await writeReview(t, id, record.status as ActivityStatus, "ARCHIVED", null, actorId, at);
      });
    },

    /** 내 활동 기록. */
    async searchMine(actorId: number, filter: { status?: ActivityStatus; page?: number } = {}) {
      await reader(db, actorId);
      return list(
        and(isNull(activityRecord.deletedAt), eq(activityRecord.createdByMemberId, actorId), filter.status ? eq(activityRecord.status, filter.status) : undefined),
        filter.page ?? 1,
      );
    },

    /** 최종 승인된 기록은 모든 활성 멤버가 열람한다. */
    async searchArchive(actorId: number, filter: { keyword?: string; teamId?: number; page?: number } = {}) {
      await reader(db, actorId);
      const keyword = filter.keyword?.trim();
      return list(
        and(
          isNull(activityRecord.deletedAt),
          eq(activityRecord.status, "APPROVED"),
          filter.teamId ? eq(activityRecord.teamId, filter.teamId) : undefined,
          keyword ? or(ilike(activityRecord.title, like(keyword)), ilike(member.name, like(keyword))) : undefined,
        ),
        filter.page ?? 1,
        "activity",
      );
    },

    /** 검수 목록: ADMIN 전체, 팀장은 자기 팀. 초안은 제외한다. */
    async searchReview(actorId: number, filter: ReviewFilter = {}) {
      const context = await reader(db, actorId);
      return list(reviewWhere(context, filter), filter.page ?? 1);
    },

    async lookupManageable(actorId: number, id: number) {
      const context = await reader(db, actorId);
      const view = await detail(db, id);
      const author = view.createdByMemberId === actorId && context.teamId === view.teamId;
      if (!context.canManageTeam(view.teamId) && !author) throw new ActivityAccessDeniedError();
      return view;
    },

    /** 검수 상세: 초안 불가, 본인 기록은 팀장 검수 불가(ADMIN은 가능). */
    async lookupReviewable(actorId: number, id: number) {
      const context = await reader(db, actorId);
      const view = await detail(db, id);
      if (view.status === "DRAFT") throw new ActivityAccessDeniedError();
      if (!context.canManageGlobal()) {
        if (view.createdByMemberId === actorId || !context.leader || !context.canManageTeam(view.teamId)) throw new ActivityAccessDeniedError();
      }
      return view;
    },

    async lookupApproved(actorId: number, id: number) {
      await reader(db, actorId);
      const view = await detail(db, id);
      if (view.status !== "APPROVED") throw new ActivityNotFoundError();
      return { ...view, history: [] };
    },

    async openApprovedFile(actorId: number, id: number, fileId: number) {
      await reader(db, actorId);
      const [row] = await db.select({ status: activityRecord.status }).from(activityRecord).where(and(eq(activityRecord.id, id), isNull(activityRecord.deletedAt)));
      if (!row || row.status !== "APPROVED") throw new ActivityNotFoundError();
      return openFileOf(id, fileId);
    },

    async openManageableFile(actorId: number, id: number, fileId: number) {
      const context = await reader(db, actorId);
      const [record] = await db.select().from(activityRecord).where(and(eq(activityRecord.id, id), isNull(activityRecord.deletedAt)));
      if (!record) throw new ActivityNotFoundError();
      const author = record.createdByMemberId === actorId && context.teamId === record.teamId;
      if (!context.canManageTeam(record.teamId) && !author) throw new ActivityAccessDeniedError();
      return openFileOf(id, fileId);
    },

    async openReviewFile(actorId: number, id: number, fileId: number) {
      const context = await reader(db, actorId);
      const [record] = await db.select().from(activityRecord).where(and(eq(activityRecord.id, id), isNull(activityRecord.deletedAt)));
      if (!record) throw new ActivityNotFoundError();
      if (record.status === "DRAFT") throw new ActivityAccessDeniedError();
      if (!context.canManageGlobal()) {
        if (record.createdByMemberId === actorId || !context.leader || !context.canManageTeam(record.teamId)) throw new ActivityAccessDeniedError();
      }
      return openFileOf(id, fileId);
    },

    /** 필터 전체 기준 CSV (ADMIN 전용). 본문·사진·학번은 포함하지 않는다. */
    async exportReviewCsv(actorId: number, filter: ReviewFilter = {}): Promise<string> {
      const context = await reader(db, actorId);
      if (!context.canManageGlobal()) throw new ActivityAccessDeniedError();
      const rows = await db
        .select({ rec: activityRecord, teamName: team.name, authorName: member.name })
        .from(activityRecord)
        .innerJoin(team, eq(team.id, activityRecord.teamId))
        .innerJoin(member, eq(member.id, activityRecord.createdByMemberId))
        .where(reviewWhere(context, filter))
        .orderBy(desc(activityRecord.activityAt), desc(activityRecord.id))
        .limit(5000);
      const header = ["번호", "팀", "제목", "활동 일시", "참여 인원", "작성자", "상태", "제출 시각", "검수 시각"].map(csvCell).join(",");
      const lines = rows.map((r) =>
        [r.rec.id, r.teamName, r.rec.title, r.rec.activityAt.toISOString(), r.rec.participantCount, r.authorName, r.rec.status, r.rec.submittedAt?.toISOString() ?? "", r.rec.reviewedAt?.toISOString() ?? ""]
          .map(csvCell)
          .join(","),
      );
      return `﻿${[header, ...lines].join("\r\n")}\r\n`;
    },
  };
}
