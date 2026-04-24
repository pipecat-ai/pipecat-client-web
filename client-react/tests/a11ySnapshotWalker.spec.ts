/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it } from "@jest/globals";

import {
  findElementByRef,
  snapshotDocument,
} from "../src/a11ySnapshotWalker";

function html(body: string): HTMLElement {
  document.body.innerHTML = body;
  return document.body;
}

describe("snapshotDocument: roles and hierarchy", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("walks a simple document and emits landmarks + leaves", () => {
    html(`
      <main>
        <h1>Home</h1>
        <nav>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
        </nav>
      </main>
    `);

    const snap = snapshotDocument();
    expect(snap.root.role).toBe("generic");
    const mainNode = snap.root.children?.[0];
    expect(mainNode?.role).toBe("main");
    expect(mainNode?.children?.[0]).toMatchObject({
      role: "heading",
      name: "Home",
      level: 1,
    });
    expect(mainNode?.children?.[1]).toMatchObject({ role: "nav" });
    const nav = mainNode?.children?.[1];
    expect(nav?.children).toHaveLength(2);
    expect(nav?.children?.[0]).toMatchObject({ role: "link", name: "About" });
    expect(nav?.children?.[1]).toMatchObject({ role: "link", name: "Contact" });
  });

  it("uses explicit role attribute over tag-derived role", () => {
    html(`<div role="button">Click</div>`);
    const snap = snapshotDocument();
    const node = snap.root.children?.[0];
    expect(node).toMatchObject({ role: "button", name: "Click" });
  });

  it("flattens pure wrapper divs without emitting them", () => {
    html(`
      <div>
        <div>
          <div>
            <button>Hello</button>
          </div>
        </div>
      </div>
    `);
    const snap = snapshotDocument();
    expect(snap.root.children).toHaveLength(1);
    expect(snap.root.children?.[0]).toMatchObject({
      role: "button",
      name: "Hello",
    });
  });

  it("promotes containers with aria-label to generic role", () => {
    html(`
      <div aria-label="Trending artists">
        <button>Bad Bunny</button>
      </div>
    `);
    const snap = snapshotDocument();
    const region = snap.root.children?.[0];
    expect(region?.role).toBe("generic");
    expect(region?.name).toBe("Trending artists");
    expect(region?.children?.[0]).toMatchObject({ role: "button" });
  });
});

describe("snapshotDocument: exclusions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("skips aria-hidden subtrees", () => {
    html(`
      <main>
        <button>Visible</button>
        <div aria-hidden="true"><button>Hidden</button></div>
      </main>
    `);
    const snap = snapshotDocument();
    const main = snap.root.children?.[0];
    expect(main?.children).toHaveLength(1);
    expect(main?.children?.[0].name).toBe("Visible");
  });

  it("skips hidden attribute", () => {
    html(`<main><button hidden>Gone</button><button>Here</button></main>`);
    const snap = snapshotDocument();
    const main = snap.root.children?.[0];
    expect(main?.children?.map((c) => c.name)).toEqual(["Here"]);
  });

  it("skips script and style elements", () => {
    html(`
      <main>
        <script>alert(1)</script>
        <style>.x {}</style>
        <button>Only</button>
      </main>
    `);
    const snap = snapshotDocument();
    const main = snap.root.children?.[0];
    expect(main?.children).toHaveLength(1);
    expect(main?.children?.[0].name).toBe("Only");
  });
});

describe("snapshotDocument: values and state", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("includes text input value", () => {
    html(`<input id="email" type="text" value="me@example.com" />`);
    const snap = snapshotDocument();
    const input = snap.root.children?.[0];
    expect(input?.role).toBe("textbox");
    expect(input?.value).toBe("me@example.com");
  });

  it("omits password input value", () => {
    html(`<input id="pw" type="password" value="hunter2" />`);
    const snap = snapshotDocument();
    const input = snap.root.children?.[0];
    expect(input?.role).toBe("textbox");
    expect(input?.value).toBeUndefined();
  });

  it("captures disabled and checked state", () => {
    html(`
      <button disabled>Off</button>
      <input type="checkbox" checked aria-label="Agree" />
    `);
    const snap = snapshotDocument();
    const [btn, cb] = snap.root.children ?? [];
    expect(btn?.state).toContain("disabled");
    expect(cb?.state).toContain("checked");
    expect(cb?.name).toBe("Agree");
  });

  it("uses <label for> to name inputs", () => {
    html(`
      <label for="e">Email</label>
      <input id="e" type="text" />
    `);
    const snap = snapshotDocument();
    const input = snap.root.children?.[0];
    expect(input?.name).toBe("Email");
  });

  it("records heading level from tag", () => {
    html(`<h3>Section</h3>`);
    const snap = snapshotDocument();
    const h = snap.root.children?.[0];
    expect(h?.role).toBe("heading");
    expect(h?.level).toBe(3);
  });
});

describe("snapshotDocument: names and truncation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collapses whitespace in names", () => {
    html(`<button>   Click   me   now   </button>`);
    const snap = snapshotDocument();
    const btn = snap.root.children?.[0];
    expect(btn?.name).toBe("Click me now");
  });

  it("truncates long names at 100 chars", () => {
    const long = "a".repeat(150);
    html(`<button>${long}</button>`);
    const snap = snapshotDocument();
    const btn = snap.root.children?.[0];
    expect(btn?.name).toHaveLength(100);
    expect(btn?.name?.endsWith("…")).toBe(true);
  });
});

describe("snapshotDocument: multi-child names", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("separates adjacent span children in a button name with a space", () => {
    html(`
      <button>
        <span>Nine Inch Noize</span>
        <span>Nine Inch Nails</span>
      </button>
    `);
    const snap = snapshotDocument();
    const btn = snap.root.children?.[0];
    expect(btn?.role).toBe("button");
    expect(btn?.name).toBe("Nine Inch Noize Nine Inch Nails");
  });

  it("joins deeply nested text across element boundaries in a link", () => {
    html(`
      <a href="/x">
        <div><span>Bad</span></div>
        <div><span>Bunny</span></div>
      </a>
    `);
    const snap = snapshotDocument();
    const link = snap.root.children?.[0];
    expect(link?.role).toBe("link");
    expect(link?.name).toBe("Bad Bunny");
  });

  it("excludes aria-hidden descendants from the accessible name", () => {
    html(`
      <button>
        <span>Visible</span>
        <span aria-hidden="true">Hidden</span>
      </button>
    `);
    const snap = snapshotDocument();
    const btn = snap.root.children?.[0];
    expect(btn?.name).toBe("Visible");
  });
});

describe("snapshotDocument: wrapper text children", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("emits a text leaf when a wrapper div holds only text", () => {
    html(`
      <main>
        <ul>
          <li>
            <div>Track 1 Title</div>
            <button>Play</button>
          </li>
        </ul>
      </main>
    `);
    const snap = snapshotDocument();
    const list = snap.root.children?.[0].children?.[0];
    expect(list?.role).toBe("list");
    const item = list?.children?.[0];
    expect(item?.role).toBe("listitem");
    const kids = item?.children?.map((c) => ({ role: c.role, name: c.name }));
    expect(kids).toEqual([
      { role: "text", name: "Track 1 Title" },
      { role: "button", name: "Play" },
    ]);
  });

  it("preserves text-between-elements ordering", () => {
    html(`
      <main>
        <button>First</button>
        Interstitial copy
        <button>Second</button>
      </main>
    `);
    const snap = snapshotDocument();
    const main = snap.root.children?.[0];
    expect(main?.children?.map((c) => ({ role: c.role, name: c.name }))).toEqual([
      { role: "button", name: "First" },
      { role: "text", name: "Interstitial copy" },
      { role: "button", name: "Second" },
    ]);
  });

  it("ignores whitespace-only text between elements", () => {
    html(`
      <main>
        <button>A</button>
        <button>B</button>
      </main>
    `);
    const snap = snapshotDocument();
    const main = snap.root.children?.[0];
    expect(main?.children).toHaveLength(2);
    expect(main?.children?.every((c) => c.role === "button")).toBe(true);
  });
});

describe("snapshotDocument: viewport tracking", () => {
  // jsdom doesn't do layout, so ``getBoundingClientRect`` returns
  // zeros by default and every element would be classified
  // ``offscreen``. Mock per element for viewport tests.
  function mockRect(el: Element, rect: Partial<DOMRect>): void {
    const full: DOMRect = {
      x: rect.x ?? rect.left ?? 0,
      y: rect.y ?? rect.top ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      top: rect.top ?? rect.y ?? 0,
      left: rect.left ?? rect.x ?? 0,
      right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
      bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
      toJSON() {
        return this;
      },
    };
    (el as HTMLElement).getBoundingClientRect = () => full;
  }

  const VIEWPORT_W = 1024;
  const VIEWPORT_H = 768;

  beforeEach(() => {
    document.body.innerHTML = "";
    // jsdom's defaults are 1024x768, but pin explicitly so the
    // assertions don't drift if those change.
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: VIEWPORT_W,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: VIEWPORT_H,
    });
  });

  it("marks elements below the fold as offscreen", () => {
    html(`
      <main>
        <button id="above">Above</button>
        <button id="below">Below</button>
      </main>
    `);
    mockRect(document.getElementById("above")!, {
      top: 100,
      left: 100,
      width: 80,
      height: 30,
    });
    mockRect(document.getElementById("below")!, {
      top: VIEWPORT_H + 50,
      left: 100,
      width: 80,
      height: 30,
    });

    const snap = snapshotDocument();
    const main = snap.root.children?.[0];
    const [above, below] = main?.children ?? [];
    expect(above?.state ?? []).not.toContain("offscreen");
    expect(below?.state ?? []).toContain("offscreen");
  });

  it("marks elements off to the right as offscreen", () => {
    html(`<main><button id="right">Right</button></main>`);
    mockRect(document.getElementById("right")!, {
      top: 100,
      left: VIEWPORT_W + 50,
      width: 80,
      height: 30,
    });
    const snap = snapshotDocument();
    const btn = snap.root.children?.[0].children?.[0];
    expect(btn?.state ?? []).toContain("offscreen");
  });

  it("treats partially visible elements as visible", () => {
    html(`<main><button id="partial">Partial</button></main>`);
    // Straddles the bottom edge: half in, half out.
    mockRect(document.getElementById("partial")!, {
      top: VIEWPORT_H - 10,
      left: 100,
      width: 80,
      height: 30,
    });
    const snap = snapshotDocument();
    const btn = snap.root.children?.[0].children?.[0];
    expect(btn?.state ?? []).not.toContain("offscreen");
  });

  it("opts out of viewport annotation with trackViewport: false", () => {
    html(`<main><button id="below">Below</button></main>`);
    mockRect(document.getElementById("below")!, {
      top: VIEWPORT_H + 50,
      left: 100,
      width: 80,
      height: 30,
    });
    const snap = snapshotDocument(undefined, { trackViewport: false });
    const btn = snap.root.children?.[0].children?.[0];
    expect(btn?.state ?? []).not.toContain("offscreen");
  });

  it("combines offscreen with other state tags", () => {
    html(`<main><button id="b" disabled>B</button></main>`);
    mockRect(document.getElementById("b")!, {
      top: VIEWPORT_H + 50,
      left: 100,
      width: 80,
      height: 30,
    });
    const snap = snapshotDocument();
    const btn = snap.root.children?.[0].children?.[0];
    expect(btn?.state).toEqual(expect.arrayContaining(["disabled", "offscreen"]));
  });
});

describe("snapshotDocument: refs", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("assigns a ref to every emitted node", () => {
    html(`<main><button>Go</button></main>`);
    const snap = snapshotDocument();
    const main = snap.root.children?.[0];
    expect(main?.ref).toMatch(/^e\d+$/);
    expect(main?.children?.[0].ref).toMatch(/^e\d+$/);
  });

  it("keeps the same ref for the same node across snapshots", () => {
    html(`<main id="m"><button>Go</button></main>`);
    const first = snapshotDocument();
    // Mutate a sibling. The ref for <button> should not change.
    const btn = document.querySelector("button")!;
    document.body.appendChild(document.createElement("div"));
    const second = snapshotDocument();

    const firstBtn = first.root.children?.[0].children?.[0];
    const secondBtn = second.root.children?.[0].children?.[0];
    expect(firstBtn?.ref).toBe(secondBtn?.ref);
    expect(btn).toBeTruthy(); // sanity
  });
});

describe("snapshotDocument: grid dimensions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("captures aria-colcount and aria-rowcount on a grid", () => {
    html(`
      <div role="grid" aria-colcount="8" aria-rowcount="2">
        <button>A</button>
        <button>B</button>
      </div>
    `);
    const snap = snapshotDocument();
    const grid = snap.root.children?.[0];
    expect(grid?.role).toBe("grid");
    expect(grid?.colcount).toBe(8);
    expect(grid?.rowcount).toBe(2);
  });

  it("omits grid fields when the attributes are absent", () => {
    html(`<div role="grid"><button>A</button></div>`);
    const snap = snapshotDocument();
    const grid = snap.root.children?.[0];
    expect(grid?.role).toBe("grid");
    expect(grid?.colcount).toBeUndefined();
    expect(grid?.rowcount).toBeUndefined();
  });

  it("ignores unparseable aria-colcount values", () => {
    html(`<div role="grid" aria-colcount="auto"><button>A</button></div>`);
    const snap = snapshotDocument();
    const grid = snap.root.children?.[0];
    expect(grid?.colcount).toBeUndefined();
  });
});

describe("findElementByRef", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the live element for a ref from the last snapshot", () => {
    html(`<main><button>Target</button></main>`);
    const snap = snapshotDocument();
    const btnRef = snap.root.children?.[0].children?.[0].ref;
    expect(btnRef).toMatch(/^e\d+$/);

    const resolved = findElementByRef(btnRef!);
    expect(resolved).toBeInstanceOf(HTMLButtonElement);
    expect(resolved?.textContent).toBe("Target");
  });

  it("returns null for a ref that was never assigned", () => {
    html(`<main><button>X</button></main>`);
    snapshotDocument();
    expect(findElementByRef("e99999")).toBeNull();
  });

  it("returns null after the element is detached from the DOM", () => {
    html(`<main><button id="victim">X</button></main>`);
    const snap = snapshotDocument();
    const ref = snap.root.children?.[0].children?.[0].ref;
    document.getElementById("victim")!.remove();
    expect(findElementByRef(ref!)).toBeNull();
  });
});
