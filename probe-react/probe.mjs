// Limitation-2 probe: does a reactive-component framework change the XSS surface?
// Renders the SAME attacker payload two ways and shows JSX auto-escaping vs. the
// dangerouslySetInnerHTML opt-out (the React analogue of Bootstrap/Foundation's
// innerHTML tooltip sink, CVE-2019-8331 class). Run: node probe-react/probe.mjs
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const payload = `<img src=x onerror="alert('xss')">`;

const safe = renderToStaticMarkup(React.createElement("div", null, payload));
const unsafe = renderToStaticMarkup(
  React.createElement("div", { dangerouslySetInnerHTML: { __html: payload } })
);

console.log("Attacker payload :", payload);
console.log("JSX interpolation:", safe);
console.log("dangerouslySet…  :", unsafe);
console.log();
console.log(
  safe.includes("<img")
    ? "UNEXPECTED: JSX did not escape"
    : "PASS — JSX auto-escaped the payload (&lt;img…); the injected handler is inert."
);
console.log(
  unsafe.includes("<img")
    ? "EXPECTED — raw injection occurs ONLY when the developer explicitly opts out of escaping."
    : "UNEXPECTED"
);
console.log(
  "\nFinding: in reactive frameworks XSS is opt-IN to danger, whereas the classic\n" +
    "RWD-framework sinks were opt-OUT of safety. This is the Limitation-2 contribution\n" +
    "the paper calls for — the security model differs by default posture, not by CSS."
);
