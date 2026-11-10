import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** 셀 정렬/강조용 추가 클래스 */
  className?: string;
}

/**
 * 디자인 가이드의 dataTable: 카드(보더) 안에서 가로 스크롤, 헤더는 text-xs font-extrabold text-muted-foreground.
 * caption은 스크린 리더용 설명이다.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, testId, empty = "표시할 항목이 없습니다." }: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  testId?: string;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:bg-secondary [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-extrabold [&_th]:text-muted-foreground [&_td]:border-b [&_td]:px-4 [&_td]:py-3 [&_td]:text-sm [&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-secondary/50 [&_tbody_tr:last-child_td]:border-b-0" data-testid={testId}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.header} className={column.className}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
