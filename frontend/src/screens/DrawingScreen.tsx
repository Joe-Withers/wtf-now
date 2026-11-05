import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { getJson, type Drawing } from "../api";
import { DrawingView } from "../components/Drawing";
import { Loading, ScreenHead } from "../components/ui";

export function DrawingScreen() {
  const { slug } = useParams();
  const query = useQuery({ queryKey: ["drawings"], queryFn: () => getJson<Drawing[]>("/drawings") });

  return (
    <main className="screen">
      <Loading query={query}>
        {(drawings) => {
          const drawing = drawings.find((candidate) => candidate.slug === slug);
          return (
            <>
              <ScreenHead title={drawing?.title ?? "Drawing"} />
              {drawing ? (
                <DrawingView drawing={drawing} />
              ) : (
                <p className="empty">No drawing called that.</p>
              )}
            </>
          );
        }}
      </Loading>
    </main>
  );
}
