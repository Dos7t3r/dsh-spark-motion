const React = require("react");

const ID = "dsh-spark-motion";
const ATTR = "data-dsh-spark-kind";
const STYLE_ID = ID + "-style";
const STORAGE_KEY = "dsh-spark-motion:kind";
const KINDS = ["dsh", "classic", "new"];

const REPO_URL = "https://github.com/Dos7t3r/dsh-spark-motion";
const VERSION = __VERSION__;

const CSS = __CSS__;
const e = React.createElement;

let current = "dsh";
const listeners = new Set();

function normalize(kind) {
  return KINDS.indexOf(kind) === -1 ? "dsh" : kind;
}

function readStored() {
  try {
    return normalize(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "dsh";
  }
}

function persist(kind) {
  try {
    window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    /* private mode / storage disabled — preference simply will not survive a reload */
  }
}

function paint(kind) {
  current = kind;
  const root = document.documentElement;
  if (root) root.setAttribute(ATTR, kind);
}

function setKind(kind) {
  const next = normalize(kind);
  if (next === current) return;
  paint(next);
  persist(next);
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* a broken subscriber must not break the toggle */
    }
  });
}

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const tag = document.createElement("style");
    tag.id = STYLE_ID;
    tag.dataset.plugin = ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }
}

const OPTIONS = [
  {
    kind: "dsh",
    zh: "DeepSeek 原版",
    en: "DeepSeek original — the animated whale tail",
  },
  {
    kind: "classic",
    zh: "Claude 经典星芒",
    en: "Claude classic spark — 9 frames, 90ms each",
  },
  {
    kind: "new",
    zh: "Claude 新版散点",
    en: "Claude current dots — 110 frames, 30fps",
  },
];

/** A plain two-stroke tail glyph drawn for this plugin (not DSH's own artwork). */
function TailGlyph() {
  return e(
    "svg",
    { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", "aria-hidden": "true" },
    e("path", {
      // stem + two flukes: reads as a tail rather than a cross at 16px
      d: "M8 14V9M8 9C6.6 7 5.2 6.2 3.4 5.8M8 9C9.4 7 10.8 6.2 12.6 5.8",
      stroke: "currentColor",
      strokeWidth: 1.3,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}

function Preview(props) {
  if (props.kind === "dsh") return e(TailGlyph);
  return e("span", { "data-dsh-spark-pv": props.kind });
}

function SparkSection() {
  const [kind, setLocal] = React.useState(current);

  React.useEffect(
    function () {
      const fn = function (next) {
        setLocal(next);
      };
      listeners.add(fn);
      return function () {
        listeners.delete(fn);
      };
    },
    [],
  );

  return e(
    "div",
    { className: "dshspark-section" },
    e("h2", { className: "dshspark-title" }, "思考动效"),
    e(
      "p",
      { className: "dshspark-sub" },
      "Thinking & working indicator — choose what animates while Claude / DeepSeek is working.",
    ),
    e(
      "div",
      { className: "dshspark-list", role: "radiogroup", "aria-label": "思考动效" },
      OPTIONS.map(function (option) {
        const active = option.kind === kind;
        return e(
          "button",
          {
            key: option.kind,
            type: "button",
            role: "radio",
            "aria-checked": active,
            className: "dshspark-option" + (active ? " is-active" : ""),
            onClick: function () {
              setKind(option.kind);
            },
          },
          e("span", { className: "dshspark-preview" }, e(Preview, { kind: option.kind })),
          e(
            "span",
            { className: "dshspark-meta" },
            e("span", { className: "dshspark-zh" }, option.zh),
            e("span", { className: "dshspark-en" }, option.en),
          ),
          e("span", { className: "dshspark-radio", "aria-hidden": "true" }),
        );
      }),
    ),
    e(
      "p",
      { className: "dshspark-note" },
      "立即生效、随客户端保存。Claude 两版的素材取自 Claude Desktop 内的动画序列帧，著作权归 Anthropic；详见本插件的 NOTICE。",
    ),
    e(
      "div",
      { className: "dshspark-foot" },
      e(
        "a",
        {
          className: "dshspark-repo",
          href: REPO_URL,
          // Never let Electron navigate the app itself: hand the URL to the OS.
          onClick: function (event) {
            event.preventDefault();
            if (typeof window.open === "function") {
              window.open(REPO_URL, "_blank", "noopener,noreferrer");
            }
          },
        },
        e("span", { className: "dshspark-repo-label" }, "GitHub 仓库"),
        e("span", { className: "dshspark-repo-url" }, "Dos7t3r/dsh-spark-motion"),
      ),
      e("span", { className: "dshspark-ver" }, "v" + VERSION),
    ),
  );
}

function apply(ctx) {
  ensureStyle();
  paint(readStored());

  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      {
        name: "settings.section",
        id: "spark-motion",
        order: 100,
        label: function () {
          return "思考动效";
        },
      },
      SparkSection,
    );
  });
}

exports.apply = apply;
exports.inject = ["slots"];
exports.setKind = setKind;
exports.KINDS = KINDS;
