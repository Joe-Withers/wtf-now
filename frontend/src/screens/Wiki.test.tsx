import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import { mockApi, renderApp } from "../test-helpers";
import { LogScreen } from "./LogScreen";
import { More } from "./More";
import { NoteScreen } from "./NoteScreen";
import { Wiki } from "./Wiki";

const note = {
  slug: "height", title: "Ceiling height", type: "Measurement", description: "", generated_by: "wtf-now/model",
  verified: false, needs_verifying: true, stale: false,
};

test("unverified and stale notes are flagged", async () => {
  mockApi({ "/api/notes": [note, { ...note, slug: "price", title: "PIR price", needs_verifying: false, stale: true }] });

  renderApp(<Wiki />);

  expect(await screen.findByText("Unverified")).toBeInTheDocument();
  expect(screen.getByText("May be out of date")).toBeInTheDocument();
});

test("searching replaces the list with results", async () => {
  mockApi({
    "/api/notes": [note],
    "/api/search": [{ kind: "task", slug: "fridge", title: "Fit the fridge", snippet: "needs venting" }],
  });
  renderApp(<Wiki />);
  await screen.findByText("Ceiling height");

  await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "fridge");

  expect(await screen.findByRole("link", { name: /Fit the fridge/ })).toHaveAttribute("href", "/tasks/fridge");
  expect(screen.queryByText("Ceiling height")).not.toBeInTheDocument();
});

test("an unverified measurement can be confirmed with a tap", async () => {
  const calls = mockApi({
    "/api/notes/height/verify": { change: { id: "c", summary: "", at: "" } },
    "/api/notes/height": { ...note, body: "1420mm" },
  });
  renderApp(
    <Routes>
      <Route path="/notes/:slug" element={<NoteScreen />} />
    </Routes>,
    "/notes/height",
  );

  await userEvent.click(await screen.findByRole("button", { name: "Yes, it's right" }));

  await waitFor(() => expect(calls.some((call) => call.url === "/api/notes/height/verify")).toBe(true));
});

test("a verified note doesn't ask again", async () => {
  mockApi({ "/api/notes/height": { ...note, verified: true, needs_verifying: false, body: "1420mm" } });
  renderApp(
    <Routes>
      <Route path="/notes/:slug" element={<NoteScreen />} />
    </Routes>,
    "/notes/height",
  );

  expect(await screen.findByText(/Verified by you/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Yes, it's right" })).not.toBeInTheDocument();
});

test("the log groups lines by day", async () => {
  mockApi({
    "/api/log": [
      { day: "2026-08-09", label: "Progress", text: "One" },
      { day: "2026-08-09", label: "Note", text: "Two" },
      { day: "2026-08-01", label: "Arrived", text: "Three" },
    ],
  });

  renderApp(<LogScreen />);

  expect(await screen.findAllByText("2026-08-09")).toHaveLength(1);
  expect(screen.getByText("2026-08-01")).toBeInTheDocument();
});

test("the wiki counts the notes waiting to be confirmed", async () => {
  mockApi({ "/api/notes": [note] });

  renderApp(<Wiki />);

  expect(await screen.findByText("1 to verify")).toBeInTheDocument();
});

test("the menu shows problems in the project files", async () => {
  mockApi({ "/api/problems": [{ code: "x", path: "tasks/a.md", message: "bad parent" }] });

  renderApp(<More />);

  expect(await screen.findByText("tasks/a.md: bad parent")).toBeInTheDocument();
});
