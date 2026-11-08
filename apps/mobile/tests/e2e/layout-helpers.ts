export async function textProblems(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const texts: { text: string; rect: DOMRect; raw: DOMRect; el: Element }[] = [];
    const walker = document.createTreeWalker(
      document.querySelector('[data-testid="budget-modal"]') || document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode,
        el = node.parentElement;
      if (
        !el ||
        !node.textContent?.trim() ||
        el.closest('script,style,svg,[role="alert"],[aria-hidden="true"]')
      )
        continue;
      if (getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none')
        continue;
      const range = document.createRange();
      range.selectNode(node);
      for (const rect of range.getClientRects()) {
        let top = 0,
          bottom = innerHeight;
        for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(ancestor).overflowY)) {
            const clip = ancestor.getBoundingClientRect();
            top = Math.max(top, clip.top);
            bottom = Math.min(bottom, clip.bottom);
          }
        }
        if (rect.width > 1 && rect.height > 1 && rect.bottom > top && rect.top < bottom) {
          const visible = new DOMRect(
            rect.left,
            Math.max(top, rect.top),
            rect.width,
            Math.min(bottom, rect.bottom) - Math.max(top, rect.top),
          );
          texts.push({ text: node.textContent!.slice(0, 70), rect: visible, raw: rect, el });
        }
      }
    }
    const issues: string[] = [];
    for (const a of texts) {
      if (a.rect.left < -1 || a.rect.right > innerWidth + 1)
        issues.push(`Out of viewport: ${a.text}`);
      const card = a.el.closest('[data-testid="budget-card"]');
      if (card) {
        const bounds = card.getBoundingClientRect();
        if (a.raw.left < bounds.left + 4 || a.raw.right > bounds.right - 4)
          issues.push(`Outside card: ${a.text}`);
      }
      for (const b of texts) {
        if (a === b || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left),
          y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (x > 3 && y > 3) issues.push(`Overlap: ${a.text} / ${b.text}`);
      }
    }
    return [...new Set(issues)];
  });
}
