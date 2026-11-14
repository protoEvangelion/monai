/**
 * The URL fragment as it was on first load, captured at module evaluation.
 *
 * The router normalises the location during hydration and drops the fragment,
 * so by the time a component's effect runs `window.location.hash` is already
 * empty. Route modules are imported by the generated route tree before the
 * router is created, so reading it here is the last reliable moment.
 *
 * Used by /amazon-import, where the bookmarklet hands over the scrape payload
 * in the fragment: browsers never send fragments to a server, so the payload
 * stays out of request logs and out of URL length limits.
 */
export const initialHash =
  typeof window === "undefined" ? "" : window.location.hash;
