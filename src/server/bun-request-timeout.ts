/**
 * Bun closes a connection that sends no bytes for 10 seconds, even while the
 * handler is still working. Local AI categorize waits on the Cursor CLI with
 * nothing to send back until it finishes, so the dev server needs a longer
 * idle window. This runs when the server boots, before that server starts listening.
 */
const idleTimeoutSeconds = 255;

const bunGlobal = globalThis as typeof globalThis & {
  Bun?: {
    serve?: ((options: { idleTimeout?: number }) => unknown) & { __monaiIdleTimeout?: boolean };
  };
};

const bunServe = bunGlobal.Bun?.serve;
if (bunServe && !bunServe.__monaiIdleTimeout) {
  const serveWithLongIdle = ((options: { idleTimeout?: number }) =>
    bunServe({
      ...options,
      idleTimeout: options.idleTimeout ?? idleTimeoutSeconds,
    })) as typeof bunServe;
  serveWithLongIdle.__monaiIdleTimeout = true;
  bunGlobal.Bun!.serve = serveWithLongIdle;
}
