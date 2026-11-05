import { screen } from "@testing-library/react";
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
  blocked_by: [], easier_after: [], closes_zone_title: null, preflight: [], photos: [],
};

const renderTask = (overrides = {}) => {
  const calls = mockApi({
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
  expect(screen.getByRole("link", { name: /Tell it what you've done/ })).toHaveAttribute("href", "/chat?focus=wire");
});

test("the task screen has no buttons that change the work", async () => {
  const calls = renderTask();

  await screen.findByText("Cables in the blue box.");
  expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save progress" })).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(calls.every((call) => call.init?.method !== "POST")).toBe(true);
});

test("a purchase is changed in the chat, not by a button", async () => {
  renderTask({ kind: "purchase", state: "todo" });

  expect(await screen.findByText("Wire the board")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark as ordered" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "It's arrived" })).not.toBeInTheDocument();
});

test("parents are calculated, so they have no buttons either", async () => {
  renderTask({ is_leaf: false });

  await screen.findByText("Cables in the blue box.");
  expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
});

test("progress is shown, not set", async () => {
  renderTask();

  expect(await screen.findByRole("progressbar", { name: "Wire the board progress" })).toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

test("a task that closes a zone warns about what's still in there", async () => {
  renderTask({
    closes_zone_title: "Rear cabinet",
    preflight: [{ slug: "board-solar", title: "Connect the solar", state: "todo" }],
  });

  expect(await screen.findByRole("alert")).toHaveTextContent("This closes off Rear cabinet");
  expect(screen.getByRole("link", { name: "Connect the solar" })).toHaveAttribute("href", "/tasks/board-solar");
});

test("no warning when nothing is left in the zone", async () => {
  renderTask();

  await screen.findByText("Cables in the blue box.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("photos show on the task", async () => {
  renderTaskWithPhotos();

  expect(await screen.findByRole("img", { name: "The fuse block" })).toHaveAttribute("src", "/api/photos/abc.jpg");
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

function renderTaskWithPhotos() {
  return renderTask({ photos: [{ key: "abc.jpg", caption: "The fuse block" }] });
}
