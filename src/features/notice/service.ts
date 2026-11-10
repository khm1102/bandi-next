import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { koSort } from "@/db/columns";
import type { Db, DbOrTx } from "@/db/types";
import type { createFileService } from "@/features/file/service";
import { InvalidFileStateError } from "@/features/file/errors";
import { member, team } from "@/features/member/schema";
import type { MemberStatus, Role } from "@/features/member/codes";
import { MemberNotFoundError, InvalidTeamError } from "@/features/member/errors";
import { storedFile } from "@/features/file/schema";
import { accessFor, type AccessContext } from "@/lib/policy";
import { generateShareToken, SHARE_TOKEN_PATTERN } from "@/lib/share-token";
import { extractAttachmentImageIds, renderMarkdown, type SafeMarkdownHtml } from "./markdown";
import {
  InvalidNoticeError,
  NoticeAccessDeniedError,
  NoticeNotFoundError,
  canArchive,
  canBePublic,
  canClose,
  canDelete,
  canEdit,
  canReturnToDraft,
  InvalidNoticeStateError,
  isVisibleAt,
  planPublish,
  validateNoticeFields,
  type NoticeFields,
} from "./model";
import { internalNotice, internalNoticeAttachment, internalNoticeRead, type NoticeScope, type NoticeStatus } from "./schema";

type FileService = ReturnType<typeof createFileService>;

export interface NoticeServiceDeps {
  db: Db;
  files: FileService;
  now?: () => Date;
}

export interface NoticeInput extends NoticeFields {
  attachmentFileIds: number[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;
const MAX_ATTACHMENTS = 10;
const INLINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const clampPage = (page?: number) => Math.max(1, Math.floor(page ?? 1));

export function createNoticeService(deps: NoticeServiceDeps) {
  const { db, files } = deps;
  const now = deps.now ?? (() => new Date());

  async function actorAccess(executor: DbOrTx, actorId: number): Promise<AccessContext> {
    const [row] = await executor.select().from(member).where(eq(member.id, actorId));
    if (!row) throw new MemberNotFoundError();
    return accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus });
  }

  const canManage = (access: AccessContext, scope: NoticeScope, teamId: number | null) =>
    scope === "ALL" ? access.canManageGlobal() : access.canManageTeam(teamId);

  function assertManage(access: AccessContext, scope: NoticeScope, teamId: number | null) {
    if (!canManage(access, scope, teamId)) throw new NoticeAccessDeniedError();
  }

  async function lockNotice(tx: DbOrTx, id: number) {
    const [row] = await tx
      .select()
      .from(internalNotice)
      .where(and(eq(internalNotice.id, id), isNull(internalNotice.deletedAt)))
      .for("update");
    if (!row) throw new NoticeNotFoundError();
    return row;
  }

  async function assertActiveTarget(tx: DbOrTx, scope: NoticeScope, teamId: number | null) {
    if (scope === "TEAM") {
      const [row] = await tx.select().from(team).where(and(eq(team.id, teamId ?? -1), eq(team.isActive, true)));
      if (!row) throw new InvalidTeamError();
    }
  }

  /** 새로 연결하는 첨부는 수정자가 올린 private 파일이어야 하고, 기존 첨부는 업로더와 무관하게 유지한다. */
  async function validateAttachments(tx: DbOrTx, actorId: number, wanted: number[], existing: number[]) {
    if (wanted.length > MAX_ATTACHMENTS || new Set(wanted).size !== wanted.length) {
      throw new InvalidNoticeError("첨부 파일 목록이 올바르지 않습니다.");
    }
    for (const fileId of wanted) {
      if (!existing.includes(fileId)) {
        await files.assertPrivateReadyOwnedBy(fileId, actorId, tx);
      }
    }
  }

  /** 본문의 attachment://N 은 현재 첨부에 실제로 연결된 이미지(형식·용량 검증)여야 한다. */
  async function validateInlineImages(tx: DbOrTx, body: string, attachmentIds: number[]) {
    const referenced = extractAttachmentImageIds(body);
    for (const id of referenced) {
      if (!attachmentIds.includes(id)) throw new InvalidNoticeError("본문 이미지가 첨부 목록에 없습니다.");
      const [file] = await tx.select().from(storedFile).where(eq(storedFile.id, id));
      if (!file || !INLINE_IMAGE_TYPES.has(file.contentType) || file.sizeBytes > INLINE_IMAGE_MAX_BYTES) {
        throw new InvalidNoticeError("본문에는 JPEG·PNG·WebP 10MiB 이하 이미지만 사용할 수 있습니다.");
      }
    }
  }

  async function currentAttachmentIds(tx: DbOrTx, noticeId: number): Promise<number[]> {
    const rows = await tx
      .select({ id: internalNoticeAttachment.storedFileId })
      .from(internalNoticeAttachment)
      .where(eq(internalNoticeAttachment.internalNoticeId, noticeId))
      .orderBy(asc(internalNoticeAttachment.displayOrder));
    return rows.map((row) => row.id);
  }

  async function replaceAttachments(tx: DbOrTx, noticeId: number, fileIds: number[]) {
    await tx.delete(internalNoticeAttachment).where(eq(internalNoticeAttachment.internalNoticeId, noticeId));
    if (fileIds.length > 0) {
      await tx.insert(internalNoticeAttachment).values(
        fileIds.map((storedFileId, displayOrder) => ({ internalNoticeId: noticeId, storedFileId, displayOrder })),
      );
    }
  }

  async function attachmentViews(executor: DbOrTx, noticeId: number) {
    return executor
      .select({
        id: storedFile.id,
        name: storedFile.originalName,
        contentType: storedFile.contentType,
        sizeBytes: storedFile.sizeBytes,
      })
      .from(internalNoticeAttachment)
      .innerJoin(storedFile, eq(storedFile.id, internalNoticeAttachment.storedFileId))
      .where(eq(internalNoticeAttachment.internalNoticeId, noticeId))
      .orderBy(asc(internalNoticeAttachment.displayOrder));
  }

  /** 본문 이미지 URL 맵: 첨부된 이미지에 한해 인증이 필요한 우리 서버 경로로 치환한다. */
  function imageUrlMap(noticeId: number, attachments: { id: number; contentType: string }[], manage: boolean) {
    const base = manage ? "/api/internal-notice-management" : "/api/internal-notices";
    return new Map(
      attachments.filter((a) => INLINE_IMAGE_TYPES.has(a.contentType)).map((a) => [a.id, `${base}/${noticeId}/attachments/${a.id}/inline`]),
    );
  }

  /** 멤버가 읽을 수 있는 공지 조건: 삭제 안 됨 + 게시 중 + 기간 안 + (ADMIN 전체 | 전체 공지 | 자기 팀). */
  function readableCondition(access: AccessContext, current: Date) {
    return and(
      isNull(internalNotice.deletedAt),
      inArray(internalNotice.status, ["SCHEDULED", "PUBLISHED"]),
      lte(internalNotice.publishStartAt, current),
      or(isNull(internalNotice.publishEndAt), gt(internalNotice.publishEndAt, current)),
      access.admin
        ? undefined
        : or(eq(internalNotice.targetScope, "ALL"), and(eq(internalNotice.targetScope, "TEAM"), eq(internalNotice.teamId, access.teamId))),
    );
  }

  async function requireReader(actorId: number) {
    const access = await actorAccess(db, actorId);
    if (!access.canReadInternal()) throw new NoticeAccessDeniedError();
    return access;
  }

  async function requireManager(actorId: number) {
    const access = await actorAccess(db, actorId);
    if (!access.canManageGlobal() && !access.canManageTeam(access.teamId)) throw new NoticeAccessDeniedError();
    return access;
  }

  const toSummary = (row: { n: typeof internalNotice.$inferSelect; teamName: string | null; creatorName: string; readAt?: Date | null }) => ({
    id: row.n.id,
    targetScope: row.n.targetScope as NoticeScope,
    teamId: row.n.teamId,
    teamName: row.teamName,
    title: row.n.title,
    important: row.n.isImportant,
    status: row.n.status as NoticeStatus,
    createdByName: row.creatorName,
    publishStartAt: row.n.publishStartAt,
    publishEndAt: row.n.publishEndAt,
    updatedAt: row.n.updatedAt,
    isRead: row.readAt != null,
  });

  return {
    async createDraft(actorId: number, input: NoticeInput): Promise<number> {
      return db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const fields = validateNoticeFields(input);
        assertManage(access, fields.targetScope, fields.teamId);
        await assertActiveTarget(tx, fields.targetScope, fields.teamId);
        await validateAttachments(tx, actorId, input.attachmentFileIds, []);
        await validateInlineImages(tx, fields.body, input.attachmentFileIds);
        const [created] = await tx
          .insert(internalNotice)
          .values({
            targetScope: fields.targetScope,
            teamId: fields.teamId,
            title: fields.title,
            body: fields.body,
            status: "DRAFT",
            isImportant: fields.important,
            createdByMemberId: actorId,
            updatedByMemberId: actorId,
          })
          .returning({ id: internalNotice.id });
        await replaceAttachments(tx, created.id, input.attachmentFileIds);
        return created.id;
      });
    },

    async update(actorId: number, noticeId: number, input: NoticeInput): Promise<void> {
      await db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const original = await lockNotice(tx, noticeId);
        assertManage(access, original.targetScope as NoticeScope, original.teamId);
        const fields = validateNoticeFields(input);
        assertManage(access, fields.targetScope, fields.teamId);
        await assertActiveTarget(tx, fields.targetScope, fields.teamId);
        if (!canEdit(original.status as NoticeStatus)) throw new InvalidNoticeStateError(original.status as NoticeStatus);
        const existing = await currentAttachmentIds(tx, noticeId);
        await validateAttachments(tx, actorId, input.attachmentFileIds, existing);
        await validateInlineImages(tx, fields.body, input.attachmentFileIds);
        await tx
          .update(internalNotice)
          .set({
            targetScope: fields.targetScope,
            teamId: fields.teamId,
            title: fields.title,
            body: fields.body,
            isImportant: fields.important,
            updatedByMemberId: actorId,
          })
          .where(eq(internalNotice.id, noticeId));
        await replaceAttachments(tx, noticeId, input.attachmentFileIds);
      });
    },

    async publish(actorId: number, noticeId: number, period: { start?: Date | null; end?: Date | null } = {}): Promise<void> {
      await db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const original = await lockNotice(tx, noticeId);
        assertManage(access, original.targetScope as NoticeScope, original.teamId);
        await assertActiveTarget(tx, original.targetScope as NoticeScope, original.teamId);
        const plan = planPublish(original.status as NoticeStatus, period.start ?? null, period.end ?? null, now());
        await tx
          .update(internalNotice)
          .set({
            status: plan.status,
            publishStartAt: plan.publishStartAt,
            publishEndAt: plan.publishEndAt,
            publishedByMemberId: actorId,
            updatedByMemberId: actorId,
          })
          .where(eq(internalNotice.id, noticeId));
      });
    },

    async close(actorId: number, noticeId: number): Promise<void> {
      await this.transition(actorId, noticeId, "CLOSED", canClose);
    },

    async archive(actorId: number, noticeId: number): Promise<void> {
      await this.transition(actorId, noticeId, "ARCHIVED", canArchive);
    },

    /** 내부 사용: 단순 상태 전이(권한 + 전이 규칙). */
    async transition(actorId: number, noticeId: number, next: NoticeStatus, allowed: (s: NoticeStatus) => boolean): Promise<void> {
      await db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const original = await lockNotice(tx, noticeId);
        assertManage(access, original.targetScope as NoticeScope, original.teamId);
        if (!allowed(original.status as NoticeStatus)) throw new InvalidNoticeStateError(original.status as NoticeStatus);
        await tx.update(internalNotice).set({ status: next, updatedByMemberId: actorId }).where(eq(internalNotice.id, noticeId));
      });
    },

    /** 초안 복귀: 게시 시각·게시자를 초기화하고 재게시 때 확인 상태가 섞이지 않도록 읽음 기록도 지운다. */
    async returnToDraft(actorId: number, noticeId: number): Promise<void> {
      await db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const original = await lockNotice(tx, noticeId);
        assertManage(access, original.targetScope as NoticeScope, original.teamId);
        if (!canReturnToDraft(original.status as NoticeStatus)) throw new InvalidNoticeStateError(original.status as NoticeStatus);
        await tx
          .update(internalNotice)
          .set({ status: "DRAFT", publishStartAt: null, publishEndAt: null, publishedByMemberId: null, updatedByMemberId: actorId })
          .where(eq(internalNotice.id, noticeId));
        await tx.delete(internalNoticeRead).where(eq(internalNoticeRead.internalNoticeId, noticeId));
      });
    },

    /** 초안만 소프트 삭제한다. 게시 이력이 있는 공지는 종료 후 보관한다. */
    async deleteDraft(actorId: number, noticeId: number): Promise<void> {
      await db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const original = await lockNotice(tx, noticeId);
        assertManage(access, original.targetScope as NoticeScope, original.teamId);
        if (!canDelete(original.status as NoticeStatus)) throw new InvalidNoticeStateError(original.status as NoticeStatus);
        await tx.update(internalNotice).set({ deletedAt: now(), updatedByMemberId: actorId }).where(eq(internalNotice.id, noticeId));
      });
    },

    async searchReadable(
      actorId: number,
      filter: { keyword?: string; unreadOnly?: boolean; scope?: NoticeScope; page?: number } = {},
    ): Promise<Page<ReturnType<typeof toSummary>>> {
      const access = await requireReader(actorId);
      const page = clampPage(filter.page);
      const keyword = filter.keyword?.trim();
      const where = and(
        readableCondition(access, now()),
        keyword ? or(ilike(internalNotice.title, like(keyword)), ilike(internalNotice.body, like(keyword))) : undefined,
        filter.scope ? eq(internalNotice.targetScope, filter.scope) : undefined,
        filter.unreadOnly ? isNull(internalNoticeRead.id) : undefined,
      );
      const base = db
        .select({ n: internalNotice, teamName: team.name, creatorName: member.name, readAt: internalNoticeRead.firstReadAt })
        .from(internalNotice)
        .leftJoin(team, eq(team.id, internalNotice.teamId))
        .innerJoin(member, eq(member.id, internalNotice.createdByMemberId))
        .leftJoin(internalNoticeRead, and(eq(internalNoticeRead.internalNoticeId, internalNotice.id), eq(internalNoticeRead.memberId, actorId)))
        .where(where);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(internalNotice)
        .leftJoin(internalNoticeRead, and(eq(internalNoticeRead.internalNoticeId, internalNotice.id), eq(internalNoticeRead.memberId, actorId)))
        .where(where);
      const rows = await base
        .orderBy(desc(internalNotice.isImportant), desc(internalNotice.publishStartAt), desc(internalNotice.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return { items: rows.map(toSummary), total, page, pageSize: PAGE_SIZE };
    },

    /** 공지 상세. 읽을 수 있는 공지를 열면 읽음 기록(최초/최근)을 남긴다. */
    async lookupReadable(actorId: number, noticeId: number) {
      const access = await requireReader(actorId);
      const current = now();
      const publisher = alias(member, "publisher");
      const [row] = await db
        .select({ n: internalNotice, teamName: team.name, creatorName: member.name, publisherName: publisher.name })
        .from(internalNotice)
        .leftJoin(team, eq(team.id, internalNotice.teamId))
        .innerJoin(member, eq(member.id, internalNotice.createdByMemberId))
        .leftJoin(publisher, eq(publisher.id, internalNotice.publishedByMemberId))
        .where(and(eq(internalNotice.id, noticeId), readableCondition(access, current)));
      if (!row) throw new NoticeNotFoundError();
      await db
        .insert(internalNoticeRead)
        .values({ internalNoticeId: noticeId, memberId: actorId, firstReadAt: current, lastReadAt: current })
        .onConflictDoUpdate({
          target: [internalNoticeRead.internalNoticeId, internalNoticeRead.memberId],
          set: { lastReadAt: current },
        });
      const attachments = await attachmentViews(db, noticeId);
      const html: SafeMarkdownHtml = renderMarkdown(row.n.body, {
        imageUrls: imageUrlMap(noticeId, attachments, false),
        allowExternalImages: true,
      });
      return {
        ...toSummary({ ...row, readAt: current }),
        html,
        attachments,
        createdByMemberId: row.n.createdByMemberId,
        publishedByName: row.publisherName,
        updatedAt: row.n.updatedAt,
        canManage: canManage(access, row.n.targetScope as NoticeScope, row.n.teamId),
        canIssueShare:
          row.n.createdByMemberId === actorId || canManage(access, row.n.targetScope as NoticeScope, row.n.teamId),
        shared: row.n.shareToken !== null,
      };
    },

    async searchManageable(
      actorId: number,
      filter: { keyword?: string; status?: NoticeStatus; scope?: NoticeScope; page?: number } = {},
    ): Promise<Page<ReturnType<typeof toSummary>>> {
      const access = await requireManager(actorId);
      const page = clampPage(filter.page);
      const keyword = filter.keyword?.trim();
      const where = and(
        isNull(internalNotice.deletedAt),
        // 팀장은 자기 팀의 팀 공지만 관리한다.
        access.canManageGlobal() ? undefined : and(eq(internalNotice.targetScope, "TEAM"), eq(internalNotice.teamId, access.teamId)),
        keyword ? or(ilike(internalNotice.title, like(keyword)), ilike(internalNotice.body, like(keyword))) : undefined,
        filter.status ? eq(internalNotice.status, filter.status) : undefined,
        filter.scope ? eq(internalNotice.targetScope, filter.scope) : undefined,
      );
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(internalNotice).where(where);
      const rows = await db
        .select({ n: internalNotice, teamName: team.name, creatorName: member.name })
        .from(internalNotice)
        .leftJoin(team, eq(team.id, internalNotice.teamId))
        .innerJoin(member, eq(member.id, internalNotice.createdByMemberId))
        .where(where)
        .orderBy(desc(internalNotice.updatedAt), desc(internalNotice.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return { items: rows.map(toSummary), total, page, pageSize: PAGE_SIZE };
    },

    /** 관리 상세: 원문과 미리보기 HTML, 첨부, 공유 상태. 읽음 기록은 남기지 않는다. */
    async lookupManageable(actorId: number, noticeId: number) {
      const access = await actorAccess(db, actorId);
      const updater = alias(member, "updater");
      const publisher = alias(member, "publisher");
      const [row] = await db
        .select({ n: internalNotice, teamName: team.name, creatorName: member.name, updaterName: updater.name, publisherName: publisher.name })
        .from(internalNotice)
        .leftJoin(team, eq(team.id, internalNotice.teamId))
        .innerJoin(member, eq(member.id, internalNotice.createdByMemberId))
        .leftJoin(updater, eq(updater.id, internalNotice.updatedByMemberId))
        .leftJoin(publisher, eq(publisher.id, internalNotice.publishedByMemberId))
        .where(and(eq(internalNotice.id, noticeId), isNull(internalNotice.deletedAt)));
      if (!row) throw new NoticeNotFoundError();
      assertManage(access, row.n.targetScope as NoticeScope, row.n.teamId);
      const attachments = await attachmentViews(db, noticeId);
      return {
        ...toSummary(row),
        body: row.n.body,
        html: renderMarkdown(row.n.body, { imageUrls: imageUrlMap(noticeId, attachments, true), allowExternalImages: true }),
        attachments,
        updatedByName: row.updaterName,
        publishedByName: row.publisherName,
        shared: row.n.shareToken !== null,
      };
    },

    /** 게시 이력이 있는 공지의 대상 멤버별 확인 현황. */
    async searchReadStatuses(actorId: number, noticeId: number) {
      const access = await actorAccess(db, actorId);
      const [notice] = await db.select().from(internalNotice).where(and(eq(internalNotice.id, noticeId), isNull(internalNotice.deletedAt)));
      if (!notice) throw new NoticeNotFoundError();
      const allowed = access.canManageGlobal() || (notice.targetScope === "TEAM" && access.canManageTeam(notice.teamId));
      if (!allowed) throw new NoticeAccessDeniedError();
      if (notice.publishStartAt === null) throw new InvalidNoticeStateError(notice.status as NoticeStatus);
      return db
        .select({
          memberId: member.id,
          studentNo: member.studentNo,
          name: member.name,
          teamName: team.name,
          firstReadAt: internalNoticeRead.firstReadAt,
          lastReadAt: internalNoticeRead.lastReadAt,
        })
        .from(member)
        .innerJoin(team, eq(team.id, member.teamId))
        .leftJoin(internalNoticeRead, and(eq(internalNoticeRead.memberId, member.id), eq(internalNoticeRead.internalNoticeId, noticeId)))
        .where(and(eq(member.status, "ACTIVE"), notice.targetScope === "TEAM" ? eq(member.teamId, notice.teamId ?? -1) : undefined))
        .orderBy(koSort(member.name), asc(member.id));
    },

    /** 제목 공개 공유 링크: 작성자·해당 범위 관리자·ADMIN만 발급·중단. 재발급은 이전 링크를 무효화한다. */
    async issueShare(actorId: number, noticeId: number): Promise<string> {
      return db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const notice = await lockNotice(tx, noticeId);
        if (!(notice.createdByMemberId === actorId || canManage(access, notice.targetScope as NoticeScope, notice.teamId))) {
          throw new NoticeAccessDeniedError();
        }
        if (!canBePublic(notice.status as NoticeStatus)) throw new InvalidNoticeStateError(notice.status as NoticeStatus);
        const token = generateShareToken();
        await tx.update(internalNotice).set({ shareToken: token }).where(eq(internalNotice.id, noticeId));
        return token;
      });
    },

    async revokeShare(actorId: number, noticeId: number): Promise<void> {
      await db.transaction(async (tx) => {
        const access = await actorAccess(tx, actorId);
        const notice = await lockNotice(tx, noticeId);
        if (!(notice.createdByMemberId === actorId || canManage(access, notice.targetScope as NoticeScope, notice.teamId))) {
          throw new NoticeAccessDeniedError();
        }
        await tx.update(internalNotice).set({ shareToken: null }).where(eq(internalNotice.id, noticeId));
      });
    },

    /** 비로그인에게는 제목만 공개한다 (본문·작성자·팀·첨부 비공개). 게시 기간 안에서만 유효. */
    async lookupPublicShare(token: string): Promise<{ id: number; title: string }> {
      if (!SHARE_TOKEN_PATTERN.test(token)) throw new NoticeNotFoundError();
      const [row] = await db
        .select({ id: internalNotice.id, title: internalNotice.title, status: internalNotice.status, start: internalNotice.publishStartAt, end: internalNotice.publishEndAt })
        .from(internalNotice)
        .where(and(eq(internalNotice.shareToken, token), isNull(internalNotice.deletedAt)));
      if (!row || !isVisibleAt({ status: row.status as NoticeStatus, publishStartAt: row.start, publishEndAt: row.end }, now())) {
        throw new NoticeNotFoundError();
      }
      return { id: row.id, title: row.title };
    },

    /** 읽을 수 있는 공지의 첨부 파일을 연다. 공지 열람 권한 + 해당 공지의 첨부 여부를 모두 확인한다. */
    async openAttachment(actorId: number, noticeId: number, fileId: number, mode: "attachment" | "inline") {
      const access = await requireReader(actorId);
      const [row] = await db
        .select({ id: internalNoticeAttachment.id })
        .from(internalNoticeAttachment)
        .innerJoin(internalNotice, eq(internalNotice.id, internalNoticeAttachment.internalNoticeId))
        .where(and(eq(internalNoticeAttachment.internalNoticeId, noticeId), eq(internalNoticeAttachment.storedFileId, fileId), readableCondition(access, now())));
      if (!row) throw new NoticeNotFoundError();
      return { ...(await files.openPrivate(fileId, true)), mode };
    },

    /** 관리자 화면(초안·예약 포함)의 첨부 열람. */
    async openManageableAttachment(actorId: number, noticeId: number, fileId: number, mode: "attachment" | "inline") {
      const access = await actorAccess(db, actorId);
      const [notice] = await db.select().from(internalNotice).where(and(eq(internalNotice.id, noticeId), isNull(internalNotice.deletedAt)));
      if (!notice) throw new NoticeNotFoundError();
      assertManage(access, notice.targetScope as NoticeScope, notice.teamId);
      const [link] = await db
        .select({ id: internalNoticeAttachment.id })
        .from(internalNoticeAttachment)
        .where(and(eq(internalNoticeAttachment.internalNoticeId, noticeId), eq(internalNoticeAttachment.storedFileId, fileId)));
      if (!link) throw new NoticeNotFoundError();
      return { ...(await files.openPrivate(fileId, true)), mode };
    },

    /** 작성 중 미리보기: 아직 연결 전인 본인의 임시 이미지도 보여준다. */
    async preview(actorId: number, markdown: string, noticeId?: number): Promise<SafeMarkdownHtml> {
      const access = await actorAccess(db, actorId);
      if (!access.canManageGlobal() && !access.canManageTeam(access.teamId)) throw new NoticeAccessDeniedError();
      const urls = new Map<number, string>();
      for (const id of extractAttachmentImageIds(markdown)) {
        if (noticeId !== undefined) urls.set(id, `/api/internal-notice-management/${noticeId}/attachments/${id}/inline`);
        else urls.set(id, `/api/internal-notice-management/images/${id}/preview`);
      }
      return renderMarkdown(markdown, { imageUrls: urls, allowExternalImages: true });
    },

    async assertTemporaryImageOwned(actorId: number, fileId: number) {
      const access = await actorAccess(db, actorId);
      if (!access.canManageGlobal() && !access.canManageTeam(access.teamId)) throw new NoticeAccessDeniedError();
      const ref = await files.assertPrivateReadyOwnedBy(fileId, actorId, db);
      if (!INLINE_IMAGE_TYPES.has(ref.contentType)) throw new InvalidFileStateError();
      return files.openPrivate(fileId, true);
    },
  };
}
