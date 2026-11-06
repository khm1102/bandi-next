import { and, eq, ilike, isNull, or } from "drizzle-orm";
import sharp from "sharp";
import { koSort } from "@/db/columns";
import type { Db } from "@/db/types";
import type { createFileService } from "@/features/file/service";
import { clubOfficer, member } from "@/features/member/schema";
import { DomainError, MemberNotFoundError } from "@/features/member/errors";
import { accessFor } from "@/lib/policy";
import type { MemberStatus, Role } from "@/features/member/codes";
import { generateBlank, generateReport, InvalidReportDocumentError, type ReportDocumentInput, type ReportParticipantInput } from "./hwpx";
import { ActivityAccessDeniedError, ActivityNotFoundError, InvalidActivityError, canEdit } from "./model";
import { activityRecord, activityReportDocument, type ActivityStatus } from "./schema";
import type { createActivityService } from "./service";

type FileService = ReturnType<typeof createFileService>;
type ActivityService = ReturnType<typeof createActivityService>;

export interface ReportServiceDeps {
  db: Db;
  files: FileService;
  activities: ActivityService;
}

export interface ReportDraftInput {
  recordTitle: string;
  representative: string;
  location: string;
  activityAt: Date;
  content: string;
  participants: ReportParticipantInput[];
}

export class PresidentNotConfiguredError extends DomainError {
  override readonly kind = "conflict" as const;
  constructor() {
    super("PRESIDENT_NOT_CONFIGURED", "현재 회장이 지정되지 않아 활동 내역서를 만들 수 없습니다. 운영진에게 문의해 주세요.");
  }
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_EDGE = 2400;
const FILE_DATE = (date: Date) => new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

function validate(input: ReportDraftInput): ReportDraftInput {
  const trim = (v: string | null | undefined) => v?.trim() ?? "";
  const clean: ReportDraftInput = {
    ...input,
    recordTitle: trim(input.recordTitle),
    representative: trim(input.representative),
    location: trim(input.location),
    content: input.content ?? "",
    participants: input.participants.map((p) => ({
      name: trim(p.name),
      department: trim(p.department) || null,
      studentNo: trim(p.studentNo) || null,
      note: trim(p.note) || null,
    })),
  };
  const bad = (field: string) => new InvalidReportDocumentError(field);
  if (!clean.recordTitle || clean.recordTitle.length > 150) throw bad("recordTitle");
  if (!clean.representative || clean.representative.length > 20) throw bad("representative");
  if (!clean.location || clean.location.length > 50) throw bad("location");
  if (Number.isNaN(clean.activityAt.getTime())) throw bad("activityAt");
  if (!clean.content.trim()) throw bad("content");
  if (clean.participants.length < 1 || clean.participants.length > 14) throw bad("participants");
  for (const p of clean.participants) {
    if (!p.name || p.name.length > 20 || (p.department?.length ?? 0) > 30 || (p.studentNo?.length ?? 0) > 20 || (p.note?.length ?? 0) > 40) {
      throw bad("participant");
    }
  }
  return clean;
}

/** 업로드 사진을 EXIF 방향을 반영한 PNG로 정규화한다. 이미지가 아니면 거부한다. */
export async function normalizePhoto(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) throw new InvalidReportDocumentError("photo");
  try {
    const out = await sharp(Buffer.from(bytes), { failOn: "error" })
      .rotate()
      .resize({ width: MAX_PHOTO_EDGE, height: MAX_PHOTO_EDGE, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    throw new InvalidReportDocumentError("photo");
  }
}

export function createReportService(deps: ReportServiceDeps) {
  const { db, files, activities } = deps;

  const stream = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });

  async function president(): Promise<string> {
    const [row] = await db
      .select({ name: member.name })
      .from(clubOfficer)
      .innerJoin(member, eq(member.id, clubOfficer.memberId))
      .where(and(eq(clubOfficer.position, "PRESIDENT"), eq(member.status, "ACTIVE")));
    if (!row) throw new PresidentNotConfiguredError();
    return row.name;
  }

  async function actor(actorId: number) {
    const [row] = await db.select().from(member).where(eq(member.id, actorId));
    if (!row) throw new MemberNotFoundError();
    const context = accessFor({ memberId: row.id, teamId: row.teamId, role: row.role as Role, status: row.status as MemberStatus });
    if (!context.canReadInternal()) throw new ActivityAccessDeniedError();
    return { row, context };
  }

  async function uploadGenerated(actorId: number, name: string, bytes: Uint8Array) {
    return files.upload({ kind: "general", domain: "activity-report", file: { name, size: bytes.length, stream: stream(bytes) }, actorId });
  }

  const toDoc = (input: ReportDraftInput): ReportDocumentInput => ({
    representative: input.representative,
    location: input.location,
    activityAt: input.activityAt,
    content: input.content,
    participants: input.participants,
  });

  return {
    /** 빈 양식 (로그인한 활성 멤버). */
    async createBlank(actorId: number): Promise<Uint8Array> {
      await actor(actorId);
      return generateBlank(await president());
    },

    /** 참여자 후보: 활성 멤버를 이름/학번으로 찾는다 (2~50자). 개인정보는 이름·학과·학번만. */
    async searchParticipants(actorId: number, rawKeyword: string) {
      await actor(actorId);
      const keyword = rawKeyword?.trim() ?? "";
      if (keyword.length < 2 || keyword.length > 50) throw new InvalidReportDocumentError("participantQuery");
      const pattern = `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const rows = await db
        .select({ name: member.name, department: member.department, studentNo: member.studentNo })
        .from(member)
        .where(and(eq(member.status, "ACTIVE"), or(ilike(member.name, pattern), ilike(member.studentNo, pattern))))
        .orderBy(koSort(member.name))
        .limit(10);
      return rows;
    },

    /** 임시 저장: 사진을 정규화하고 HWPX를 만들어 활동 기록(DRAFT)으로 저장한다. */
    async saveDraft(actorId: number, rawInput: ReportDraftInput, photo: Uint8Array): Promise<{ activityRecordId: number; hwpxFileId: number; filename: string }> {
      const { row } = await actor(actorId);
      const input = validate(rawInput);
      const normalized = await normalizePhoto(photo);
      const hwpx = generateReport(toDoc(input), await president(), normalized);
      const filename = `${FILE_DATE(input.activityAt)}_반디_동아리_활동_내역서.hwpx`;
      const photoRef = await uploadGenerated(actorId, "activity-photo.png", normalized);
      const docRef = await uploadGenerated(actorId, filename, hwpx);
      try {
        const id = await db.transaction(async (tx) => {
          const recordId = await activities.createDraft(
            actorId,
            { teamId: row.teamId, activityAt: input.activityAt, title: input.recordTitle, body: input.content, participantCount: input.participants.length },
            tx,
          );
          await activities.attachGeneratedFile(actorId, recordId, photoRef.id, "EVIDENCE", tx);
          await activities.attachGeneratedFile(actorId, recordId, docRef.id, "DOCUMENT", tx);
          await tx.insert(activityReportDocument).values({
            activityRecordId: recordId,
            representative: input.representative,
            location: input.location,
            participants: input.participants,
          });
          return recordId;
        });
        return { activityRecordId: id, hwpxFileId: docRef.id, filename };
      } catch (error) {
        await db.transaction(async (tx) => {
          await files.enqueueRetirement(tx, photoRef.id, "ACTIVITY_PHOTO");
          await files.enqueueRetirement(tx, docRef.id, "ACTIVITY_PHOTO");
        }).catch(() => undefined);
        await files.runRetirements().catch(() => undefined);
        throw error;
      }
    },

    /** 저장한 초안을 수정해 HWPX를 다시 만든다. 사진을 생략하면 기존 사진을 유지한다. */
    async updateDraft(actorId: number, activityRecordId: number, rawInput: ReportDraftInput, photo: Uint8Array | null) {
      await actor(actorId);
      const detail = await activities.lookupManageable(actorId, activityRecordId);
      if (!canEdit(detail.status as ActivityStatus)) throw new InvalidActivityError("수정할 수 없는 상태입니다.");
      if (!detail.isReportDocument) throw new ActivityNotFoundError();
      const input = validate(rawInput);
      let normalized: Uint8Array;
      if (photo) {
        normalized = await normalizePhoto(photo);
      } else {
        const current = detail.files.find((f) => f.role === "EVIDENCE");
        if (!current) throw new InvalidActivityError("기존 활동 사진이 없습니다.");
        const { object } = await files.openPrivate(current.fileId, true);
        const chunks: Buffer[] = [];
        for await (const chunk of object.stream) chunks.push(Buffer.from(chunk));
        normalized = new Uint8Array(Buffer.concat(chunks));
      }
      const hwpx = generateReport(toDoc(input), await president(), normalized);
      const filename = `${FILE_DATE(input.activityAt)}_반디_동아리_활동_내역서.hwpx`;
      const photoRef = photo ? await uploadGenerated(actorId, "activity-photo.png", normalized) : null;
      const docRef = await uploadGenerated(actorId, filename, hwpx);
      await db.transaction(async (tx) => {
        await activities.update(actorId, activityRecordId, { activityAt: input.activityAt, title: input.recordTitle, body: input.content, participantCount: input.participants.length }, tx);
        if (photoRef) await activities.replaceGeneratedFile(actorId, activityRecordId, "EVIDENCE", photoRef.id, tx);
        await activities.replaceGeneratedFile(actorId, activityRecordId, "DOCUMENT", docRef.id, tx);
        await tx
          .update(activityReportDocument)
          .set({ representative: input.representative, location: input.location, participants: input.participants })
          .where(eq(activityReportDocument.activityRecordId, activityRecordId));
      });
      return { activityRecordId, hwpxFileId: docRef.id, filename };
    },

    async lookupDraft(actorId: number, activityRecordId: number) {
      const detail = await activities.lookupManageable(actorId, activityRecordId);
      const [doc] = await db.select().from(activityReportDocument).where(eq(activityReportDocument.activityRecordId, activityRecordId));
      if (!doc) throw new ActivityNotFoundError();
      return {
        activityRecordId,
        recordTitle: detail.title,
        representative: doc.representative,
        location: doc.location,
        activityAt: detail.activityAt,
        content: detail.body,
        participants: doc.participants,
        status: detail.status,
        photo: detail.files.find((f) => f.role === "EVIDENCE") ?? null,
        hwpx: detail.files.find((f) => f.role === "DOCUMENT") ?? null,
      };
    },

    async submit(actorId: number, activityRecordId: number) {
      return activities.submit(actorId, activityRecordId, null);
    },

    /** 내 초안 목록에서 문서형 기록만 구분할 때 사용. */
    async isReportRecord(activityRecordId: number): Promise<boolean> {
      const [row] = await db
        .select({ id: activityReportDocument.id })
        .from(activityReportDocument)
        .innerJoin(activityRecord, eq(activityRecord.id, activityReportDocument.activityRecordId))
        .where(and(eq(activityReportDocument.activityRecordId, activityRecordId), isNull(activityRecord.deletedAt)));
      return Boolean(row);
    },
  };
}
