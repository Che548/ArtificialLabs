// TEMPORARY: turn this off to remove both the export UI and capture copies.
export const ENABLE_TEMPORARY_CAPTURE_EXPORT = true;

export type TemporaryCapture = { directoryUri: string; names: string[] };
type Storage = {
  remove: (uri: string) => Promise<void>;
  mkdir: (uri: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
};

/** Owns only disposable copies, never the originals consumed by CV. */
export class TemporaryCaptureExportStore {
  private generation = 0;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private root: string, private storage: Storage) {}

  replace(frames: readonly { uri: string }[], cancelled: () => boolean): Promise<TemporaryCapture | null> {
    const generation = ++this.generation;
    const stale = () => generation !== this.generation || cancelled();
    const work = this.pending.then(async () => {
      try {
        // Also prune copies left by an interrupted previous application session.
        await this.storage.remove(this.root);
        if (stale() || !frames.length) return null;
        const directoryUri = `${this.root}${Date.now()}-${generation}/`;
        await this.storage.mkdir(directoryUri);
        const names: string[] = [];
        for (const [index, frame] of frames.slice(-30).entries()) {
          if (stale()) break;
          const extension = /\.(jpe?g|png|heic)$/i.exec(frame.uri)?.[1].toLowerCase() ?? 'jpg';
          const name = `frame-${String(index + 1).padStart(2, '0')}.${extension}`;
          await this.storage.copy(frame.uri, directoryUri + name);
          names.push(name);
        }
        if (!stale()) return { directoryUri, names };
      } catch {
        // This optional export must never prevent the actual scan from running.
      }
      await this.storage.remove(this.root).catch(() => undefined);
      return null;
    });
    this.pending = work;
    return work;
  }

  clear(): Promise<void> {
    ++this.generation;
    const work = this.pending.then(() => this.storage.remove(this.root)).catch(() => undefined);
    this.pending = work;
    return work;
  }
}
