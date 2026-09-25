declare module "y-websocket/bin/utils" {
  import type { IncomingMessage } from "http";
  import type * as Y from "yjs";

  export interface WSSharedDoc extends Y.Doc {
    name: string;
    whenInitialized: Promise<void>;
  }

  export function setupWSConnection(
    conn: unknown,
    req: IncomingMessage,
    options?: { docName?: string; gc?: boolean }
  ): void;

  export function setPersistence(
    persistence: {
      bindState: (docName: string, doc: Y.Doc) => Promise<void>;
      writeState: (docName: string, doc: Y.Doc) => Promise<void>;
    } | null
  ): void;

  export function setContentInitializor(f: (doc: Y.Doc) => Promise<void>): void;

  export function getYDoc(docName: string, gc?: boolean): WSSharedDoc;

  export const docs: Map<string, WSSharedDoc>;
}
