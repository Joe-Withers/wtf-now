const styles = import.meta.glob("./index.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const css = Object.values(styles)[0] ?? "";

/** The declarations for one selector, as they appear in the stylesheet. */
function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return "";
  return css.slice(at, css.indexOf("}", at));
}

/** The body of a min-width media query. */
function media(width: number): string {
  const at = css.indexOf(`@media (min-width: ${width}px)`);
  if (at < 0) return "";
  return css.slice(at, css.indexOf("\n}", at));
}

test("the app fills the window", () => {
  expect(rule(".app")).toContain("height: 100dvh");
  expect(rule(".app")).not.toContain("max-width");
});

test("reading screens keep a comfortable measure", () => {
  expect(rule(".screen")).toContain("--gutter: max(16px, calc((100% - 880px) / 2))");
});

test("the rail becomes a sidebar on a laptop", () => {
  const laptop = media(860);
  expect(laptop).toContain(".rail { width: 224px;");
  expect(laptop).toContain(".rail a { flex-direction: row;");
});

test("cards go two abreast when there's room", () => {
  expect(media(1180)).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
});

test("the screens that draw use the whole width", () => {
  expect(rule(".screen.wide")).toContain("--gutter");
});
