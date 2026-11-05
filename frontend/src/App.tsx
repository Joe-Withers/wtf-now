import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Chat } from "./screens/Chat";
import { FloorPlan } from "./screens/FloorPlan";
import { GraphScreen } from "./screens/GraphScreen";
import { Home } from "./screens/Home";
import { LogScreen } from "./screens/LogScreen";
import { More } from "./screens/More";
import { NoteScreen } from "./screens/NoteScreen";
import { ShoppingScreen } from "./screens/ShoppingScreen";
import { TaskScreen } from "./screens/TaskScreen";
import { Tasks } from "./screens/Tasks";
import { WhatNowScreen } from "./screens/WhatNowScreen";
import { Wiki } from "./screens/Wiki";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="what-now" element={<WhatNowScreen />} />
            <Route path="chat" element={<Chat />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="tasks/:slug" element={<TaskScreen />} />
            <Route path="more" element={<More />} />
            <Route path="wiki" element={<Wiki />} />
            <Route path="notes/:slug" element={<NoteScreen />} />
            <Route path="log" element={<LogScreen />} />
            <Route path="shopping" element={<ShoppingScreen />} />
            <Route path="floor-plan" element={<FloorPlan />} />
            <Route path="graph" element={<GraphScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
