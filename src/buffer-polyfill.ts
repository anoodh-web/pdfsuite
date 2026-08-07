// Must be imported as the very first thing in the app. node-forge and the
// @signpdf packages (used for real PKCS#12 digital signatures) assume a
// Node.js-style global `Buffer`, which doesn't exist in the browser.
//
// This is a real side-effect module (not inline code in main.tsx) on
// purpose: ES module import statements are hoisted and evaluated before
// any of the importing file's own top-level code, so if this assignment
// lived inline in main.tsx, every other import in that file — including
// the whole component tree that transitively imports node-forge — would
// already have been evaluated first, defeating the polyfill. Putting the
// assignment inside its own module's top-level scope, imported first,
// guarantees it runs before anything that depends on it.
import { Buffer } from 'buffer';

if (!(window as unknown as { Buffer?: unknown }).Buffer) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
