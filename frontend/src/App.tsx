import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { ChatPage } from "./screens/Chat";
import { Docs } from "./screens/Docs";
import { DrawingScreen } from "./screens/DrawingScreen";
import { GraphScreen } from "./screens/GraphScreen";
import { LogScreen } from "./screens/LogScreen";
import { NoteScreen } from "./screens/NoteScreen";
import { ShoppingScreen } from "./screens/ShoppingScreen";
import { TaskScreen } from "./screens/TaskScreen";
import { WhatNowScreen } from "./screens/WhatNowScreen";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<GraphScreen />} />
            <Route path="what-now" element={<WhatNowScreen />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="tasks/:slug" element={<TaskScreen />} />
            <Route path="docs" element={<Docs />} />
            <Route path="notes/:slug" element={<NoteScreen />} />
            <Route path="log" element={<LogScreen />} />
            <Route path="shopping" element={<ShoppingScreen />} />
            <Route path="drawings/:slug" element={<DrawingScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
