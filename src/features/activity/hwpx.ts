import { readFileSync } from "node:fs";
import path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { DomainError } from "@/features/member/errors";
import { toKstDate } from "@/lib/kst";

const HP = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const HC = "http://www.hancom.co.kr/hwpml/2011/core";
const SECTION_PATH = "Contents/section0.xml";
const PHOTO_PATH = "BinData/activity-photo.png";
const PREVIEW_TEXT_PATH = "Preview/PrvText.txt";
const MAX_PARTICIPANTS = 14;

const REQUIRED_ENTRIES = [
  "mimetype", "version.xml", "Contents/header.xml", SECTION_PATH, "Contents/content.hpf",
  "settings.xml", "META-INF/container.xml", "META-INF/manifest.xml", PHOTO_PATH, PREVIEW_TEXT_PATH,
];

export class InvalidReportDocumentError extends DomainError {
  constructor(public readonly field: string) {
    super("INVALID_REPORT_DOCUMENT", `활동 내역서 입력이 올바르지 않습니다. (${field})`);
  }
}

export interface ReportParticipantInput {
  name: string;
  department: string | null;
  studentNo: string | null;
  note: string | null;
}

export interface ReportDocumentInput {
  representative: string;
  location: string;
  activityAt: Date;
  content: string;
  participants: ReportParticipantInput[];
}

const participantName = (row: number, field: string) => `P${String(row).padStart(2, "0")}_${field}`;

const DYNAMIC_NAMES: string[] = [
  "TITLE", "REPRESENTATIVE", "LOCATION", "ACTIVITY_DATE", "ACTIVITY_CONTENT", "PRESIDENT_NAME", "PARTICIPANT_TOTAL",
  ...Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i + 1).flatMap((row) =>
    ["NAME", "DEPARTMENT", "STUDENT_NO", "NOTE"].map((field) => participantName(row, field)),
  ),
];

const TC_NAMES = new Set(["REPRESENTATIVE", "LOCATION", "ACTIVITY_DATE", "ACTIVITY_CONTENT"]);
const tagFor = (name: string) => (TC_NAMES.has(name) || /^P\d/.test(name) ? "tc" : "p");

function parseXml(bytes: Uint8Array): Document {
  const text = strFromU8(bytes);
  // 외부 엔티티·DTD는 허용하지 않는다.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error("HWPX XML에 DOCTYPE/ENTITY는 허용되지 않습니다.");
  }
  let failure: string | null = null;
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") failure = message;
    },
  }).parseFromString(text, "text/xml");
  if (failure || !doc.documentElement) {
    throw new Error("HWPX XML을 읽을 수 없습니다.");
  }
  return doc as unknown as Document;
}

function serializeXml(doc: Document): Uint8Array {
  let xml = new XMLSerializer().serializeToString(doc as never);
  if (!xml.startsWith("<?xml")) {
    xml = `<?xml version='1.0' encoding='utf-8'?>\n${xml}`;
  }
  return strToU8(xml);
}

function findNamed(doc: Document, tag: string, name: string): Element {
  const nodes = doc.getElementsByTagNameNS(HP, tag);
  let found: Element | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes.item(i) as Element;
    if (el.getAttribute("name") === name) {
      if (found) throw new Error(`HWPX 이름이 중복되었습니다: ${name}`);
      found = el;
    }
  }
  if (!found) throw new Error(`HWPX 이름을 찾을 수 없습니다: ${name}`);
  return found;
}

/** 이름이 지정된 문단/셀의 텍스트만 교체한다. 줄바꿈은 hp:lineBreak, 특수문자는 DOM이 이스케이프한다. */
function setNamedText(doc: Document, tag: string, name: string, value: string | null | undefined): void {
  const target = findNamed(doc, tag, name);
  const runs = target.getElementsByTagNameNS(HP, "run");
  if (runs.length === 0) throw new Error(`HWPX 텍스트 run이 없습니다: ${name}`);
  const firstRun = runs.item(0) as Element;
  const removable: Node[] = [];
  for (let r = 0; r < runs.length; r++) {
    const children = (runs.item(r) as Element).childNodes;
    for (let c = 0; c < children.length; c++) {
      const child = children.item(c) as Element;
      if (child.namespaceURI === HP && (child.localName === "t" || child.localName === "lineBreak")) {
        removable.push(child);
      }
    }
  }
  removable.forEach((node) => node.parentNode?.removeChild(node));
  const lines = (value ?? "").split(/\r\n|\r|\n/);
  lines.forEach((line, index) => {
    if (index > 0) firstRun.appendChild(doc.createElementNS(HP, "hp:lineBreak"));
    const text = doc.createElementNS(HP, "hp:t");
    text.appendChild(doc.createTextNode(line));
    firstRun.appendChild(text);
  });
}

function single(parent: Element, ns: string, local: string): Element {
  const nodes = parent.getElementsByTagNameNS(ns, local);
  if (nodes.length !== 1) throw new Error(`HWPX 사진 속성이 올바르지 않습니다: ${local}`);
  return nodes.item(0) as Element;
}

function findPhotoPicture(doc: Document): Element {
  const pictures = doc.getElementsByTagNameNS(HP, "pic");
  let found: Element | null = null;
  for (let i = 0; i < pictures.length; i++) {
    const picture = pictures.item(i) as Element;
    const images = picture.getElementsByTagNameNS(HC, "img");
    if (images.length === 1 && (images.item(0) as Element).getAttribute("binaryItemIDRef") === "image1") {
      if (found) throw new Error("활동 사진 개체가 중복되었습니다.");
      found = picture;
    }
  }
  if (!found) throw new Error("활동 사진 개체를 찾을 수 없습니다.");
  return found;
}

const IDENTITY = { e1: "1", e2: "0", e3: "0", e4: "0", e5: "1", e6: "0" } as const;

function setIdentity(matrix: Element) {
  for (const [key, value] of Object.entries(IDENTITY)) matrix.setAttribute(key, value);
}
const isIdentity = (matrix: Element) => Object.entries(IDENTITY).every(([key, value]) => matrix.getAttribute(key) === value);

/** 템플릿 사진 개체의 뒤집기·회전·변환 행렬을 항상 초기화한다 (사진이 뒤집혀 보이는 사고 방지). */
function normalizePhotoOrientation(doc: Document) {
  const picture = findPhotoPicture(doc);
  picture.setAttribute("reverse", "0");
  const flip = single(picture, HP, "flip");
  flip.setAttribute("horizontal", "0");
  flip.setAttribute("vertical", "0");
  const rotation = single(picture, HP, "rotationInfo");
  rotation.setAttribute("angle", "0");
  rotation.setAttribute("rotateimage", "0");
  const rendering = single(picture, HP, "renderingInfo");
  setIdentity(single(rendering, HC, "transMatrix"));
  const scale = single(rendering, HC, "scaMatrix");
  for (const key of ["e2", "e3", "e4", "e6"]) scale.setAttribute(key, "0");
  setIdentity(single(rendering, HC, "rotMatrix"));
}

function validatePhotoOrientation(doc: Document) {
  const picture = findPhotoPicture(doc);
  const flip = single(picture, HP, "flip");
  const rotation = single(picture, HP, "rotationInfo");
  const rendering = single(picture, HP, "renderingInfo");
  const scale = single(rendering, HC, "scaMatrix");
  const ok =
    flip.getAttribute("horizontal") === "0" &&
    flip.getAttribute("vertical") === "0" &&
    rotation.getAttribute("angle") === "0" &&
    rotation.getAttribute("rotateimage") === "0" &&
    isIdentity(single(rendering, HC, "transMatrix")) &&
    ["e2", "e3", "e4", "e6"].every((key) => scale.getAttribute(key) === "0") &&
    isIdentity(single(rendering, HC, "rotMatrix"));
  if (!ok) throw new Error("생성 HWPX의 활동 사진 방향이 올바르지 않습니다.");
}

const KST_OFFSET = 9 * 3600_000;
function formatActivityDate(date: Date): string {
  const k = new Date(date.getTime() + KST_OFFSET);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${toKstDate(date).replaceAll("-", ".")} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}
const monthOf = (date: Date) => new Date(date.getTime() + KST_OFFSET).getUTCMonth() + 1;

function validatePresident(name: string) {
  if (!name || name.trim() === "" || name.length > 20) throw new InvalidReportDocumentError("presidentName");
}

type Entries = Record<string, Uint8Array>;

let cachedTemplate: Entries | null = null;
function loadTemplate(): Entries {
  if (!cachedTemplate) {
    const file = path.join(process.cwd(), "src/features/activity/templates/bandi-activity-report-template.hwpx");
    const entries = unzipSync(new Uint8Array(readFileSync(file)));
    validateTemplate(entries);
    cachedTemplate = entries;
  }
  return cachedTemplate;
}

function validateTemplate(entries: Entries) {
  if (!REQUIRED_ENTRIES.every((name) => name in entries) || "Preview/PrvImage.png" in entries || "BinData/image1.jpg" in entries) {
    throw new Error("활동 내역서 정본 템플릿 구성이 올바르지 않습니다.");
  }
  const section = parseXml(entries[SECTION_PATH]);
  for (const name of DYNAMIC_NAMES) findNamed(section, tagFor(name), name);
  if (!strFromU8(entries["Contents/content.hpf"]).includes(PHOTO_PATH)) {
    throw new Error("활동 사진 manifest 참조가 없습니다.");
  }
}

/** mimetype을 첫 항목·무압축으로 쓰는 HWPX(ZIP). */
function writeZip(entries: Entries): Uint8Array {
  const zippable: Zippable = { mimetype: [entries.mimetype, { level: 0 }] };
  for (const [name, data] of Object.entries(entries)) {
    if (name !== "mimetype") zippable[name] = data;
  }
  return zipSync(zippable);
}

function validateGenerated(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  if (!REQUIRED_ENTRIES.every((name) => name in entries)) throw new Error("생성 HWPX의 필수 항목이 없습니다.");
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith(".xml") || name.endsWith(".hpf")) parseXml(data);
  }
  const sectionText = strFromU8(entries[SECTION_PATH]);
  for (const marker of DYNAMIC_NAMES) {
    if (sectionText.includes(`[${marker}]`)) throw new Error("치환되지 않은 HWPX 표식이 있습니다.");
  }
  validatePhotoOrientation(parseXml(entries[SECTION_PATH]));
}

function fillCommon(doc: Document, v: { title: string; representative: string; location: string; date: string; president: string; total: string }) {
  setNamedText(doc, "p", "TITLE", v.title);
  setNamedText(doc, "tc", "REPRESENTATIVE", v.representative);
  setNamedText(doc, "tc", "LOCATION", v.location);
  setNamedText(doc, "tc", "ACTIVITY_DATE", v.date);
  setNamedText(doc, "tc", "ACTIVITY_CONTENT", "");
  setNamedText(doc, "p", "PRESIDENT_NAME", `반디 회장 ${v.president} (인)`);
  setNamedText(doc, "p", "PARTICIPANT_TOTAL", `참여인원 총 ${v.total}`);
}

function clearParticipants(doc: Document) {
  for (let row = 1; row <= MAX_PARTICIPANTS; row++) {
    for (const field of ["NAME", "DEPARTMENT", "STUDENT_NO", "NOTE"]) setNamedText(doc, "tc", participantName(row, field), "");
  }
}

function build(doc: Document, photo: Uint8Array, preview: string): Uint8Array {
  const template = loadTemplate();
  normalizePhotoOrientation(doc);
  const entries: Entries = { ...template, [SECTION_PATH]: serializeXml(doc), [PHOTO_PATH]: photo, [PREVIEW_TEXT_PATH]: strToU8(preview) };
  const result = writeZip(entries);
  validateGenerated(result);
  return result;
}

/** 빈 활동 내역서 양식(내려받기용). */
export function generateBlank(presidentName: string): Uint8Array {
  validatePresident(presidentName);
  const doc = parseXml(loadTemplate()[SECTION_PATH]);
  fillCommon(doc, { title: "월 [ 반디 ] 동아리 활동 내역서", representative: "", location: "", date: "", president: presidentName, total: "00명" });
  clearParticipants(doc);
  return build(doc, loadTemplate()[PHOTO_PATH], `반디 동아리 활동 내역서\n반디 회장 ${presidentName}`);
}

/** 입력값으로 채운 활동 내역서. 참여자 총계·양식 제목의 월·회장 이름은 서버가 계산해 넣는다. */
export function generateReport(input: ReportDocumentInput, presidentName: string, normalizedPhoto: Uint8Array): Uint8Array {
  if (!normalizedPhoto || normalizedPhoto.length === 0) throw new InvalidReportDocumentError("photo");
  if (input.participants.length < 1 || input.participants.length > MAX_PARTICIPANTS) throw new InvalidReportDocumentError("participants");
  validatePresident(presidentName);
  const doc = parseXml(loadTemplate()[SECTION_PATH]);
  const title = `${monthOf(input.activityAt)}월 [ 반디 ] 동아리 활동 내역서`;
  const date = formatActivityDate(input.activityAt);
  const total = `${String(input.participants.length).padStart(2, "0")}명`;
  fillCommon(doc, { title, representative: input.representative, location: input.location, date, president: presidentName, total });
  setNamedText(doc, "tc", "ACTIVITY_CONTENT", input.content);
  clearParticipants(doc);
  input.participants.forEach((p, index) => {
    const row = index + 1;
    setNamedText(doc, "tc", participantName(row, "NAME"), p.name);
    setNamedText(doc, "tc", participantName(row, "DEPARTMENT"), p.department);
    setNamedText(doc, "tc", participantName(row, "STUDENT_NO"), p.studentNo);
    setNamedText(doc, "tc", participantName(row, "NOTE"), p.note);
  });
  const preview = `${title}\n대표자 ${input.representative}\n활동 장소 ${input.location}\n활동 일시 ${date}\n참여인원 총 ${total}\n${input.content}`;
  return build(doc, normalizedPhoto, preview);
}

export const HWPX_MIME = "application/hwp+zip";
