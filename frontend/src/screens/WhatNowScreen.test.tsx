import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp } from "../test-helpers";
import { WhatNowScreen } from "./WhatNowScreen";

const map = {
  total: 4,
  done: 1,
  progress: 25,
  categories: [
    { slug: "electrics", title: "Electrics", colour: 1, total: 2, done: 0, progress: 0, next: "wire" },
    { slug: "insulation", title: "Insulation", colour: 2, total: 2, done: 1, progress: 50, next: "wool" },
  ],
  tasks: [
    {
      slug: "wire",
      title: "Run the cables",
      kind: "build",
      state: "doing",
      progress: 40,
      category: "electrics",
      parent: "electrics",
      is_leaf: true,
      needs: [],
      blocks: ["fridge"],
      children: [],
      note: "Cables are cut.",
    },
    {
      slug: "fridge",
      title: "Fit the fridge",
      kind: "build",
      state: "todo",
      progress: 0,
      category: "electrics",
      parent: "electrics",
      is_leaf: true,
      needs: ["wire"],
      blocks: [],
      children: [],
      note: "",
    },
    {
      slug: "wool",
      title: "Order the wool",
      kind: "purchase",
      state: "todo",
      progress: 0,
      category: "insulation",
      parent: "insulation",
      is_leaf: true,
      needs: [],
      blocks: [],
      children: [],
      note: "",
    },
    {
      slug: "felt",
      title: "Trim the felt",
      kind: "build",
      state: "done",
      progress: 100,
      category: "insulation",
      parent: "insulation",
      is_leaf: true,
      needs: [],
      blocks: [],
      children: [],
      note: "",
    },
  ],
  notes: [],
  recent: [
    { slug: "felt", title: "Trim the felt", kind: "build", category: "insulation", label: "Finished", day: "2026-08-10" },
  ],
};

test("the work is a run of jobs, in four columns", async () => {
  mockApi({ "/api/map": map });

  renderApp(<WhatNowScreen />);

  expect(await screen.findByRole("heading", { name: /^Done/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /^Ready now/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /^Up next/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /^Later/ })).toBeInTheDocument();
});

test("the last thing you finished is in the done column", async () => {
  mockApi({ "/api/map": map });

  renderApp(<WhatNowScreen />);

  expect(await screen.findByRole("button", { name: "Trim the felt, Finished, 10 Aug" })).toBeInTheDocument();
});

test("picking a job says what it needs and what it unblocks", async () => {
  mockApi({ "/api/map": map });

  renderApp(<WhatNowScreen />);

  await userEvent.click(await screen.findByRole("button", { name: /Fit the fridge/ }));

  const panel = await screen.findByRole("region", { name: "Selected task" });
  expect(within(panel).getByText("Fit the fridge")).toBeInTheDocument();
  expect(within(panel).getByRole("button", { name: "Run the cables" })).toBeInTheDocument();
  expect(within(panel).getByText("Waiting on 1 task")).toBeInTheDocument();
});

test("a link can point straight at a job", async () => {
  mockApi({ "/api/map": map });

  renderApp(<WhatNowScreen />, "/what-now?task=fridge");

  const panel = await screen.findByRole("region", { name: "Selected task" });
  expect(within(panel).getByText("Fit the fridge")).toBeInTheDocument();
});

test("the chips filter the run by kind", async () => {
  mockApi({ "/api/map": map });

  renderApp(<WhatNowScreen />);

  await screen.findByRole("button", { name: /Order the wool/ });

  await userEvent.click(screen.getByRole("button", { name: "Buy" }));

  expect(screen.getByRole("button", { name: "Buy" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Order the wool/ }).className).not.toContain("faded");
  expect(screen.getByRole("button", { name: /Run the cables/ }).className).toContain("faded");
});

test("nothing on What now changes a job — the chat does that", async () => {
  const calls = mockApi({ "/api/map": map });

  renderApp(<WhatNowScreen />);

  await screen.findByRole("button", { name: /Run the cables/ });
  expect(calls.every((call) => call.init?.method !== "POST")).toBe(true);
});

test("the job each group would do next sparkles, and the others don't", async () => {
  mockApi({ "/api/map": map });

  renderApp(<WhatNowScreen />);

  const wire = await screen.findByRole("button", { name: /Run the cables/ });
  expect(wire).toHaveClass("recommended");
  expect(screen.getByRole("button", { name: /Fit the fridge/ })).not.toHaveClass("recommended");
});
