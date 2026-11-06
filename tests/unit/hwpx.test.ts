import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import { generateBlank, generateReport, type ReportDocumentInput } from "@/features/activity/hwpx";

const HP = "http://www.hancom.co.kr/hwpml/2011/paragraph";

async function photo() {
  return new Uint8Array(await sharp({ create: { width: 8, height: 6, channels: 3, background: "#336699" } }).png().toBuffer());
}

const input = (over: Partial<ReportDocumentInput> = {}): ReportDocumentInput => ({
  representative: "홍길동",
  location: "소극장 A",
  activityAt: new Date("2026-03-14T05:30:00Z"), // 2026-03-14 14:30 KST
  content: "1막 연습\n2막 블로킹 & <조명> 점검",
  participants: [
    { name: "홍길동", department: "컴퓨터공학부", studentNo: "2025591010", note: null },
    { name: "김철수", department: null, studentNo: "2025591011", note: "지각" },
  ],
  ...over,
});

function namedText(sectionXml: string, tag: string, name: string): string {
  const doc = new DOMParser().parseFromString(sectionXml, "text/xml");
  const nodes = doc.getElementsByTagNameNS(HP, tag);
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes.item(i)!;
    if (el.getAttribute("name") === name) {
      const parts: string[] = [];
      const walk = (n: Node) => {
        const e = n as Element;
        if (e.localName === "t") parts.push(e.textContent ?? "");
        if (e.localName === "lineBreak") parts.push("\n");
        for (let c = 0; c < n.childNodes.length; c++) walk(n.childNodes.item(c) as Node);
      };
      walk(el as unknown as Node);
      return parts.join("");
    }
  }
  throw new Error(`not found: ${name}`);
}

const section = (hwpx: Uint8Array) => strFromU8(unzipSync(hwpx)["Contents/section0.xml"]);

describe("HWPX 활동 내역서 생성", () => {
  it("입력값을 이름이 지정된 셀에 채우고 총계·제목의 월·회장 이름을 서버가 계산한다", async () => {
    const xml = section(generateReport(input(), "이회장", await photo()));
    expect(namedText(xml, "p", "TITLE")).toBe("3월 [ 반디 ] 동아리 활동 내역서");
    expect(namedText(xml, "tc", "REPRESENTATIVE")).toBe("홍길동");
    expect(namedText(xml, "tc", "LOCATION")).toBe("소극장 A");
    expect(namedText(xml, "tc", "ACTIVITY_DATE")).toBe("2026.03.14 14:30");
    expect(namedText(xml, "p", "PRESIDENT_NAME")).toBe("반디 회장 이회장 (인)");
    expect(namedText(xml, "p", "PARTICIPANT_TOTAL")).toBe("참여인원 총 02명");
  });

  it("참여자는 순서대로 채우고 남은 행은 비운다", async () => {
    const xml = section(generateReport(input(), "이회장", await photo()));
    expect(namedText(xml, "tc", "P01_NAME")).toBe("홍길동");
    expect(namedText(xml, "tc", "P01_DEPARTMENT")).toBe("컴퓨터공학부");
    expect(namedText(xml, "tc", "P02_NOTE")).toBe("지각");
    expect(namedText(xml, "tc", "P02_DEPARTMENT")).toBe("");
    expect(namedText(xml, "tc", "P03_NAME")).toBe("");
    expect(namedText(xml, "tc", "P14_STUDENT_NO")).toBe("");
  });

  it("줄바꿈은 lineBreak로, & < 같은 특수문자는 이스케이프되어 원문 그대로 복원된다", async () => {
    const xml = section(generateReport(input(), "이회장", await photo()));
    expect(namedText(xml, "tc", "ACTIVITY_CONTENT")).toBe("1막 연습\n2막 블로킹 & <조명> 점검");
    expect(xml).not.toContain("<조명>");
    expect(xml).toContain("&amp;");
  });

  it("XML 태그를 흉내 내는 입력은 구조를 바꾸지 못한다", async () => {
    const hostile = '</hp:t></hp:run><hp:t name="TITLE">탈취</hp:t>';
    const xml = section(generateReport(input({ content: hostile, location: hostile }), "이회장", await photo()));
    expect(namedText(xml, "tc", "ACTIVITY_CONTENT")).toBe(hostile);
    expect(namedText(xml, "p", "TITLE")).toBe("3월 [ 반디 ] 동아리 활동 내역서");
  });

  it("활동 사진을 교체하고 방향 속성을 정규화한다", async () => {
    const png = await photo();
    const entries = unzipSync(generateReport(input(), "이회장", png));
    expect(entries["BinData/activity-photo.png"]).toEqual(png);
    const xml = strFromU8(entries["Contents/section0.xml"]);
    expect(xml).toMatch(/flip[^>]*horizontal="0"/);
  });

  it("ZIP 구조: mimetype이 첫 항목이며 필수 항목이 모두 있고 미리보기 텍스트가 갱신된다", async () => {
    const bytes = generateReport(input(), "이회장", await photo());
    expect(Buffer.from(bytes.subarray(0, 4)).toString("hex")).toBe("504b0304");
    const entries = unzipSync(bytes);
    expect(strFromU8(entries.mimetype)).toBe("application/hwp+zip");
    for (const name of ["version.xml", "Contents/header.xml", "Contents/content.hpf", "settings.xml", "META-INF/container.xml", "META-INF/manifest.xml"]) {
      expect(name in entries).toBe(true);
    }
    expect(strFromU8(entries["Preview/PrvText.txt"])).toContain("대표자 홍길동");
    // 첫 로컬 파일 헤더의 파일명이 mimetype
    expect(Buffer.from(bytes.subarray(30, 38)).toString()).toBe("mimetype");
  });

  it("14명까지 허용하고 0명·15명은 거부한다", async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ name: `참여${i}`, department: null, studentNo: null, note: null }));
    expect(namedText(section(generateReport(input({ participants: many }), "이회장", await photo())), "p", "PARTICIPANT_TOTAL")).toBe("참여인원 총 14명");
    expect(() => generateReport(input({ participants: [] }), "이회장", new Uint8Array([1]))).toThrow();
    expect(() => generateReport(input({ participants: [...many, many[0]] }), "이회장", new Uint8Array([1]))).toThrow();
  });

  it("사진이 비었거나 회장 이름이 잘못되면 거부한다", async () => {
    expect(() => generateReport(input(), "이회장", new Uint8Array(0))).toThrow();
    expect(() => generateReport(input(), " ", new Uint8Array([1]))).toThrow();
    expect(() => generateReport(input(), "가".repeat(21), new Uint8Array([1]))).toThrow();
  });

  it("빈 양식은 모든 입력 칸이 비어 있고 회장 이름만 채워진다", () => {
    const xml = section(generateBlank("이회장"));
    expect(namedText(xml, "tc", "REPRESENTATIVE")).toBe("");
    expect(namedText(xml, "p", "PARTICIPANT_TOTAL")).toBe("참여인원 총 00명");
    expect(namedText(xml, "p", "PRESIDENT_NAME")).toBe("반디 회장 이회장 (인)");
    expect(namedText(xml, "tc", "P01_NAME")).toBe("");
  });

  it("KST 기준으로 월과 시각을 계산한다 (UTC 월말 경계)", async () => {
    const xml = section(generateReport(input({ activityAt: new Date("2026-03-31T16:00:00Z") }), "이회장", await photo()));
    expect(namedText(xml, "p", "TITLE")).toBe("4월 [ 반디 ] 동아리 활동 내역서"); // 04-01 01:00 KST
    expect(namedText(xml, "tc", "ACTIVITY_DATE")).toBe("2026.04.01 01:00");
  });
});
