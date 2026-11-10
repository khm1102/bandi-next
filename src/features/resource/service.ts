import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/types";
import type { createFileService } from "@/features/file/service";
import { storedFile } from "@/features/file/schema";
import { member } from "@/features/member/schema";
import type { MemberStatus, Role } from "@/features/member/codes";
import { MemberNotFoundError } from "@/features/member/errors";
import { extractAttachmentImageIds, renderMarkdown } from "@/features/notice/markdown";
import { accessFor, type AccessContext } from "@/lib/policy";
import { generateShareToken, SHARE_TOKEN_PATTERN } from "@/lib/share-token";
import { fetchLinkPreviews, MAX_PREVIEWS, previewImageExtension, urlHash as fetchHash, type LinkPreview } from "./link-preview";
import { extractStandaloneUrls } from "./net-guard";
import {
  InvalidResourceError,
  ResourceAccessDeniedError,
  ResourceNotFoundError,
  validateResourceFields,
} from "./model";
import { resource, resourceFile, resourceLinkPreview } from "./schema";

type FileService = ReturnType<typeof createFileService>;

export interface ResourceServiceDeps {
  db: Db;
  files: FileService;
  now?: () => Date;
  /** 테스트에서 네트워크 없이 대체할 수 있다. */
  fetchPreviews?: (urls: string[]) => Promise<LinkPreview[]>;
}

export interface ResourceInput {
  title: string;
  body: string;
  attachmentFileIds: number[];
}

const PAGE_SIZE = 20;
const MAX_ATTACHMENTS = 10;
const INLINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createResourceService(deps: ResourceServiceDeps) {
  const { db, files } = deps;
  const now = deps.now ?? (() => new Date());
  const fetchPreviews = deps.fetchPreviews ?? fetchLinkPreviews;

  async function access(executor: DbOrTx, actorId: number): Promise<AccessContext> {
    const [row] = await executor.select().from(member).where(eq(member.id, actorId));
    if (!row) throw new MemberNotFoundError();
    return accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus });
  }

  async function reader(actorId: number) {
    const context = await access(db, actorId);
    if (!context.canReadInternal()) throw new ResourceAccessDeniedError();
    return context;
  }

  /** 작성자 본인과 ADMIN만 수정·삭제할 수 있다 (LEADER 권한만으로는 불가). */
  const canManage = (context: AccessContext, creatorId: number) =>
    context.active && (context.memberId === creatorId || context.canManageGlobal());

  async function lockResource(tx: DbOrTx, id: number) {
    const [row] = await tx.select().from(resource).where(and(eq(resource.id, id), isNull(resource.deletedAt))).for("update");
    if (!row) throw new ResourceNotFoundError();
    return row;
  }

  async function currentFileIds(tx: DbOrTx, resourceId: number) {
    const rows = await tx
      .select({ id: resourceFile.storedFileId })
      .from(resourceFile)
      .where(eq(resourceFile.resourceId, resourceId))
      .orderBy(asc(resourceFile.displayOrder));
    return rows.map((r) => r.id);
  }

  async function validateAttachments(tx: DbOrTx, actorId: number, wanted: number[], existing: number[]) {
    if (wanted.length > MAX_ATTACHMENTS || new Set(wanted).size !== wanted.length) {
      throw new InvalidResourceError("첨부 파일 목록이 올바르지 않습니다.");
    }
    for (const fileId of wanted) {
      if (!existing.includes(fileId)) await files.assertPrivateReadyOwnedBy(fileId, actorId, tx);
    }
  }

  async function validateInlineImages(tx: DbOrTx, body: string, attachmentIds: number[]) {
    for (const id of extractAttachmentImageIds(body)) {
      if (!attachmentIds.includes(id)) throw new InvalidResourceError("본문 이미지가 첨부 목록에 없습니다.");
      const [file] = await tx.select().from(storedFile).where(eq(storedFile.id, id));
      if (!file || !INLINE_IMAGE_TYPES.has(file.contentType)) {
        throw new InvalidResourceError("본문에는 JPEG·PNG·WebP 첨부 이미지만 사용할 수 있습니다.");
      }
    }
  }

  async function replaceFiles(tx: DbOrTx, resourceId: number, fileIds: number[], uploaderOf: Map<number, number>, actorId: number) {
    await tx.delete(resourceFile).where(eq(resourceFile.resourceId, resourceId));
    if (fileIds.length > 0) {
      await tx.insert(resourceFile).values(
        fileIds.map((storedFileId, displayOrder) => ({
          resourceId,
          storedFileId,
          displayOrder,
          uploadedByMemberId: uploaderOf.get(storedFileId) ?? actorId,
        })),
      );
    }
  }

  async function uploaderMap(tx: DbOrTx, resourceId: number) {
    const rows = await tx.select().from(resourceFile).where(eq(resourceFile.resourceId, resourceId));
    return new Map(rows.map((r) => [r.storedFileId, r.uploadedByMemberId]));
  }

  async function fileViews(executor: DbOrTx, resourceId: number) {
    return executor
      .select({ id: storedFile.id, name: storedFile.originalName, contentType: storedFile.contentType, sizeBytes: storedFile.sizeBytes })
      .from(resourceFile)
      .innerJoin(storedFile, eq(storedFile.id, resourceFile.storedFileId))
      .where(eq(resourceFile.resourceId, resourceId))
      .orderBy(asc(resourceFile.displayOrder));
  }

  async function previewRows(executor: DbOrTx, resourceId: number) {
    return executor.select().from(resourceLinkPreview).where(eq(resourceLinkPreview.resourceId, resourceId)).orderBy(asc(resourceLinkPreview.id));
  }

  /**
   * 본문의 단독 줄 HTTPS URL에 맞춰 링크 카드를 동기화한다 (트랜잭션 밖에서 외부 요청).
   * 더는 쓰이지 않는 카드는 지우고 대표 이미지는 파기 대기열로 보낸다. 수집 실패는 본문 저장을 막지 않는다.
   */
  async function syncLinkPreviews(resourceId: number, actorId: number, body: string): Promise<void> {
    const urls = extractStandaloneUrls(body).slice(0, MAX_PREVIEWS);
    const existing = await previewRows(db, resourceId);
    const wantedHashes = new Set(urls.map((url) => hashOf(url)));
    const stale = existing.filter((row) => !wantedHashes.has(row.urlHash));
    if (stale.length > 0) {
      await db.transaction(async (tx) => {
        for (const row of stale) {
          await tx.delete(resourceLinkPreview).where(eq(resourceLinkPreview.id, row.id));
          if (row.previewImageFileId !== null) await files.enqueueRetirement(tx, row.previewImageFileId, "LINK_PREVIEW_IMAGE");
        }
      });
    }
    const known = new Set(existing.map((row) => row.urlHash));
    const toFetch = urls.filter((url) => !known.has(hashOf(url)));
    if (toFetch.length > 0) {
      const fetched = await fetchPreviews(toFetch).catch(() => [] as LinkPreview[]);
      for (const preview of fetched) {
        let imageFileId: number | null = null;
        if (preview.image) {
          const extension = previewImageExtension(preview.image.contentType);
          if (extension) {
            const bytes = preview.image.bytes;
            imageFileId = await files
              .upload({
                kind: "general",
                domain: "resource-link-preview",
                file: {
                  name: `link-preview.${extension}`,
                  size: bytes.length,
                  stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(bytes)); c.close(); } }),
                },
                actorId,
              })
              .then((ref) => ref.id)
              .catch(() => null);
          }
        }
        await db
          .insert(resourceLinkPreview)
          .values({
            resourceId,
            normalizedUrl: preview.normalizedUrl,
            urlHash: preview.urlHash,
            domain: preview.domain,
            title: preview.title,
            description: preview.description,
            previewImageFileId: imageFileId,
            fetchedAt: now(),
          })
          .onConflictDoNothing();
      }
    }
    await files.runRetirements().catch(() => undefined);
  }

  const hashOf = (url: string) => fetchHash(url);

  return {
    async search(actorId: number, filter: { keyword?: string; page?: number } = {}) {
      await reader(actorId);
      const page = Math.max(1, Math.floor(filter.page ?? 1));
      const keyword = filter.keyword?.trim();
      const where = and(
        isNull(resource.deletedAt),
        keyword ? or(ilike(resource.title, like(keyword)), ilike(resource.bodyMarkdown, like(keyword)), ilike(member.name, like(keyword))) : undefined,
      );
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(resource)
        .innerJoin(member, eq(member.id, resource.createdByMemberId))
        .where(where);
      const rows = await db
        .select({
          id: resource.id,
          title: resource.title,
          body: resource.bodyMarkdown,
          createdByName: member.name,
          updatedAt: resource.updatedAt,
          fileCount: sql<number>`(select count(*)::int from resource_file rf where rf.resource_id = ${resource.id})`,
          coverFileId: sql<number | null>`(select rf.stored_file_id from resource_file rf join stored_file sf on sf.id = rf.stored_file_id where rf.resource_id = ${resource.id} and sf.content_type like 'image/%' order by rf.display_order limit 1)`,
          previewCoverFileId: sql<number | null>`(select p.preview_image_file_id from resource_link_preview p where p.resource_id = ${resource.id} and p.preview_image_file_id is not null order by p.id limit 1)`,
        })
        .from(resource)
        .innerJoin(member, eq(member.id, resource.createdByMemberId))
        .where(where)
        .orderBy(desc(resource.updatedAt), desc(resource.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE);
      return {
        total,
        page,
        pageSize: PAGE_SIZE,
        items: rows.map((r) => ({ id: r.id, title: r.title, excerpt: r.body.replace(/\s+/g, " ").slice(0, 140), createdByName: r.createdByName, updatedAt: r.updatedAt, fileCount: r.fileCount, cover: r.coverFileId ? { fileId: r.coverFileId, source: "FILE" as const } : r.previewCoverFileId ? { fileId: r.previewCoverFileId, source: "LINK_PREVIEW" as const } : null })),
      };
    },

    async lookup(actorId: number, id: number) {
      const context = await reader(actorId);
      const [row] = await db
        .select({ r: resource, creatorName: member.name })
        .from(resource)
        .innerJoin(member, eq(member.id, resource.createdByMemberId))
        .where(and(eq(resource.id, id), isNull(resource.deletedAt)));
      if (!row) throw new ResourceNotFoundError();
      const attachments = await fileViews(db, id);
      const imageUrls = new Map(
        attachments.filter((a) => INLINE_IMAGE_TYPES.has(a.contentType)).map((a) => [a.id, `/api/resources/${id}/files/${a.id}/inline`] as const),
      );
      const previews = await previewRows(db, id);
      return {
        id: row.r.id,
        title: row.r.title,
        body: row.r.bodyMarkdown,
        createdByName: row.creatorName,
        createdByMemberId: row.r.createdByMemberId,
        createdAt: row.r.createdAt,
        updatedAt: row.r.updatedAt,
        // 자료실은 첨부 이미지만 허용하고 외부 이미지와 iframe은 렌더링하지 않는다.
        html: renderMarkdown(row.r.bodyMarkdown, { imageUrls, allowExternalImages: false }),
        attachments,
        previews: previews.map((p) => ({
          id: p.id,
          url: p.normalizedUrl,
          domain: p.domain,
          title: p.title,
          description: p.description,
          imageUrl: p.previewImageFileId ? `/api/resources/${id}/link-previews/${p.previewImageFileId}/inline` : null,
        })),
        canManage: canManage(context, row.r.createdByMemberId),
        shared: row.r.shareToken !== null,
      };
    },

    async create(actorId: number, input: ResourceInput): Promise<number> {
      const fields = validateResourceFields(input);
      const id = await db.transaction(async (tx) => {
        const context = await access(tx, actorId);
        if (!context.canReadInternal()) throw new ResourceAccessDeniedError();
        await validateAttachments(tx, actorId, input.attachmentFileIds, []);
        await validateInlineImages(tx, fields.body, input.attachmentFileIds);
        const [created] = await tx
          .insert(resource)
          .values({ title: fields.title, bodyMarkdown: fields.body, createdByMemberId: actorId, updatedByMemberId: actorId })
          .returning({ id: resource.id });
        await replaceFiles(tx, created.id, input.attachmentFileIds, new Map(), actorId);
        return created.id;
      });
      await syncLinkPreviews(id, actorId, fields.body);
      return id;
    },

    async update(actorId: number, id: number, input: ResourceInput): Promise<void> {
      const fields = validateResourceFields(input);
      await db.transaction(async (tx) => {
        const context = await access(tx, actorId);
        if (!context.canReadInternal()) throw new ResourceAccessDeniedError();
        const original = await lockResource(tx, id);
        if (!canManage(context, original.createdByMemberId)) throw new ResourceAccessDeniedError();
        const existing = await currentFileIds(tx, id);
        await validateAttachments(tx, actorId, input.attachmentFileIds, existing);
        await validateInlineImages(tx, fields.body, input.attachmentFileIds);
        const uploaders = await uploaderMap(tx, id);
        await tx.update(resource).set({ title: fields.title, bodyMarkdown: fields.body, updatedByMemberId: actorId }).where(eq(resource.id, id));
        await replaceFiles(tx, id, input.attachmentFileIds, uploaders, actorId);
      });
      await syncLinkPreviews(id, actorId, fields.body);
    },

    async delete(actorId: number, id: number): Promise<void> {
      await db.transaction(async (tx) => {
        const context = await access(tx, actorId);
        if (!context.canReadInternal()) throw new ResourceAccessDeniedError();
        const original = await lockResource(tx, id);
        if (!canManage(context, original.createdByMemberId)) throw new ResourceAccessDeniedError();
        await tx.update(resource).set({ deletedAt: now(), updatedByMemberId: actorId, shareToken: null }).where(eq(resource.id, id));
      });
    },

    /** 자료 열람 권한 + 해당 자료의 첨부 여부를 모두 확인한 뒤 전송한다. */
    async openFile(actorId: number, resourceId: number, fileId: number) {
      await reader(actorId);
      const [link] = await db
        .select({ id: resourceFile.id })
        .from(resourceFile)
        .innerJoin(resource, eq(resource.id, resourceFile.resourceId))
        .where(and(eq(resourceFile.resourceId, resourceId), eq(resourceFile.storedFileId, fileId), isNull(resource.deletedAt)));
      if (!link) throw new ResourceNotFoundError();
      return files.openPrivate(fileId, true);
    },

    async openPreviewImage(actorId: number, resourceId: number, fileId: number) {
      await reader(actorId);
      const [link] = await db
        .select({ id: resourceLinkPreview.id })
        .from(resourceLinkPreview)
        .innerJoin(resource, eq(resource.id, resourceLinkPreview.resourceId))
        .where(and(eq(resourceLinkPreview.resourceId, resourceId), eq(resourceLinkPreview.previewImageFileId, fileId), isNull(resource.deletedAt)));
      if (!link) throw new ResourceNotFoundError();
      return files.openPrivate(fileId, true);
    },

    async issueShare(actorId: number, id: number): Promise<string> {
      return db.transaction(async (tx) => {
        const context = await access(tx, actorId);
        const original = await lockResource(tx, id);
        if (!canManage(context, original.createdByMemberId)) throw new ResourceAccessDeniedError();
        const token = generateShareToken();
        await tx.update(resource).set({ shareToken: token }).where(eq(resource.id, id));
        return token;
      });
    },

    async revokeShare(actorId: number, id: number): Promise<void> {
      await db.transaction(async (tx) => {
        const context = await access(tx, actorId);
        const original = await lockResource(tx, id);
        if (!canManage(context, original.createdByMemberId)) throw new ResourceAccessDeniedError();
        await tx.update(resource).set({ shareToken: null }).where(eq(resource.id, id));
      });
    },

    /** 비로그인에게는 제목만 공개한다. 삭제 전까지 유효하다. */
    async lookupPublicShare(token: string): Promise<{ id: number; title: string }> {
      if (!SHARE_TOKEN_PATTERN.test(token)) throw new ResourceNotFoundError();
      const [row] = await db
        .select({ id: resource.id, title: resource.title })
        .from(resource)
        .where(and(eq(resource.shareToken, token), isNull(resource.deletedAt)));
      if (!row) throw new ResourceNotFoundError();
      return row;
    },
  };
}

