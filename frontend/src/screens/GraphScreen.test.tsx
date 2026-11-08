import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp } from "../test-helpers";
import { GraphScreen } from "./GraphScreen";

const map = {
  total: 5,
  done: 1,
  progress: 25,
  categories: [
    { slug: "electrics", title: "Electrics", colour: 1, total: 3, done: 1, progress: 33, next: "wire" },
    { slug: "insulation", title: "Insulation", colour: 2, total: 2, done: 0, progress: 0, next: "wool" },
  ],
  tasks: [
    {
      slug: "board",
      title: "Wire the board",
      kind: "build",
      state: "doing",
      progress: 60,
      category: "electrics",
      parent: "electrics",
      is_leaf: false,
      needs: [],
      blocks: [],
      children: ["wire", "fridge"],
      note: "Cables are in the blue box.",
    },
    {
      slug: "wire",
      title: "Run the cables",
      kind: "build",
      state: "todo",
      progress: 0,
      category: "electrics",
      parent: "board",
      is_leaf: true,
      needs: [],
      blocks: ["fridge"],
      children: [],
      note: "",
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
      title: "Lay the wool",
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
  notes: [{ slug: "blue-box", title: "The blue box", task: "wire" }],
};

test("shows the project whole, and the groups it's made of", async () => {
  mockApi({ "/api/map": map });

  renderApp(<GraphScreen />);

  expect(await screen.findByText("25%")).toBeInTheDocument();
  expect(screen.getByText("5 tasks · 1 done")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Electrics/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Insulation/ })).toBeInTheDocument();
});

test("draws the work, with the next task of each group called out", async () => {
  mockApi({ "/api/map": map });

  renderApp(<GraphScreen />);

  expect(await screen.findByRole("button", { name: "Fit the fridge" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Next up: Run the cables/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Next up: Lay the wool/ })).toBeInTheDocument();
});

test("the tasks that are done can be hidden", async () => {
  mockApi({ "/api/map": map });

  renderApp(<GraphScreen />);

  expect(await screen.findByRole("button", { name: "Trim the felt" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Hide done" }));

  expect(screen.queryByRole("button", { name: "Trim the felt" })).not.toBeInTheDocument();
});

test("picking a task opens no panel, and picking it again lets it go", async () => {
  mockApi({ "/api/map": map });

  const { container } = renderApp(<GraphScreen />);

  const fridge = await screen.findByRole("button", { name: "Fit the fridge" });
  await userEvent.click(fridge);
  expect(fridge).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("region", { name: "Selected task" })).not.toBeInTheDocument();
  expect(container.querySelectorAll(".graph-line.needs")).toHaveLength(1);

  await userEvent.click(fridge);
  expect(fridge).toHaveAttribute("aria-pressed", "false");
  expect(container.querySelectorAll(".graph-line.needs")).toHaveLength(0);
});

test("a note about a task shows up beside it", async () => {
  mockApi({ "/api/map": map });

  renderApp(<GraphScreen />);

  expect(await screen.findByRole("link", { name: "The blue box" })).toBeInTheDocument();
});

test("a link can point straight at a task", async () => {
  mockApi({ "/api/map": map });

  const { container } = renderApp(<GraphScreen />, "/?task=fridge");

  expect(await screen.findByRole("button", { name: "Fit the fridge" })).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelectorAll(".graph-line.needs")).toHaveLength(1);
});

test("no dependency lines are drawn until a task is picked", async () => {
  mockApi({ "/api/map": map });

  const { container } = renderApp(<GraphScreen />);
  await screen.findByRole("button", { name: "Fit the fridge" });

  expect(container.querySelectorAll(".graph-line.dependency, .graph-line.cross")).toHaveLength(0);
});

test("picking a task draws what it needs in red and what it unlocks in green", async () => {
  mockApi({ "/api/map": map });

  const { container } = renderApp(<GraphScreen />);

  await userEvent.click(await screen.findByRole("button", { name: "Fit the fridge" }));
  expect(container.querySelectorAll(".graph-line.needs")).toHaveLength(1);
  expect(container.querySelectorAll(".graph-line.unlocks")).toHaveLength(0);

  await userEvent.click((await screen.findAllByRole("button", { name: "Run the cables" }))[0]);
  expect(container.querySelectorAll(".graph-line.needs")).toHaveLength(0);
  expect(container.querySelectorAll(".graph-line.unlocks")).toHaveLength(1);
});

test("done work, work that is waiting and work that is free look different", async () => {
  mockApi({ "/api/map": map });

  renderApp(<GraphScreen />);

  expect(await screen.findByRole("button", { name: "Trim the felt" })).toHaveClass("done");
  expect(screen.getByRole("button", { name: "Fit the fridge" })).toHaveClass("waiting");
  expect(screen.getByRole("button", { name: "Lay the wool" })).not.toHaveClass("waiting");
});
