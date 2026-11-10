/** CSV 셀: 수식 주입(= + - @, 탭·CR 시작) 방지 접두사와 따옴표 이스케이프, 개행 제거. */
export function csvCell(value: string | number | null | undefined): string {
  let text = (value === null || value === undefined ? "" : String(value)).replace(/[\r\n]+/g, " ");
  if (text !== "" && "=+-@\t".includes(text[0])) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

/** 엑셀에서 한글이 깨지지 않도록 BOM을 붙이고 CRLF로 줄을 나눈다. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
