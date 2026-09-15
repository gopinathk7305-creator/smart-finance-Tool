import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode } from "react";

interface VirtualTableProps<T> {
  rows: T[];
  /** table header row cells */
  head: ReactNode;
  /** renders one row's cells */
  row: (item: T, index: number) => ReactNode;
  rowHeight?: number;
  height?: number;
  className?: string;
}

/**
 * Renders only the rows visible in the viewport, so 50,000-row datasets scroll
 * at full speed without flooding the DOM.
 */
export function VirtualTable<T>({
  rows,
  head,
  row,
  rowHeight = 40,
  height = 420,
  className,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();

  return (
    <div className={`rounded-md border border-border ${className ?? ""}`}>
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-xs text-muted-foreground">{head}</tr>
        </thead>
      </table>
      <div ref={parentRef} style={{ height, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          <table className="w-full text-sm">
            <tbody>
              {items.map((v) => (
                <tr
                  key={v.key}
                  className="border-t border-border"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: v.size,
                    transform: `translateY(${v.start}px)`,
                    display: "table",
                    tableLayout: "fixed",
                  }}
                >
                  {row(rows[v.index]!, v.index)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
