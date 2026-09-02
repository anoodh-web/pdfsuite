# Code Signing — What It Actually Takes

Being direct about this upfront: I cannot obtain a real code-signing
certificate for you. It requires your organization to purchase one from
a Certificate Authority and go through their identity verification — a
legal/business step that has to happen outside of this chat, with real
payment and real documentation about AD Labs. What I *can* do is prepare
everything on the technical side so that once you have a certificate,
using it is just a matter of a couple of config values and an
environment variable — no code changes needed.

## Why this matters

Right now, every install shows Windows SmartScreen's "Unknown
publisher" warning. A code-signing certificate lets Windows verify the
installer is genuinely from AD Labs and hasn't been tampered with,
which removes that warning (or at minimum replaces it with your verified
publisher name instead of "Unknown").

## Two kinds of certificate, and which one you actually want

**Standard (OV) code signing certificate** — around $200–500/year from
providers like DigiCert, Sectigo, SSL.com, or GlobalSign. Removes the
worst of the warning, but Windows SmartScreen still needs to build up
"reputation" for a new certificate over time (based on how many people
download and run files signed with it) before the warning fully
disappears for everyone. For internal-only office software distributed
to a known set of laptops, this is usually the right, cost-effective
choice — your 10 (or however many) office laptops don't need SmartScreen
reputation to trust it once IT deploys it directly.

**EV (Extended Validation) certificate** — more expensive (roughly
$300–700/year) and requires stricter identity verification (often a
notarized business document and a phone verification call), but grants
**instant** SmartScreen trust with no reputation-building period. Worth
it if you're planning to distribute more broadly (e.g., outside a
managed set of office machines) or want the warning gone from day one.

**My recommendation for your situation** (internal office tool, known
set of laptops, IT-managed rollout): a standard OV certificate is very
likely sufficient and meaningfully cheaper. The SmartScreen warning on
first install is a one-time "click More info → Run anyway" per machine
either way, and you're not dealing with random members of the public
downloading it.

## What to actually do

1. **Choose a Certificate Authority** and purchase a code-signing
   certificate under your organization's legal name (AD Labs). All of
   DigiCert, Sectigo, and SSL.com are reputable, well-supported choices.
2. **Complete their identity verification** — expect to provide business
   registration documents; EV certs add a verification phone call.
3. You'll typically receive the certificate as a **`.pfx`/`.p12` file**
   (or it may be issued to a **hardware USB token**, which some CAs now
   require for EV certificates specifically, for security reasons).

## Wiring it into this project once you have it

Tauri supports Windows code signing directly via config. Two paths
depending on what you were issued:

**If you have a `.pfx`/`.p12` file:**
```json
// src-tauri/tauri.conf.json → bundle.windows
"windows": {
  "certificateThumbprint": "<thumbprint of the cert once imported into the Windows certificate store>",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```
You'd import the `.pfx` into the Windows certificate store first (via
`certutil` or double-clicking it), then reference it by thumbprint —
Tauri's build process finds it there rather than needing the file path
directly (keeps the private key out of any config file).

**If you have a hardware USB token (common for EV certs):** the signing
happens through Windows' `signtool.exe` using the token's own driver;
Tauri's `windows.signCommand` config can be pointed at a custom signing
command if the default certificate-store approach doesn't pick it up
automatically — this is a bit more setup-specific to the token vendor,
so let me know if you end up with one and I'll help wire up the exact
command.

Once either is in place, `npm run tauri build` signs the installer
automatically as part of the normal build — no other workflow changes.

## Bottom line

This is the one item on your roadmap that has a real dollar cost and a
waiting period (certificate issuance can take anywhere from a few hours
to a few business days depending on the CA and verification level) that
I can't shortcut. Everything else on your list — the auto-updater,
undo/redo, the canvas tools — I can build directly. This one needs you
to make a purchase decision and go through the CA's process first.
