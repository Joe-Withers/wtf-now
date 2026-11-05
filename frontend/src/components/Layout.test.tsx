import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import { mockApi, renderApp } from "../test-helpers";
import { TaskScreen } from "../screens/TaskScreen";
import { Layout } from "./Layout";

const detail = {
  slug: "wire", title: "Wire the board", description: "", kind: "build", state: "doing", progress: 40,
  progress_reason: "Half wired", remaining_hours: 1.5, is_leaf: true, zone: null, needs_helper: false, cost: null,
  current_state: "Cables in the blue box.", notes: "",
  breadcrumbs: [], children: [], depends_on: [],
  dependents: [], blocked_by: [], easier_after: [], closes_zone_title: null, preflight: [], photos: [],
};

function renderShell(path = "/") {
  return renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<p>The plan</p>} />
        <Route path="/tasks/:slug" element={<TaskScreen />} />
      </Route>
    </Routes>,
    path,
  );
}

test("the navigation is a rail, and the chat is not in it", () => {
  renderShell();

  const rail = screen.getByRole("navigation", { name: "Main" });
  expect(within(rail).getByRole("link", { name: /What now/ })).toHaveAttribute("href", "/what-now");
  expect(within(rail).getByRole("link", { name: /Shopping/ })).toHaveAttribute("href", "/shopping");
  expect(within(rail).queryByRole("link", { name: /Chat/ })).not.toBeInTheDocument();
});

test("the rail carries the wordmark, for when it is a sidebar", () => {
  renderShell();

  const rail = screen.getByRole("navigation", { name: "Main" });
  expect(within(rail).getByText("wtf-")).toBeInTheDocument();
});

test("one button pulls the chat out of the right-hand side", async () => {
  mockApi({ "/api/sessions": [], "/api/features": { chat: true, voice: false } });
  renderShell();

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Chat to the AI" }));

  expect(await screen.findByRole("dialog", { name: "Chat with the AI" })).toBeInTheDocument();
});

test("the chat closes again", async () => {
  mockApi({ "/api/sessions": [], "/api/features": { chat: true, voice: false } });
  renderShell();

  await userEvent.click(screen.getByRole("button", { name: "Chat to the AI" }));
  await userEvent.click(await screen.findByRole("button", { name: "Close the chat" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("the chat knows which task you were on", async () => {
  mockApi({
    "/api/tasks/wire": detail,
    "/api/sessions": [],
    "/api/features": { chat: true, voice: false },
  });
  renderShell("/tasks/wire");

  await screen.findByText("Cables in the blue box.");
  await userEvent.click(screen.getByRole("button", { name: "Chat to the AI" }));

  const drawer = await screen.findByRole("dialog", { name: "Chat with the AI" });
  expect(within(drawer).getByRole("link", { name: "Wire the board" })).toHaveAttribute("href", "/tasks/wire");
});
