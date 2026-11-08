import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import { mockApi, renderApp } from "../test-helpers";
import { NoteScreen } from "./NoteScreen";

const note = {
  slug: "height", title: "Ceiling height", type: "Measurement", description: "", generated_by: "wtf-now/model",
  verified: false, needs_verifying: true, stale: false,
};

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

test("an unverified measurement that is wrong can be removed, and you go back to the docs", async () => {
  const calls = mockApi({
    "/api/notes/height": { ...note, body: "1420mm", change: { id: "c", summary: "", at: "" } },
  });
  renderApp(
    <Routes>
      <Route path="/notes/:slug" element={<NoteScreen />} />
      <Route path="/docs" element={<p>The docs</p>} />
    </Routes>,
    "/notes/height",
  );

  await userEvent.click(await screen.findByRole("button", { name: "No, it's wrong" }));

  await waitFor(() => expect(calls.some((call) => call.url === "/api/notes/height" && call.init?.method === "DELETE")).toBe(true));
  expect(await screen.findByText("The docs")).toBeInTheDocument();
});
