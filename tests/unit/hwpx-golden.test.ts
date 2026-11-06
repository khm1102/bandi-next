import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { strFromU8, unzipSync } from "fflate";
import { generateBlank, generateReport } from "@/features/activity/hwpx";

/**
 * tests/golden/java-*.hwpx 는 기존 Spring 앱의 ActivityReportHwpxGenerator(Java)가 같은 입력으로 만든 출력이다.
 * TS 이식본이 section0.xml은 DOM 단위로, 나머지 ZIP 항목은 바이트 단위로 같은 결과를 내는지 고정한다.
 */
const golden = (name: string) => path.join(process.cwd(), "tests/golden", name);

type XmlNode = { nodeType: number; data?: string; nodeName: string; attributes: { length: number; item(i: number): { name: string; value: string } }; childNodes: { length: number; item(i: number): XmlNode } };

function canon(node: XmlNode): string {
  if (node.nodeType === 3) return (node.data ?? "").trim() === "" ? "" : JSON.stringify(node.data);
  if (node.nodeType !== 1) return "";
  const attrs = Array.from({ length: node.attributes.length }, (_, i) => node.attributes.item(i))
    .map((a) => `${a.name}=${a.value}`)
    .sort()
    .join(" ");
  const kids = Array.from({ length: node.childNodes.length }, (_, i) => canon(node.childNodes.item(i))).filter(Boolean).join("");
  return `<${node.nodeName} ${attrs}>${kids}</>`;
}

const section = (bytes: Uint8Array) =>
  canon(new DOMParser().parseFromString(strFromU8(bytes), "text/xml").documentElement as unknown as XmlNode);

function expectSameAsJava(javaFile: string, produced: Uint8Array) {
  const java = unzipSync(new Uint8Array(readFileSync(golden(javaFile))));
  const ts = unzipSync(produced);
  expect(Object.keys(ts).sort()).toEqual(Object.keys(java).sort());
  for (const key of Object.keys(java)) {
    if (key === "Contents/section0.xml") {
      expect(section(ts[key])).toBe(section(java[key]));
    } else {
      expect(Buffer.from(ts[key]).equals(Buffer.from(java[key])), key).toBe(true);
    }
  }
}

describe("HWPX 생성 — Java 구현과의 동일성", () => {
  it("활동 내역서가 Java 출력과 같다 (섹션 DOM 동일, 나머지 항목 바이트 동일)", () => {
    const bytes = generateReport(
      {
        representative: "홍대표",
        location: "소극장 A",
        activityAt: new Date("2026-03-14T05:30:00Z"),
        content: "1막 연습\n2막 블로킹 & <조명> 점검",
        participants: [
          { name: "홍길동", department: "컴퓨터공학부", studentNo: "2025591010", note: null },
          { name: "김철수", department: null, studentNo: "2025591011", note: "지각" },
        ],
      },
      "이회장",
      new Uint8Array(readFileSync(golden("photo.png"))),
    );
    expectSameAsJava("java-report.hwpx", bytes);
  });

  it("빈 양식이 Java 출력과 같다", () => {
    expectSameAsJava("java-blank.hwpx", generateBlank("이회장"));
  });
});
