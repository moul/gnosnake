# vendor/

Third-party code, committed rather than installed, because this front-end has no build step
and no `node_modules`: what is debugged locally is what is served, byte for byte.

| file | what | version | sha256 |
|---|---|---|---|
| `secp256k1.js` | [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1), the only dependency the signing path has | 2.2.3 | see `SHA256SUMS` |

**Why this one is vendored and the hashes are not.** `@noble/secp256k1` is one self-contained
ES module with no imports of its own, so committing it is a single file and no graph.
`@noble/hashes`' ripemd160 pulls three more modules behind it, and RIPEMD-160 is eighty lines
of fixed, forty-year-old arithmetic with published test vectors: `crypto.js` implements it and
pins it against those vectors, which is less code in the repository than the import graph would
have been.

To update: fetch the new version, replace the file, update `SHA256SUMS`, and run
`node web/session.test.js`. The test signs and verifies against fixtures produced by `gnokey`
itself, so a version that changes behaviour fails rather than passing quietly.
