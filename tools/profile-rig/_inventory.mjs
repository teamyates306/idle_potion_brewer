import puppeteer from "puppeteer-core";
const b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const p = (await b.pages()).find(x => x.url().includes("vercel.app"));
const out = await p.evaluate(() => {
  const anims = document.getAnimations();
  const groups = {};
  for (const a of anims) {
    const t = a.effect?.target;
    const name = a.animationName || (a.transitionProperty ? "transition:" + a.transitionProperty : a.constructor.name);
    const timing = a.effect?.getTiming?.() || {};
    const key = name;
    const g = groups[key] ??= { count: 0, infinite: 0, running: 0, paused: 0, durations: new Set(), tags: new Set(), svg: 0 };
    g.count++;
    if (timing.iterations === Infinity) g.infinite++;
    a.playState === "running" ? g.running++ : g.paused++;
    g.durations.add(Math.round(timing.duration));
    if (t) {
      if (t instanceof SVGElement) g.svg++;
      const cls = (t.getAttribute("class") || "").split(" ").slice(0, 2).join(".");
      g.tags.add(t.tagName.toLowerCase() + (cls ? "." + cls : ""));
    }
  }
  return Object.entries(groups).map(([k, g]) => ({ name: k, count: g.count, infinite: g.infinite, running: g.running, paused: g.paused, svg: g.svg, durations: [...g.durations].slice(0, 4), targets: [...g.tags].slice(0, 3) }))
    .sort((a, b) => b.count - a.count);
});
const inline = await p.evaluate(() => ({ modal: !!document.querySelector(".fixed.inset-0.z-40"), reveal: !!document.querySelector(".reveal-dim"), windows: document.querySelectorAll('img[src="/sprites/window.png"]').length, workersOnTrack: document.querySelectorAll('[style*="translate(calc(-50%"]').length }));
console.log(JSON.stringify({ inline, groups: out }, null, 1));
b.disconnect();
