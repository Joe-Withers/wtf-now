import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import { mockApi, renderApp } from "../test-helpers";
import { DrawingScreen } from "./DrawingScreen";

const shape = (id: string) => ({ id, tag: "rect" as const, attributes: { x: "0", y: "0", width: "100", height: "40" } });

const zone = (id: string, title: string, overrides = {}) => ({
  id,
  title,
  progress: null,
  tasks: [],
  shape: shape(id),
  ...overrides,
});

const drawing = {
  slug: "van-plan",
  title: "Van plan",
  view_box: "0 0 100 100",
  zones: [
    zone("rear", "Rear cabinet", { progress: 40, tasks: [{ slug: "wire", title: "Wire the board", state: "doing" }] }),
    zone("bed", "Bed", { progress: 100 }),
    zone("loft", "Loft", { shape: null }),
  ],
  shapes: [shape("rear"), shape("bed"), shape("wall")],
};

function renderDrawing() {
  mockApi({ "/api/drawings": [drawing] });
  renderApp(
    <Routes>
      <Route path="/drawings/:slug" element={<DrawingScreen />} />
    </Routes>,
    "/drawings/van-plan",
  );
}

test("draws the zones and lists their progress", async () => {
  renderDrawing();

  const plan = await screen.findByRole("img", { name: "Van plan" });
  expect(plan.querySelectorAll("rect")).toHaveLength(3);
  expect(plan.querySelector("rect.zone")).toHaveStyle({ fill: "color-mix(in srgb, var(--now) 45%, var(--surface))" });
  expect(plan.querySelectorAll("rect.zone")).toHaveLength(2);
  expect(plan.querySelector("rect.outline")).toHaveClass("outline");
  expect(screen.getByRole("button", { name: /Rear cabinet\s*40%/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Loft\s*no tasks/ })).toBeInTheDocument();
});

test("a finished zone is coloured as done", async () => {
  renderDrawing();

  const plan = await screen.findByRole("img", { name: "Van plan" });
  const bed = plan.querySelector('rect.zone[id="bed"]');
  expect(bed).toHaveStyle({ fill: "var(--done)" });
});

test("tapping a zone lists its tasks", async () => {
  renderDrawing();

  await userEvent.click(await screen.findByRole("button", { name: /Rear cabinet/ }));

  const section = screen.getByRole("region", { name: "Tasks in Rear cabinet" });
  expect(within(section).getByRole("link", { name: /Wire the board/ })).toHaveAttribute("href", "/tasks/wire");
});

test("says so when the drawing isn't there", async () => {
  mockApi({ "/api/drawings": [] });
  renderApp(
    <Routes>
      <Route path="/drawings/:slug" element={<DrawingScreen />} />
    </Routes>,
    "/drawings/nope",
  );

  expect(await screen.findByText("No drawing called that.")).toBeInTheDocument();
});
