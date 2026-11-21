/* Monai Amazon bookmarklet.
 *
 * Run on https://www.amazon.com/cpe/yourpayments/transactions while signed in.
 * It reads the payments table from the DOM (never fetches that URL — Amazon
 * logs "Ajax request to same page detected"), paginates by clicking Next Page,
 * fetches each order's detail page, then hands the result to Monai by
 * navigating to /amazon-import with the payload in the URL fragment.
 *
 * The fragment is never sent to a server, so nothing large or sensitive lands
 * in a request log. No extension, no token, no CORS: it is a top-level
 * navigation, so the normal Clerk session applies.
 *
 * Keep this file free of line comments: it is inlined into a javascript: URL,
 * where a raw newline inside a line comment would truncate the script.
 */
(async () => {
  /* Baked in when the link is generated, so the bookmark points at whichever
   * host you dragged it from — localhost while developing, production otherwise.
   * It cannot be read from localStorage at runtime: this runs on amazon.com, and
   * localStorage is per-origin, so Amazon's storage knows nothing about Monai. */
  const MONAI_ORIGIN = "@@MONAI_ORIGIN@@";
  const MAX_UNIQUE_ORDERS = 200;
  const DELAY_MS = 400;
  const PAGE_WAIT_MS = 12000;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const badge = document.createElement("div");
  badge.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "right:16px",
    "bottom:16px",
    "max-width:320px",
    "padding:12px 14px",
    "border-radius:12px",
    "background:#0f172a",
    "color:#e2e8f0",
    "font:600 12px/1.5 ui-sans-serif,system-ui,sans-serif",
    "box-shadow:0 12px 32px rgba(0,0,0,.35)",
  ].join(";");
  badge.textContent = "Monai: starting…";
  document.body.appendChild(badge);
  const say = (text, link) => {
    badge.textContent = `Monai: ${text}`;
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.textContent = "Open payment frame →";
      anchor.style.cssText =
        "display:block;margin-top:8px;color:#7dd3fc;font-weight:700;text-decoration:underline;cursor:pointer";
      badge.appendChild(anchor);
    }
  };

  const fail = (message) => {
    badge.style.background = "#7f1d1d";
    badge.textContent = `Monai: ${message}`;
    console.error("[monai-amazon]", message);
  };

  const uniqueOrderCount = (rows) => new Set(rows.map((row) => row.order_id)).size;

  const stripTags = (value) =>
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const parseAmountCents = (amount) => {
    const sign = amount.includes("-") ? -1 : 1;
    const numeric = amount.replace(/[^0-9.]/g, "");
    return Math.abs(Math.round(Number(numeric) * 100 * sign));
  };

  /* Amazon renders the payments table in the top document on some accounts and
   * inside a same-origin iframe on others, so every lookup walks all readable
   * documents. Cross-origin frames are counted for the diagnostics but cannot
   * be read. */
  const readableDocuments = () => {
    const documents = [document];
    let frames = 0;
    let readableFrames = 0;

    for (const frame of document.querySelectorAll("iframe")) {
      frames += 1;
      try {
        const inner = frame.contentDocument;
        if (inner && inner.body) {
          documents.push(inner);
          readableFrames += 1;
        }
      } catch {
        /* cross-origin */
      }
    }

    return { documents, frames, readableFrames };
  };

  /* A cross-origin frame's content is unreadable, but its src attribute is not.
   * If the payments table lives in one, hand the user a link to it — opened
   * directly it becomes the top document, which this script can read. */
  const frameSources = () => {
    const frames = [];
    for (const frame of document.querySelectorAll("iframe")) {
      const raw = frame.getAttribute("src");
      if (!raw) continue;
      let resolved = raw;
      try {
        resolved = new URL(raw, location.href).href;
      } catch {
        /* keep raw */
      }
      let readable = false;
      try {
        readable = Boolean(frame.contentDocument && frame.contentDocument.body);
      } catch {
        readable = false;
      }
      frames.push({ src: resolved, readable });
    }
    return frames;
  };

  /* The frame that most likely holds the payments table. */
  const paymentFrame = () => {
    const unreadable = frameSources().filter((frame) => !frame.readable);
    const byUrl = unreadable.find((frame) =>
      /yourpayments|payment|transactions|order|history|activity/i.test(frame.src),
    );
    if (byUrl) return byUrl;
    // No hint in the URL, but a lone unreadable frame is almost certainly it.
    return unreadable.length === 1 ? unreadable[0] : undefined;
  };

  const orderLinks = () => {
    const links = [];
    for (const doc of readableDocuments().documents) {
      for (const link of doc.querySelectorAll('a[href*="orderID" i], a[href*="orderId" i]')) {
        links.push(link);
      }
    }
    return links;
  };

  const orderIdFromHref = (href) => {
    const match = String(href).match(/[?&]orderI[dD]=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  };

  const AMOUNT_RE = /[-+]?\$[\d,]+\.\d{2}/;

  /* Walk up from the order link until an ancestor looks like a single payment
   * row: it has an amount and is still small. Requiring "Order #" was too
   * strict — the label varies by locale and layout. */
  const rowTextFor = (link) => {
    let node = link;
    for (let depth = 0; depth < 12 && node; depth++) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.length > 0 && text.length < 600 && AMOUNT_RE.test(text)) return text;
      node = node.parentElement;
    }
    return "";
  };

  const firstOrderKey = () => {
    const link = orderLinks()[0];
    if (!link) return null;
    const orderId = orderIdFromHref(link.href);
    const amount = rowTextFor(link).match(AMOUNT_RE)?.[0] || "";
    return `${orderId}:${parseAmountCents(amount)}`;
  };

  const parsePaymentsFromDom = () => {
    const rows = [];
    const seen = new Set();

    for (const link of orderLinks()) {
      const orderId = orderIdFromHref(link.href);
      if (!orderId) continue;

      const text = rowTextFor(link);
      const amountMatch = text.match(AMOUNT_RE);
      if (!amountMatch) continue;

      const amountCents = parseAmountCents(amountMatch[0]);
      const key = `${orderId}:${amountCents}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        order_id: orderId,
        href: link.href,
        amount_cents: amountCents,
        payment_date:
          text.match(
            /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}\b/,
          )?.[0] || null,
      });
    }

    return rows;
  };

  /* What the page actually looked like, so a failure is actionable instead of
   * "are you signed in?". */
  /* Everything needed to explain a failed scrape, sent to Monai as a page
   * rather than squeezed into a badge. */
  const collectDiagnostics = (reason) => {
    const { documents } = readableDocuments();
    const top = documents[0];
    const text = (top.body?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      kind: "diagnostics",
      reason,
      url: location.href,
      title: top.title || "",
      textLength: text.length,
      frames: frameSources().map((frame) => ({
        src: frame.src.slice(0, 220),
        readable: frame.readable,
      })),
      links: [...top.querySelectorAll("a[href]")]
        .map((anchor) => (anchor.getAttribute("href") || "").slice(0, 120))
        .slice(0, 40),
      headings: [...top.querySelectorAll("h1, h2, h3")]
        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 15),
      excerpt: text.slice(0, 1500),
    };
  };

  const handOff = (payload) => {
    if (MONAI_ORIGIN.includes("@@")) {
      fail("this bookmark was not generated by Monai — drag it again from /amazon-import.");
      return false;
    }
    location.href = `${MONAI_ORIGIN}/amazon-import#${toBase64Url(JSON.stringify(payload))}`;
    return true;
  };

  const describePage = () => {
    const { documents, frames, readableFrames } = readableDocuments();
    const links = orderLinks().length;
    const title = (document.title || "").slice(0, 60);
    const bodyLength = documents.reduce((total, doc) => total + (doc.body?.innerText?.length ?? 0), 0);
    const samples = [...documents[0].querySelectorAll("a[href]")]
      .slice(0, 6)
      .map((anchor) =>
        (anchor.getAttribute("href") || "")
          .replace(/^https?:\/\/[^/]+/, "")
          .slice(0, 48),
      )
      .join(" , ");
    const sources = frameSources()
      .map((frame) => frame.src.replace(/^https?:\/\//, "").slice(0, 60))
      .join(" , ");
    return `orderID links: ${links} · iframes: ${frames} (${readableFrames} readable) · text: ${bodyLength} chars · title: "${title}"${sources ? ` · frame srcs: ${sources}` : ""}${samples ? ` · links: ${samples}` : " · links: none"}`;
  };

  /* The payments page is a Next.js app: the rows are React Native Web anchors
   * with href="#", so there is nothing to read from the DOM. The whole first
   * page of transactions ships as JSON in <script id="__NEXT_DATA__">, which is
   * both complete and far more stable than markup.
   *
   * Amazon renders a charge as a negative amount ("-$5.33"); parseAmountCents
   * returns absolute cents, which is what Monai stores for a charge. */
  const parseStatePayments = () => {
    const script = document.querySelector("script#__NEXT_DATA__");
    if (!script) return { payments: [], hasMore: false };

    let state;
    try {
      state = JSON.parse(script.textContent || "").props?.pageProps?.state
        ?.transactionResponseState;
    } catch {
      return { payments: [], hasMore: false };
    }

    const list = state?.visibleTransactionResponse?.transactionList;
    if (!Array.isArray(list)) return { payments: [], hasMore: false };

    return { payments: paymentsFromList(list), hasMore: Boolean(state?.hasMore) };
  };

  /* The page fetches further transactions as you go; the response shape is not
   * documented, so look for a transactionList anywhere inside it. */
  const findTransactionList = (node, depth = 0) => {
    if (!node || depth > 8) return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = findTransactionList(child, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof node !== "object") return null;
    if (Array.isArray(node.transactionList)) return node.transactionList;
    for (const value of Object.values(node)) {
      const hit = findTransactionList(value, depth + 1);
      if (hit) return hit;
    }
    return null;
  };

  /* Click "next page" if there is one, otherwise scroll; whatever the page
   * fetches in response is captured on the way past. */
  const collectFurtherPages = async (maxPages) => {
    const captured = [];
    const originalFetch = window.fetch;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    const take = (text) => {
      if (!text || !text.includes("transactionList")) return;
      try {
        const list = findTransactionList(JSON.parse(text));
        if (list) captured.push(list);
      } catch {
        /* not JSON */
      }
    };

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        take(await response.clone().text());
      } catch {
        /* body already used */
      }
      return response;
    };

    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      this.addEventListener("load", () => take(this.responseText));
      return originalSend.apply(this, args);
    };

    try {
      for (let page = 0; page < maxPages; page += 1) {
        const before = captured.length;
        const control = [...document.querySelectorAll('[role="button"], button, a')].find((el) =>
          /next page|load more|show more/i.test(
            `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`,
          ),
        );
        if (control) control.click();
        else window.scrollTo(0, document.body.scrollHeight);
        await sleep(2500);
        if (captured.length === before) break;
        say(`reading more payments… ${captured.length} extra page(s)`);
      }
    } finally {
      window.fetch = originalFetch;
      XMLHttpRequest.prototype.open = originalOpen;
      XMLHttpRequest.prototype.send = originalSend;
    }

    return captured.flat();
  };

  const paymentsFromList = (list) => {
    const payments = [];
    const seen = new Set();

    for (const item of list) {
      const signed = parseAmountCents(String(item.formattedAmount || ""));
      if (!signed) continue;

      const order = (item.orderData || [])[0] || {};
      const href = order.orderDetailsUrl || "";
      const orderId =
        orderIdFromHref(href) ||
        String(order.orderDisplayString || "").replace(/^Order\s*#/i, "").trim();
      if (!orderId) continue;

      const key = `${orderId}:${signed}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const method = item.paymentMethodDisplayStringData || {};
      const lastDigits = method.paymentMethodNumber?.lastDigits;

      payments.push({
        order_id: orderId,
        href: href || `https://www.amazon.com/gp/css/order-details?orderID=${orderId}`,
        amount_cents: signed,
        payment_date: item.formattedDate || null,
        payment_hint: [method.paymentMethodName, lastDigits ? `*${lastDigits}` : ""]
          .filter(Boolean)
          .join(" "),
        snippet: String(item.statementDescriptor || "").slice(0, 200),
      });
    }

    return payments;
  };

  const findNextPageButton = () => {
    const candidates = [
      ...document.querySelectorAll('input[type="submit"], button[type="submit"], button'),
    ];
    return (
      candidates.find((el) =>
        /next page/i.test(
          el.getAttribute("aria-label") ||
            el.textContent ||
            el.getAttribute("aria-labelledby") ||
            "",
        ),
      ) ??
      candidates.find((el) => /DefaultNextPageNavigationEvent/.test(el.getAttribute("name") || ""))
    );
  };

  const clickNextPage = async () => {
    const next = findNextPageButton();
    if (!next || next.disabled) return false;

    const before = firstOrderKey();
    next.click();

    const deadline = Date.now() + PAGE_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(250);
      const after = firstOrderKey();
      if (after && after !== before) return true;
    }

    throw new Error("Timed out waiting for the next payments page.");
  };

  const fetchOrderHtml = async (url) => {
    const res = await fetch(url, { credentials: "include", redirect: "follow" });
    const html = await res.text();
    if (
      html.includes("Sign in or create account") ||
      html.includes("authportal-main-section") ||
      /<title[^>]*>\s*Amazon Sign-In/i.test(html)
    ) {
      throw new Error("Sign-in page while fetching order details.");
    }
    return html;
  };

  const parseOrderDetails = (html, orderId) => {
    const text = stripTags(html);
    const orderDate = text.match(/Order placed\s+([A-Za-z]+ \d{1,2}, \d{4})/i)?.[1] || null;
    const titles = [];
    for (const re of [
      /<a[^>]+href="[^"]*(?:ppx_hzod_title_dt_b_fed_asin_title|ppx_yo_dt_b_asin_title)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
      /<img[^>]+alt="([^"]+)"[^>]*>/gi,
    ]) {
      let match;
      while ((match = re.exec(html))) {
        const title = stripTags(match[1]);
        if (title && !titles.includes(title)) titles.push(title);
      }
    }
    const digitalHint =
      text.match(
        /Ad[- ]free for Prime\s*Video|Kindle|Prime Video Channels|Prime membership|Audible/i,
      )?.[0] || null;
    return { order_id: orderId, order_date: orderDate, titles, digital_hint: digitalHint };
  };

  const buildNote = (order) => {
    const itemTitles = (order.titles ?? []).filter((title) => {
      const cleaned = stripTags(title);
      return !/^amazon visa$/i.test(cleaned) && !/^tnf on prime$/i.test(cleaned);
    });
    let summary;
    if (itemTitles.length) {
      summary = itemTitles
        .slice(0, 3)
        .map((title) => stripTags(title).replace(/&amp;/g, "&"))
        .join("; ");
      if (itemTitles.length > 3) summary += ` +${itemTitles.length - 3} more`;
    } else if (order.digital_hint) {
      summary = order.digital_hint;
    } else {
      return null;
    }
    if (order.order_date) {
      const parsed = new Date(order.order_date);
      const ordered = Number.isNaN(parsed.getTime())
        ? order.order_date
        : parsed.toLocaleString("en-US", { month: "short", day: "numeric" });
      return `Amazon: ${summary} (ordered ${ordered})`;
    }
    return `Amazon: ${summary}`;
  };

  const toBase64Url = (text) => {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  try {
    for (let attempt = 0; attempt < 75 && orderLinks().length === 0; attempt += 1) {
      // If the table is in an unreadable frame, waiting will not help.
      if (paymentFrame()) break;
      // Keep the badge informative while waiting: whatever the user screenshots
      // then says what the page actually contains.
      if (attempt % 5 === 0) say(`looking for the payments table… ${describePage()}`);
      await sleep(200);
    }

    let payments = [];
    let hasMore = false;
    let source = "dom";

    const fromState = parseStatePayments();
    if (fromState.payments.length > 0) {
      payments = fromState.payments;
      hasMore = fromState.hasMore;
      source = "next-data";
      say(`found ${payments.length} payments in the page data…`);

      if (hasMore) {
        const extra = await collectFurtherPages(15);
        const known = new Set(payments.map((payment) => `${payment.order_id}:${payment.amount_cents}`));
        for (const payment of paymentsFromList(extra)) {
          const key = `${payment.order_id}:${payment.amount_cents}`;
          if (known.has(key)) continue;
          known.add(key);
          payments.push(payment);
          if (uniqueOrderCount(payments) >= MAX_UNIQUE_ORDERS) break;
        }
        say(`${payments.length} payments collected`);
      }
    }

    const seen = new Set();
    let pageIndex = 0;

    while (source === "dom") {
      for (const row of parsePaymentsFromDom()) {
        const key = `${row.order_id}:${row.amount_cents}`;
        if (seen.has(key)) continue;
        seen.add(key);
        payments.push(row);
        if (uniqueOrderCount(payments) >= MAX_UNIQUE_ORDERS) break;
      }

      const orderCount = uniqueOrderCount(payments);
      say(`page ${pageIndex + 1} · ${payments.length} payments · ${orderCount} orders`);

      if (orderCount >= MAX_UNIQUE_ORDERS) break;

      const next = findNextPageButton();
      if (!next || next.disabled) break;

      await sleep(DELAY_MS);
      try {
        await clickNextPage();
      } catch (error) {
        console.warn("[monai-amazon] pagination stopped:", error.message);
        break;
      }
      pageIndex += 1;
    }

    if (payments.length === 0) {
      const candidate = paymentFrame();

      if (candidate) {
        badge.style.background = "#0c4a6e";
        say(
          "the payments table is inside a frame — open it, then click this bookmark again.",
          candidate.src,
        );
        console.warn("[monai-amazon] payments table is in a frame:", candidate.src);
        return;
      }

      console.warn("[monai-amazon] nothing parsed:", describePage());
      handOff(collectDiagnostics("no-payments"));
      return;
    }

    const orders = [];
    const seenOrders = new Set();
    const toFetch = payments.slice(0, 60).filter((payment) => {
      if (seenOrders.has(payment.order_id)) return false;
      seenOrders.add(payment.order_id);
      return true;
    });

    for (const [index, payment] of toFetch.entries()) {
      say(`order ${index + 1}/${toFetch.length}…`);
      await sleep(DELAY_MS);
      try {
        const html = await fetchOrderHtml(payment.href);
        const order = parseOrderDetails(html, payment.order_id);
        orders.push({
          order_id: order.order_id,
          order_date: order.order_date,
          suggestedNote: buildNote(order),
        });
      } catch (error) {
        orders.push({ order_id: payment.order_id, error: String(error) });
      }
    }

    const payload = {
      kind: "scrape",
      scrapedAt: new Date().toISOString(),
      source,
      hasMore,
      payments: payments.map((payment) => ({
        order_id: payment.order_id,
        amount_cents: payment.amount_cents,
        payment_date: payment.payment_date,
      })),
      orders,
    };

    say(`sending ${payments.length} payments to Monai…`);
    handOff(payload);
  } catch (error) {
    fail(String(error && error.message ? error.message : error));
  }
})();
