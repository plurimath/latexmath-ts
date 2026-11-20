// Ruby model wire ({node, fields}, nil and unset fields left out) for a
// generated model. Fields come out in declaration order, as the Ruby producer
// writes them. A field in `derived` is computed from the bound data (the
// symbol catalog), and a row written before the model declared it does not
// record it: it is left out when the row's object has no entry for it, and
// reported. A derived field the row does record must match.
// Ruby tagged model wire used by the pinned corpus replay. Field order,
// unset fields and collection order retain the existing replay semantics.
const derived = { "Latexmath::Model::MathSymbol": new Set(["value", "kind"]) };
export const omitted = new Set();
export function model(v, expected) {
  if (v === null || v === undefined || typeof v === "symbol") return undefined;
  if (typeof v === "string") return { str: v };
  if (Array.isArray(v)) {
    const items = Array.isArray(expected?.array) ? expected.array : [];
    return { array: v.map((x, i) => model(x, items[i])) };
  }
  const name = v.constructor.name;
  if (!name.startsWith("LatexmathModel")) throw new Error("not a generated model: " + name);
  const node = "Latexmath::Model::" + name.slice(14);
  const recorded = expected && typeof expected === "object" && expected.node === node ? new Map(expected.fields) : null;
  const fields = [];
  for (const [k, x] of Object.entries(v)) {
    if (derived[node]?.has(k) && recorded && !recorded.has(k)) {
      omitted.add(`${node}#${k}`);
      continue;
    }
    const wire = model(x, recorded?.get(k));
    if (wire !== undefined) fields.push([k, wire]);
  }
  return { node, fields };
}
