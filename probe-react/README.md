# React probe — Limitation 2 (reactive-component frameworks)

The paper excludes reactive frameworks, noting their "security model may differ substantially." This probe answers that with evidence.

```bash
node probe-react/probe.mjs
```

**Finding (reproducible):** given the identical payload `<img src=x onerror=…>`, JSX interpolation auto-escapes it (`&lt;img…`, inert), while `dangerouslySetInnerHTML` injects it raw. So in reactive frameworks XSS is **opt-in to danger**, whereas the classic RWD-framework sinks (Bootstrap/Foundation tooltip `data-template` → `innerHTML`, CVE-2019-8331 class) were **opt-out of safety**.

That default-posture inversion — not anything about CSS — is the security-model difference the paper anticipated. Fold it into the Discussion as the reactive-framework data point.

> Scope note: this is a focused probe, not a 4th full MedReach variant (plan §3, §6). Keeping it small was a deliberate cost/novelty trade.
