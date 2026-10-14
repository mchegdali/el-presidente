export type Segment = { text: string; mention?: string };

/** Découpe un message en texte et @mentions (noms des joueurs de la table, même avec espaces). */
export function splitMentions(body: string, names: string[]): Segment[] {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const lower = body.toLowerCase();
  const out: Segment[] = [];
  let buf = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '@') {
      const name = sorted.find((n) => lower.startsWith(`@${n.toLowerCase()}`, i));
      if (name !== undefined) {
        if (buf) out.push({ text: buf });
        buf = '';
        out.push({ text: body.slice(i, i + 1 + name.length), mention: name });
        i += 1 + name.length;
        continue;
      }
    }
    buf += body[i];
    i++;
  }
  if (buf) out.push({ text: buf });
  return out;
}

export function mentions(body: string, name: string | undefined) {
  return name !== undefined && body.toLowerCase().includes(`@${name.toLowerCase()}`);
}
