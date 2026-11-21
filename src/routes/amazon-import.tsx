import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import bookmarkletSource from "../../scripts/amazon-bookmarklet.js?raw";
import { requireAllowedSession } from "../lib/devAuth";
import { initialHash } from "../lib/initialHash";
import {
  reconcileAmazonNotes,
  type AmazonReconcileResult,
} from "../server/amazon-notes.fns";

/**
 * Landing page for the Amazon bookmarklet.
 *
 * With a payload in the URL fragment it runs the reconcile immediately and
 * shows the report. Without one it shows setup instructions, so the same URL is
 * both "install this" and "here are your results".
 *
 * The fragment carries the scrape. Browsers never send it to the server, so the
 * payload stays out of request logs. It is a top-level navigation, which means
 * the normal Clerk session applies — no token, no CORS, no extension.
 */

const authStateFn = createServerFn().handler(async () => {
  const { userId } = await requireAllowedSession();
  return { userId };
});

export const Route = createFileRoute("/amazon-import")({
  component: AmazonImportRoute,
  beforeLoad: async () => await authStateFn(),
});

type ImportState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: AmazonReconcileResult }
  | { kind: "error"; message: string };

function decodeFragment(hash: string) {
  const raw = hash.replace(/^#/, "");
  if (!raw) throw new Error("No scrape data in the URL.");

  const standard = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error(
      "That link did not contain a readable scrape payload. Run the bookmarklet again.",
    );
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function AmazonImportRoute() {
  const reconcile = useServerFn(reconcileAmazonNotes);
  const [state, setState] = useState<ImportState>({ kind: "idle" });
  const [isSetup, setIsSetup] = useState(false);

  useEffect(() => {
    // Not window.location.hash: the router has already dropped it by now.
    const hash = initialHash;

    if (!hash || hash.length < 2) {
      setIsSetup(true);
      return;
    }

    let scrapeJson: string;
    try {
      scrapeJson = decodeFragment(hash);
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
      return;
    }

    // Drop the hash so a refresh cannot replay the same import.
    window.history.replaceState(null, "", window.location.pathname);
    setState({ kind: "running" });

    void (async () => {
      try {
        const result = (await (reconcile as unknown as (input: {
          data: { scrapeJson: string; targets: string };
        }) => Promise<AmazonReconcileResult>)({
          data: { scrapeJson, targets: "all" },
        })) as AmazonReconcileResult;
        setState({ kind: "done", result });
      } catch (error) {
        setState({ kind: "error", message: errorMessage(error) });
      }
    })();
  }, [reconcile]);

  if (isSetup) return <Setup />;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Amazon import</h1>
        <p className="text-sm text-muted-foreground">
          Matches scraped Amazon payments against Amazon charges that have no note.
        </p>
      </header>

      {state.kind === "running" ? (
        <p className="text-sm text-muted-foreground">Matching payments…</p>
      ) : null}

      {state.kind === "error" ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.message}
        </div>
      ) : null}

      {state.kind === "done" ? <Report result={state.result} /> : null}
    </main>
  );
}

function Report({ result }: { result: AmazonReconcileResult }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Missing notes", result.worklistCount],
          ["Matched", result.matchedCount],
          ["Noted", result.updatedCount],
          ["Skipped", result.skippedCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-divider bg-content1 px-3 py-2">
            <dt className="text-[10px] font-bold tracking-[0.14em] text-default-400 uppercase">
              {label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {result.updatedCount === 0 && result.matchedCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing changed. Either every Amazon charge already has a note, or the scraped
          payments did not line up with a charge on the same amount and date.
        </p>
      ) : null}

      {result.updates.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-[0.14em] text-default-400 uppercase">
            Notes written
          </h2>
          <ul className="flex flex-col divide-y divide-divider rounded-xl border border-divider">
            {result.updates.slice(0, 50).map((update) => (
              <li key={update.transactionId} className="px-3 py-2 text-sm">
                <span className="text-muted-foreground">#{update.transactionId}</span>{" "}
                {update.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.skipped.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-[0.14em] text-default-400 uppercase">
            Skipped
          </h2>
          <ul className="flex flex-col divide-y divide-divider rounded-xl border border-divider">
            {result.skipped.slice(0, 50).map((skip) => (
              <li key={skip.transactionId} className="px-3 py-2 text-sm">
                <span className="text-muted-foreground">#{skip.transactionId}</span>{" "}
                {skip.merchantName} — {skip.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <a className="text-sm font-medium text-primary hover:underline" href="/transactions">
        Back to transactions
      </a>
    </div>
  );
}

function Setup() {
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  // Set the href through the DOM, not as a prop: React 19 replaces a
  // javascript: href with a "blocked as a security precaution" thrower.
  // Encode the whole source rather than minifying it — a javascript: URL is
  // decoded by the browser, so comments and newlines survive intact.
  //
  // The origin is baked in here, not resolved at runtime: the script runs on
  // amazon.com, where localStorage belongs to Amazon, not to us.
  useEffect(() => {
    const source = bookmarkletSource.replace(
      '"@@MONAI_ORIGIN@@"',
      JSON.stringify(window.location.origin),
    );
    linkRef.current?.setAttribute("href", `javascript:${encodeURIComponent(source)}`);
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Amazon import</h1>
        <p className="text-sm text-muted-foreground">
          One-click setup. Drag the button below to your bookmarks bar, once.
        </p>
      </header>

      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex flex-col gap-2">
          <span className="font-semibold">1. Drag this to your bookmarks bar</span>
          <a
            ref={linkRef}
            href="#"
            onClick={(event) => event.preventDefault()}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-linear-to-br from-cyan-500 via-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20"
          >
            Monai → Amazon
          </a>
          <span className="text-xs text-muted-foreground">
            Dragging saves the script as a bookmark. It is not a link to this page. The
            script is embedded in the bookmark, so drag it again after an update.
          </span>
        </li>
        <li className="flex flex-col gap-1">
          <span className="font-semibold">2. Open Amazon → Your Payments → Transactions</span>
          <a
            href="https://www.amazon.com/cpe/yourpayments/transactions"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline"
          >
            amazon.com/cpe/yourpayments/transactions
          </a>
        </li>
        <li className="flex flex-col gap-1">
          <span className="font-semibold">3. Click the bookmark</span>
          <span className="text-xs text-muted-foreground">
            It scrolls through your payments, fetches each order, then comes back here with the
            report. Keep the tab open; 200 orders takes a few minutes.
          </span>
        </li>
      </ol>

      <p className="rounded-xl border border-divider bg-content1 px-4 py-3 text-xs text-muted-foreground">
        Runs in your own browser session, so there is no extension to install and no password to
        share. Amazon&apos;s terms prohibit automated access, so this is a judgement call — it
        reads your own payment history, and it never buys anything.
      </p>
    </main>
  );
}
