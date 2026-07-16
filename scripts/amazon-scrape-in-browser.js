/**
 * Run on https://www.amazon.com/cpe/yourpayments/transactions while logged in.
 *
 * Page 1: reads the already-loaded DOM (no fetch — Amazon flags fetch to same page).
 * Page 2+: clicks Next Page and waits for DOM update.
 * Order details: fetch() to order URLs (different origin path — fine).
 *
 * 1. DevTools → Console → paste this file → Enter
 * 2. Wait for "[amazon-scrape] done" — file auto-downloads if clipboard is blocked
 * 3. Save to data/amazon-payments-scraped.json (or use window.__amazonScrapeResult)
 */
(async () => {
  const MAX_UNIQUE_ORDERS = 200;
  const FETCH_ORDERS = true;
  const DELAY_MS = 500;
  const PAGE_WAIT_MS = 12000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const firstOrderKey = () => {
    const link = document.querySelector('a[href*="orderID="]');
    if (!link) return null;
    const orderId = new URL(link.href).searchParams.get("orderID") || "";
    let node = link;
    let text = "";
    for (let depth = 0; depth < 8 && node; depth++) {
      text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/[-+]?\$[\d,]+\.\d{2}/.test(text) && /Order #/.test(text)) break;
      node = node.parentElement;
    }
    const amount = text.match(/[-+]?\$[\d,]+\.\d{2}/)?.[0] || "";
    return `${orderId}:${parseAmountCents(amount)}`;
  };

  const parsePaymentsFromDom = (pageIndex) => {
    const rows = [];
    const seen = new Set();

    for (const link of document.querySelectorAll('a[href*="orderID="]')) {
      let node = link;
      let text = "";
      for (let depth = 0; depth < 10 && node; depth++) {
        text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (/[-+]?\$[\d,]+\.\d{2}/.test(text) && /Order #/.test(text)) break;
        node = node.parentElement;
      }

      const amountMatch = text.match(/[-+]?\$[\d,]+\.\d{2}/);
      const orderId = new URL(link.href).searchParams.get("orderID") || "";
      if (!amountMatch || !orderId) continue;

      const amount = amountMatch[0];
      const amountCents = parseAmountCents(amount);
      const key = `${orderId}:${amountCents}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        order_id: orderId,
        href: link.href,
        amount,
        amount_cents: amountCents,
        payment_date:
          text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/)?.[0] ||
          null,
        payment_hint:
          text.match(
            /Prime Visa \*+\d{4}|Amazon Visa points|Gift Card|Bank Account|Amazon Store Card/i,
          )?.[0] || "",
        snippet: text.slice(0, 220),
        page_index: pageIndex,
      });
    }

    return rows;
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

    throw new Error("Timed out waiting for next payments page to load.");
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

  const parseOrderDetails = (html, orderId, href) => {
    const text = stripTags(html);
    const orderDate = text.match(/Order placed\s+([A-Za-z]+ \d{1,2}, \d{4})/i)?.[1] || null;
    const titles = [];
    for (const re of [
      /<a[^>]+href="[^"]*(?:ppx_hzod_title_dt_b_fed_asin_title|ppx_yo_dt_b_asin_title)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
      /<img[^>]+alt="([^"]+)"[^>]*>/gi,
    ]) {
      let m;
      while ((m = re.exec(html))) {
        const title = stripTags(m[1]);
        if (title && !titles.includes(title)) titles.push(title);
      }
    }
    const digital_hint =
      text.match(/Ad[- ]free for Prime\s*Video|Kindle|Prime Video Channels|Prime membership|Audible/i)?.[0] ||
      null;
    return {
      order_id: orderId,
      order_date: orderDate,
      titles: titles,
      digital_hint,
      href,
    };
  };

  const buildNote = (order) => {
    const itemTitles = (order.titles ?? []).filter(
      (title) => !/^amazon visa$/i.test(stripTags(title)),
    );
    let summary;
    if (itemTitles.length) {
      summary = itemTitles.slice(0, 3).map((t) => stripTags(t).replace(/&amp;/g, "&")).join("; ");
      if (itemTitles.length > 3) summary += ` +${itemTitles.length - 3} more`;
    } else if (order.digital_hint) {
      summary = order.digital_hint;
    } else {
      return null;
    }
    if (order.order_date) {
      const d = new Date(order.order_date);
      const ordered = Number.isNaN(d.getTime())
        ? order.order_date
        : d.toLocaleString("en-US", { month: "short", day: "numeric" });
      return `Amazon: ${summary} (ordered ${ordered})`;
    }
    return `Amazon: ${summary}`;
  };

  const downloadJson = (json, filename) => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const copyJson = async (json) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(json);
        return true;
      } catch {
        // fall through
      }
    }
    if (typeof copy === "function") {
      try {
        copy(json);
        return true;
      } catch {
        // fall through
      }
    }
    return false;
  };

  const saveResult = async (result) => {
    const json = JSON.stringify(result, null, 2);
    const filename = `amazon-payments-scraped-${new Date().toISOString().slice(0, 10)}.json`;

    window.__amazonScrapeResult = result;

    if (await copyJson(json)) {
      console.log(
        `%c[amazon-scrape] done — ${result.payments.length} payments, ${result.orders.length} orders (copied to clipboard)`,
        "font-weight:bold;color:#0a0",
      );
      console.log("Also on window.__amazonScrapeResult");
      return;
    }

    try {
      downloadJson(json, filename);
      console.log(
        `%c[amazon-scrape] done — ${result.payments.length} payments, ${result.orders.length} orders (downloaded ${filename})`,
        "font-weight:bold;color:#0a0",
      );
    } catch (error) {
      console.log(
        `%c[amazon-scrape] done — ${result.payments.length} payments, ${result.orders.length} orders`,
        "font-weight:bold;color:#0a0",
      );
      console.warn("[amazon-scrape] clipboard/download blocked. Run:");
      console.log("copy(JSON.stringify(window.__amazonScrapeResult, null, 2))");
      console.warn(error);
    }
  };

  if (!location.href.includes("/cpe/yourpayments/transactions")) {
    console.warn("[amazon-scrape] Navigate to Your Payments → Transactions first.");
  }

  console.log(`[amazon-scrape] reading payments from DOM (max ${MAX_UNIQUE_ORDERS} unique orders)...`);
  const payments = [];
  const seen = new Set();
  let pagesFetched = 0;

  let pageIndex = 0;
  while (true) {
    const beforeCount = payments.length;
    for (const row of parsePaymentsFromDom(pageIndex)) {
      const key = `${row.order_id}:${row.amount_cents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      payments.push(row);
      if (uniqueOrderCount(payments) >= MAX_UNIQUE_ORDERS) break;
    }
    pagesFetched += 1;
    const added = payments.length - beforeCount;
    const orderCount = uniqueOrderCount(payments);
    console.log(
      `[amazon-scrape] page ${pageIndex + 1}: +${added} payments (${payments.length} total, ${orderCount} unique orders)`,
    );

    if (orderCount >= MAX_UNIQUE_ORDERS) {
      console.log(`[amazon-scrape] reached max ${MAX_UNIQUE_ORDERS} unique orders, stopping pagination.`);
      break;
    }

    const next = findNextPageButton();
    if (!next || next.disabled) {
      console.log("[amazon-scrape] no more pages.");
      break;
    }

    await sleep(DELAY_MS);
    try {
      await clickNextPage();
    } catch (error) {
      console.warn(`[amazon-scrape] pagination stopped: ${error.message}`);
      break;
    }
    pageIndex += 1;
  }

  const orders = [];
  if (FETCH_ORDERS) {
    const toFetch = payments.filter(
      (p, i, arr) => arr.findIndex((x) => x.order_id === p.order_id) === i,
    );
    console.log(`[amazon-scrape] fetching ${toFetch.length} order detail pages...`);
    const seenOrders = new Set();
    for (const payment of toFetch) {
      if (seenOrders.has(payment.order_id)) continue;
      seenOrders.add(payment.order_id);
      await sleep(DELAY_MS);
      try {
        const orderHtml = await fetchOrderHtml(payment.href);
        const order = parseOrderDetails(orderHtml, payment.order_id, payment.href);
        order.suggestedNote = buildNote(order);
        orders.push(order);
      } catch (error) {
        orders.push({
          order_id: payment.order_id,
          href: payment.href,
          error: String(error),
        });
      }
    }
  }

  const result = {
    scrapedAt: new Date().toISOString(),
    pagesFetched,
    limits: { maxUniqueOrders: MAX_UNIQUE_ORDERS },
    payments,
    orders,
  };

  await saveResult(result);
  return result;
})();
