import * as Y from "yjs";

const DEFAULT_COLUMNS = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "In Progress" },
  { id: "done", title: "Done" },
];

export function buildDefaultBoardState(): Buffer {
  const doc = new Y.Doc();
  const columnOrder = doc.getArray<string>("columnOrder");
  const columns = doc.getMap<Y.Map<unknown>>("columns");

  doc.transact(() => {
    DEFAULT_COLUMNS.forEach((c) => {
      columnOrder.push([c.id]);
      const colMap = new Y.Map();
      colMap.set("title", c.title);
      columns.set(c.id, colMap);
    });
  });

  return Buffer.from(Y.encodeStateAsUpdate(doc));
}
