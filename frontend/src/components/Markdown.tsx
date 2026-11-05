import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";

/** Bundle links point at markdown files; in the app they're screens. */
function route(href = ""): string | null {
  const match = href.match(/^\/(tasks|notes)\/([a-z0-9-]+)\.md$/);
  return match ? `/${match[1]}/${match[2]}` : null;
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        components={{
          a({ href, children }) {
            const to = route(href);
            return to ? (
              <Link to={to}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
