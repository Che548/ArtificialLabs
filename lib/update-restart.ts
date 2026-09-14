/** Saving fails closed: no reload if any mounted editor cannot preserve its draft. */
export function createRestartPreparation() {
  const preparations = new Set<() => Promise<void>>();
  let running: Promise<boolean> | undefined;
  return {
    register(prepare: () => Promise<void>) {
      preparations.add(prepare);
      return () => { preparations.delete(prepare); };
    },
    run(allowed: () => boolean, reload: () => Promise<void>) {
      if (running) return running;
      running = (async () => {
        if (!allowed()) return false;
        for (const prepare of preparations) await prepare();
        if (!allowed()) return false;
        await reload();
        return true;
      })().finally(() => { running = undefined; });
      return running;
    },
  };
}
