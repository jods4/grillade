// This is registered as a CSS paint worklet.
// It has to be published as a separate file

function box(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  size >>= 1;
  const x0 = cx - size,
    x1 = cx + size,
    y0 = cy - size,
    y1 = cy + size;
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y0);
}

registerPaint(
  "dg-tree",
  class {
    static get inputProperties() {
      return ["--dg-tree", "--dg-tree-color", "--dg-expanding"];
    }

    paint(ctx: CanvasRenderingContext2D, size: { width: number; height: number }, props: { get<T>(key: string): T }) {
      const h = size.height;
      const h2 = h / 2;
      ctx.strokeStyle = props.get<CSSUnparsedValue>("--dg-tree-color")[0] as string;
      ctx.beginPath();
      let x = 12 + 6; /* cell padding + half of first level */
      let lines = props.get<CSSUnparsedValue>("--dg-tree")[0] as string;
      const isClosed = /[.+]$/.test(lines);
      if (!lines.endsWith("└.") && !lines.endsWith("└+"))
        lines = "│".repeat(lines.length - 1) + lines[lines.length - 1];
      for (const char of lines) {
        switch (char) {
          case "O":
            ctx.moveTo(x, h2 + 5);
            ctx.arc(x, h2, 5, 0.5 * Math.PI, 2.5 * Math.PI);
            ctx.lineTo(x, h);
            break;
          case "-":
            box(ctx, x, h2, 10);
            ctx.moveTo(x - 3, h2);
            ctx.lineTo(x + 3, h2);
            ctx.moveTo(x, h2 + 5);
            ctx.lineTo(x, h);
            break;
          case "+":
            const expanding = props.get<CSSUnitValue>("--dg-expanding");
            if (expanding.value < 0) {
              box(ctx, x, h2, 10);
              ctx.moveTo(x - 3, h2);
              ctx.lineTo(x + 3, h2);
              ctx.moveTo(x, h2 - 3);
              ctx.lineTo(x, h2 + 3);
            } else {
              ctx.stroke();
              ctx.beginPath();
              const start = (expanding.value * Math.PI) / 180;
              ctx.arc(x, h2, 5, start, start + Math.PI * 1.25);
              ctx.lineWidth = 2;
              // No need to revert or stroke and open a new path,
              // a spinner is always the last element in gutter
            }
            break;
          // @ts-ignore: Fallthrough case
          case "└":
            if (isClosed) {
              ctx.moveTo(x, 0);
              ctx.lineTo(x, h2 + 5);
              ctx.moveTo(x - 3, h2 + 5);
              ctx.lineTo(x + 3, h2 + 5);
              break;
            }
          // Fallthrough: when node is not closed, substitute L by |
          case "│":
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            break;
        }
        x += 12;
      }
      ctx.stroke();
    }
  },
);
