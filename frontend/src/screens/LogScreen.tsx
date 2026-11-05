import { useQuery } from "@tanstack/react-query";

import { getJson, type LogLine } from "../api";
import { ChatLink, Loading, ScreenHead } from "../components/ui";

export function LogScreen() {
  const query = useQuery({ queryKey: ["log"], queryFn: () => getJson<LogLine[]>("/log?limit=500") });

  return (
    <main className="screen">
      <ScreenHead title="Log" action={<ChatLink />} />
      <Loading query={query}>
        {(lines) =>
          lines.length === 0 ? (
            <p className="empty">Nothing's happened yet.</p>
          ) : (
            <div>
              {lines.map((line, index) => (
                <div key={index}>
                  {line.day !== lines[index - 1]?.day && <div className="log-day">{line.day}</div>}
                  <div className="log-line">
                    <strong>{line.label}</strong> {line.text}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Loading>
    </main>
  );
}
