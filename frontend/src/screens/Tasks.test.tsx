import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import { mockApi, renderApp } from "../test-helpers";
import { TaskScreen } from "./TaskScreen";
import { Tasks } from "./Tasks";

const node = (slug: string, title: string, overrides = {}) => ({
  slug, title, kind: "build", state: "todo", progress: 0, remaining_hours: 1, blocked: false, children: [], ...overrides,
});

const tree = [
  node("electrics", "Electrics", {
    state: "doing",
    progress: 40,
    children: [node("wire", "Wire the board", { state: "done", progress: 100 }), node("fit", "Fit battery", { blocked: true })],
  }),
];

const detail = {
  slug: "wire", title: "Wire the board", description: "", kind: "build", state: "doing", progress: 40,
  progress_reason: "Half wired", remaining_hours: 1.5, is_leaf: true, zone: null, needs_helper: false, cost: null,
  current_state: "Cables in the blue box.", notes: "See [the torque note](/notes/torque.md).",
  breadcrumbs: [{ slug: "electrics", title: "Electrics", state: "doing" }], children: [], depends_on: [],
  dependents: [{ slug: "fit", title: "Fit battery", state: "todo" }],
  blocked_by: [], easier_after: [],
};

const renderTask = (overrides = {}) => {
  const calls = mockApi({
    "/api/tasks/wire/state": { change: { id: "c1", summary: "", at: "" } },
    "/api/tasks/wire/progress": { change: { id: "c2", summary: "", at: "" } },
    "/api/tasks/wire": { ...detail, ...overrides },
  });
  renderApp(
    <Routes>
      <Route path="/tasks/:slug" element={<TaskScreen />} />
    </Routes>,
    "/tasks/wire",
  );
  return calls;
};

test("the tree opens to show children and their state", async () => {
  mockApi({ "/api/tree": tree });
  renderApp(<Tasks />);

  await userEvent.click(await screen.findByRole("button", { name: "Open Electrics" }));

  expect(screen.getByRole("link", { name: /Wire the board/ })).toHaveAttribute("href", "/tasks/wire");
  expect(screen.getByText("Done")).toBeInTheDocument();
  expect(screen.getByText("Blocked")).toBeInTheDocument();
});

test("a task shows where it was left and links its notes in the app", async () => {
  renderTask();

  expect(await screen.findByText("Cables in the blue box.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "the torque note" })).toHaveAttribute("href", "/notes/torque");
  expect(screen.getByRole("link", { name: /Talk about this task/ })).toHaveAttribute("href", "/chat?focus=wire");
});

test("marking a task done offers undo", async () => {
  const calls = renderTask();

  await userEvent.click(await screen.findByRole("button", { name: "Done" }));

  expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
  expect(calls.find((call) => call.url === "/api/tasks/wire/state")?.init?.body).toBe(JSON.stringify({ state: "done" }));
});

test("a purchase uses ordering language", async () => {
  renderTask({ kind: "purchase", state: "todo" });

  expect(await screen.findByRole("button", { name: "Mark as ordered" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "It's arrived" })).toBeInTheDocument();
});

test("parents have no state buttons, because they're calculated", async () => {
  renderTask({ is_leaf: false });

  await screen.findByText("Cables in the blue box.");
  expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
});

test("changing progress asks what changed", async () => {
  const calls = renderTask();
  const slider = await screen.findByRole("slider", { name: "Progress" });

  expect(screen.queryByRole("button", { name: "Save progress" })).not.toBeInTheDocument();
  fireEvent.change(slider, { target: { value: "45" } });
  expect(screen.getByRole("button", { name: "Save progress" })).toBeDisabled();

  await userEvent.type(screen.getByRole("textbox", { name: "What changed?" }), "More wired");
  await userEvent.click(screen.getByRole("button", { name: "Save progress" }));

  expect(calls.find((call) => call.url === "/api/tasks/wire/progress")?.init?.body).toBe(
    JSON.stringify({ progress: 45, reason: "More wired" }),
  );
});
