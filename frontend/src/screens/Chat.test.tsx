import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "../test-helpers";
import { Chat } from "./Chat";

const encoder = new TextEncoder();

function sse(events: object[], splitAt?: number) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  const chunks = splitAt ? [text.slice(0, splitAt), text.slice(splitAt)] : [text];
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

function server(events: object[], routes: Record<string, unknown> = {}, splitAt?: number) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/messages")) return { ok: true, body: sse(events, splitAt) };
      const key = Object.keys(routes).find((route) => url.startsWith(route));
      if (key) return { ok: true, json: async () => routes[key] };
      if (url === "/api/sessions" && init?.method === "POST") return { ok: true, json: async () => ({ id: "s1" }) };
      if (url === "/api/sessions") return { ok: true, json: async () => [] };
      return { ok: false, status: 404, json: async () => ({ detail: "Not found" }) };
    }),
  );
  return calls;
}

async function say(text: string) {
  await userEvent.type(screen.getByRole("textbox", { name: "Message" }), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

test("streams a reply, even when an event splits across chunks", async () => {
  server(
    [
      { type: "text", text: "Noted. " },
      { type: "text", text: "All saved." },
      { type: "done" },
    ],
    {},
    20,
  );
  renderApp(<Chat />);

  await say("Finished the ceiling");

  expect(await screen.findByText("Noted. All saved.")).toBeInTheDocument();
  expect(screen.getByText("Finished the ceiling")).toBeInTheDocument();
});

test("direct changes can be undone", async () => {
  const calls = server(
    [{ type: "change", id: "abc", summary: "Ceiling is at 40%" }, { type: "done" }],
    { "/api/changes/abc/undo": { change: {} } },
  );
  renderApp(<Chat />);
  await say("Update it");

  await userEvent.click(await screen.findByRole("button", { name: "Undo" }));

  expect(await screen.findByText("Undone: Ceiling is at 40%")).toBeInTheDocument();
  expect(calls).toContain("POST /api/changes/abc/undo");
});

const proposal = {
  type: "proposal",
  id: "p1",
  summary: "Plan the solar work",
  descriptions: ["Add purchase task “Solar panels”", "Fit panels needs Solar panels first (hard)"],
  status: "pending",
};

test("a grouped proposal is approved with one tap", async () => {
  const calls = server([proposal, { type: "done" }], { "/api/proposals/p1/approve": { ...proposal, status: "applied" } });
  renderApp(<Chat />);
  await say("Plan it");

  expect(await screen.findByText("Fit panels needs Solar panels first (hard)")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Approve" }));

  expect(await screen.findByText("Approved")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  expect(calls).toContain("POST /api/proposals/p1/approve");
});

test("a proposal that can no longer apply says why", async () => {
  server([proposal, { type: "done" }]);
  renderApp(<Chat />);
  await say("Plan it");

  await userEvent.click(await screen.findByRole("button", { name: "Approve" }));

  expect(await screen.findByText("Couldn't apply: Not found")).toBeInTheDocument();
});

test("a recent chat is restored, including decided proposals", async () => {
  server([], {
    "/api/sessions/s9": {
      id: "s9",
      title: "Old chat",
      focus: null,
      display: [
        { type: "user", text: "Earlier message" },
        { ...proposal, status: "rejected" },
      ],
    },
  });

  renderApp(<Chat />, "/chat?session=s9");

  expect(await screen.findByText("Earlier message")).toBeInTheDocument();
  expect(screen.getByText("Rejected")).toBeInTheDocument();
});

test("a failed message shows the error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/sessions" && init?.method === "POST") {
        return { ok: false, status: 503, json: async () => ({ detail: "The AI isn't configured." }) };
      }
      return { ok: true, json: async () => [] };
    }),
  );
  renderApp(<Chat />);

  await say("Hello");

  await waitFor(() => expect(screen.getByText("The AI isn't configured.")).toBeInTheDocument());
});
