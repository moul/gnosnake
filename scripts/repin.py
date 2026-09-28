#!/usr/bin/env python3
"""Regenerate the pinned Render output in a realm's render_test.gno.

A pinned render turns a rendering regression into a red build instead of a
page somebody notices three weeks later. The cost is that every deliberate
change to Render means retyping the expected bytes, which is exactly the chore
that gets skipped until the pin is deleted. So it is generated:

    make repin        # rewrite the pins from what Render actually produces
    git diff          # read the change, decide whether you meant it

The generator never approves anything. It only removes the excuse for a pin
that asserts nothing.

How it works: the realm ships a dump test that prints each page between
markers, this reads them back, and it rewrites the one `var pinnedPages`
block in render_test.gno. Backticks cannot appear in a gno raw string literal,
so each one is written as {BT} and the test restores it.
"""
import json
import os
import re
import subprocess
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# --print renders the pages and writes a markdown preview to stdout instead of
# rewriting the pins. That is what CI posts on a pull request: the reviewer sees
# the pages as they will actually look, produced by a fresh run rather than read
# back out of the file under review.
preview = "--print" in sys.argv
argv = [a for a in sys.argv[1:] if not a.startswith("--")]
realm = argv[0] if argv else None
if realm is None:
    realm = next(
        os.path.join(dp, "")
        for dp, dn, fn in os.walk(os.path.join(root, "r"))
        if "render_test.gno" in fn
    )
test_file = os.path.join(realm, "render_test.gno")
dump_file = os.path.join(realm, "zz_dump_test.gno")

DUMP = '''package %s

import "testing"

// TestDumpRenders exists for scripts/repin.py and is deleted again straight
// after. It is written by the generator, never by hand.
func TestDumpRenders(cur realm, t *testing.T) {
	fixture(cur, t)
	for _, p := range pinnedPaths() {
		println("<<<<<PIN " + p + ">>>>>")
		println(renderForPin(p))
		println("<<<<<END>>>>>")
	}
}
'''

EMPTY = "var pinnedPages = []pinnedPage{\n}\n"
PINS = re.compile(r"var pinnedPages = \[\]pinnedPage\{.*?\n\}\n", re.S)

original = open(test_file).read()
pkg = re.match(r"package (\w+)", original).group(1)

# Empty the pins before dumping. A pin that no longer compiles (a stray quote,
# a bad escape) would otherwise make the dump unbuildable, and the generator
# whose job is to fix the pins would need the pins to be correct first.
open(test_file, "w").write(PINS.sub(EMPTY, original))
open(dump_file, "w").write(DUMP % pkg)
try:
    out = subprocess.run(
        ["gno", "test", "-v", "-run", "TestDumpRenders", "./" + os.path.relpath(realm, root)],
        cwd=root, capture_output=True, text=True,
    ).stdout
finally:
    os.remove(dump_file)

pages = re.findall(r"<<<<<PIN (.*?)>>>>>\n(.*?)\n<<<<<END>>>>>", out, re.S)
if preview:
    open(test_file, "w").write(original)  # preview never edits anything
if not pages:
    open(test_file, "w").write(original)  # leave the tree as we found it
    sys.exit("no pages dumped; run `make test` first and read the error\n" + out[-3000:])

if preview:
    print("Every page this realm renders, from a fresh run of the test fixture.\n")
    for path, want in pages:
        title = path or "(the lobby)"
        print("<details><summary><code>:%s</code></summary>\n" % title)
        print(want)
        print("\n</details>\n")
    sys.exit(0)

body = "var pinnedPages = []pinnedPage{\n"
for path, want in pages:
    want = want.replace("`", "{BT}")
    body += "\t{%s, `%s`},\n" % (json.dumps(path), want)
body += "}\n"

open(test_file, "w").write(PINS.sub(lambda _: body, original))
print("repinned %d page(s) in %s" % (len(pages), os.path.relpath(test_file, root)))
