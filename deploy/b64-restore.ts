// Rebuild binary files shipped as <file>.b64.NN text parts (Botkeep ZIPs are text-only).
const parts = new Map<string, string[]>();
for await (const f of new Bun.Glob("**/*.b64.*").scan({ cwd: "." })) {
  if (f.startsWith("node_modules/")) continue;
  const out = f.slice(0, f.lastIndexOf(".b64."));
  if (!parts.has(out)) parts.set(out, []);
  parts.get(out)!.push(f);
}
for (const [out, fs] of parts) {
  fs.sort();
  let b64 = "";
  for (const f of fs) b64 += await Bun.file(f).text();
  await Bun.write(out, Buffer.from(b64, "base64"));
}
console.log(`restored ${parts.size} binary files`);
export {};
